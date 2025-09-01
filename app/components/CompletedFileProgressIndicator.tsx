"use client";

import { useState } from 'react';
import { FileReadStatus } from './FileReadingIndicator';

interface CompletedFileProgressIndicatorProps {
  completedFiles: FileReadStatus[];
  isVisible: boolean;
  onClose: () => void;
}

export default function CompletedFileProgressIndicator({ 
  completedFiles, 
  isVisible, 
  onClose 
}: CompletedFileProgressIndicatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!isVisible || completedFiles.length === 0) {
    return null;
  }

  return (
    <div className={`fixed top-20 right-4 z-35 transition-all duration-300 ${
      isCollapsed ? 'w-80' : 'w-96'
    } max-w-md`}>
      <div className="bg-gray-800 border border-green-600 rounded-lg shadow-2xl backdrop-blur-sm bg-opacity-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <span className="text-xl">✅</span>
            <div>
              <h3 className="text-sm font-semibold text-green-300">
                Files Read Complete
              </h3>
              <p className="text-xs text-gray-400">
                {completedFiles.length} files processed
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-4 space-y-2 max-h-60 overflow-y-auto">
            {completedFiles.slice(-6).map((file, index) => (
              <div key={index} className="bg-gray-700 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <span className="text-green-400">✅</span>
                    <span className="text-xs text-gray-300 truncate">
                      {file.fileName}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400 ml-2">
                    {file.linesRead} lines
                  </span>
                </div>
                
                {file.relevanceScore && (
                  <div className="text-xs text-gray-500">
                    Relevance: {Math.round(file.relevanceScore * 100)}%
                  </div>
                )}
              </div>
            ))}
            
            {completedFiles.length > 6 && (
              <div className="text-xs text-gray-500 text-center pt-2">
                And {completedFiles.length - 6} more files...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
