// Types for codebase analysis
export interface ParsedFunction {
  name: string;
  line: number;
  endLine?: number;
  params: string[];
  returnType?: string;
  isAsync?: boolean;
  isExported?: boolean;
  docstring?: string;
}

export interface ParsedClass {
  name: string;
  line: number;
  endLine?: number;
  methods: ParsedFunction[];
  properties: string[];
  extends?: string;
  implements?: string[];
  isExported?: boolean;
  docstring?: string;
}

export interface ParsedImport {
  source: string;
  imports: string[];
  line: number;
  isDefault?: boolean;
  isNamespace?: boolean;
  alias?: string;
}

export interface ParsedExport {
  name: string;
  line: number;
  isDefault?: boolean;
  type: 'function' | 'class' | 'variable' | 'const' | 'interface' | 'type';
}

export interface CodebaseIndex {
  fileId: string;
  fileName: string;
  filePath: string;
  language: string;
  content: string;
  lines: number;
  size: number;
  lastModified: number;
  functions: ParsedFunction[];
  classes: ParsedClass[];
  imports: ParsedImport[];
  exports: ParsedExport[];
  variables: string[];
  interfaces?: ParsedClass[]; // For TypeScript
  types?: ParsedExport[]; // For TypeScript
  keywords: string[];
  dependencies: string[];
}

export class CodebaseParser {
  private static languageDetectors: { [key: string]: RegExp[] } = {
    javascript: [/\.m?js$/i, /\.jsx$/i],
    typescript: [/\.ts$/i, /\.tsx$/i],
    python: [/\.py$/i, /\.pyw$/i],
    java: [/\.java$/i],
    cpp: [/\.cpp$/i, /\.cc$/i, /\.cxx$/i, /\.c\+\+$/i],
    c: [/\.c$/i, /\.h$/i],
    csharp: [/\.cs$/i],
    php: [/\.php$/i],
    ruby: [/\.rb$/i],
    go: [/\.go$/i],
    rust: [/\.rs$/i],
    swift: [/\.swift$/i],
    kotlin: [/\.kt$/i, /\.kts$/i],
    scala: [/\.scala$/i],
    dart: [/\.dart$/i],
    html: [/\.html$/i, /\.htm$/i],
    css: [/\.css$/i, /\.scss$/i, /\.sass$/i, /\.less$/i],
    json: [/\.json$/i],
    yaml: [/\.ya?ml$/i],
    xml: [/\.xml$/i],
    sql: [/\.sql$/i],
    shell: [/\.sh$/i, /\.bash$/i, /\.zsh$/i],
    powershell: [/\.ps1$/i],
    dockerfile: [/dockerfile$/i, /\.dockerfile$/i],
    markdown: [/\.md$/i, /\.markdown$/i],
  };

  static detectLanguage(fileName: string, content?: string): string {
    // Check file extension first
    for (const [language, patterns] of Object.entries(this.languageDetectors)) {
      if (patterns.some(pattern => pattern.test(fileName))) {
        return language;
      }
    }

    // Check content for shebang or specific patterns
    if (content) {
      const firstLine = content.split('\n')[0];
      if (firstLine.startsWith('#!')) {
        if (firstLine.includes('python')) return 'python';
        if (firstLine.includes('node')) return 'javascript';
        if (firstLine.includes('bash') || firstLine.includes('sh')) return 'shell';
      }
    }

    return 'text';
  }

  static parseFile(fileName: string, content: string): CodebaseIndex {
    const language = this.detectLanguage(fileName, content);
    const lines = content.split('\n').length;
    
    let parsedData: Partial<CodebaseIndex> = {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      variables: [],
      interfaces: [],
      types: [],
      keywords: [],
      dependencies: [],
    };

    switch (language) {
      case 'javascript':
      case 'typescript':
        parsedData = this.parseJavaScriptTypeScript(content, language === 'typescript');
        break;
      case 'python':
        parsedData = this.parsePython(content);
        break;
      case 'java':
        parsedData = this.parseJava(content);
        break;
      case 'cpp':
      case 'c':
        parsedData = this.parseCpp(content);
        break;
      case 'csharp':
        parsedData = this.parseCSharp(content);
        break;
      default:
        parsedData = this.parseGeneric(content, language);
    }

    return {
      fileId: this.generateFileId(fileName),
      fileName,
      filePath: fileName,
      language,
      content,
      lines,
      size: content.length,
      lastModified: Date.now(),
      functions: parsedData.functions || [],
      classes: parsedData.classes || [],
      imports: parsedData.imports || [],
      exports: parsedData.exports || [],
      variables: parsedData.variables || [],
      interfaces: parsedData.interfaces || [],
      types: parsedData.types || [],
      keywords: parsedData.keywords || [],
      dependencies: parsedData.dependencies || [],
    };
  }

  private static parseJavaScriptTypeScript(content: string, isTypeScript: boolean): Partial<CodebaseIndex> {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    const imports: ParsedImport[] = [];
    const exports: ParsedExport[] = [];
    const variables: string[] = [];
    const interfaces: ParsedClass[] = [];
    const types: ParsedExport[] = [];
    const keywords: string[] = [];
    const dependencies: string[] = [];

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Parse imports
      if (line.startsWith('import ') || line.startsWith('const ') && line.includes('require(')) {
        const importMatch = line.match(/from\s+['"`]([^'"`]+)['"`]/);
        if (importMatch) {
          const source = importMatch[1];
          dependencies.push(source);
          
          const importNames = line.match(/import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))/);
          const parsedImport: ParsedImport = {
            source,
            line: lineNum,
            imports: [],
          };

          if (importNames) {
            if (importNames[1]) { // Named imports
              parsedImport.imports = importNames[1].split(',').map(s => s.trim());
            } else if (importNames[2]) { // Namespace import
              parsedImport.imports = [importNames[2]];
              parsedImport.isNamespace = true;
            } else if (importNames[3]) { // Default import
              parsedImport.imports = [importNames[3]];
              parsedImport.isDefault = true;
            }
          }
          
          imports.push(parsedImport);
        }
      }

      // Parse functions
      const functionMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/);
      if (functionMatch) {
        const func: ParsedFunction = {
          name: functionMatch[1],
          line: lineNum,
          params: functionMatch[2] ? functionMatch[2].split(',').map(p => p.trim()) : [],
          isAsync: line.includes('async'),
          isExported: line.includes('export'),
        };
        functions.push(func);
      }

      // Parse arrow functions
      const arrowFunctionMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/);
      if (arrowFunctionMatch) {
        const func: ParsedFunction = {
          name: arrowFunctionMatch[1],
          line: lineNum,
          params: [],
          isAsync: line.includes('async'),
          isExported: line.includes('export'),
        };
        functions.push(func);
      }

      // Parse classes
      const classMatch = line.match(/(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/);
      if (classMatch) {
        const cls: ParsedClass = {
          name: classMatch[1],
          line: lineNum,
          methods: [],
          properties: [],
          extends: classMatch[2],
          implements: classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [],
          isExported: line.includes('export'),
        };
        classes.push(cls);
      }

      // Parse TypeScript interfaces
      if (isTypeScript) {
        const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
        if (interfaceMatch) {
          const iface: ParsedClass = {
            name: interfaceMatch[1],
            line: lineNum,
            methods: [],
            properties: [],
            isExported: line.includes('export'),
          };
          interfaces.push(iface);
        }

        // Parse TypeScript types
        const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)\s*=/);
        if (typeMatch) {
          const type: ParsedExport = {
            name: typeMatch[1],
            line: lineNum,
            type: 'type',
            isDefault: false,
          };
          types.push(type);
        }
      }

      // Parse variables
      const varMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (varMatch && !arrowFunctionMatch) {
        variables.push(varMatch[1]);
      }

      // Parse exports
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:(?:function|class|const|let|var)\s+)?(\w+)/);
      if (exportMatch) {
        const exp: ParsedExport = {
          name: exportMatch[1],
          line: lineNum,
          type: 'variable',
          isDefault: line.includes('default'),
        };
        exports.push(exp);
      }

      // Extract keywords for search
      const codeKeywords = line.match(/\b(async|await|promise|fetch|api|auth|user|data|error|handle|validate|submit|form|button|component|hook|state|effect|ref|props|context|provider|reducer|dispatch|action|type|interface|class|function|method|property|import|export|from|default|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|super|extends|implements|public|private|protected|static|readonly|const|let|var|boolean|string|number|object|array|null|undefined|void|never|any|unknown)\b/gi);
      if (codeKeywords) {
        keywords.push(...codeKeywords.map(k => k.toLowerCase()));
      }
    }

    return {
      functions,
      classes,
      imports,
      exports,
      variables,
      interfaces,
      types,
      keywords: [...new Set(keywords)], // Remove duplicates
      dependencies: [...new Set(dependencies)],
    };
  }

  private static parsePython(content: string): Partial<CodebaseIndex> {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    const imports: ParsedImport[] = [];
    const variables: string[] = [];
    const keywords: string[] = [];
    const dependencies: string[] = [];

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Parse imports
      const importMatch = line.match(/^(?:from\s+(\S+)\s+)?import\s+(.+)/);
      if (importMatch) {
        const source = importMatch[1] || importMatch[2].split(',')[0].trim();
        dependencies.push(source);
        
        const importNames = importMatch[2].split(',').map(s => s.trim());
        imports.push({
          source,
          imports: importNames,
          line: lineNum,
        });
      }

      // Parse functions
      const functionMatch = line.match(/^def\s+(\w+)\s*\(([^)]*)\)/);
      if (functionMatch) {
        const func: ParsedFunction = {
          name: functionMatch[1],
          line: lineNum,
          params: functionMatch[2] ? functionMatch[2].split(',').map(p => p.trim()) : [],
          isAsync: line.includes('async def'),
        };
        functions.push(func);
      }

      // Parse classes
      const classMatch = line.match(/^class\s+(\w+)(?:\(([^)]+)\))?:/);
      if (classMatch) {
        const cls: ParsedClass = {
          name: classMatch[1],
          line: lineNum,
          methods: [],
          properties: [],
          extends: classMatch[2],
        };
        classes.push(cls);
      }

      // Parse variables
      const varMatch = line.match(/^(\w+)\s*=/);
      if (varMatch && !functionMatch && !classMatch) {
        variables.push(varMatch[1]);
      }

      // Extract keywords
      const pythonKeywords = line.match(/\b(def|class|import|from|as|if|elif|else|for|while|try|except|finally|with|async|await|yield|return|break|continue|pass|lambda|global|nonlocal|and|or|not|in|is|True|False|None|self|super|init|str|int|float|bool|list|dict|tuple|set|len|range|enumerate|zip|map|filter|sum|max|min|abs|round|type|isinstance|hasattr|getattr|setattr|print|input|open|read|write|close|json|requests|datetime|os|sys|re|math|random)\b/gi);
      if (pythonKeywords) {
        keywords.push(...pythonKeywords.map(k => k.toLowerCase()));
      }
    }

    return {
      functions,
      classes,
      imports,
      variables,
      keywords: [...new Set(keywords)],
      dependencies: [...new Set(dependencies)],
    };
  }

  private static parseJava(content: string): Partial<CodebaseIndex> {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    const imports: ParsedImport[] = [];
    const variables: string[] = [];
    const keywords: string[] = [];
    const dependencies: string[] = [];

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Parse imports
      const importMatch = line.match(/^import\s+(?:static\s+)?([^;]+);/);
      if (importMatch) {
        const source = importMatch[1];
        dependencies.push(source);
        imports.push({
          source,
          imports: [source.split('.').pop() || source],
          line: lineNum,
        });
      }

      // Parse methods/functions
      const methodMatch = line.match(/(?:public|private|protected|static|\s)+\s*\w+\s+(\w+)\s*\([^)]*\)/);
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        const func: ParsedFunction = {
          name: methodMatch[1],
          line: lineNum,
          params: [],
          isExported: line.includes('public'),
        };
        functions.push(func);
      }

      // Parse classes
      const classMatch = line.match(/(?:public\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/);
      if (classMatch) {
        const cls: ParsedClass = {
          name: classMatch[1],
          line: lineNum,
          methods: [],
          properties: [],
          extends: classMatch[2],
          implements: classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [],
          isExported: line.includes('public'),
        };
        classes.push(cls);
      }

      // Extract keywords
      const javaKeywords = line.match(/\b(public|private|protected|static|final|abstract|synchronized|volatile|transient|native|strictfp|class|interface|enum|extends|implements|import|package|void|int|long|short|byte|char|float|double|boolean|String|Object|List|Map|Set|ArrayList|HashMap|HashSet|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|throws|new|this|super|null|true|false|instanceof|synchronized|volatile|transient|native|strictfp)\b/gi);
      if (javaKeywords) {
        keywords.push(...javaKeywords.map(k => k.toLowerCase()));
      }
    }

    return {
      functions,
      classes,
      imports,
      variables,
      keywords: [...new Set(keywords)],
      dependencies: [...new Set(dependencies)],
    };
  }

  private static parseCpp(content: string): Partial<CodebaseIndex> {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    const imports: ParsedImport[] = [];
    const variables: string[] = [];
    const keywords: string[] = [];
    const dependencies: string[] = [];

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Parse includes
      const includeMatch = line.match(/^#include\s*[<"]([^>"]+)[>"]/);
      if (includeMatch) {
        const source = includeMatch[1];
        dependencies.push(source);
        imports.push({
          source,
          imports: [source],
          line: lineNum,
        });
      }

      // Parse functions
      const functionMatch = line.match(/^(?:\w+\s+)*(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?[{;]/);
      if (functionMatch && !line.includes('class ') && !line.includes('struct ')) {
        functions.push({
          name: functionMatch[1],
          line: lineNum,
          params: [],
        });
      }

      // Parse classes/structs
      const classMatch = line.match(/^(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+(\w+))?/);
      if (classMatch) {
        classes.push({
          name: classMatch[1],
          line: lineNum,
          methods: [],
          properties: [],
          extends: classMatch[2],
        });
      }

      // Extract keywords
      const cppKeywords = line.match(/\b(include|define|ifdef|ifndef|endif|pragma|namespace|using|class|struct|union|enum|typedef|template|typename|public|private|protected|virtual|static|const|constexpr|inline|explicit|override|final|noexcept|void|int|long|short|char|float|double|bool|auto|decltype|nullptr|true|false|if|else|for|while|do|switch|case|default|break|continue|return|try|catch|throw|new|delete|this|operator|friend|extern|register|volatile|mutable|thread_local|alignas|alignof|static_assert|std|vector|string|map|set|list|queue|stack|array|unique_ptr|shared_ptr|weak_ptr|function|lambda|iostream|fstream|sstream|algorithm|iterator|memory|utility|chrono|thread|mutex|condition_variable|atomic|future|promise)\b/gi);
      if (cppKeywords) {
        keywords.push(...cppKeywords.map(k => k.toLowerCase()));
      }
    }

    return {
      functions,
      classes,
      imports,
      variables,
      keywords: [...new Set(keywords)],
      dependencies: [...new Set(dependencies)],
    };
  }

  private static parseCSharp(content: string): Partial<CodebaseIndex> {
    const functions: ParsedFunction[] = [];
    const classes: ParsedClass[] = [];
    const imports: ParsedImport[] = [];
    const variables: string[] = [];
    const keywords: string[] = [];
    const dependencies: string[] = [];

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Parse using statements
      const usingMatch = line.match(/^using\s+([^;]+);/);
      if (usingMatch) {
        const source = usingMatch[1];
        dependencies.push(source);
        imports.push({
          source,
          imports: [source.split('.').pop() || source],
          line: lineNum,
        });
      }

      // Parse methods
      const methodMatch = line.match(/(?:public|private|protected|internal|static|\s)+\s*\w+\s+(\w+)\s*\([^)]*\)/);
      if (methodMatch && !line.includes('class ') && !line.includes('interface ')) {
        functions.push({
          name: methodMatch[1],
          line: lineNum,
          params: [],
          isExported: line.includes('public'),
        });
      }

      // Parse classes
      const classMatch = line.match(/(?:public\s+)?class\s+(\w+)(?:\s*:\s*([^{]+))?/);
      if (classMatch) {
        classes.push({
          name: classMatch[1],
          line: lineNum,
          methods: [],
          properties: [],
          extends: classMatch[2],
          isExported: line.includes('public'),
        });
      }

      // Extract keywords
      const csharpKeywords = line.match(/\b(using|namespace|public|private|protected|internal|static|readonly|const|volatile|virtual|abstract|sealed|override|new|extern|unsafe|fixed|lock|partial|class|struct|interface|enum|delegate|event|property|indexer|operator|implicit|explicit|void|int|long|short|byte|sbyte|uint|ulong|ushort|char|float|double|decimal|bool|string|object|var|dynamic|null|true|false|if|else|for|foreach|while|do|switch|case|default|break|continue|return|try|catch|finally|throw|using|yield|async|await|Task|List|Dictionary|Array|IEnumerable|IList|IDictionary|LINQ|System|Console|String|Int32|DateTime|TimeSpan|Exception|ArgumentException|InvalidOperationException|NotImplementedException|NotSupportedException)\b/gi);
      if (csharpKeywords) {
        keywords.push(...csharpKeywords.map(k => k.toLowerCase()));
      }
    }

    return {
      functions,
      classes,
      imports,
      variables,
      keywords: [...new Set(keywords)],
      dependencies: [...new Set(dependencies)],
    };
  }

  private static parseGeneric(content: string, language: string): Partial<CodebaseIndex> {
    const keywords: string[] = [];
    const dependencies: string[] = [];

    // Extract general programming keywords and patterns
    const generalKeywords = content.match(/\b(function|class|method|variable|constant|import|export|include|require|module|package|library|framework|api|database|server|client|request|response|data|model|view|controller|service|component|utility|helper|config|settings|environment|development|production|test|debug|error|exception|log|cache|session|authentication|authorization|validation|security|encryption|hash|token|jwt|oauth|rest|graphql|json|xml|html|css|javascript|typescript|python|java|cpp|csharp|php|ruby|go|rust|swift|kotlin|scala|dart|sql|nosql|mongodb|mysql|postgresql|redis|docker|kubernetes|aws|azure|gcp|ci|cd|git|github|gitlab|bitbucket|npm|yarn|pip|maven|gradle|webpack|babel|eslint|prettier|jest|mocha|cypress|selenium|react|vue|angular|svelte|next|nuxt|express|django|flask|spring|laravel|rails|gin|fiber|fastapi|nestjs|graphql|apollo|prisma|typeorm|sequelize|mongoose|knex|tailwind|bootstrap|material|antd|chakra|styled|emotion|sass|less|postcss|vite|rollup|parcel|snowpack|turbopack)\b/gi);
    
    if (generalKeywords) {
      keywords.push(...generalKeywords.map(k => k.toLowerCase()));
    }

    // Look for common dependency patterns
    const depPatterns = [
      /(?:import|require|include)\s+['"`]([^'"`]+)['"`]/g,
      /(?:from|import)\s+['"`]([^'"`]+)['"`]/g,
      /@import\s+['"`]([^'"`]+)['"`]/g,
      /#include\s*[<"]([^>"]+)[>"]/g,
    ];

    for (const pattern of depPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        dependencies.push(match[1]);
      }
    }

    return {
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      variables: [],
      keywords: [...new Set(keywords)],
      dependencies: [...new Set(dependencies)],
    };
  }

  private static generateFileId(fileName: string): string {
    return btoa(fileName).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
}
