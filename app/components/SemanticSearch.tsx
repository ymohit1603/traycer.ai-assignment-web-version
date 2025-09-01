"use client";

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import FileReadingIndicator, { useFileReadingProgress } from './FileReadingIndicator';
import { PayloadPruner, PayloadValidationResult } from '../lib/payloadPruning';
import { StoredCodebase, StorageManager } from '../lib/storageManager';

export interface SemanticSearchResult {
  success: boolean;
  searchResults: {
    chunks: Array<{
      chunkId: string;
      score: number;
      chunk: {
        id: string;
        content: string;
        type: string;
        name?: string;
        filePath: string;
        startLine: number;
        endLine: number;
      };
      contextualRelevance: number;
      snippet: string;
    }>;
    totalRelevance: number;
    searchTime: number;
    query: string;
    contextSummary: string;
  };
  assembledContext: {
    contextId: string;
    query: string;
    relevantFiles: Array<{
      filePath: string;
      fileName: string;
      language: string;
      relevantSections: Array<{
        startLine: number;
        endLine: number;
        content: string;
        type: string;
        name?: string;
        relevanceScore: number;
      }>;
      relevanceScore: number;
      lineCount: number;
    }>;
    summary: {
      filesAnalyzed: number;
      sectionsFound: number;
      primaryLanguages: string[];
      keyPatterns: string[];
      suggestedApproach: string;
      relatedConcepts: string[];
    };
    confidence: number;
    totalLines: number;
  };
  textContext: string;
  metadata: {
    query: string;
    codebaseId: string;
    searchResultsCount: number;
    contextFilesCount: number;
    totalSearchTime: number;
    totalAssemblyTime: number;
    confidence: number;
  };
}

interface SemanticSearchProps {
  codebaseId: string;
  onResultsFound: (results: SemanticSearchResult) => void;
  className?: string;
  storedCodebase?: StoredCodebase; // Optional codebase to send with requests
}

export default function SemanticSearch({ codebaseId, onResultsFound, className, storedCodebase }: SemanticSearchProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexStatus, setIndexStatus] = useState<'unknown' | 'indexed' | 'not-indexed'>('unknown');
  const [lastResults, setLastResults] = useState<SemanticSearchResult | null>(null);
  const [payloadValidation, setPayloadValidation] = useState<PayloadValidationResult | null>(null);
  
  const {
    progress: readingProgress,
    isVisible: showFileReading,
    startProgress,
    updateProgress,
    addFileStatus,
    completeProgress,
    hideProgress,
    resetProgress
  } = useFileReadingProgress();

  const checkIndexStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/semantic-index?action=status&codebaseId=${codebaseId}`);
      const data = await response.json();
      
      if (data.success) {
        setIndexStatus(data.indexed ? 'indexed' : 'not-indexed');
      }
    } catch (error) {
      console.error('Error checking index status:', error);
      setIndexStatus('not-indexed');
    }
  }, [codebaseId]);

  // Check if codebase is indexed on mount
  useEffect(() => {
    if (codebaseId) {
      checkIndexStatus();
    } else {
      setIndexStatus('not-indexed');
    }
  }, [codebaseId, checkIndexStatus]);

  // Validate payload when storedCodebase changes
  useEffect(() => {
    if (storedCodebase) {
      try {
        console.log('🔍 StoredCodebase for validation:', {
          id: storedCodebase.metadata?.id,
          filesCount: storedCodebase.files?.length || 0,
          hasSearchIndex: !!storedCodebase.searchIndex,
          sampleFile: storedCodebase.files?.[0] ? {
            path: storedCodebase.files[0].filePath,
            hasContent: !!storedCodebase.files[0].content,
            contentLength: storedCodebase.files[0].content?.length || 0
          } : 'no files'
        });
        
        const prunedCodebase = PayloadPruner.pruneCodebaseForTransmission(storedCodebase);
        const validation = PayloadPruner.validatePayload(prunedCodebase);
        setPayloadValidation(validation);
        
        if (!validation.isValid) {
          console.warn('⚠️ Codebase payload validation failed:', validation.error);
        } else {
          console.log(`✅ Codebase payload validated: ${(validation.size / 1024).toFixed(1)}KB`);
        }
      } catch (error) {
        console.error('❌ Error validating payload:', error);
        setPayloadValidation({
          isValid: false,
          size: 0,
          error: 'Failed to validate payload'
        });
      }
    } else {
      setPayloadValidation(null);
    }
  }, [storedCodebase]);

  const indexCodebase = async () => {
    if (isIndexing) return;
    
    if (!codebaseId || codebaseId.trim() === '') {
      console.error('❌ No codebase ID provided for indexing');
      toast.error('No codebase selected for indexing. Please upload files or import from GitHub first.');
      return;
    }
    
    setIsIndexing(true);
    
    try {
      console.log(`🚀 Starting codebase indexing for: ${codebaseId}`);
      
      // Initialize search service
      const initResponse = await fetch('/api/semantic-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize' })
      });

      if (!initResponse.ok) {
        throw new Error('Failed to initialize search service');
      }

      // Start indexing
      const indexResponse = await fetch('/api/semantic-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'index-codebase',
          codebaseId
        })
      });

      const indexData = await indexResponse.json();
      
      if (!indexData.success) {
        throw new Error(indexData.message || 'Failed to start indexing');
      }

      console.log('📊 Indexing started, polling progress...');
      
      // Start progress tracking
      startProgress({
        phase: 'indexing',
        message: 'Starting semantic indexing...',
        progress: 0,
        totalFiles: indexData.filesCount || 0
      });

      // Poll for progress
      const progressId = indexData.progressId;
      const pollInterval = setInterval(async () => {
        try {
          const progressResponse = await fetch(`/api/semantic-index?action=progress&progressId=${progressId}`);
          const progressData = await progressResponse.json();
          
          if (progressData.success && progressData.progress) {
            const progress = progressData.progress;
            
            updateProgress({
              phase: progress.phase === 'complete' ? 'complete' : 'indexing',
              message: progress.message,
              progress: progress.progress,
              currentFile: progress.currentFile,
              filesProcessed: progress.chunksProcessed || 0,
              errors: progress.errors || []
            });

            // Add file status updates (simulated based on progress)
            if (progress.currentFile && progress.progress > 0) {
              addFileStatus({
                filePath: progress.currentFile,
                fileName: progress.currentFile.split('/').pop() || '',
                status: progress.progress === 100 ? 'complete' : 'processing',
                progress: progress.progress,
                linesRead: 0,
                totalLines: 0
              });
            }

            if (progress.phase === 'complete') {
              clearInterval(pollInterval);
              completeProgress();
              setIndexStatus('indexed');
              setIsIndexing(false);
              toast.success('Codebase indexed successfully! You can now search.');
            }
          }
        } catch (error) {
          console.error('Error polling progress:', error);
        }
      }, 1000);

      // Cleanup after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsIndexing(false);
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error('❌ Error indexing codebase:', error);
      setIsIndexing(false);
      updateProgress({
        phase: 'complete',
        progress: 100,
        message: 'Indexing failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
      toast.error('Failed to index codebase');
    }
  };

  const performSearch = async () => {
    if (!query.trim() || isSearching) return;
    
    if (indexStatus !== 'indexed') {
      toast.error('Please index the codebase first');
      return;
    }

    // Check payload validation if we have a stored codebase
    if (storedCodebase && payloadValidation && !payloadValidation.isValid) {
      // For the "no files" case, we can still search but with server-side fallback
      if (payloadValidation.error?.includes('No files available')) {
        console.log('🔄 No local files available, falling back to server-side search');
        toast('Using server-side search (local files not available)', { icon: 'ℹ️' });
        // Continue with search but without client payload
      } else {
        // For other validation errors, stop the search
        toast.error(`Cannot send codebase data: ${payloadValidation.error}`);
        if (payloadValidation.suggestions) {
          console.warn('💡 Suggestions:', payloadValidation.suggestions);
          toast.error(`Suggestions: ${payloadValidation.suggestions.join('; ')}`);
        }
        return;
      }
    }

    setIsSearching(true);
    resetProgress();

    try {
      console.log(`🔍 Performing semantic search: "${query}"`);

      // Prepare payload
      let prunedCodebase = null;
      const shouldIncludePayload = storedCodebase && 
        payloadValidation?.isValid && 
        !payloadValidation.error?.includes('No files available');
        
      if (shouldIncludePayload) {
        prunedCodebase = PayloadPruner.pruneCodebaseForTransmission(storedCodebase);
        console.log(`📦 Including complete codebase payload: ${(payloadValidation.size / 1024).toFixed(1)}KB`);
      } else {
        console.log('🔍 Searching without codebase payload (server-side lookup only)');
      }

      // Start progress tracking for search
      startProgress({
        phase: 'searching',
        message: 'Searching codebase...',
        progress: 20,
        totalFiles: 0
      });

      const requestBody = {
        action: 'search-with-context',
        query,
        codebaseId,
        options: {
          maxResults: 15,
          relevanceThreshold: 0.5,
          includeRelated: true,
          contextWindow: 5
        },
        assemblyOptions: {
          maxFiles: 8,
          maxSnippets: 20,
          contextLines: 5,
          includeFullFiles: false,
          relevanceThreshold: 0.5
        },
        // Include complete codebase if available and valid
        ...(prunedCodebase && { prunedCodebase })
      };

      const response = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      updateProgress({
        phase: 'assembling',
        message: 'Assembling intelligent context...',
        progress: 60
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Search failed');
      }

      // Simulate file reading progress
      if (data.assembledContext?.relevantFiles) {
        const files = data.assembledContext.relevantFiles;
        
        updateProgress({
          phase: 'assembling',
          message: 'Reading relevant files...',
          progress: 70,
          totalFiles: files.length
        });

        // Simulate reading each file
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          
          // Simulate reading progress
          for (let progress = 0; progress <= 100; progress += 25) {
            addFileStatus({
              filePath: file.filePath,
              fileName: file.fileName,
              status: progress === 100 ? 'complete' : 'reading',
              progress,
              linesRead: Math.floor((file.lineCount * progress) / 100),
              totalLines: file.lineCount,
              relevanceScore: file.relevanceScore
            });
            
            if (progress < 100) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          }
        }
      }

      updateProgress({
        phase: 'complete',
        message: 'Context assembly complete!',
        progress: 100,
        filesProcessed: data.assembledContext?.relevantFiles?.length || 0
      });

      completeProgress();
      setLastResults(data);
      onResultsFound(data);

      console.log('✅ Search completed successfully');
      toast.success(`Found ${data.searchResults.chunks.length} relevant code segments`);

    } catch (error) {
      console.error('❌ Error performing search:', error);
      updateProgress({
        phase: 'complete',
        progress: 100,
        message: 'Search failed',
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });
      toast.error('Search failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  };

  return (
    <div className={className}>
      {/* File Reading Indicator */}
      <FileReadingIndicator
        isVisible={showFileReading}
        progress={readingProgress || undefined}
        onClose={hideProgress}
      />

      {/* Search Interface */}
      <div className="space-y-4">
        {/* Index Status */}
        {indexStatus !== 'unknown' && (
          <div className={`p-3 rounded-lg border ${
            indexStatus === 'indexed' 
              ? 'bg-green-900 bg-opacity-20 border-green-700 text-green-400'
              : 'bg-yellow-900 bg-opacity-20 border-yellow-700 text-yellow-400'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>{indexStatus === 'indexed' ? '✅' : '⚠️'}</span>
                <span className="text-sm font-medium">
                  {indexStatus === 'indexed' ? 'Semantic Search Ready' : 'Indexing Required'}
                </span>
              </div>
              
              {indexStatus !== 'indexed' && (
                <button
                  onClick={indexCodebase}
                  disabled={isIndexing}
                  className="px-3 py-1 text-xs bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white rounded transition-colors"
                >
                  {isIndexing ? 'Indexing...' : 'Index Codebase'}
                </button>
              )}
            </div>
            
            <p className="text-xs mt-1 opacity-80">
              {indexStatus === 'indexed' 
                ? 'Use natural language to search your codebase semantically'
                : 'Index your codebase to enable semantic search capabilities'
              }
            </p>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about your codebase... (e.g., 'How does user authentication work?', 'Find similar components to Button', 'Show me error handling patterns')"
            className="w-full p-4 bg-gray-700 border border-gray-600 rounded-lg text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            disabled={isSearching || indexStatus !== 'indexed'}
          />
          
          <div className="absolute bottom-3 right-3 flex items-center space-x-2">
            <span className="text-xs text-gray-500">
              {indexStatus === 'indexed' ? 'Press Enter to search' : 'Index required'}
            </span>
            <button
              onClick={performSearch}
              disabled={!query.trim() || isSearching || indexStatus !== 'indexed'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded-md transition-colors flex items-center space-x-2"
            >
              {isSearching ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Search</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Payload Status */}
        {payloadValidation && (
          <div className={`p-3 rounded-lg border ${
            payloadValidation.isValid 
              ? 'bg-green-900 bg-opacity-20 border-green-700 text-green-400'
              : payloadValidation.error?.includes('No files available')
                ? 'bg-blue-900 bg-opacity-20 border-blue-700 text-blue-400'
                : 'bg-red-900 bg-opacity-20 border-red-700 text-red-400'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">
                {payloadValidation.isValid 
                  ? '🔒 Privacy-First Search' 
                  : payloadValidation.error?.includes('No files available')
                    ? '🗄️ Server-Side Search'
                    : '⚠️ Payload Issue'}
              </span>
              <span className="text-xs opacity-80">
                {(payloadValidation.size / 1024).toFixed(1)}KB
              </span>
            </div>
            
            {payloadValidation.isValid ? (
              <p className="text-xs opacity-80">
                Codebase metadata will be sent securely with search requests (no server storage)
              </p>
            ) : payloadValidation.error?.includes('No files available') ? (
              <p className="text-xs opacity-80">
                Search will use server-side codebase lookup (files not stored locally)
              </p>
            ) : (
              <div>
                <p className="text-xs mb-1">{payloadValidation.error}</p>
                {payloadValidation.suggestions && (
                  <ul className="text-xs opacity-80 list-disc list-inside">
                    {payloadValidation.suggestions.map((suggestion, i) => (
                      <li key={i}>{suggestion}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search Tips */}
        <div className="bg-gray-800 bg-opacity-50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-300 mb-2">💡 Search Tips</h4>
          <ul className="text-xs text-gray-400 space-y-1">
            <li>• Ask specific questions: &ldquo;How does the login function work?&rdquo;</li>
            <li>• Find patterns: &ldquo;Show me similar error handling approaches&rdquo;</li>
            <li>• Discover functionality: &ldquo;Where is data validation implemented?&rdquo;</li>
            <li>• Get context: &ldquo;What components use the UserService?&rdquo;</li>
          </ul>
        </div>

        {/* Recent Results Summary */}
        {lastResults && !isSearching && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-gray-200">Last Search Results</h4>
              <span className="text-xs text-gray-400">
                {Math.round(lastResults.metadata.confidence * 100)}% confidence
              </span>
            </div>
            
            <p className="text-xs text-gray-400 mb-2">&ldquo;{lastResults.metadata.query}&rdquo;</p>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Files Found:</span>
                <span className="text-gray-300 ml-1">{lastResults.metadata.contextFilesCount}</span>
              </div>
              <div>
                <span className="text-gray-500">Code Segments:</span>
                <span className="text-gray-300 ml-1">{lastResults.metadata.searchResultsCount}</span>
              </div>
              <div>
                <span className="text-gray-500">Search Time:</span>
                <span className="text-gray-300 ml-1">{lastResults.metadata.totalSearchTime}ms</span>
              </div>
              <div>
                <span className="text-gray-500">Assembly Time:</span>
                <span className="text-gray-300 ml-1">{lastResults.metadata.totalAssemblyTime}ms</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-xs text-gray-400">
                <span className="font-medium">Suggestion:</span> {lastResults.assembledContext.summary.suggestedApproach}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
