import { EnhancedSearchResult, ContextualSearchResult } from './similaritySearch';
import { CodeChunk } from './semanticChunking';
import { CodebaseIndex } from './codebaseParser';
import { StoredCodebase, StorageManager } from './storageManager';
import { PrunedStoredCodebase, PrunedCodebaseFile } from './payloadPruning';

export interface AssembledContext {
  contextId: string;
  query: string;
  relevantFiles: FileContext[];
  codeSnippets: CodeSnippet[];
  summary: ContextSummary;
  assemblyTime: number;
  totalLines: number;
  confidence: number;
}

export interface FileContext {
  filePath: string;
  fileName: string;
  language: string;
  fullContent: string;
  relevantSections: RelevantSection[];
  imports: string[];
  exports: string[];
  lineCount: number;
  relevanceScore: number;
}

export interface RelevantSection {
  startLine: number;
  endLine: number;
  content: string;
  type: 'function' | 'class' | 'method' | 'variable' | 'import' | 'export' | 'interface' | 'type' | 'block';
  name?: string;
  context: string; // Surrounding context
  relevanceScore: number;
  chunkId: string;
}

export interface CodeSnippet {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  type: string;
  name?: string;
  relevanceScore: number;
  context: {
    before: string;
    after: string;
  };
}

export interface ContextSummary {
  filesAnalyzed: number;
  sectionsFound: number;
  primaryLanguages: string[];
  keyPatterns: string[];
  suggestedApproach: string;
  relatedConcepts: string[];
}

export interface AssemblyOptions {
  maxFiles?: number;
  maxSnippets?: number;
  contextLines?: number;
  includeFullFiles?: boolean;
  relevanceThreshold?: number;
  groupByFile?: boolean;
  includeDependencies?: boolean;
}

export interface ReadFileStatus {
  filePath: string;
  status: 'reading' | 'processing' | 'complete' | 'error';
  progress: number;
  linesRead: number;
  totalLines: number;
  error?: string;
}

export type FileReadProgressCallback = (status: ReadFileStatus) => void;

export class ContextAssemblyService {
  private codebaseCache: Map<string, StoredCodebase> = new Map();
  private fileContentCache: Map<string, string> = new Map();

  constructor() {
    // Initialize cache cleanup interval
    setInterval(() => this.cleanupCache(), 10 * 60 * 1000); // 10 minutes
  }

  /**
   * Assemble intelligent context from search results
   */
  async assembleContext(
    searchResults: ContextualSearchResult,
    codebaseId: string,
    options: AssemblyOptions = {},
    onFileRead?: FileReadProgressCallback,
    clientCodebase?: PrunedStoredCodebase
  ): Promise<AssembledContext> {
    const startTime = Date.now();
    
    console.log(`🔧 Assembling context for query: "${searchResults.query}"`);
    console.log(`📊 Processing ${searchResults.chunks.length} search results`);

    const {
      maxFiles = 10,
      maxSnippets = 20,
      contextLines = 5,
      includeFullFiles = false,
      relevanceThreshold = 0.5,
      groupByFile = true,
      includeDependencies = true
    } = options;

    try {
      // Get codebase from client-provided data or server storage
      const codebase = await this.getCodebaseWithClientOverride(codebaseId, clientCodebase);
      
      // Filter and group results
      const relevantResults = searchResults.chunks
        .filter(result => result.score >= relevanceThreshold)
        .slice(0, maxSnippets);

      console.log(`📋 Processing ${relevantResults.length} relevant results`);

      // Group by file for efficient processing
      const fileGroups = this.groupResultsByFile(relevantResults);
      const filesToProcess = Array.from(fileGroups.keys()).slice(0, maxFiles);

      console.log(`📁 Processing ${filesToProcess.length} files`);

      // Process each file and assemble context
      const fileContexts: FileContext[] = [];
      const codeSnippets: CodeSnippet[] = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        const filePath = filesToProcess[i];
        const fileResults = fileGroups.get(filePath) || [];

        onFileRead?.({
          filePath,
          status: 'reading',
          progress: (i / filesToProcess.length) * 100,
          linesRead: 0,
          totalLines: 0
        });

        try {
          const fileContext = await this.processFileContext(
            filePath,
            fileResults,
            codebase,
            {
              contextLines,
              includeFullFiles,
              includeDependencies
            },
            onFileRead
          );

          if (fileContext) {
            fileContexts.push(fileContext);
            
            // Extract code snippets from file context
            const snippets = this.extractCodeSnippets(fileContext, fileResults);
            codeSnippets.push(...snippets);
          }

          onFileRead?.({
            filePath,
            status: 'complete',
            progress: ((i + 1) / filesToProcess.length) * 100,
            linesRead: fileContext?.lineCount || 0,
            totalLines: fileContext?.lineCount || 0
          });

        } catch (error) {
          console.error(`❌ Error processing file ${filePath}:`, error);
          
          onFileRead?.({
            filePath,
            status: 'error',
            progress: ((i + 1) / filesToProcess.length) * 100,
            linesRead: 0,
            totalLines: 0,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      // Generate context summary
      const summary = this.generateContextSummary(
        fileContexts,
        codeSnippets,
        searchResults.query
      );

      // Calculate overall confidence
      const confidence = this.calculateContextConfidence(
        searchResults,
        fileContexts,
        codeSnippets
      );

      const assemblyTime = Date.now() - startTime;
      const totalLines = fileContexts.reduce((sum, fc) => sum + fc.lineCount, 0);

      console.log(`✅ Context assembly complete in ${assemblyTime}ms`);
      console.log(`📊 Assembled: ${fileContexts.length} files, ${codeSnippets.length} snippets, ${totalLines} total lines`);

      return {
        contextId: this.generateContextId(searchResults.query, codebaseId),
        query: searchResults.query,
        relevantFiles: fileContexts,
        codeSnippets,
        summary,
        assemblyTime,
        totalLines,
        confidence
      };

    } catch (error) {
      console.error('❌ Error assembling context:', error);
      throw error;
    }
  }

  /**
   * Process a single file to extract context
   */
  private async processFileContext(
    filePath: string,
    searchResults: EnhancedSearchResult[],
    codebase: StoredCodebase,
    options: {
      contextLines: number;
      includeFullFiles: boolean;
      includeDependencies: boolean;
    },
    onProgress?: FileReadProgressCallback
  ): Promise<FileContext | null> {
    // Find the file in the codebase with improved path matching
    const file = this.findFileInCodebase(codebase, filePath);

    if (!file || !file.content) {
      console.warn(`⚠️ File not found or has no content: ${filePath}`);
      console.log(`🔄 Attempting fallback using chunk content for ${searchResults.length} search results`);
      // FALLBACK: Use chunk content from search results instead of discarding
      return this.createFileContextFromChunks(filePath, searchResults, options);
    }

    onProgress?.({
      filePath,
      status: 'processing',
      progress: 25,
      linesRead: 0,
      totalLines: file.lines
    });

    const lines = file.content.split('\n');
    
    // Extract relevant sections from search results
    const relevantSections: RelevantSection[] = [];
    
    for (const result of searchResults) {
      const section = this.extractRelevantSection(
        result,
        file.content,
        options.contextLines
      );
      
      if (section) {
        relevantSections.push(section);
      }
    }

    onProgress?.({
      filePath,
      status: 'processing',
      progress: 75,
      linesRead: lines.length,
      totalLines: lines.length
    });

    // Calculate file relevance score
    const relevanceScore = searchResults.reduce(
      (sum, result) => sum + result.score, 0
    ) / searchResults.length;

    const fileContext: FileContext = {
      filePath: file.filePath,
      fileName: file.fileName,
      language: file.language,
      fullContent: options.includeFullFiles ? file.content : '',
      relevantSections,
      imports: file.imports.map(imp => imp.source),
      exports: file.exports.map(exp => exp.name),
      lineCount: file.lines,
      relevanceScore
    };

    return fileContext;
  }

  /**
   * Extract a relevant section from a search result
   */
  private extractRelevantSection(
    result: EnhancedSearchResult,
    fileContent: string,
    contextLines: number
  ): RelevantSection | null {
    const chunk = result.chunk;
    const lines = fileContent.split('\n');
    
    // Expand the section to include context
    const expandedStart = Math.max(0, chunk.startLine - contextLines - 1);
    const expandedEnd = Math.min(lines.length, chunk.endLine + contextLines);
    
    const content = lines.slice(chunk.startLine - 1, chunk.endLine).join('\n');
    const context = lines.slice(expandedStart, expandedEnd).join('\n');

    return {
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content,
      type: chunk.type,
      name: chunk.name,
      context,
      relevanceScore: result.contextualRelevance,
      chunkId: chunk.id
    };
  }

  /**
   * Extract code snippets from file context
   */
  private extractCodeSnippets(
    fileContext: FileContext,
    searchResults: EnhancedSearchResult[]
  ): CodeSnippet[] {
    const snippets: CodeSnippet[] = [];
    
    for (const section of fileContext.relevantSections) {
      const lines = fileContext.fullContent.split('\n');
      const beforeLines = lines.slice(
        Math.max(0, section.startLine - 4), 
        section.startLine - 1
      );
      const afterLines = lines.slice(
        section.endLine, 
        Math.min(lines.length, section.endLine + 3)
      );

      const snippet: CodeSnippet = {
        id: section.chunkId,
        filePath: fileContext.filePath,
        content: section.content,
        startLine: section.startLine,
        endLine: section.endLine,
        type: section.type,
        name: section.name,
        relevanceScore: section.relevanceScore,
        context: {
          before: beforeLines.join('\n'),
          after: afterLines.join('\n')
        }
      };

      snippets.push(snippet);
    }

    return snippets;
  }

  /**
   * Group search results by file path
   */
  private groupResultsByFile(
    results: EnhancedSearchResult[]
  ): Map<string, EnhancedSearchResult[]> {
    const groups = new Map<string, EnhancedSearchResult[]>();
    
    for (const result of results) {
      const filePath = result.chunk.filePath;
      
      if (!groups.has(filePath)) {
        groups.set(filePath, []);
      }
      
      groups.get(filePath)!.push(result);
    }

    return groups;
  }

  /**
   * Find file in codebase with improved path matching
   */
  private findFileInCodebase(codebase: StoredCodebase, filePath: string): CodebaseIndex | undefined {
    // Try exact match first
    let file = codebase.files.find(f => f.filePath === filePath);
    if (file) return file;

    // Try normalized paths (remove leading slash, handle relative paths)
    const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    file = codebase.files.find(f => 
      f.filePath === normalizedPath || 
      f.filePath.endsWith('/' + normalizedPath) ||
      this.normalizeFilePath(f.filePath) === this.normalizeFilePath(filePath)
    );
    if (file) return file;

    // Try filename match as last resort
    const fileName = filePath.split('/').pop();
    if (fileName) {
      file = codebase.files.find(f => f.fileName === fileName);
    }
    
    return file;
  }

  /**
   * Normalize file path for comparison
   */
  private normalizeFilePath(path: string): string {
    return path
      .replace(/^\/+/, '') // Remove leading slashes
      .replace(/\/+/g, '/') // Normalize multiple slashes
      .toLowerCase();
  }

  /**
   * Create file context from chunks when file is not found (FALLBACK LOGIC)
   */
  private createFileContextFromChunks(
    filePath: string,
    searchResults: EnhancedSearchResult[],
    options: {
      contextLines: number;
      includeFullFiles: boolean;
      includeDependencies: boolean;
    }
  ): FileContext {
    console.log(`🔄 Creating fallback context from ${searchResults.length} chunks for: ${filePath}`);
    
    const fileName = filePath.split('/').pop() || filePath;
    const language = searchResults[0]?.chunk?.metadata?.language || 'unknown';
    
    // Extract relevant sections from chunk content
    const relevantSections: RelevantSection[] = [];
    let totalLines = 0;
    let fullContent = '';
    
    for (const result of searchResults) {
      const chunk = result.chunk;
      if (!chunk?.content) continue;
      
      // Create section from chunk content
      const section: RelevantSection = {
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        content: chunk.content,
        type: chunk.type,
        name: chunk.name,
        context: chunk.content, // Use full content as context
        relevanceScore: result.score,
        chunkId: result.chunkId
      };
      
      relevantSections.push(section);
      
      // Accumulate for full content if requested
      if (options.includeFullFiles) {
        fullContent += chunk.content + '\n\n';
      }
      
      totalLines += (chunk.endLine - chunk.startLine + 1);
    }
    
    // Calculate aggregated relevance score
    const relevanceScore = searchResults.reduce(
      (sum, result) => sum + result.score, 0
    ) / searchResults.length;
    
    // Extract imports/exports from chunks
    const imports = [...new Set(searchResults.flatMap(r => r.chunk?.metadata?.imports || []))];
    const exports = [...new Set(searchResults.flatMap(r => r.chunk?.metadata?.exports || []))];
    
    console.log(`✅ Created fallback context with ${relevantSections.length} sections, ${totalLines} lines`);
    
    return {
      filePath,
      fileName,
      language,
      fullContent: options.includeFullFiles ? fullContent.trim() : '',
      relevantSections,
      imports,
      exports,
      lineCount: totalLines,
      relevanceScore
    };
  }

  /**
   * Generate context summary
   */
  private generateContextSummary(
    fileContexts: FileContext[],
    codeSnippets: CodeSnippet[],
    query: string
  ): ContextSummary {
    const languages = [...new Set(fileContexts.map(fc => fc.language))];
    const allKeywords = new Set<string>();
    
    // Extract patterns from code snippets
    codeSnippets.forEach(snippet => {
      // Simple keyword extraction
      const keywords = this.extractKeywords(snippet.content);
      keywords.forEach(kw => allKeywords.add(kw));
    });

    const keyPatterns = Array.from(allKeywords).slice(0, 10);
    
    // Generate suggested approach based on found patterns
    const suggestedApproach = this.generateSuggestedApproach(
      fileContexts,
      query,
      keyPatterns
    );

    // Find related concepts
    const relatedConcepts = this.findRelatedConcepts(fileContexts, query);

    return {
      filesAnalyzed: fileContexts.length,
      sectionsFound: codeSnippets.length,
      primaryLanguages: languages,
      keyPatterns,
      suggestedApproach,
      relatedConcepts
    };
  }

  /**
   * Calculate context confidence score
   */
  private calculateContextConfidence(
    searchResults: ContextualSearchResult,
    fileContexts: FileContext[],
    codeSnippets: CodeSnippet[]
  ): number {
    let confidence = 0;

    // Base confidence from search results
    confidence += Math.min(searchResults.totalRelevance / searchResults.chunks.length, 0.4);

    // Boost for having multiple relevant files
    confidence += Math.min(fileContexts.length * 0.05, 0.2);

    // Boost for having code snippets
    confidence += Math.min(codeSnippets.length * 0.02, 0.2);

    // Boost for consistent language/patterns
    const languages = new Set(fileContexts.map(fc => fc.language));
    if (languages.size <= 2) confidence += 0.1;

    // Boost for having high-relevance snippets
    const highRelevanceSnippets = codeSnippets.filter(s => s.relevanceScore > 0.8);
    confidence += Math.min(highRelevanceSnippets.length * 0.03, 0.1);

    return Math.min(confidence, 1.0);
  }

  /**
   * Extract keywords from code content
   */
  private extractKeywords(content: string): string[] {
    const keywords = new Set<string>();
    
    // Function names
    const functions = content.match(/(?:function\s+|const\s+|let\s+|var\s+)(\w+)/g);
    functions?.forEach(match => {
      const name = match.split(/\s+/).pop();
      if (name && name.length > 2) keywords.add(name);
    });

    // Class names
    const classes = content.match(/class\s+(\w+)/g);
    classes?.forEach(match => {
      const name = match.split(/\s+/)[1];
      if (name) keywords.add(name);
    });

    // Important identifiers
    const identifiers = content.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
    identifiers?.slice(0, 5).forEach(id => keywords.add(id));

    return Array.from(keywords);
  }

  /**
   * Generate suggested implementation approach
   */
  private generateSuggestedApproach(
    fileContexts: FileContext[],
    query: string,
    patterns: string[]
  ): string {
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('implement') || queryLower.includes('create')) {
      return `Based on the found patterns, consider implementing similar to the existing ${patterns[0] || 'components'} using the ${fileContexts[0]?.language || 'same'} approach.`;
    }
    
    if (queryLower.includes('fix') || queryLower.includes('debug')) {
      return `Review the similar implementations found to understand the expected behavior and identify potential issues.`;
    }
    
    if (queryLower.includes('optimize') || queryLower.includes('improve')) {
      return `Analyze the performance patterns in the found code to identify optimization opportunities.`;
    }
    
    return `Study the related code patterns to understand the current implementation approach and build upon it.`;
  }

  /**
   * Find related concepts in the codebase
   */
  private findRelatedConcepts(fileContexts: FileContext[], query: string): string[] {
    const concepts = new Set<string>();
    
    // Extract from imports/exports
    fileContexts.forEach(fc => {
      fc.imports.slice(0, 3).forEach(imp => concepts.add(imp));
      fc.exports.slice(0, 3).forEach(exp => concepts.add(exp));
    });

    // Extract from file names
    fileContexts.forEach(fc => {
      const baseName = fc.fileName.split('.')[0];
      if (baseName.length > 2) concepts.add(baseName);
    });

    return Array.from(concepts).slice(0, 8);
  }

  /**
   * Get codebase with client override support
   */
  private async getCodebaseWithClientOverride(
    codebaseId: string, 
    clientCodebase?: PrunedStoredCodebase
  ): Promise<StoredCodebase> {
    // Prefer client-provided codebase for privacy-first approach
    if (clientCodebase) {
      console.log(`🔒 Using client-provided codebase (privacy-first mode): ${clientCodebase.metadata.id}`);
      return this.convertPrunedToStoredCodebase(clientCodebase);
    }

    // Fall back to server-side lookup
    console.log(`🗄️ Attempting server-side codebase lookup: ${codebaseId}`);
    return this.getCodebase(codebaseId);
  }

  /**
   * Convert pruned codebase back to StoredCodebase format
   */
  private convertPrunedToStoredCodebase(prunedCodebase: PrunedStoredCodebase): StoredCodebase {
    // Convert pruned files back to CodebaseIndex format
    const files: CodebaseIndex[] = prunedCodebase.files.map(prunedFile => ({
      fileId: prunedFile.fileId,
      fileName: prunedFile.fileName,
      filePath: prunedFile.filePath,
      language: prunedFile.language,
      content: prunedFile.contentPreview, // Use the complete content (not pruned anymore)
      lines: prunedFile.lines,
      size: prunedFile.size,
      lastModified: prunedFile.lastModified,
      functions: prunedFile.functions.map(f => ({ 
        name: f.name, 
        line: f.line,
        params: [], // Not available in pruned format
        returnType: '', // Not available in pruned format
        isAsync: false, // Not available in pruned format
        isExported: false // Not available in pruned format
      })),
      classes: prunedFile.classes.map(c => ({ 
        name: c.name, 
        line: c.line,
        extends: '', // Not available in pruned format
        implements: [], // Not available in pruned format
        methods: [], // Not available in pruned format
        properties: [] // Not available in pruned format
      })),
      imports: prunedFile.imports.map(i => ({ 
        source: i.source, 
        imports: [], // Not available in pruned format
        line: 0 // Not available in pruned format
      })),
      exports: prunedFile.exports.map(e => ({ 
        name: e.name, 
        type: (e.type as "function" | "class" | "variable" | "interface" | "type" | "const") || "variable",
        line: 0 // Not available in pruned format
      })),
      variables: prunedFile.variables.map(v => v.name),
      interfaces: prunedFile.interfaces.map(i => ({ 
        name: i.name, 
        line: i.line,
        extends: undefined, // Not available in pruned format
        properties: [], // Not available in pruned format
        methods: [] // Not available in pruned format
      })),
      types: prunedFile.types.map(t => ({ 
        name: t.name, 
        line: t.line,
        type: 'type' as const,
        isDefault: false
      })),
      keywords: prunedFile.keywords,
      dependencies: prunedFile.dependencies
    }));

    return {
      metadata: prunedCodebase.metadata,
      files,
      searchIndex: prunedCodebase.searchIndex
    };
  }

  /**
   * Get codebase from storage with caching
   */
  private async getCodebase(codebaseId: string): Promise<StoredCodebase> {
    if (this.codebaseCache.has(codebaseId)) {
      return this.codebaseCache.get(codebaseId)!;
    }

    const codebase = await StorageManager.getCodebase(codebaseId);
    if (!codebase) {
      console.warn(`⚠️ Codebase not found in StorageManager: ${codebaseId}`);
      
      // Check if this is a GitHub repository that might need re-import
      if (codebaseId.startsWith('github_')) {
        console.log(`💡 This appears to be a GitHub repository. You may need to re-import it to store metadata.`);
      }
      
      // List available codebases for debugging
      try {
        const allCodebases = await StorageManager.getAllCodebaseMetadata();
        console.log(`📋 Available codebases in storage:`, allCodebases.map(cb => cb.id));
      } catch (e) {
        console.warn(`Failed to list codebases:`, e);
      }
      
      throw new Error(`Codebase not found: ${codebaseId}. Please ensure the codebase is properly imported and indexed, or provide codebase metadata with your search request.`);
    }

    this.codebaseCache.set(codebaseId, codebase);
    return codebase;
  }

  /**
   * Generate unique context ID
   */
  private generateContextId(query: string, codebaseId: string): string {
    const timestamp = Date.now();
    const hash = query.length + codebaseId.length + timestamp;
    return `context_${hash.toString(36)}`;
  }

  /**
   * Clean up cache to prevent memory leaks
   */
  private cleanupCache(): void {
    // Clear caches if they get too large
    if (this.codebaseCache.size > 10) {
      const entries = Array.from(this.codebaseCache.entries());
      // Keep only the 5 most recently used
      entries.slice(0, -5).forEach(([key]) => {
        this.codebaseCache.delete(key);
      });
    }

    if (this.fileContentCache.size > 50) {
      this.fileContentCache.clear();
    }
  }

  /**
   * Optimize context for display (limit size, etc.)
   */
  optimizeForDisplay(context: AssembledContext, maxDisplayLines: number = 500): AssembledContext {
    let currentLines = 0;
    const optimizedFiles: FileContext[] = [];
    const optimizedSnippets: CodeSnippet[] = [];

    // Sort by relevance and include until we hit the line limit
    const sortedFiles = context.relevantFiles.sort((a, b) => b.relevanceScore - a.relevanceScore);

    for (const file of sortedFiles) {
      if (currentLines >= maxDisplayLines) break;

      const remainingLines = maxDisplayLines - currentLines;
      
      if (file.lineCount <= remainingLines) {
        optimizedFiles.push(file);
        currentLines += file.lineCount;
      } else {
        // Truncate file content
        const truncatedFile: FileContext = {
          ...file,
          fullContent: file.fullContent.split('\n').slice(0, remainingLines).join('\n'),
          lineCount: remainingLines,
          relevantSections: file.relevantSections.filter(
            section => section.startLine <= remainingLines
          )
        };
        optimizedFiles.push(truncatedFile);
        currentLines = maxDisplayLines;
      }
    }

    // Include snippets from the optimized files
    const optimizedFilePaths = new Set(optimizedFiles.map(f => f.filePath));
    optimizedSnippets.push(
      ...context.codeSnippets.filter(snippet => 
        optimizedFilePaths.has(snippet.filePath)
      )
    );

    return {
      ...context,
      relevantFiles: optimizedFiles,
      codeSnippets: optimizedSnippets,
      totalLines: currentLines
    };
  }

  /**
   * Export context as formatted text (for AI consumption)
   */
  exportAsText(context: AssembledContext): string {
    const sections: string[] = [];

    sections.push(`# Context for Query: ${context.query}`);
    sections.push(`Generated: ${new Date().toISOString()}`);
    sections.push(`Confidence: ${(context.confidence * 100).toFixed(1)}%`);
    sections.push('');

    sections.push('## Summary');
    sections.push(`- Files analyzed: ${context.summary.filesAnalyzed}`);
    sections.push(`- Code sections found: ${context.summary.sectionsFound}`);
    sections.push(`- Primary languages: ${context.summary.primaryLanguages.join(', ')}`);
    sections.push(`- Suggested approach: ${context.summary.suggestedApproach}`);
    sections.push('');

    sections.push('## Relevant Code Sections');
    
    for (const snippet of context.codeSnippets.slice(0, 10)) {
      sections.push(`### ${snippet.name || snippet.type} - ${snippet.filePath}:${snippet.startLine}-${snippet.endLine}`);
      sections.push(`Relevance: ${(snippet.relevanceScore * 100).toFixed(1)}%`);
      sections.push('```' + this.getLanguageFromPath(snippet.filePath));
      sections.push(snippet.content);
      sections.push('```');
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Get language identifier from file path
   */
  private getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust'
    };
    return langMap[ext || ''] || '';
  }
}
