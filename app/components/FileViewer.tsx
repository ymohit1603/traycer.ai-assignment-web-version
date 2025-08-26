"use client";

import React, { useState } from "react";
import { CodebaseIndex } from "../lib/codebaseParser";

interface FileViewerProps {
  file: CodebaseIndex | null;
  onClose: () => void;
}

export default function FileViewer({ file, onClose }: FileViewerProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'analysis' | 'dependencies'>('content');

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-2">📄</div>
          <p>Select a file to view details</p>
        </div>
      </div>
    );
  }

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

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getLanguageIcon(file.language)}</span>
          <div>
            <h3 className="font-semibold text-gray-900">{file.fileName}</h3>
            <p className="text-sm text-gray-500">{file.filePath}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => copyToClipboard(file.content)}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            title="Copy content"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* File Stats */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center space-x-6 text-sm text-gray-600">
          <span>{file.lines} lines</span>
          <span>{formatFileSize(file.size)}</span>
          <span>{file.language}</span>
          <span>Modified: {formatDate(file.lastModified)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'content'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Content
        </button>
        
        <button
          onClick={() => setActiveTab('analysis')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'analysis'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Analysis ({file.functions.length + file.classes.length})
        </button>
        
        <button
          onClick={() => setActiveTab('dependencies')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'dependencies'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Dependencies ({file.imports.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'content' && (
          <div className="h-full p-4">
            <pre className="text-sm bg-gray-50 p-4 rounded-lg overflow-auto h-full font-mono">
              <code>{file.content}</code>
            </pre>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="h-full p-4 overflow-auto space-y-6">
            {/* Functions */}
            {file.functions.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                  Functions ({file.functions.length})
                </h4>
                <div className="space-y-2">
                  {file.functions.map((func, index) => (
                    <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-mono font-medium text-blue-900">
                            {func.name}({func.params.join(', ')})
                          </h5>
                          {func.docstring && (
                            <p className="text-sm text-blue-700 mt-1">{func.docstring}</p>
                          )}
                        </div>
                        <div className="text-right text-sm text-blue-600">
                          <div>Line {func.line}</div>
                          <div className="flex space-x-2 mt-1">
                            {func.isAsync && <span className="bg-blue-200 px-2 py-1 rounded text-xs">async</span>}
                            {func.isExported && <span className="bg-green-200 px-2 py-1 rounded text-xs">exported</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Classes */}
            {file.classes.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                  Classes ({file.classes.length})
                </h4>
                <div className="space-y-2">
                  {file.classes.map((cls, index) => (
                    <div key={index} className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-mono font-medium text-purple-900">{cls.name}</h5>
                          {cls.extends && (
                            <p className="text-sm text-purple-700">extends {cls.extends}</p>
                          )}
                          {cls.implements && cls.implements.length > 0 && (
                            <p className="text-sm text-purple-700">implements {cls.implements.join(', ')}</p>
                          )}
                          {cls.docstring && (
                            <p className="text-sm text-purple-700 mt-1">{cls.docstring}</p>
                          )}
                        </div>
                        <div className="text-right text-sm text-purple-600">
                          <div>Line {cls.line}</div>
                          <div className="flex space-x-2 mt-1">
                            <span className="bg-purple-200 px-2 py-1 rounded text-xs">
                              {cls.methods.length} methods
                            </span>
                            {cls.isExported && <span className="bg-green-200 px-2 py-1 rounded text-xs">exported</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TypeScript Interfaces */}
            {file.interfaces && file.interfaces.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
                  Interfaces ({file.interfaces.length})
                </h4>
                <div className="space-y-2">
                  {file.interfaces.map((iface, index) => (
                    <div key={index} className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-mono font-medium text-indigo-900">{iface.name}</h5>
                        </div>
                        <div className="text-right text-sm text-indigo-600">
                          <div>Line {iface.line}</div>
                          {iface.isExported && (
                            <span className="bg-green-200 px-2 py-1 rounded text-xs mt-1 inline-block">exported</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Variables */}
            {file.variables.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                  Variables ({file.variables.length})
                </h4>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {file.variables.map((variable, index) => (
                      <span key={index} className="bg-green-200 text-green-800 px-2 py-1 rounded text-sm font-mono">
                        {variable}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {file.functions.length === 0 && file.classes.length === 0 && file.variables.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">🔍</div>
                <p>No code structures detected in this file</p>
                <p className="text-sm mt-1">This might be a configuration file or have unsupported syntax</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'dependencies' && (
          <div className="h-full p-4 overflow-auto space-y-4">
            {/* Imports */}
            {file.imports.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-2"></span>
                  Imports ({file.imports.length})
                </h4>
                <div className="space-y-2">
                  {file.imports.map((imp, index) => (
                    <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-mono font-medium text-orange-900">{imp.source}</h5>
                          {imp.imports.length > 0 && (
                            <p className="text-sm text-orange-700 mt-1">
                              Imports: {imp.imports.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-sm text-orange-600">
                          <div>Line {imp.line}</div>
                          <div className="flex space-x-1 mt-1">
                            {imp.isDefault && <span className="bg-orange-200 px-2 py-1 rounded text-xs">default</span>}
                            {imp.isNamespace && <span className="bg-orange-200 px-2 py-1 rounded text-xs">namespace</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Exports */}
            {file.exports.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-teal-500 rounded-full mr-2"></span>
                  Exports ({file.exports.length})
                </h4>
                <div className="space-y-2">
                  {file.exports.map((exp, index) => (
                    <div key={index} className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-mono font-medium text-teal-900">{exp.name}</h5>
                          <p className="text-sm text-teal-700 capitalize">{exp.type}</p>
                        </div>
                        <div className="text-right text-sm text-teal-600">
                          <div>Line {exp.line}</div>
                          {exp.isDefault && (
                            <span className="bg-teal-200 px-2 py-1 rounded text-xs mt-1 inline-block">default</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            {file.keywords.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                  <span className="w-2 h-2 bg-gray-500 rounded-full mr-2"></span>
                  Keywords ({file.keywords.length})
                </h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {file.keywords.slice(0, 50).map((keyword, index) => (
                      <span key={index} className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm">
                        {keyword}
                      </span>
                    ))}
                    {file.keywords.length > 50 && (
                      <span className="text-sm text-gray-500 px-2 py-1">
                        +{file.keywords.length - 50} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {file.imports.length === 0 && file.exports.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <div className="text-4xl mb-2">📦</div>
                <p>No dependencies detected in this file</p>
                <p className="text-sm mt-1">This file might be self-contained or use implicit imports</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
