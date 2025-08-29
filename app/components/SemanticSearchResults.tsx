"use client";

import { useState } from 'react';
import { SemanticSearchResult } from './SemanticSearch';

interface SemanticSearchResultsProps {
  results: SemanticSearchResult;
  onClose: () => void;
}

export default function SemanticSearchResults({ results, onClose }: SemanticSearchResultsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'files' | 'code' | 'context'>('overview');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  const toggleFileExpansion = (filePath: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filePath)) {
      newExpanded.delete(filePath);
    } else {
      newExpanded.add(filePath);
    }
    setExpandedFiles(newExpanded);
  };

  const toggleChunkExpansion = (chunkId: string) => {
    const newExpanded = new Set(expandedChunks);
    if (newExpanded.has(chunkId)) {
      newExpanded.delete(chunkId);
    } else {
      newExpanded.add(chunkId);
    }
    setExpandedChunks(newExpanded);
  };

  const getLanguageFromPath = (filePath: string): string => {
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
  };

  const formatScore = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 0.9) return 'text-green-400';
    if (score >= 0.8) return 'text-blue-400';
    if (score >= 0.7) return 'text-yellow-400';
    return 'text-gray-400';
  };

  return (
    <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">Semantic Search Results</h3>
          <p className="text-sm text-gray-400 mt-1">
            Found {results.searchResults.chunks.length} relevant code segments across {results.assembledContext.relevantFiles.length} files
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 text-xs text-gray-400">
            <span>Confidence:</span>
            <span className={`font-medium ${getScoreColor(results.metadata.confidence)}`}>
              {formatScore(results.metadata.confidence)}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Query Display */}
      <div className="bg-gray-700 rounded-lg p-3 mb-4">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-blue-400">🔍</span>
          <span className="text-sm font-medium text-gray-300">Query</span>
        </div>
        <p className="text-gray-200 text-sm">{results.searchResults.query}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-700 mb-4">
        <nav className="flex space-x-6">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'files', label: 'Files', icon: '📁' },
            { id: 'code', label: 'Code Segments', icon: '📝' },
            { id: 'context', label: 'Full Context', icon: '🧠' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'files' | 'code' | 'context')}
              className={`flex items-center space-x-2 pb-2 px-1 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-2xl font-bold text-blue-400">{results.assembledContext.summary.filesAnalyzed}</div>
                <div className="text-xs text-gray-400">Files Analyzed</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-2xl font-bold text-green-400">{results.assembledContext.summary.sectionsFound}</div>
                <div className="text-xs text-gray-400">Code Sections</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-2xl font-bold text-yellow-400">{results.assembledContext.totalLines}</div>
                <div className="text-xs text-gray-400">Total Lines</div>
              </div>
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-2xl font-bold text-purple-400">{results.metadata.totalSearchTime + results.metadata.totalAssemblyTime}ms</div>
                <div className="text-xs text-gray-400">Processing Time</div>
              </div>
            </div>

            {/* Languages and Patterns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Primary Languages</h4>
                <div className="flex flex-wrap gap-2">
                  {results.assembledContext.summary.primaryLanguages.map((lang, index) => (
                    <span key={index} className="px-2 py-1 bg-blue-600 bg-opacity-30 text-blue-300 text-xs rounded">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Key Patterns</h4>
                <div className="flex flex-wrap gap-2">
                  {results.assembledContext.summary.keyPatterns.slice(0, 8).map((pattern, index) => (
                    <span key={index} className="px-2 py-1 bg-green-600 bg-opacity-30 text-green-300 text-xs rounded">
                      {pattern}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Suggested Approach */}
            <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-blue-400 mb-2">💡 Suggested Approach</h4>
              <p className="text-sm text-blue-300">{results.assembledContext.summary.suggestedApproach}</p>
            </div>

            {/* Related Concepts */}
            {results.assembledContext.summary.relatedConcepts.length > 0 && (
              <div className="bg-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Related Concepts</h4>
                <div className="flex flex-wrap gap-2">
                  {results.assembledContext.summary.relatedConcepts.map((concept, index) => (
                    <span key={index} className="px-2 py-1 bg-purple-600 bg-opacity-30 text-purple-300 text-xs rounded">
                      {concept}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-3">
            {results.assembledContext.relevantFiles
              .sort((a, b) => b.relevanceScore - a.relevanceScore)
              .map((file, index) => (
                <div key={file.filePath} className="bg-gray-700 rounded-lg border border-gray-600">
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                    onClick={() => toggleFileExpansion(file.filePath)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400">
                          {expandedFiles.has(file.filePath) ? '📂' : '📁'}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-gray-200">{file.fileName}</div>
                          <div className="text-xs text-gray-400">{file.filePath}</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-xs text-gray-400">
                        <span className="px-2 py-1 bg-gray-600 rounded">{file.language}</span>
                        <span className={`font-medium ${getScoreColor(file.relevanceScore)}`}>
                          {formatScore(file.relevanceScore)}
                        </span>
                        <span>{file.relevantSections.length} sections</span>
                        <span>{file.lineCount} lines</span>
                      </div>
                    </div>
                  </div>

                  {expandedFiles.has(file.filePath) && (
                    <div className="px-4 pb-4 space-y-2">
                      {file.relevantSections.map((section, sectionIndex) => (
                        <div key={sectionIndex} className="bg-gray-800 rounded p-3 border-l-2 border-blue-500">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs px-2 py-1 bg-blue-600 bg-opacity-30 text-blue-300 rounded">
                                {section.type}
                              </span>
                              {section.name && (
                                <span className="text-sm font-medium text-gray-300">{section.name}</span>
                              )}
                            </div>
                            <div className="flex items-center space-x-2 text-xs text-gray-400">
                              <span>Lines {section.startLine}-{section.endLine}</span>
                              <span className={getScoreColor(section.relevanceScore)}>
                                {formatScore(section.relevanceScore)}
                              </span>
                            </div>
                          </div>
                          <pre className="text-xs text-gray-300 bg-gray-900 rounded p-2 overflow-x-auto">
                            <code>{section.content}</code>
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-3">
            {results.searchResults.chunks
              .sort((a, b) => b.score - a.score)
              .map((chunk, index) => (
                <div key={chunk.chunkId} className="bg-gray-700 rounded-lg border border-gray-600">
                  <div 
                    className="p-4 cursor-pointer hover:bg-gray-600 transition-colors"
                    onClick={() => toggleChunkExpansion(chunk.chunkId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-gray-400">
                          {expandedChunks.has(chunk.chunkId) ? '📖' : '📄'}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-gray-200">
                            {chunk.chunk.name || `${chunk.chunk.type} in ${chunk.chunk.filePath.split('/').pop()}`}
                          </div>
                          <div className="text-xs text-gray-400">
                            {chunk.chunk.filePath}:{chunk.chunk.startLine}-{chunk.chunk.endLine}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-4 text-xs">
                        <span className="px-2 py-1 bg-gray-600 text-gray-300 rounded">{chunk.chunk.type}</span>
                        <span className={`font-medium ${getScoreColor(chunk.score)}`}>
                          {formatScore(chunk.score)}
                        </span>
                        <span className={`font-medium ${getScoreColor(chunk.contextualRelevance)}`}>
                          {formatScore(chunk.contextualRelevance)} contextual
                        </span>
                      </div>
                    </div>
                  </div>

                  {expandedChunks.has(chunk.chunkId) && (
                    <div className="px-4 pb-4">
                      {/* Snippet Preview */}
                      <div className="mb-3">
                        <h5 className="text-xs font-medium text-gray-400 mb-2">Relevant Snippet</h5>
                        <pre className="text-xs text-gray-300 bg-gray-800 rounded p-3 overflow-x-auto border-l-2 border-yellow-500">
                          <code>{chunk.snippet}</code>
                        </pre>
                      </div>

                      {/* Full Content */}
                      <div>
                        <h5 className="text-xs font-medium text-gray-400 mb-2">Full Content</h5>
                        <pre className={`text-xs text-gray-300 bg-gray-900 rounded p-3 overflow-x-auto language-${getLanguageFromPath(chunk.chunk.filePath)}`}>
                          <code>{chunk.chunk.content}</code>
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="space-y-4">
            <div className="bg-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Formatted Context for AI</h4>
              <div className="bg-gray-900 rounded p-3">
                <pre className="text-xs text-gray-300 whitespace-pre-wrap overflow-x-auto">
                  {results.textContext}
                </pre>
              </div>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => navigator.clipboard.writeText(results.textContext)}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              >
                Copy Context
              </button>
              <button
                onClick={() => {
                  const blob = new Blob([results.textContext], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `context-${results.assembledContext.contextId}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
              >
                Download Context
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
