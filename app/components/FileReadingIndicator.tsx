"use client";

import { useState, useEffect } from 'react';

export interface FileReadStatus {
  filePath: string;
  fileName: string;
  status: 'queued' | 'reading' | 'processing' | 'complete' | 'error';
  progress: number;
  linesRead: number;
  totalLines: number;
  error?: string;
  duration?: number;
  relevanceScore?: number;
}

export interface FileReadingProgress {
  phase: 'initializing' | 'indexing' | 'searching' | 'assembling' | 'complete';
  message: string;
  progress: number;
  currentFile?: string;
  filesProcessed: number;
  totalFiles: number;
  activeFiles: FileReadStatus[];
  completedFiles: FileReadStatus[];
  errors: string[];
}

interface FileReadingIndicatorProps {
  isVisible: boolean;
  progress?: FileReadingProgress;
  onClose?: () => void;
  maxVisibleFiles?: number;
}

export default function FileReadingIndicator({ 
  isVisible, 
  progress, 
  onClose,
  maxVisibleFiles = 6 
}: FileReadingIndicatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    if (progress?.completedFiles) {
      setCompletedCount(progress.completedFiles.length);
    }
  }, [progress?.completedFiles]);

  if (!isVisible || !progress) {
    return null;
  }

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'initializing':
        return '🔧';
      case 'indexing':
        return '📊';
      case 'searching':
        return '🔍';
      case 'assembling':
        return '🧠';
      case 'complete':
        return '✅';
      default:
        return '⚙️';
    }
  };

  // const getStatusIcon = (status: string) => {
  //   switch (status) {
  //     case 'queued':
  //       return '⏳';
  //     case 'reading':
  //       return '📖';
  //     case 'processing':
  //       return '⚙️';
  //     case 'complete':
  //       return '✅';
  //     case 'error':
  //       return '❌';
  //     default:
  //       return '⚙️';
  //   }
  // };

  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case 'queued':
  //       return 'text-gray-400';
  //     case 'reading':
  //       return 'text-blue-400';
  //     case 'processing':
  //       return 'text-yellow-400';
  //     case 'complete':
  //       return 'text-green-400';
  //     case 'error':
  //       return 'text-red-400';
  //     default:
  //       return 'text-gray-400';
  //   }
  // };

  const visibleActiveFiles = progress.activeFiles.slice(0, maxVisibleFiles);
  const hiddenActiveFiles = progress.activeFiles.length - visibleActiveFiles.length;
  const recentCompletedFiles = progress.completedFiles.slice(-3);

  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
      isCollapsed ? 'w-80' : 'w-96'
    } max-w-md`}>
      <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl backdrop-blur-sm bg-opacity-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <span className="text-xl">{getPhaseIcon(progress.phase)}</span>
            <div>
              <h3 className="text-sm font-semibold text-gray-200">
                {progress.phase === 'complete' ? 'Context Ready' : 'Reading Codebase'}
              </h3>
              <p className="text-xs text-gray-400">
                {progress.filesProcessed}/{progress.totalFiles} files
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
            
            {progress.phase === 'complete' && onClose && (
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-4 space-y-4">
            {/* Overall Progress */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-gray-400">{progress.message}</span>
                <span className="text-xs text-gray-400">{Math.round(progress.progress)}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>

            {/* Current File */}
            {progress.currentFile && (
              <div className="bg-gray-700 rounded-lg p-3 border-l-2 border-blue-500">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-blue-400">📖</span>
                  <span className="text-sm font-medium text-gray-200">Reading</span>
                </div>
                <p className="text-xs text-gray-300 truncate">{progress.currentFile}</p>
              </div>
            )}

            {/* Active Files */}
            {visibleActiveFiles.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Processing Files ({progress.activeFiles.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {visibleActiveFiles.map((file) => (
                    <FileStatusItem key={file.filePath} file={file} />
                  ))}
                  
                  {hiddenActiveFiles > 0 && (
                    <div className="text-xs text-gray-500 text-center py-1">
                      +{hiddenActiveFiles} more files...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Recently Completed Files */}
            {recentCompletedFiles.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-400 mb-2">
                  Recently Completed ({completedCount} total)
                </h4>
                <div className="space-y-1">
                  {recentCompletedFiles.map((file) => (
                    <CompletedFileItem key={file.filePath} file={file} />
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {progress.errors.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-red-400 mb-2">
                  Errors ({progress.errors.length})
                </h4>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {progress.errors.slice(-3).map((error, index) => (
                    <div key={index} className="text-xs text-red-300 bg-red-900 bg-opacity-20 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phase-specific Information */}
            {progress.phase === 'complete' && (
              <div className="bg-green-900 bg-opacity-20 border border-green-700 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-green-400">✅</span>
                  <span className="text-sm font-medium text-green-400">Context Ready</span>
                </div>
                <p className="text-xs text-green-300">
                  Found relevant code across {progress.completedFiles.length} files
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FileStatusItem({ file }: { file: FileReadStatus }) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued': return 'text-gray-400';
      case 'reading': return 'text-blue-400';
      case 'processing': return 'text-yellow-400';
      case 'complete': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued': return '⏳';
      case 'reading': return '📖';
      case 'processing': return '⚙️';
      case 'complete': return '✅';
      case 'error': return '❌';
      default: return '⚙️';
    }
  };

  return (
    <div className="bg-gray-700 rounded p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          <span className={getStatusColor(file.status)}>
            {getStatusIcon(file.status)}
          </span>
          <span className="text-xs text-gray-300 truncate">
            {file.fileName}
          </span>
        </div>
        <span className="text-xs text-gray-400 ml-2">
          {Math.round(file.progress)}%
        </span>
      </div>
      
      {file.status === 'reading' && file.totalLines > 0 && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{file.linesRead}/{file.totalLines} lines</span>
        </div>
      )}
      
      {file.progress > 0 && file.status !== 'complete' && (
        <div className="w-full bg-gray-600 rounded-full h-1">
          <div 
            className={`h-1 rounded-full transition-all duration-200 ${
              file.status === 'error' ? 'bg-red-500' : 'bg-blue-400'
            }`}
            style={{ width: `${file.progress}%` }}
          />
        </div>
      )}

      {file.error && (
        <div className="text-xs text-red-300 mt-1 truncate">
          {file.error}
        </div>
      )}
    </div>
  );
}

function CompletedFileItem({ file }: { file: FileReadStatus }) {
  return (
    <div className="flex items-center justify-between bg-gray-700 bg-opacity-50 rounded p-2">
      <div className="flex items-center space-x-2 min-w-0 flex-1">
        <span className="text-green-400">✅</span>
        <span className="text-xs text-gray-300 truncate">{file.fileName}</span>
      </div>
      
      <div className="flex items-center space-x-2 text-xs text-gray-500">
        {file.relevanceScore && (
          <span className="px-1 py-0.5 bg-blue-600 bg-opacity-30 rounded text-blue-300">
            {Math.round(file.relevanceScore * 100)}%
          </span>
        )}
        {file.duration && (
          <span>{Math.round(file.duration)}ms</span>
        )}
      </div>
    </div>
  );
}

// Hook for managing file reading progress
export function useFileReadingProgress() {
  const [progress, setProgress] = useState<FileReadingProgress | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const startProgress = (initialProgress: Partial<FileReadingProgress>) => {
    setProgress({
      phase: 'initializing',
      message: 'Starting...',
      progress: 0,
      filesProcessed: 0,
      totalFiles: 0,
      activeFiles: [],
      completedFiles: [],
      errors: [],
      ...initialProgress
    });
    setIsVisible(true);
  };

  const updateProgress = (updates: Partial<FileReadingProgress>) => {
    setProgress(prev => prev ? { ...prev, ...updates } : null);
  };

  const addFileStatus = (fileStatus: FileReadStatus) => {
    setProgress(prev => {
      if (!prev) return null;
      
      const existingIndex = prev.activeFiles.findIndex(f => f.filePath === fileStatus.filePath);
      
      if (existingIndex >= 0) {
        // Update existing file
        const updatedActiveFiles = [...prev.activeFiles];
        updatedActiveFiles[existingIndex] = fileStatus;
        
        // Move to completed if status is complete or error
        if (fileStatus.status === 'complete' || fileStatus.status === 'error') {
          updatedActiveFiles.splice(existingIndex, 1);
          return {
            ...prev,
            activeFiles: updatedActiveFiles,
            completedFiles: [...prev.completedFiles, fileStatus],
            filesProcessed: prev.filesProcessed + 1
          };
        }
        
        return {
          ...prev,
          activeFiles: updatedActiveFiles
        };
      } else {
        // Add new file
        return {
          ...prev,
          activeFiles: [...prev.activeFiles, fileStatus]
        };
      }
    });
  };

  const completeProgress = () => {
    setProgress(prev => prev ? {
      ...prev,
      phase: 'complete',
      progress: 100,
      message: 'Context assembly complete!'
    } : null);
  };

  const hideProgress = () => {
    setIsVisible(false);
  };

  const resetProgress = () => {
    setProgress(null);
    setIsVisible(false);
  };

  return {
    progress,
    isVisible,
    startProgress,
    updateProgress,
    addFileStatus,
    completeProgress,
    hideProgress,
    resetProgress
  };
}
