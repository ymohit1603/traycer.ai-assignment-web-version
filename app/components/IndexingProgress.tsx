"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface IndexingProgress {
  codebaseId: string;
  status: 'idle' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'error';
  phase: string;
  progress: number; // 0-100
  message: string;
  chunksProcessed: number;
  totalChunks: number;
  errors: string[];
  startTime: number;
  estimatedTimeRemaining?: number;
}

interface IndexingProgressProps {
  codebaseId?: string;
  isVisible: boolean;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export default function IndexingProgress({ 
  codebaseId, 
  isVisible, 
  onComplete, 
  onError 
}: IndexingProgressProps) {
  const [progress, setProgress] = useState<IndexingProgress | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const fetchProgress = useCallback(async () => {
    if (!codebaseId || !isVisible) return;

    try {
      const response = await fetch(`/api/indexing-progress?codebaseId=${encodeURIComponent(codebaseId)}`);
      const data = await response.json();
      
      if (data.success && data.progress) {
        setProgress(data.progress);
        
        // Check for completion or error
        if (data.progress.status === 'completed') {
          setIsPolling(false);
          onComplete?.();
        } else if (data.progress.status === 'error') {
          setIsPolling(false);
          onError?.(data.progress.errors[0] || 'Unknown error occurred');
        }
      }
    } catch (error) {
      console.error('Error fetching indexing progress:', error);
      onError?.('Failed to fetch indexing progress');
    }
  }, [codebaseId, isVisible, onComplete, onError]);

  useEffect(() => {
    if (!codebaseId || !isVisible) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    
    // Initial fetch
    fetchProgress();
    
    // Set up polling interval
    const interval = setInterval(fetchProgress, 2000); // Poll every 2 seconds
    
    return () => {
      clearInterval(interval);
      setIsPolling(false);
    };
  }, [codebaseId, isVisible, fetchProgress]);

  const formatTime = (ms?: number): string => {
    if (!ms) return 'Unknown';
    
    const seconds = Math.ceil(ms / 1000);
    
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${Math.ceil(seconds / 3600)}h`;
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'idle': return '⏳';
      case 'chunking': return '📝';
      case 'embedding': return '🧠';
      case 'storing': return '💾';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⚙️';
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'idle': return 'text-gray-400';
      case 'chunking': return 'text-blue-400';
      case 'embedding': return 'text-purple-400';
      case 'storing': return 'text-yellow-400';
      case 'completed': return 'text-green-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  if (!isVisible || !progress) {
    return null;
  }

  const { status, phase, progress: progressPercent, message, chunksProcessed, totalChunks, errors, estimatedTimeRemaining } = progress;

  return (
    <div className="fixed top-4 right-4 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-6 max-w-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className={`text-2xl ${getStatusColor(status)}`}>
            {getStatusIcon(status)}
          </span>
          <h3 className="text-lg font-semibold text-white">
            Indexing Progress
          </h3>
        </div>
        
        <div className="text-xs text-gray-400 capitalize">
          {status}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-gray-300 mb-2">
          <span>{phase}</span>
          <span>{progressPercent}%</span>
        </div>
        
        <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
          <div 
            className={`h-full transition-all duration-300 ${
              status === 'error' ? 'bg-red-500' : 
              status === 'completed' ? 'bg-green-500' : 
              'bg-blue-500'
            }`}
            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
          />
        </div>
      </div>

      {/* Current Status Message */}
      <div className="mb-4">
        <p className="text-sm text-gray-300">
          {message}
        </p>
      </div>

      {/* Processing Stats */}
      {totalChunks > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Chunks Processed:</span>
            <span className="text-white">{chunksProcessed.toLocaleString()} / {totalChunks.toLocaleString()}</span>
          </div>
          
          {estimatedTimeRemaining && status !== 'completed' && status !== 'error' && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">ETA:</span>
              <span className="text-white">{formatTime(estimatedTimeRemaining)}</span>
            </div>
          )}
        </div>
      )}

      {/* Animated Processing Indicator */}
      {status !== 'completed' && status !== 'error' && status !== 'idle' && (
        <div className="mb-4">
          <div className="flex items-center space-x-2">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
            <span className="text-xs text-gray-400">Processing in progress...</span>
          </div>
        </div>
      )}

      {/* Error Messages */}
      {errors.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-red-400 mb-2">Errors:</h4>
          <div className="max-h-24 overflow-y-auto space-y-1">
            {errors.slice(-3).map((error, index) => (
              <p key={index} className="text-xs text-red-300 bg-red-900/20 p-2 rounded">
                {error}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Status-specific Messages */}
      {status === 'completed' && (
        <div className="bg-green-900/20 border border-green-700 rounded p-3">
          <p className="text-sm text-green-300">
            ✅ Indexing completed successfully! Your codebase is now ready for semantic search.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3">
          <p className="text-sm text-red-300">
            ❌ Indexing failed. Please check the errors above and try again.
          </p>
        </div>
      )}

      {/* Warning about rate limits */}
      {status === 'embedding' && (
        <div className="bg-yellow-900/20 border border-yellow-700 rounded p-3">
          <p className="text-xs text-yellow-300">
            💡 Using free tier rate limits. For faster indexing, consider upgrading your Voyage AI plan.
          </p>
        </div>
      )}
    </div>
  );
}

export { type IndexingProgress };
