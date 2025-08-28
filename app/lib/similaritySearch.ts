import { SemanticChunker, CodeChunk } from './semanticChunking';
import { VectorEmbeddingService, EmbeddingBatch } from './vectorEmbeddings';
import { PineconeService, SearchResult, PineconeChunkMetadata } from './pineconeService';
import { CodebaseIndex } from './codebaseParser';

export interface ContextualSearchResult {
  chunks: EnhancedSearchResult[];
  totalRelevance: number;
  searchTime: number;
  query: string;
  contextSummary: string;
}

export interface EnhancedSearchResult extends SearchResult {
  chunk: CodeChunk;
  contextualRelevance: number;
  snippet: string;
  relatedChunks: SearchResult[];
}

export interface SearchContext {
  codebaseId: string;
  language?: string;
  fileType?: string;
  maxResults?: number;
  relevanceThreshold?: number;
  includeRelated?: boolean;
  contextWindow?: number; // Lines of context around the match
}

export interface IndexingProgress {
  phase: 'chunking' | 'embedding' | 'storing' | 'complete';
  progress: number; // 0-100
  currentFile?: string;
  message: string;
  chunksProcessed?: number;
  totalChunks?: number;
  errors: string[];
}

export type IndexingProgressCallback = (progress: IndexingProgress) => void;

export class SimilaritySearchService {
  private chunker: SemanticChunker;
  private embeddingService: VectorEmbeddingService;
  private pineconeService: PineconeService;

  constructor(
    openAiApiKey?: string,
    pineconeApiKey?: string,
    pineconeEnvironment?: string
  ) {
    this.chunker = new SemanticChunker({
      maxChunkSize: 1500,
      minChunkSize: 100,
      preserveStructure: true,
      includeComments: true
    });

    this.embeddingService = new VectorEmbeddingService(openAiApiKey);
    this.pineconeService = new PineconeService(pineconeApiKey, pineconeEnvironment);
  }

  /**
   * Initialize the search service (setup Pinecone index)
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Similarity Search Service...');
    await this.pineconeService.initializeIndex();
    console.log('✅ Similarity Search Service ready');
  }

  /**
   * Index a codebase for semantic search
   */
  async indexCodebase(
    codebaseFiles: CodebaseIndex[],
    codebaseId: string,
    onProgress?: IndexingProgressCallback
  ): Promise<{
    chunksIndexed: number;
    embeddingsGenerated: number;
    indexingTime: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    const errors: string[] = [];
    let totalChunks = 0;

    console.log(`🔍 Starting codebase indexing for codebase: ${codebaseId}`);
    console.log(`📁 Processing ${codebaseFiles.length} files...`);

    onProgress?.({
      phase: 'chunking',
      progress: 0,
      message: 'Starting semantic chunking...',
      errors: []
    });

    // Phase 1: Semantic Chunking
    const allChunks: CodeChunk[] = [];
    let processedFiles = 0;

    for (const file of codebaseFiles) {
      if (!file.content || file.content.trim().length === 0) {
        console.log(`⏭️ Skipping empty file: ${file.filePath}`);
        processedFiles++;
        continue;
      }

      try {
        onProgress?.({
          phase: 'chunking',
          progress: Math.round((processedFiles / codebaseFiles.length) * 100),
          currentFile: file.fileName,
          message: `Chunking ${file.fileName}...`,
          errors
        });

        console.log(`🔄 Chunking file: ${file.filePath}`);
        
        const chunks = await this.chunker.chunkCode(
          file.filePath, 
          file.content, 
          file.language
        );

        // Optimize chunks
        const optimizedChunks = this.chunker.optimizeChunks(chunks);
        allChunks.push(...optimizedChunks);
        totalChunks += optimizedChunks.length;

        console.log(`✅ Generated ${optimizedChunks.length} chunks for ${file.fileName}`);
      } catch (error) {
        const errorMsg = `Error chunking ${file.fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌', errorMsg);
        errors.push(errorMsg);
      }

      processedFiles++;
    }

    console.log(`📊 Phase 1 complete: Generated ${allChunks.length} total chunks`);

    // Phase 2: Generate Embeddings
    onProgress?.({
      phase: 'embedding',
      progress: 0,
      message: 'Generating vector embeddings...',
      chunksProcessed: 0,
      totalChunks: allChunks.length,
      errors
    });

    let embeddingBatch: EmbeddingBatch;
    
    try {
      console.log('🧠 Generating embeddings for all chunks...');
      embeddingBatch = await this.embeddingService.generateEmbeddings(allChunks);
      
      console.log(`✅ Generated ${embeddingBatch.embeddings.length} embeddings`);
      console.log(`📊 Token usage: ${embeddingBatch.totalTokens} tokens`);
    } catch (error) {
      const errorMsg = `Error generating embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      errors.push(errorMsg);
      throw new Error(errorMsg);
    }

    // Phase 3: Store in Pinecone
    onProgress?.({
      phase: 'storing',
      progress: 0,
      message: 'Storing vectors in Pinecone...',
      chunksProcessed: 0,
      totalChunks: allChunks.length,
      errors
    });

    try {
      console.log('💾 Storing chunks and embeddings in Pinecone...');
      
      await this.pineconeService.storeChunks(
        allChunks,
        embeddingBatch.embeddings,
        codebaseId,
        (progress) => {
          onProgress?.({
            phase: 'storing',
            progress: Math.round((progress.processed / progress.total) * 100),
            message: `Storing vectors... (${progress.processed}/${progress.total})`,
            currentFile: progress.currentChunk,
            chunksProcessed: progress.processed,
            totalChunks: progress.total,
            errors: [...errors, ...Array(progress.errors).fill('Storage error')]
          });
        }
      );

      console.log(`✅ Successfully stored vectors in Pinecone`);
    } catch (error) {
      const errorMsg = `Error storing in Pinecone: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      errors.push(errorMsg);
      throw new Error(errorMsg);
    }

    const indexingTime = Date.now() - startTime;

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: `Indexing complete! ${allChunks.length} chunks indexed in ${Math.round(indexingTime / 1000)}s`,
      chunksProcessed: allChunks.length,
      totalChunks: allChunks.length,
      errors
    });

    console.log(`🎉 Codebase indexing complete!`);
    console.log(`📊 Stats: ${allChunks.length} chunks, ${embeddingBatch.embeddings.length} embeddings, ${indexingTime}ms`);

    return {
      chunksIndexed: allChunks.length,
      embeddingsGenerated: embeddingBatch.embeddings.length,
      indexingTime,
      errors
    };
  }

  /**
   * Search for semantically similar code using natural language query
   */
  async search(
    query: string,
    context: SearchContext
  ): Promise<ContextualSearchResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Searching for: "${query.substring(0, 100)}..."`);
    console.log(`📊 Context: codebase=${context.codebaseId}, maxResults=${context.maxResults || 10}`);

    try {
      // Generate embedding for the query
      console.log('🧠 Generating query embedding...');
      const queryEmbedding = await this.embeddingService.generateQueryEmbedding(query);

      // Search in Pinecone
      console.log('🔍 Searching similar chunks in Pinecone...');
      const searchResults = await this.pineconeService.advancedSearch({
        query,
        generateEmbedding: (text) => this.embeddingService.generateQueryEmbedding(text),
        codebaseId: context.codebaseId,
        languages: context.language ? [context.language] : undefined,
        topK: context.maxResults || 10
      });

      // Filter by relevance threshold
      const relevantResults = searchResults.filter(
        result => result.score >= (context.relevanceThreshold || 0.7)
      );

      console.log(`📊 Found ${relevantResults.length} relevant results (${searchResults.length} total)`);

      // Enhance results with additional context
      const enhancedResults = await this.enhanceSearchResults(
        relevantResults,
        context,
        query
      );

      const searchTime = Date.now() - startTime;
      const totalRelevance = enhancedResults.reduce((sum, result) => sum + result.score, 0);

      const contextSummary = this.generateContextSummary(enhancedResults, query);

      console.log(`✅ Search completed in ${searchTime}ms`);

      return {
        chunks: enhancedResults,
        totalRelevance,
        searchTime,
        query,
        contextSummary
      };
    } catch (error) {
      console.error('❌ Error during search:', error);
      throw error;
    }
  }

  /**
   * Get intelligent context for a specific file or function
   */
  async getIntelligentContext(
    filePath: string,
    codebaseId: string,
    contextType: 'file' | 'function' | 'class' = 'file',
    targetName?: string
  ): Promise<ContextualSearchResult> {
    console.log(`🎯 Getting intelligent context for ${contextType}: ${filePath}${targetName ? `::${targetName}` : ''}`);

    // Build search query based on context type
    let searchQuery = '';
    
    switch (contextType) {
      case 'file':
        searchQuery = `File structure and main functionality of ${filePath}`;
        break;
      case 'function':
        searchQuery = `Function ${targetName} implementation and usage patterns`;
        break;
      case 'class':
        searchQuery = `Class ${targetName} methods properties and inheritance`;
        break;
    }

    // Search for related chunks
    const results = await this.search(searchQuery, {
      codebaseId,
      maxResults: 15,
      relevanceThreshold: 0.6,
      includeRelated: true
    });

    // Filter results to focus on the specific file/function
    const filteredResults = results.chunks.filter(chunk => {
      const metadata = chunk.metadata as PineconeChunkMetadata;
      
      if (metadata.filePath.includes(filePath)) {
        if (targetName) {
          return metadata.name === targetName || 
                 chunk.chunk.content.includes(targetName);
        }
        return true;
      }
      
      // Include related chunks that reference the target
      return targetName ? chunk.chunk.content.includes(targetName) : false;
    });

    return {
      ...results,
      chunks: filteredResults,
      contextSummary: `Intelligent context for ${contextType} ${filePath}${targetName ? `::${targetName}` : ''}`
    };
  }

  /**
   * Find code patterns and similar implementations
   */
  async findSimilarPatterns(
    codeExample: string,
    codebaseId: string,
    patternType: 'function' | 'class' | 'pattern' = 'pattern'
  ): Promise<ContextualSearchResult> {
    console.log(`🔍 Finding similar ${patternType} patterns...`);

    // Create a search query that focuses on code patterns
    const searchQuery = `${patternType} implementation similar to: ${codeExample.substring(0, 500)}`;

    const results = await this.search(searchQuery, {
      codebaseId,
      maxResults: 20,
      relevanceThreshold: 0.75,
      includeRelated: false
    });

    // Sort by contextual relevance for pattern matching
    results.chunks.sort((a, b) => b.contextualRelevance - a.contextualRelevance);

    return {
      ...results,
      contextSummary: `Similar ${patternType} patterns found in codebase`
    };
  }

  /**
   * Enhance search results with additional context and related chunks
   */
  private async enhanceSearchResults(
    results: SearchResult[],
    context: SearchContext,
    query: string
  ): Promise<EnhancedSearchResult[]> {
    const enhanced: EnhancedSearchResult[] = [];

    for (const result of results) {
      try {
        // Reconstruct CodeChunk from metadata
        const chunk = this.reconstructChunkFromMetadata(result.metadata);
        
        // Calculate contextual relevance
        const contextualRelevance = this.calculateContextualRelevance(
          chunk,
          query,
          result.score
        );

        // Generate snippet
        const snippet = this.generateSnippet(chunk, query, context.contextWindow || 3);

        // Find related chunks if requested
        let relatedChunks: SearchResult[] = [];
        if (context.includeRelated) {
          relatedChunks = await this.findRelatedChunks(chunk, context.codebaseId);
        }

        enhanced.push({
          ...result,
          chunk,
          contextualRelevance,
          snippet,
          relatedChunks
        });
      } catch (error) {
        console.warn(`⚠️ Error enhancing result ${result.chunkId}:`, error);
      }
    }

    return enhanced.sort((a, b) => b.contextualRelevance - a.contextualRelevance);
  }

  /**
   * Reconstruct CodeChunk from Pinecone metadata
   */
  private reconstructChunkFromMetadata(metadata: PineconeChunkMetadata): CodeChunk {
    return {
      id: '', // Will be set by the calling function
      content: metadata.contentPreview + '...', // Note: Full content not stored in metadata
      type: metadata.type as CodeChunk['type'],
      name: metadata.name,
      filePath: metadata.filePath,
      startLine: metadata.startLine,
      endLine: metadata.endLine,
      metadata: {
        language: metadata.language,
        complexity: metadata.complexity,
        dependencies: metadata.dependencies,
        exports: metadata.exports,
        imports: metadata.imports,
        keywords: metadata.keywords
      },
      parentChunk: metadata.parentChunk,
      childChunks: []
    };
  }

  /**
   * Calculate contextual relevance based on multiple factors
   */
  private calculateContextualRelevance(
    chunk: CodeChunk,
    query: string,
    baseScore: number
  ): number {
    let relevance = baseScore;

    // Boost based on chunk type relevance
    const queryLower = query.toLowerCase();
    if (queryLower.includes('function') && chunk.type === 'function') relevance += 0.1;
    if (queryLower.includes('class') && chunk.type === 'class') relevance += 0.1;
    if (queryLower.includes('interface') && chunk.type === 'interface') relevance += 0.1;

    // Boost based on keyword matches
    const queryWords = queryLower.split(/\s+/);
    const keywordMatches = chunk.metadata.keywords.filter(keyword =>
      queryWords.some(word => keyword.includes(word) || word.includes(keyword))
    );
    relevance += keywordMatches.length * 0.02;

    // Boost based on complexity (more complex = potentially more relevant for implementations)
    relevance += chunk.metadata.complexity * 0.01;

    // Penalize very short chunks
    if (chunk.content.length < 100) relevance -= 0.05;

    return Math.min(relevance, 1.0);
  }

  /**
   * Generate a contextual snippet from the chunk
   */
  private generateSnippet(
    chunk: CodeChunk,
    query: string,
    contextLines: number = 3
  ): string {
    const lines = chunk.content.split('\n');
    const queryWords = query.toLowerCase().split(/\s+/);
    
    // Find the most relevant lines
    let bestMatch = 0;
    let bestScore = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const score = queryWords.reduce((acc, word) => {
        return acc + (line.includes(word) ? 1 : 0);
      }, 0);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = i;
      }
    }

    // Extract context around the best match
    const start = Math.max(0, bestMatch - contextLines);
    const end = Math.min(lines.length, bestMatch + contextLines + 1);
    
    const snippet = lines.slice(start, end).join('\n');
    
    return snippet.length > 300 ? snippet.substring(0, 300) + '...' : snippet;
  }

  /**
   * Find related chunks (same file, same class, etc.)
   */
  private async findRelatedChunks(
    chunk: CodeChunk,
    codebaseId: string
  ): Promise<SearchResult[]> {
    try {
      // Search for chunks in the same file
      const sameFileResults = await this.pineconeService.advancedSearch({
        codebaseId,
        topK: 5,
        // This would need to be implemented with proper metadata filtering
      });

      return sameFileResults.filter(result => 
        result.metadata.filePath === chunk.filePath && 
        result.chunkId !== chunk.id
      );
    } catch (error) {
      console.warn('⚠️ Error finding related chunks:', error);
      return [];
    }
  }

  /**
   * Generate a summary of the search context
   */
  private generateContextSummary(
    results: EnhancedSearchResult[],
    query: string
  ): string {
    if (results.length === 0) {
      return `No relevant code found for query: "${query}"`;
    }

    const fileCount = new Set(results.map(r => r.metadata.fileName)).size;
    const typeDistribution = results.reduce((acc, r) => {
      acc[r.chunk.type] = (acc[r.chunk.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topType = Object.entries(typeDistribution)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'code';

    return `Found ${results.length} relevant ${topType} segments across ${fileCount} files for "${query}"`;
  }

  /**
   * Health check for the entire search service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: {
      pinecone: any;
      embeddings: boolean;
      chunking: boolean;
    };
    details: string;
  }> {
    try {
      // Check Pinecone
      const pineconeHealth = await this.pineconeService.healthCheck();
      
      // Test embeddings (simple test)
      let embeddingsWorking = false;
      try {
        await this.embeddingService.generateQueryEmbedding('test');
        embeddingsWorking = true;
      } catch {
        embeddingsWorking = false;
      }

      // Test chunking (simple test)
      let chunkingWorking = false;
      try {
        await this.chunker.chunkCode('test.js', 'function test() { return "hello"; }');
        chunkingWorking = true;
      } catch {
        chunkingWorking = false;
      }

      const allHealthy = pineconeHealth.connected && 
                       pineconeHealth.indexReady && 
                       embeddingsWorking && 
                       chunkingWorking;

      const status = allHealthy ? 'healthy' : 
                    (pineconeHealth.connected ? 'degraded' : 'unhealthy');

      return {
        status,
        components: {
          pinecone: pineconeHealth,
          embeddings: embeddingsWorking,
          chunking: chunkingWorking
        },
        details: `Pinecone: ${pineconeHealth.connected ? 'OK' : 'FAIL'}, Embeddings: ${embeddingsWorking ? 'OK' : 'FAIL'}, Chunking: ${chunkingWorking ? 'OK' : 'FAIL'}`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        components: {
          pinecone: { connected: false, error: 'Health check failed' },
          embeddings: false,
          chunking: false
        },
        details: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
