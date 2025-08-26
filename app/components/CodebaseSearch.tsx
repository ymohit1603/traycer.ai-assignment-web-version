"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { SearchEngine, SearchResult, StoredCodebase } from "../lib/storageManager";

interface CodebaseSearchProps {
  storedCodebase: StoredCodebase | null;
  onFileSelect?: (fileId: string) => void;
}

interface FilterOptions {
  languages: string[];
  fileTypes: string[];
  includeContent: boolean;
}

export default function CodebaseSearch({ storedCodebase, onFileSelect }: CodebaseSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    languages: [],
    fileTypes: [],
    includeContent: true,
  });

  const searchEngine = useMemo(() => {
    return storedCodebase ? new SearchEngine(storedCodebase) : null;
  }, [storedCodebase]);

  const availableLanguages = useMemo(() => {
    if (!searchEngine) return [];
    return Object.keys(searchEngine.getLanguageStats());
  }, [searchEngine]);

  const availableFileTypes = useMemo(() => {
    if (!storedCodebase) return [];
    const extensions = new Set<string>();
    storedCodebase.files.forEach(file => {
      const ext = file.fileName.split('.').pop()?.toLowerCase();
      if (ext) extensions.add(ext);
    });
    return Array.from(extensions).sort();
  }, [storedCodebase]);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchEngine || !searchQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      
      try {
        // Small delay to debounce search
        await new Promise(resolve => setTimeout(resolve, 150));
        
        const searchResults = searchEngine.search(searchQuery, {
          languages: filters.languages,
          fileTypes: filters.fileTypes,
          includeContent: filters.includeContent,
          maxResults: 50,
          caseSensitive: false,
        });
        
        setResults(searchResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [searchEngine, filters]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  const toggleLanguageFilter = (language: string) => {
    setFilters(prev => ({
      ...prev,
      languages: prev.languages.includes(language)
        ? prev.languages.filter(l => l !== language)
        : [...prev.languages, language],
    }));
  };

  const toggleFileTypeFilter = (fileType: string) => {
    setFilters(prev => ({
      ...prev,
      fileTypes: prev.fileTypes.includes(fileType)
        ? prev.fileTypes.filter(ft => ft !== fileType)
        : [...prev.fileTypes, fileType],
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      languages: [],
      fileTypes: [],
      includeContent: true,
    });
  };

  const getMatchTypeColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      function: 'bg-blue-100 text-blue-800',
      class: 'bg-purple-100 text-purple-800',
      keyword: 'bg-green-100 text-green-800',
      dependency: 'bg-yellow-100 text-yellow-800',
      filename: 'bg-red-100 text-red-800',
      filepath: 'bg-gray-100 text-gray-800',
      content: 'bg-indigo-100 text-indigo-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getLanguageIcon = (language: string): string => {
    const icons: { [key: string]: string } = {
      javascript: '🟨',
      typescript: '🟦',
      python: '🐍',
      java: '☕',
      cpp: '🔧',
      c: '🔧',
      csharp: '💜',
      php: '🐘',
      ruby: '💎',
      go: '🐹',
      rust: '🦀',
      swift: '🔶',
      kotlin: '🎯',
      scala: '🎭',
      dart: '🎯',
      html: '🌐',
      css: '🎨',
      json: '📋',
      yaml: '⚙️',
      xml: '📜',
      sql: '🗃️',
      shell: '⚡',
      markdown: '📝',
    };
    return icons[language] || '📄';
  };

  if (!storedCodebase) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-4xl mb-2">🔍</div>
        <p>Upload a codebase to start searching</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search functions, classes, files, keywords..."
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        
        {isSearching && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
          </svg>
          <span>Filters</span>
          {(filters.languages.length > 0 || filters.fileTypes.length > 0) && (
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {filters.languages.length + filters.fileTypes.length}
            </span>
          )}
        </button>

        {query && (
          <span className="text-sm text-gray-500">
            {results.length} results
            {isSearching && (
              <span className="ml-2 text-blue-600">searching...</span>
            )}
          </span>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-gray-900">Search Filters</h4>
            <button
              onClick={clearAllFilters}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear all
            </button>
          </div>

          {/* Language Filters */}
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Languages</h5>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.map(language => (
                <button
                  key={language}
                  onClick={() => toggleLanguageFilter(language)}
                  className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-sm transition-colors ${
                    filters.languages.includes(language)
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span>{getLanguageIcon(language)}</span>
                  <span>{language}</span>
                </button>
              ))}
            </div>
          </div>

          {/* File Type Filters */}
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">File Types</h5>
            <div className="flex flex-wrap gap-2">
              {availableFileTypes.slice(0, 10).map(fileType => (
                <button
                  key={fileType}
                  onClick={() => toggleFileTypeFilter(fileType)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    filters.fileTypes.includes(fileType)
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  .{fileType}
                </button>
              ))}
              {availableFileTypes.length > 10 && (
                <span className="text-sm text-gray-500 px-2 py-1">
                  +{availableFileTypes.length - 10} more
                </span>
              )}
            </div>
          </div>

          {/* Content Search Toggle */}
          <div>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={filters.includeContent}
                onChange={(e) => setFilters(prev => ({ ...prev, includeContent: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Include file content in search</span>
            </label>
          </div>
        </div>
      )}

      {/* Search Results */}
      <div className="space-y-3">
        {results.map(result => (
          <div
            key={result.fileId}
            onClick={() => onFileSelect?.(result.fileId)}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center space-x-2">
                <span className="text-lg">{getLanguageIcon(result.language)}</span>
                <div>
                  <h4 className="font-medium text-gray-900">{result.fileName}</h4>
                  <p className="text-sm text-gray-500">{result.filePath}</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-400">
                  Score: {result.relevanceScore}
                </span>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getLanguageIcon(result.language) ? 'bg-gray-100 text-gray-700' : ''}`}>
                  {result.language}
                </span>
              </div>
            </div>

            {/* Match Tags */}
            <div className="flex flex-wrap gap-2">
              {result.matches.slice(0, 6).map((match, index) => (
                <span
                  key={index}
                  className={`px-2 py-1 rounded-full text-xs font-medium ${getMatchTypeColor(match.type)}`}
                >
                  {match.type}: {match.term}
                </span>
              ))}
              {result.matches.length > 6 && (
                <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600">
                  +{result.matches.length - 6} more
                </span>
              )}
            </div>

            {/* File Stats */}
            <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
              <span>{result.file.lines} lines</span>
              <span>{Math.round(result.file.size / 1024)} KB</span>
              {result.file.functions.length > 0 && (
                <span>{result.file.functions.length} functions</span>
              )}
              {result.file.classes.length > 0 && (
                <span>{result.file.classes.length} classes</span>
              )}
            </div>
          </div>
        ))}

        {query && !isSearching && results.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🔍</div>
            <p>No results found for "{query}"</p>
            <p className="text-sm mt-1">Try different keywords or adjust your filters</p>
          </div>
        )}

        {!query && (
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-2">💡</div>
            <p>Start typing to search your codebase</p>
            <p className="text-sm mt-1">Search for functions, classes, files, or any keyword</p>
          </div>
        )}
      </div>
    </div>
  );
}
