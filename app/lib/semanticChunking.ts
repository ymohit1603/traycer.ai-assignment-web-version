import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import crypto from 'crypto-js';

export interface CodeChunk {
  id: string;
  content: string;
  type: 'function' | 'class' | 'method' | 'variable' | 'import' | 'export' | 'interface' | 'type' | 'block';
  name?: string;
  filePath: string;
  startLine: number;
  endLine: number;
  metadata: {
    language: string;
    complexity: number;
    dependencies: string[];
    exports: string[];
    imports: string[];
    keywords: string[];
  };
  embedding?: number[];
  parentChunk?: string;
  childChunks: string[];
}

export interface ChunkingOptions {
  maxChunkSize: number;
  minChunkSize: number;
  preserveStructure: boolean;
  includeComments: boolean;
  language: string;
}

export class SemanticChunker {
  private defaultOptions: ChunkingOptions = {
    maxChunkSize: 1000,
    minChunkSize: 50,
    preserveStructure: true,
    includeComments: true,
    language: 'auto'
  };

  constructor(private options: Partial<ChunkingOptions> = {}) {
    this.options = { ...this.defaultOptions, ...options };
  }

  /**
   * Main method to chunk code into semantic segments
   */
  async chunkCode(filePath: string, content: string, language?: string): Promise<CodeChunk[]> {
    const detectedLanguage = language || this.detectLanguage(filePath);
    
    try {
      switch (detectedLanguage) {
        case 'javascript':
        case 'typescript':
        case 'jsx':
        case 'tsx':
          return await this.chunkJavaScriptTypeScript(filePath, content, detectedLanguage);
        case 'python':
          return await this.chunkPython(filePath, content);
        case 'java':
          return await this.chunkJava(filePath, content);
        default:
          return await this.chunkGeneric(filePath, content, detectedLanguage);
      }
    } catch (error) {
      console.error(`Error chunking file ${filePath}:`, error);
      // Fallback to generic chunking
      return await this.chunkGeneric(filePath, content, detectedLanguage);
    }
  }

  /**
   * Chunk JavaScript/TypeScript using AST parsing
   */
  private async chunkJavaScriptTypeScript(filePath: string, content: string, language: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    
    try {
      // Parse with appropriate settings for TypeScript/JSX
      const ast = parse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'asyncGenerators',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
          'importMeta',
          'topLevelAwait',
          'optionalCatchBinding'
        ]
      });

      // Collect imports and exports first
      const imports: string[] = [];
      const exports: string[] = [];
      const topLevelStatements: any[] = [];

      traverse(ast, {
        // Collect imports
        ImportDeclaration(path) {
          const importStr = this.getNodeContent(content, path.node);
          imports.push(path.node.source.value);
          
          chunks.push(this.createChunk(
            importStr,
            'import',
            filePath,
            path.node.loc?.start.line || 1,
            path.node.loc?.end.line || 1,
            language,
            {
              dependencies: [path.node.source.value],
              imports: [path.node.source.value],
              exports: [],
              keywords: ['import']
            }
          ));
        },

        // Collect exports
        ExportDeclaration(path) {
          const exportStr = this.getNodeContent(content, path.node);
          
          if (t.isExportNamedDeclaration(path.node)) {
            if (path.node.declaration) {
              if (t.isFunctionDeclaration(path.node.declaration)) {
                exports.push(path.node.declaration.id?.name || 'anonymous');
              } else if (t.isClassDeclaration(path.node.declaration)) {
                exports.push(path.node.declaration.id?.name || 'anonymous');
              } else if (t.isVariableDeclaration(path.node.declaration)) {
                path.node.declaration.declarations.forEach(decl => {
                  if (t.isIdentifier(decl.id)) {
                    exports.push(decl.id.name);
                  }
                });
              }
            }
          } else if (t.isExportDefaultDeclaration(path.node)) {
            exports.push('default');
          }

          chunks.push(this.createChunk(
            exportStr,
            'export',
            filePath,
            path.node.loc?.start.line || 1,
            path.node.loc?.end.line || 1,
            language,
            {
              dependencies: [],
              imports: [],
              exports: exports,
              keywords: ['export']
            }
          ));
        },

        // Functions (including arrow functions and methods)
        FunctionDeclaration(path) {
          if (path.parent.type === 'Program') { // Top-level functions only
            this.processFunctionDeclaration(path, content, chunks, filePath, language, imports, exports);
          }
        },

        // Arrow functions assigned to variables
        VariableDeclaration(path) {
          if (path.parent.type === 'Program') {
            path.node.declarations.forEach(declaration => {
              if (t.isArrowFunctionExpression(declaration.init) || 
                  t.isFunctionExpression(declaration.init)) {
                const funcContent = this.getNodeContent(content, path.node);
                const funcName = t.isIdentifier(declaration.id) ? declaration.id.name : 'anonymous';
                
                chunks.push(this.createChunk(
                  funcContent,
                  'function',
                  filePath,
                  path.node.loc?.start.line || 1,
                  path.node.loc?.end.line || 1,
                  language,
                  {
                    dependencies: imports,
                    imports: imports,
                    exports: exports,
                    keywords: this.extractKeywords(funcContent)
                  },
                  funcName
                ));
              } else {
                // Regular variable declaration
                const varContent = this.getNodeContent(content, path.node);
                const varName = t.isIdentifier(declaration.id) ? declaration.id.name : 'anonymous';
                
                chunks.push(this.createChunk(
                  varContent,
                  'variable',
                  filePath,
                  path.node.loc?.start.line || 1,
                  path.node.loc?.end.line || 1,
                  language,
                  {
                    dependencies: imports,
                    imports: imports,
                    exports: exports,
                    keywords: this.extractKeywords(varContent)
                  },
                  varName
                ));
              }
            });
          }
        },

        // Classes
        ClassDeclaration(path) {
          if (path.parent.type === 'Program') {
            this.processClassDeclaration(path, content, chunks, filePath, language, imports, exports);
          }
        },

        // Interfaces (TypeScript)
        TSInterfaceDeclaration(path) {
          const interfaceContent = this.getNodeContent(content, path.node);
          const interfaceName = path.node.id.name;
          
          chunks.push(this.createChunk(
            interfaceContent,
            'interface',
            filePath,
            path.node.loc?.start.line || 1,
            path.node.loc?.end.line || 1,
            language,
            {
              dependencies: imports,
              imports: imports,
              exports: exports,
              keywords: this.extractKeywords(interfaceContent)
            },
            interfaceName
          ));
        },

        // Type aliases (TypeScript)
        TSTypeAliasDeclaration(path) {
          const typeContent = this.getNodeContent(content, path.node);
          const typeName = path.node.id.name;
          
          chunks.push(this.createChunk(
            typeContent,
            'type',
            filePath,
            path.node.loc?.start.line || 1,
            path.node.loc?.end.line || 1,
            language,
            {
              dependencies: imports,
              imports: imports,
              exports: exports,
              keywords: this.extractKeywords(typeContent)
            },
            typeName
          ));
        }
      });

      return chunks;
    } catch (parseError) {
      console.warn(`AST parsing failed for ${filePath}, falling back to generic chunking:`, parseError);
      return await this.chunkGeneric(filePath, content, language);
    }
  }

  private processFunctionDeclaration(path: any, content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]) {
    const funcContent = this.getNodeContent(content, path.node);
    const funcName = path.node.id?.name || 'anonymous';
    
    chunks.push(this.createChunk(
      funcContent,
      'function',
      filePath,
      path.node.loc?.start.line || 1,
      path.node.loc?.end.line || 1,
      language,
      {
        dependencies: imports,
        imports: imports,
        exports: exports,
        keywords: this.extractKeywords(funcContent)
      },
      funcName
    ));
  }

  private processClassDeclaration(path: any, content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]) {
    const classContent = this.getNodeContent(content, path.node);
    const className = path.node.id?.name || 'anonymous';
    
    const classChunk = this.createChunk(
      classContent,
      'class',
      filePath,
      path.node.loc?.start.line || 1,
      path.node.loc?.end.line || 1,
      language,
      {
        dependencies: imports,
        imports: imports,
        exports: exports,
        keywords: this.extractKeywords(classContent)
      },
      className
    );

    chunks.push(classChunk);

    // Process class methods as separate chunks
    path.node.body.body.forEach((node: any) => {
      if (t.isMethodDefinition(node) || t.isClassMethod(node)) {
        const methodContent = this.getNodeContent(content, node);
        const methodName = t.isIdentifier(node.key) ? node.key.name : 'anonymous';
        
        const methodChunk = this.createChunk(
          methodContent,
          'method',
          filePath,
          node.loc?.start.line || 1,
          node.loc?.end.line || 1,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(methodContent)
          },
          `${className}.${methodName}`,
          classChunk.id
        );

        chunks.push(methodChunk);
        classChunk.childChunks.push(methodChunk.id);
      }
    });
  }

  /**
   * Chunk Python code (simplified - could be enhanced with Python AST)
   */
  private async chunkPython(filePath: string, content: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let chunkStartLine = 1;
    let chunkType: CodeChunk['type'] = 'block';
    let chunkName = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Detect function definitions
      if (trimmedLine.startsWith('def ')) {
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i, 'python'));
        }
        
        const funcMatch = trimmedLine.match(/def\s+(\w+)/);
        chunkName = funcMatch ? funcMatch[1] : 'anonymous';
        chunkType = 'function';
        currentChunk = line + '\n';
        chunkStartLine = i + 1;
      }
      // Detect class definitions
      else if (trimmedLine.startsWith('class ')) {
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i, 'python'));
        }
        
        const classMatch = trimmedLine.match(/class\s+(\w+)/);
        chunkName = classMatch ? classMatch[1] : 'anonymous';
        chunkType = 'class';
        currentChunk = line + '\n';
        chunkStartLine = i + 1;
      }
      // Detect imports
      else if (trimmedLine.startsWith('import ') || trimmedLine.startsWith('from ')) {
        if (currentChunk.trim() && chunkType !== 'import') {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i, 'python'));
          currentChunk = '';
        }
        
        if (chunkType !== 'import') {
          chunkType = 'import';
          chunkStartLine = i + 1;
        }
        currentChunk += line + '\n';
      }
      else {
        currentChunk += line + '\n';
        
        // Check if we've reached max chunk size
        if (currentChunk.length > this.options.maxChunkSize! && 
            trimmedLine === '' && 
            chunkType === 'block') {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i + 1, 'python'));
          currentChunk = '';
          chunkStartLine = i + 2;
          chunkType = 'block';
          chunkName = '';
        }
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, lines.length, 'python', undefined, chunkName));
    }

    return chunks;
  }

  /**
   * Chunk Java code (simplified)
   */
  private async chunkJava(filePath: string, content: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    let currentChunk = '';
    let chunkStartLine = 1;
    let chunkType: CodeChunk['type'] = 'block';
    let braceLevel = 0;
    let inClass = false;
    let className = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Count braces
      braceLevel += (line.match(/\{/g) || []).length;
      braceLevel -= (line.match(/\}/g) || []).length;

      // Detect class definitions
      if (trimmedLine.includes('class ') && !inClass) {
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i, 'java'));
        }
        
        const classMatch = trimmedLine.match(/class\s+(\w+)/);
        className = classMatch ? classMatch[1] : 'anonymous';
        chunkType = 'class';
        currentChunk = line + '\n';
        chunkStartLine = i + 1;
        inClass = true;
      }
      // Detect method definitions within classes
      else if (inClass && (trimmedLine.includes('public ') || trimmedLine.includes('private ') || trimmedLine.includes('protected ')) && 
               trimmedLine.includes('(') && trimmedLine.includes(')')) {
        if (currentChunk.trim() && chunkType !== 'class') {
          chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i, 'java'));
        }
        
        chunkType = 'method';
        currentChunk = line + '\n';
        chunkStartLine = i + 1;
      }
      else {
        currentChunk += line + '\n';
      }

      // End of class
      if (inClass && braceLevel === 0 && trimmedLine === '}') {
        chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, i + 1, 'java', undefined, className));
        currentChunk = '';
        chunkStartLine = i + 2;
        chunkType = 'block';
        inClass = false;
        className = '';
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(currentChunk, chunkType, filePath, chunkStartLine, lines.length, 'java'));
    }

    return chunks;
  }

  /**
   * Generic chunking for unsupported languages
   */
  private async chunkGeneric(filePath: string, content: string, language: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const lines = content.split('\n');
    const chunkSize = this.options.maxChunkSize!;
    
    let currentChunk = '';
    let chunkStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentChunk += line + '\n';

      // Create chunk when reaching max size or at natural breakpoints
      if (currentChunk.length >= chunkSize || 
          (line.trim() === '' && currentChunk.length > this.options.minChunkSize!)) {
        
        if (currentChunk.trim()) {
          chunks.push(this.createChunk(
            currentChunk.trim(),
            'block',
            filePath,
            chunkStartLine,
            i + 1,
            language
          ));
        }
        
        currentChunk = '';
        chunkStartLine = i + 2;
      }
    }

    // Add the last chunk
    if (currentChunk.trim()) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        'block',
        filePath,
        chunkStartLine,
        lines.length,
        language
      ));
    }

    return chunks;
  }

  /**
   * Create a code chunk with metadata
   */
  private createChunk(
    content: string,
    type: CodeChunk['type'],
    filePath: string,
    startLine: number,
    endLine: number,
    language: string,
    metadata?: Partial<CodeChunk['metadata']>,
    name?: string,
    parentChunk?: string
  ): CodeChunk {
    const id = this.generateChunkId(filePath, startLine, endLine, content);
    
    return {
      id,
      content: content.trim(),
      type,
      name,
      filePath,
      startLine,
      endLine,
      metadata: {
        language,
        complexity: this.calculateComplexity(content),
        dependencies: metadata?.dependencies || [],
        exports: metadata?.exports || [],
        imports: metadata?.imports || [],
        keywords: metadata?.keywords || this.extractKeywords(content),
        ...metadata
      },
      parentChunk,
      childChunks: []
    };
  }

  /**
   * Generate unique chunk ID
   */
  private generateChunkId(filePath: string, startLine: number, endLine: number, content: string): string {
    const hash = crypto.SHA256(`${filePath}:${startLine}-${endLine}:${content.substring(0, 100)}`).toString();
    return `chunk_${hash.substring(0, 16)}`;
  }

  /**
   * Extract content from AST node
   */
  private getNodeContent(sourceCode: string, node: any): string {
    if (!node.loc) return '';
    
    const lines = sourceCode.split('\n');
    const startLine = node.loc.start.line - 1;
    const endLine = node.loc.end.line - 1;
    
    if (startLine === endLine) {
      return lines[startLine].substring(node.loc.start.column, node.loc.end.column);
    }
    
    let content = lines[startLine].substring(node.loc.start.column) + '\n';
    for (let i = startLine + 1; i < endLine; i++) {
      content += lines[i] + '\n';
    }
    content += lines[endLine].substring(0, node.loc.end.column);
    
    return content;
  }

  /**
   * Calculate complexity score for a code chunk
   */
  private calculateComplexity(content: string): number {
    let complexity = 1;
    
    // Count control flow statements
    const controlFlow = content.match(/(if|else|for|while|switch|try|catch|finally)/g) || [];
    complexity += controlFlow.length;
    
    // Count function calls
    const functionCalls = content.match(/\w+\s*\(/g) || [];
    complexity += Math.floor(functionCalls.length / 3);
    
    // Count nested structures
    const braces = content.match(/\{/g) || [];
    complexity += Math.floor(braces.length / 2);
    
    return Math.min(complexity, 10); // Cap at 10
  }

  /**
   * Extract keywords from code content
   */
  private extractKeywords(content: string): string[] {
    const keywords = new Set<string>();
    
    // Programming keywords
    const codeKeywords = content.match(/\b(async|await|class|function|method|import|export|from|const|let|var|if|else|for|while|do|switch|case|break|continue|return|try|catch|finally|throw|new|this|super|extends|implements|interface|type|enum|namespace|module|public|private|protected|static|readonly|abstract|virtual|override|final|synchronized|volatile|transient|native|strictfp|package|void|int|long|short|byte|char|float|double|boolean|string|object|array|list|map|set|dict|tuple|null|undefined|none|true|false|bool|number)\b/gi);
    
    if (codeKeywords) {
      codeKeywords.forEach(keyword => keywords.add(keyword.toLowerCase()));
    }
    
    // Extract identifiers (variable/function names)
    const identifiers = content.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
    identifiers.slice(0, 20).forEach(id => {
      if (id.length > 2 && !keywords.has(id.toLowerCase())) {
        keywords.add(id.toLowerCase());
      }
    });
    
    return Array.from(keywords).slice(0, 30); // Limit keywords
  }

  /**
   * Detect programming language from file path
   */
  private detectLanguage(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'swift': 'swift',
      'kt': 'kotlin',
      'scala': 'scala',
      'dart': 'dart',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'sh': 'shell',
      'md': 'markdown'
    };
    
    return languageMap[extension || ''] || 'text';
  }

  /**
   * Optimize chunks by merging small chunks and splitting large ones
   */
  optimizeChunks(chunks: CodeChunk[]): CodeChunk[] {
    const optimized: CodeChunk[] = [];
    
    for (const chunk of chunks) {
      // Split large chunks
      if (chunk.content.length > this.options.maxChunkSize! * 1.5) {
        const subChunks = this.splitLargeChunk(chunk);
        optimized.push(...subChunks);
      }
      // Keep normal sized chunks
      else if (chunk.content.length >= this.options.minChunkSize!) {
        optimized.push(chunk);
      }
      // Small chunks can be merged with adjacent chunks or kept if they're important
      else if (chunk.type !== 'block' || chunk.metadata.complexity > 1) {
        optimized.push(chunk);
      }
    }
    
    return optimized;
  }

  /**
   * Split a large chunk into smaller chunks
   */
  private splitLargeChunk(chunk: CodeChunk): CodeChunk[] {
    const lines = chunk.content.split('\n');
    const targetSize = this.options.maxChunkSize!;
    const chunks: CodeChunk[] = [];
    
    let currentContent = '';
    let currentStart = chunk.startLine;
    let lineOffset = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentContent += line + '\n';
      
      if (currentContent.length >= targetSize && line.trim() === '') {
        chunks.push(this.createChunk(
          currentContent.trim(),
          'block',
          chunk.filePath,
          currentStart,
          chunk.startLine + lineOffset,
          chunk.metadata.language,
          chunk.metadata,
          `${chunk.name || 'chunk'}_part_${chunks.length + 1}`,
          chunk.id
        ));
        
        currentContent = '';
        currentStart = chunk.startLine + lineOffset + 1;
      }
      lineOffset++;
    }
    
    // Add remaining content
    if (currentContent.trim()) {
      chunks.push(this.createChunk(
        currentContent.trim(),
        'block',
        chunk.filePath,
        currentStart,
        chunk.endLine,
        chunk.metadata.language,
        chunk.metadata,
        `${chunk.name || 'chunk'}_part_${chunks.length + 1}`,
        chunk.id
      ));
    }
    
    return chunks;
  }
}
