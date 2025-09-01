import { CodebaseIndex } from './codebaseParser';

export interface CodebaseMetadata {
  id: string;
  name: string;
  totalFiles: number;
  totalSize: number;
  languages: string[];
  lastProcessed: number;
  version: string;
}

export interface StoredCodebase {
  metadata: CodebaseMetadata;
  files: CodebaseIndex[];
  searchIndex: SearchIndex;
}

export interface SearchIndex {
  byKeyword: { [keyword: string]: string[] }; // keyword -> fileIds
  byLanguage: { [language: string]: string[] }; // language -> fileIds
  byFunction: { [funcName: string]: string[] }; // function -> fileIds
  byClass: { [className: string]: string[] }; // class -> fileIds
  byDependency: { [dep: string]: string[] }; // dependency -> fileIds
  byFileName: { [fileName: string]: string }; // fileName -> fileId
  byFilePath: { [filePath: string]: string }; // filePath -> fileId
}

export class StorageManager {
  private static readonly STORAGE_KEY = 'traycer_codebases';
  private static readonly CURRENT_VERSION = '1.0.0';
  private static readonly MAX_STORAGE_SIZE = 50 * 1024 * 1024; // 50MB limit

  static async storeCodebase(
    name: string, 
    files: CodebaseIndex[], 
    replaceExisting = false
  ): Promise<string> {
    const codebaseId = this.generateCodebaseId(name);
    return this.storeCodebaseWithId(codebaseId, name, files, replaceExisting);
  }

  static async storeCodebaseWithId(
    codebaseId: string,
    name: string, 
    files: CodebaseIndex[], 
    replaceExisting = false
  ): Promise<string> {
    // Check if codebase already exists
    const existing = await this.getCodebase(codebaseId);
    if (existing && !replaceExisting) {
      throw new Error(`Codebase "${name}" already exists. Set replaceExisting=true to update.`);
    }

    // Create metadata
    const languages = [...new Set(files.map(f => f.language))];
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    const metadata: CodebaseMetadata = {
      id: codebaseId,
      name,
      totalFiles: files.length,
      totalSize,
      languages,
      lastProcessed: Date.now(),
      version: this.CURRENT_VERSION,
    };

    // Build search index
    const searchIndex = this.buildSearchIndex(files);

    const storedCodebase: StoredCodebase = {
      metadata,
      files,
      searchIndex,
    };

    // Check storage size
    const serialized = JSON.stringify(storedCodebase);
    if (serialized.length > this.MAX_STORAGE_SIZE) {
      throw new Error('Codebase too large for browser storage. Consider using a smaller subset.');
    }

    // Store in localStorage
    try {
      const existingData = this.getAllCodebases();
      existingData[codebaseId] = storedCodebase;
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(existingData));
      
      return codebaseId;
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        throw new Error('Browser storage quota exceeded. Please clear some data.');
      }
      throw error;
    }
  }

  static async getCodebase(codebaseId: string): Promise<StoredCodebase | null> {
    try {
      const allCodebases = this.getAllCodebases();
      return allCodebases[codebaseId] || null;
    } catch (error) {
      console.warn(`⚠️ Error retrieving codebase ${codebaseId}:`, error);
      return null;
    }
  }

  static async getAllCodebaseMetadata(): Promise<CodebaseMetadata[]> {
    try {
      const allCodebases = this.getAllCodebases();
      return Object.values(allCodebases).map(cb => cb.metadata);
    } catch {
      return [];
    }
  }

  static async deleteCodebase(codebaseId: string): Promise<boolean> {
    try {
      const allCodebases = this.getAllCodebases();
      if (allCodebases[codebaseId]) {
        delete allCodebases[codebaseId];
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allCodebases));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  static async clearAllCodebases(): Promise<void> {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch {
      // Ignore errors
    }
  }

  static getStorageUsage(): { used: number; total: number; percentage: number } {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      const used = data ? new Blob([data]).size : 0;
      const total = this.MAX_STORAGE_SIZE;
      const percentage = Math.round((used / total) * 100);
      
      return { used, total, percentage };
    } catch {
      return { used: 0, total: this.MAX_STORAGE_SIZE, percentage: 0 };
    }
  }

  private static getAllCodebases(): { [id: string]: StoredCodebase } {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private static buildSearchIndex(files: CodebaseIndex[]): SearchIndex {
    const searchIndex: SearchIndex = {
      byKeyword: {},
      byLanguage: {},
      byFunction: {},
      byClass: {},
      byDependency: {},
      byFileName: {},
      byFilePath: {},
    };

    for (const file of files) {
      const fileId = file.fileId;

      // Index by language
      if (!searchIndex.byLanguage[file.language]) {
        searchIndex.byLanguage[file.language] = [];
      }
      searchIndex.byLanguage[file.language].push(fileId);

      // Index by keywords
      for (const keyword of file.keywords) {
        if (!searchIndex.byKeyword[keyword]) {
          searchIndex.byKeyword[keyword] = [];
        }
        searchIndex.byKeyword[keyword].push(fileId);
      }

      // Index by functions
      for (const func of file.functions) {
        if (!searchIndex.byFunction[func.name]) {
          searchIndex.byFunction[func.name] = [];
        }
        searchIndex.byFunction[func.name].push(fileId);
      }

      // Index by classes
      for (const cls of file.classes) {
        if (!searchIndex.byClass[cls.name]) {
          searchIndex.byClass[cls.name] = [];
        }
        searchIndex.byClass[cls.name].push(fileId);
      }

      // Index by interfaces (TypeScript)
      if (file.interfaces) {
        for (const iface of file.interfaces) {
          if (!searchIndex.byClass[iface.name]) {
            searchIndex.byClass[iface.name] = [];
          }
          searchIndex.byClass[iface.name].push(fileId);
        }
      }

      // Index by dependencies
      for (const dep of file.dependencies) {
        if (!searchIndex.byDependency[dep]) {
          searchIndex.byDependency[dep] = [];
        }
        searchIndex.byDependency[dep].push(fileId);
      }

      // Index by file name and path
      searchIndex.byFileName[file.fileName.toLowerCase()] = fileId;
      searchIndex.byFilePath[file.filePath.toLowerCase()] = fileId;
    }

    return searchIndex;
  }

  private static generateCodebaseId(name: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${sanitized}_${timestamp}_${random}`;
  }
}

export class SearchEngine {
  private searchIndex: SearchIndex;
  private files: { [fileId: string]: CodebaseIndex };

  constructor(storedCodebase: StoredCodebase) {
    this.searchIndex = storedCodebase.searchIndex;
    this.files = {};
    
    // Create file lookup map
    for (const file of storedCodebase.files) {
      this.files[file.fileId] = file;
    }
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const {
      languages = [],
      fileTypes = [],
      includeContent = true,
      maxResults = 50,
      caseSensitive = false,
    } = options;

    const normalizedQuery = caseSensitive ? query : query.toLowerCase();
    const queryTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    
    const results: { [fileId: string]: SearchResult } = {};

    // Search by different criteria
    for (const term of queryTerms) {
      // Search keywords
      const keywordMatches = this.searchIndex.byKeyword[term] || [];
      for (const fileId of keywordMatches) {
        this.addSearchResult(results, fileId, 'keyword', term, 10);
      }

      // Search function names
      const functionMatches = this.searchIndex.byFunction[term] || [];
      for (const fileId of functionMatches) {
        this.addSearchResult(results, fileId, 'function', term, 20);
      }

      // Search class names
      const classMatches = this.searchIndex.byClass[term] || [];
      for (const fileId of classMatches) {
        this.addSearchResult(results, fileId, 'class', term, 20);
      }

      // Search dependencies
      const depMatches = this.searchIndex.byDependency[term] || [];
      for (const fileId of depMatches) {
        this.addSearchResult(results, fileId, 'dependency', term, 15);
      }

      // Search file names (fuzzy)
      for (const [fileName, fileId] of Object.entries(this.searchIndex.byFileName)) {
        if (fileName.includes(term)) {
          this.addSearchResult(results, fileId, 'filename', term, 25);
        }
      }

      // Search file paths (fuzzy)
      for (const [filePath, fileId] of Object.entries(this.searchIndex.byFilePath)) {
        if (filePath.includes(term)) {
          this.addSearchResult(results, fileId, 'filepath', term, 15);
        }
      }

      // Content search (if enabled)
      if (includeContent) {
        for (const file of Object.values(this.files)) {
          const content = caseSensitive ? file.content : file.content.toLowerCase();
          if (content.includes(term)) {
            this.addSearchResult(results, file.fileId, 'content', term, 5);
          }
        }
      }
    }

    // Filter by language and file type
    let filteredResults = Object.values(results);

    if (languages.length > 0) {
      filteredResults = filteredResults.filter(r => 
        languages.includes(this.files[r.fileId].language)
      );
    }

    if (fileTypes.length > 0) {
      filteredResults = filteredResults.filter(r => {
        const fileName = this.files[r.fileId].fileName;
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        return fileTypes.includes(extension);
      });
    }

    // Sort by relevance score
    filteredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return filteredResults.slice(0, maxResults);
  }

  getFileById(fileId: string): CodebaseIndex | null {
    return this.files[fileId] || null;
  }

  getLanguageStats(): { [language: string]: number } {
    const stats: { [language: string]: number } = {};
    for (const file of Object.values(this.files)) {
      stats[file.language] = (stats[file.language] || 0) + 1;
    }
    return stats;
  }

  getFunctionNames(): string[] {
    return Object.keys(this.searchIndex.byFunction);
  }

  getClassNames(): string[] {
    return Object.keys(this.searchIndex.byClass);
  }

  getDependencies(): string[] {
    return Object.keys(this.searchIndex.byDependency);
  }

  private addSearchResult(
    results: { [fileId: string]: SearchResult },
    fileId: string,
    matchType: SearchMatchType,
    term: string,
    baseScore: number
  ): void {
    const file = this.files[fileId];
    if (!file) return;

    if (!results[fileId]) {
      results[fileId] = {
        fileId,
        fileName: file.fileName,
        filePath: file.filePath,
        language: file.language,
        relevanceScore: 0,
        matches: [],
        file,
      };
    }

    results[fileId].relevanceScore += baseScore;
    results[fileId].matches.push({
      type: matchType,
      term,
      score: baseScore,
    });
  }
}

export interface SearchOptions {
  languages?: string[];
  fileTypes?: string[];
  includeContent?: boolean;
  maxResults?: number;
  caseSensitive?: boolean;
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  filePath: string;
  language: string;
  relevanceScore: number;
  matches: SearchMatch[];
  file: CodebaseIndex;
}

export interface SearchMatch {
  type: SearchMatchType;
  term: string;
  score: number;
}

export type SearchMatchType = 
  | 'keyword' 
  | 'function' 
  | 'class' 
  | 'dependency' 
  | 'filename' 
  | 'filepath' 
  | 'content';
