import { StoredCodebase, CodebaseMetadata } from './storageManager';
import { CodebaseIndex } from './codebaseParser';

// Size limits for client-to-server transmission - DISABLED FOR COMPLETE CODEBASE STORAGE
export const PAYLOAD_LIMITS = {
  MAX_TOTAL_SIZE: Number.MAX_SAFE_INTEGER, // No limit - store complete codebase
  MAX_FILE_CONTENT_PREVIEW: Number.MAX_SAFE_INTEGER, // No limit - store full content
  MAX_FILES: Number.MAX_SAFE_INTEGER, // No limit - include all files
  MAX_SEARCH_INDEX_ENTRIES: Number.MAX_SAFE_INTEGER, // No limit - include all index entries
} as const;

export interface PrunedCodebaseFile {
  fileId: string;
  fileName: string;
  filePath: string;
  language: string;
  contentPreview: string; // Complete content (not pruned anymore)
  lines: number;
  size: number;
  lastModified: number;
  functions: Array<{ name: string; type: string; line: number }>;
  classes: Array<{ name: string; line: number }>;
  imports: Array<{ source: string; type: string }>;
  exports: Array<{ name: string; type: string }>;
  variables: Array<{ name: string; type: string; line: number }>;
  interfaces: Array<{ name: string; line: number }>;
  types: Array<{ name: string; line: number }>;
  keywords: string[];
  dependencies: string[];
}

export interface PrunedSearchIndex {
  byKeyword: { [keyword: string]: string[] };
  byLanguage: { [language: string]: string[] };
  byFunction: { [funcName: string]: string[] };
  byClass: { [className: string]: string[] };
  byDependency: { [dep: string]: string[] };
  byFileName: { [fileName: string]: string };
  byFilePath: { [filePath: string]: string };
}

export interface PrunedStoredCodebase {
  metadata: CodebaseMetadata;
  files: PrunedCodebaseFile[];
  searchIndex: PrunedSearchIndex;
  payloadStats: {
    originalSize: number;
    prunedSize: number;
    compressionRatio: number;
    filesIncluded: number;
    filesExcluded: number;
  };
}

export interface PayloadValidationResult {
  isValid: boolean;
  size: number;
  error?: string;
  suggestions?: string[];
}

export class PayloadPruner {
  /**
   * Prepare complete codebase for client-to-server transmission (no pruning)
   */
  static pruneCodebaseForTransmission(codebase: StoredCodebase): PrunedStoredCodebase {
    console.log('🔧 Preparing complete codebase for transmission:', codebase.metadata.id);
    console.log('📁 Input codebase files count:', codebase.files?.length || 0);
    console.log('🔍 Sample files:', codebase.files?.slice(0, 3).map(f => ({ 
      path: f.filePath, 
      hasContent: !!f.content,
      contentLength: f.content?.length || 0 
    })));

    const originalSize = this.estimateCodebaseSize(codebase);
    console.log(`📊 Original codebase size: ${(originalSize / 1024).toFixed(1)}KB`);

    // Include all files (no pruning)
    const prunedFiles = this.pruneFiles(codebase.files);
    
    // Include complete search index (no pruning)
    const prunedSearchIndex = this.pruneSearchIndex(codebase.searchIndex);

    // Create pruned codebase
    const prunedCodebase: PrunedStoredCodebase = {
      metadata: codebase.metadata,
      files: prunedFiles.included,
      searchIndex: prunedSearchIndex,
      payloadStats: {
        originalSize,
        prunedSize: 0, // Will be calculated below
        compressionRatio: 0,
        filesIncluded: prunedFiles.included.length,
        filesExcluded: prunedFiles.excluded
      }
    };

    // Calculate pruned size
    const prunedSize = this.estimatePrunedCodebaseSize(prunedCodebase);
    prunedCodebase.payloadStats.prunedSize = prunedSize;
    prunedCodebase.payloadStats.compressionRatio = originalSize > 0 ? prunedSize / originalSize : 0;

    console.log(`📦 Complete codebase prepared: ${(prunedSize / 1024).toFixed(1)}KB (${(prunedCodebase.payloadStats.compressionRatio * 100).toFixed(1)}% of original)`);
    console.log(`📁 Files: ${prunedFiles.included.length} included, ${prunedFiles.excluded} excluded`);

    return prunedCodebase;
  }

  /**
   * Validate if payload is safe to send
   */
  static validatePayload(prunedCodebase: PrunedStoredCodebase): PayloadValidationResult {
    const size = prunedCodebase.payloadStats.prunedSize;
    
    // Check if no files are available
    if (prunedCodebase.files.length === 0) {
      console.warn('⚠️ No files in codebase payload - will fall back to server-side search');
      return {
        isValid: false,
        size,
        error: 'No files available for privacy-first search',
        suggestions: [
          'The codebase metadata is available but files are not stored locally',
          'Search will fall back to server-side codebase lookup',
          'For privacy-first search, ensure files are stored during repository import'
        ]
      };
    }
    
    // Size validation disabled for complete codebase storage
    console.log(`📊 Payload size: ${(size / 1024 / 1024).toFixed(1)}MB (no size limits enforced)`);
    // Skip size validation since we want to store the complete codebase

    // Skip sensitive content validation for complete codebase storage
    // User has requested to store the complete codebase without any filtering
    console.log('🔒 Sensitive content validation disabled for complete codebase storage');

    return {
      isValid: true,
      size
    };
  }

  /**
   * Include all files (no pruning - for complete codebase storage)
   */
  private static pruneFiles(files: CodebaseIndex[]): { included: PrunedCodebaseFile[], excluded: number } {
    console.log('🗂️ Including all files, input count:', files?.length || 0);
    
    if (!files || files.length === 0) {
      console.warn('⚠️ No files to include - codebase.files is empty or undefined');
      return { included: [], excluded: 0 };
    }

    // Include all files without any sorting or limiting
    const allFiles = files;

    console.log('📋 Including all files:', allFiles.length, 'files');

    const prunedFiles: PrunedCodebaseFile[] = allFiles.map(file => ({
      fileId: file.fileId,
      fileName: file.fileName,
      filePath: file.filePath,
      language: file.language,
      contentPreview: this.createContentPreview(file.content),
      lines: file.lines,
      size: file.size,
      lastModified: file.lastModified,
      functions: file.functions.map(f => ({ name: f.name, type: 'function', line: f.line })),
      classes: file.classes.map(c => ({ name: c.name, line: c.line })),
      imports: file.imports.map(i => ({ source: i.source, type: 'import' })),
      exports: file.exports.map(e => ({ name: e.name, type: e.type })),
      variables: file.variables.map(v => ({ name: v, type: 'variable', line: 0 })),
      interfaces: file.interfaces?.map(i => ({ name: i.name, line: i.line })) || [],
      types: file.types?.map(t => ({ name: t.name, line: t.line })) || [],
      keywords: file.keywords,
      dependencies: file.dependencies
    }));

    return {
      included: prunedFiles,
      excluded: 0 // No files excluded - including all files
    };
  }

  /**
   * Return full content (no pruning - for complete codebase storage)
   */
  private static createContentPreview(content: string): string {
    if (!content) return '';
    
    // Return the complete content without any truncation or redaction
    // since we want to store the complete codebase
    return content;
  }

  /**
   * Include complete search index (no pruning - for complete codebase storage)
   */
  private static pruneSearchIndex(searchIndex: any): PrunedSearchIndex {
    const pruned: PrunedSearchIndex = {
      byKeyword: {},
      byLanguage: {},
      byFunction: {},
      byClass: {},
      byDependency: {},
      byFileName: {},
      byFilePath: {}
    };

    // Include all entries without any limits
    Object.entries(searchIndex.byKeyword || {})
      .forEach(([key, value]) => pruned.byKeyword[key] = Array.isArray(value) ? value : []);

    Object.entries(searchIndex.byLanguage || {}).forEach(([key, value]) => 
      pruned.byLanguage[key] = Array.isArray(value) ? value : []);

    Object.entries(searchIndex.byFunction || {})
      .forEach(([key, value]) => pruned.byFunction[key] = Array.isArray(value) ? value : []);

    Object.entries(searchIndex.byClass || {})
      .forEach(([key, value]) => pruned.byClass[key] = Array.isArray(value) ? value : []);

    Object.entries(searchIndex.byDependency || {})
      .forEach(([key, value]) => pruned.byDependency[key] = Array.isArray(value) ? value : []);

    Object.entries(searchIndex.byFileName || {}).forEach(([key, value]) => 
      pruned.byFileName[key] = typeof value === 'string' ? value : '');

    Object.entries(searchIndex.byFilePath || {}).forEach(([key, value]) => 
      pruned.byFilePath[key] = typeof value === 'string' ? value : '');

    return pruned;
  }

  /**
   * Estimate size of original codebase
   */
  private static estimateCodebaseSize(codebase: StoredCodebase): number {
    const jsonString = JSON.stringify(codebase);
    return new Blob([jsonString]).size;
  }

  /**
   * Estimate size of pruned codebase
   */
  private static estimatePrunedCodebaseSize(prunedCodebase: PrunedStoredCodebase): number {
    const jsonString = JSON.stringify(prunedCodebase);
    return new Blob([jsonString]).size;
  }

  /**
   * Check if file is a code file
   */
  private static isCodeFile(filePath: string): boolean {
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.php', '.rb', '.go', '.rs'];
    return codeExtensions.some(ext => filePath.toLowerCase().endsWith(ext));
  }

  /**
   * Detect potentially sensitive content (relaxed for development)
   */
  private static detectSensitiveContent(prunedCodebase: PrunedStoredCodebase): string[] {
    const sensitivePatterns: string[] = [];
    
    for (const file of prunedCodebase.files) {
      const content = file.contentPreview.toLowerCase();
      
      // Only flag actual sensitive values, not just variable names
      // Check for actual API keys (long alphanumeric strings)
      if (/(?:api[_-]?key|secret|token)\s*[=:]\s*['"`][a-z0-9_-]{32,}['"`]/i.test(content)) {
        sensitivePatterns.push('long credential values');
      }
      
      // Check for actual passwords (not just the word "password")
      if (/password\s*[=:]\s*['"`].{8,}['"`]/i.test(content)) {
        sensitivePatterns.push('password values');
      }
      
      // Check for URLs with embedded credentials
      if (/https?:\/\/[^:\/\s]+:[^@\/\s]+@[^\s]+/i.test(content)) {
        sensitivePatterns.push('URLs with credentials');
      }
      
      // Check for JWT tokens or bearer tokens
      if (/bearer\s+[a-z0-9_-]{100,}/i.test(content)) {
        sensitivePatterns.push('bearer tokens');
      }
    }
    
    return [...new Set(sensitivePatterns)];
  }

  /**
   * Create a minimal metadata-only payload for very large codebases
   */
  static createMetadataOnlyPayload(codebase: StoredCodebase): Partial<PrunedStoredCodebase> {
    return {
      metadata: codebase.metadata,
      files: [], // No files, just metadata
      searchIndex: {
        byKeyword: {},
        byLanguage: {},
        byFunction: {},
        byClass: {},
        byDependency: {},
        byFileName: {},
        byFilePath: {}
      },
      payloadStats: {
        originalSize: this.estimateCodebaseSize(codebase),
        prunedSize: 0,
        compressionRatio: 0,
        filesIncluded: 0,
        filesExcluded: codebase.files.length
      }
    };
  }
}
