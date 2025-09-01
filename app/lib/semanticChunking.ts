import { createHash } from 'crypto';

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
    
    console.log(`🗂️ Starting chunking for ${filePath} (${detectedLanguage}, ${content.length} chars)`);
    
    try {
      let chunks: CodeChunk[] = [];
      
      switch (detectedLanguage) {
        case 'javascript':
        case 'typescript':
        case 'jsx':
        case 'tsx':
          chunks = await this.chunkJavaScriptTypeScript(filePath, content, detectedLanguage);
          break;
        case 'python':
          chunks = await this.chunkPython(filePath, content);
          break;
        case 'java':
          chunks = await this.chunkJava(filePath, content);
          break;
        default:
          chunks = await this.chunkGeneric(filePath, content, detectedLanguage);
      }
      
      console.log(`📋 Created ${chunks.length} semantic chunks for ${filePath}:`);
      chunks.forEach((chunk, index) => {
        console.log(`  ${index + 1}. ${chunk.type}: ${chunk.name || 'unnamed'} (lines ${chunk.startLine}-${chunk.endLine}, ${chunk.content.length} chars)`);
      });
      
      return chunks;
    } catch (error) {
      console.error(`❌ Error chunking file ${filePath}:`, error);
      console.log(`🔄 Falling back to generic chunking for ${filePath}`);
      // Fallback to generic chunking
      return await this.chunkGeneric(filePath, content, detectedLanguage);
    }
  }

  /**
   * Chunk JavaScript/TypeScript using robust regex-based parsing
   */
  private async chunkJavaScriptTypeScript(filePath: string, content: string, language: string): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    
    try {
      // Pre-validate and clean content
      const cleanedContent = this.preprocessCodeContent(content, filePath);
      
      // Track imports and exports
      const imports: string[] = [];
      const exports: string[] = [];
      
      // Parse using robust regex patterns
      this.parseWithRegex(cleanedContent, chunks, filePath, language, imports, exports);
      
      // If no specific chunks were found, create a generic chunk
      if (chunks.length === 0) {
        chunks.push(this.createChunk(
          cleanedContent,
          'block',
          filePath,
          1,
          cleanedContent.split('\n').length,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(cleanedContent)
          }
        ));
      }
      
      return chunks;
      
    } catch (error: any) {
      console.warn(`Regex parsing failed for ${filePath}:`, error.message);
      // Fallback to generic chunking
      return await this.chunkGeneric(filePath, content, language);
    }
  }

  /**
   * Pre-process code content to fix common syntax issues
   */
  private preprocessCodeContent(content: string, filePath: string): string {
    try {
      let cleaned = content;
      
      // Remove BOM if present
      if (cleaned.charCodeAt(0) === 0xFEFF) {
        cleaned = cleaned.slice(1);
      }
      
      // Normalize line endings
      cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      
      // Remove trailing whitespace from lines
      cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
      
      // Fix common trailing comma issues in objects and arrays
      cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
      
      // Fix missing semicolons before closing braces (common in some JS dialects)
      cleaned = cleaned.replace(/([^;\s}])\s*\n\s*}/g, '$1;\n}');
      
      // Remove duplicate semicolons
      cleaned = cleaned.replace(/;;+/g, ';');
      
      // Fix common JSX issues - ensure proper closing tags
      if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) {
        // Fix self-closing tags without proper syntax
        cleaned = cleaned.replace(/<(\w+)([^>]*?)(?<!\/)\s*>/g, (match, tagName, attrs) => {
          if (attrs && !attrs.includes('=')) {
            // Likely a self-closing tag
            return `<${tagName}${attrs} />`;
          }
          return match;
        });
      }
      
      // Ensure the file ends with a newline
      if (!cleaned.endsWith('\n')) {
        cleaned += '\n';
      }
      
      return cleaned;
    } catch (cleanError) {
      console.warn(`Error preprocessing content for ${filePath}:`, cleanError);
      return content; // Return original content if cleaning fails
    }
  }

  /**
   * Parse code using robust regex patterns
   */
  private parseWithRegex(
    content: string, 
    chunks: CodeChunk[], 
    filePath: string, 
    language: string, 
    imports: string[], 
    exports: string[]
  ): void {
    const lines = content.split('\n');
    
    try {
      // Parse imports
      this.parseImports(content, chunks, filePath, language, imports);
      
      // Parse exports  
      this.parseExports(content, chunks, filePath, language, exports);
      
      // Parse interfaces (TypeScript)
      if (language.includes('typescript') || filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        this.parseInterfaces(content, chunks, filePath, language, imports, exports);
        this.parseTypeAliases(content, chunks, filePath, language, imports, exports);
      }
      
      // Parse functions
      this.parseFunctions(content, chunks, filePath, language, imports, exports);
      
      // Parse classes
      this.parseClasses(content, chunks, filePath, language, imports, exports);
      
      // Parse variables/constants
      this.parseVariables(content, chunks, filePath, language, imports, exports);
      
    } catch (error) {
      console.warn(`Error in regex parsing for ${filePath}:`, error);
    }
  }

  private parseImports(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[]): void {
    // Match import statements with improved regex
    const importRegex = /^(\s*)import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\w+))?\s+from\s+)?['"`]([^'"`]+)['"`]\s*;?$/gm;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      try {
        const fullMatch = match[0];
        const source = match[2];
        const startPos = match.index;
        const endPos = startPos + fullMatch.length;
        
        // Calculate line numbers
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        const endLine = startLine + fullMatch.split('\n').length - 1;
        
        imports.push(source);
        
        chunks.push(this.createChunk(
          fullMatch.trim(),
          'import',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: [source],
            imports: [source],
            exports: [],
            keywords: ['import']
          }
        ));
      } catch (error) {
        console.warn(`Error processing import match:`, error);
      }
    }
  }

  private parseExports(content: string, chunks: CodeChunk[], filePath: string, language: string, exports: string[]): void {
    // Match export statements
    const exportRegex = /^(\s*)export\s+(?:default\s+)?(?:(?:async\s+)?function\s+(\w+)|class\s+(\w+)|(?:const|let|var)\s+(\w+)|interface\s+(\w+)|type\s+(\w+)|\{[^}]*\})/gm;
    
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      try {
        const fullMatch = match[0];
        const exportName = match[2] || match[3] || match[4] || match[5] || match[6] || 'default';
        const startPos = match.index;
        
        // Calculate line numbers
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        
        exports.push(exportName);
        
        chunks.push(this.createChunk(
          fullMatch.trim(),
          'export',
          filePath,
          startLine,
          startLine,
          language,
          {
            dependencies: [],
            imports: [],
            exports: [exportName],
            keywords: ['export']
          }
        ));
      } catch (error) {
        console.warn(`Error processing export match:`, error);
      }
    }
  }

  private parseInterfaces(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]): void {
    // Match TypeScript interfaces with proper brace matching
    const interfaceRegex = /^(\s*)(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+[\w\s,<>]+)?\s*\{/gm;
    
    let match;
    while ((match = interfaceRegex.exec(content)) !== null) {
      try {
        const interfaceName = match[2];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        
        // Find the end of the interface by matching braces
        const interfaceContent = this.extractBlockContent(content, startPos, '{', '}');
        const endLine = startLine + interfaceContent.split('\n').length - 1;
        
        chunks.push(this.createChunk(
          interfaceContent,
          'interface',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(interfaceContent)
          },
          interfaceName
        ));
      } catch (error) {
        console.warn(`Error processing interface match:`, error);
      }
    }
  }

  private parseTypeAliases(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]): void {
    // Match TypeScript type aliases
    const typeRegex = /^(\s*)(?:export\s+)?type\s+(\w+)\s*=\s*[^;]+;?$/gm;
    
    let match;
    while ((match = typeRegex.exec(content)) !== null) {
      try {
        const typeName = match[2];
        const fullMatch = match[0];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        const endLine = startLine + fullMatch.split('\n').length - 1;
        
        chunks.push(this.createChunk(
          fullMatch.trim(),
          'type',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(fullMatch)
          },
          typeName
        ));
      } catch (error) {
        console.warn(`Error processing type alias match:`, error);
      }
    }
  }

  private parseFunctions(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]): void {
    // Match regular function declarations
    const functionDeclRegex = /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*\{/gm;
    
    // Match arrow functions assigned to variables
    const arrowFunctionRegex = /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]\s*(?:async\s+)?\([^)]*\)\s*=>/gm;
    
    // Process regular functions
    let match;
    while ((match = functionDeclRegex.exec(content)) !== null) {
      try {
        const functionName = match[2];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        
        const functionContent = this.extractBlockContent(content, startPos, '{', '}');
        const endLine = startLine + functionContent.split('\n').length - 1;
        
        chunks.push(this.createChunk(
          functionContent,
          'function',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(functionContent)
          },
          functionName
        ));
      } catch (error) {
        console.warn(`Error processing function declaration:`, error);
      }
    }
    
    // Process arrow functions
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
      try {
        const functionName = match[2];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        
        const functionContent = this.extractArrowFunctionContent(content, startPos);
        const endLine = startLine + functionContent.split('\n').length - 1;
        
        chunks.push(this.createChunk(
          functionContent,
          'function',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(functionContent)
          },
          functionName
        ));
      } catch (error) {
        console.warn(`Error processing arrow function:`, error);
      }
    }
  }

  private parseClasses(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]): void {
    // Match class declarations
    const classRegex = /^(\s*)(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+[\w<>]+)?(?:\s+implements\s+[\w\s,<>]+)?\s*\{/gm;
    
    let match;
    while ((match = classRegex.exec(content)) !== null) {
      try {
        const className = match[2];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        
        const classContent = this.extractBlockContent(content, startPos, '{', '}');
        const endLine = startLine + classContent.split('\n').length - 1;
        
        chunks.push(this.createChunk(
          classContent,
          'class',
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(classContent)
          },
          className
        ));
      } catch (error) {
        console.warn(`Error processing class match:`, error);
      }
    }
  }

  private parseVariables(content: string, chunks: CodeChunk[], filePath: string, language: string, imports: string[], exports: string[]): void {
    // Match variable declarations (excluding those already captured as functions)
    const varRegex = /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]\s*(?!(?:async\s+)?\([^)]*\)\s*=>)[^;]*;?$/gm;
    
    let match;
    while ((match = varRegex.exec(content)) !== null) {
      try {
        const varName = match[2];
        const fullMatch = match[0];
        const startPos = match.index;
        const beforeMatch = content.substring(0, startPos);
        const startLine = beforeMatch.split('\n').length;
        const endLine = startLine + fullMatch.split('\n').length - 1;
        
        // Determine if this is likely a function assignment
        const isFunctionAssignment = fullMatch.includes('function') || fullMatch.includes('=>');
        const chunkType = isFunctionAssignment ? 'function' : 'variable';
        
        chunks.push(this.createChunk(
          fullMatch.trim(),
          chunkType,
          filePath,
          startLine,
          endLine,
          language,
          {
            dependencies: imports,
            imports: imports,
            exports: exports,
            keywords: this.extractKeywords(fullMatch)
          },
          varName
        ));
      } catch (error) {
        console.warn(`Error processing variable match:`, error);
      }
    }
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
    // Use Node.js built-in crypto instead of crypto-js
    const hash = createHash('sha256').update(`${filePath}:${startLine}-${endLine}:${content.substring(0, 100)}`).digest('hex');
    return `chunk_${hash.substring(0, 16)}`;
  }

  /**
   * Extract block content by matching opening and closing braces
   */
  private extractBlockContent(content: string, startPos: number, openChar: string, closeChar: string): string {
    let braceCount = 0;
    let i = startPos;
    let started = false;
    
    // Find the opening brace
    while (i < content.length) {
      if (content[i] === openChar) {
        if (!started) {
          started = true;
        }
        braceCount++;
      } else if (content[i] === closeChar) {
        braceCount--;
      }
      
      i++;
      
      if (started && braceCount === 0) {
        break;
      }
    }
    
    return content.substring(startPos, i);
  }

  /**
   * Extract arrow function content including its body
   */
  private extractArrowFunctionContent(content: string, startPos: number): string {
    let i = startPos;
    let braceCount = 0;
    let parenCount = 0;
    let inString = false;
    let stringChar = '';
    let foundArrow = false;
    
    // Find the complete arrow function
    while (i < content.length) {
      const char = content[i];
      
      if (!inString) {
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
        } else if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (foundArrow && braceCount === 0) {
            return content.substring(startPos, i + 1);
          }
        } else if (char === '=' && i + 1 < content.length && content[i + 1] === '>') {
          foundArrow = true;
          i++; // Skip the '>'
        } else if (foundArrow && braceCount === 0 && (char === ';' || char === '\n')) {
          return content.substring(startPos, i);
        }
      } else {
        if (char === stringChar && (i === 0 || content[i - 1] !== '\\')) {
          inString = false;
        }
      }
      
      i++;
    }
    
    // If we reach here, return what we have
    return content.substring(startPos, i);
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
