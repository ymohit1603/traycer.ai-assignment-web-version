"use client";

import React, { useEffect, useState } from "react";
import { PlanGenerationProgress } from "../lib/openAIService";

interface StreamingProgressTickerProps {
  progress: PlanGenerationProgress | null;
  isVisible: boolean;
}

export default function StreamingProgressTicker({ progress, isVisible }: StreamingProgressTickerProps) {
  const [toolHistory, setToolHistory] = useState<{name: string, file?: string}[]>([]);
  const [progressLog, setProgressLog] = useState<{message: string, type: 'file' | 'step', timestamp: number}[]>([]);
  
  // Keep a persistent log of all progress steps
  useEffect(() => {
    if (!progress) return;

    // Add file reading to log
    if (progress.currentFile) {
      setProgressLog(prev => {
        const lastEntry = prev[prev.length - 1];
        const newMessage = ` read ${progress.currentFile}`;
        
        // Only add if it's different from the last entry
        if (!lastEntry || lastEntry.message !== newMessage) {
          return [...prev, {
            message: newMessage,
            type: 'file',
            timestamp: Date.now()
          }];
        }
        return prev;
      });
    }

    // Add AI generation steps to log
    if (progress.step) {
      let stepMessage = '';
      switch (progress.step) {
        case 'analyzing':
          stepMessage = '🔍 AI is analyzing codebase...';
          break;
        case 'generating':
          stepMessage = '🤖 AI is generating implementation plan...';
          break;
        case 'finalizing':
          stepMessage = '📋 AI is finalizing your plan...';
          break;
        case 'complete':
          stepMessage = '✅ Plan generation complete!';
          break;
      }

      if (stepMessage) {
        setProgressLog(prev => {
          const lastEntry = prev[prev.length - 1];
          
          // Only add if it's different from the last entry
          if (!lastEntry || lastEntry.message !== stepMessage) {
            return [...prev, {
              message: stepMessage,
              type: 'step',
              timestamp: Date.now()
            }];
          }
          return prev;
        });
      }
    }
  }, [progress?.currentFile, progress?.step]);

  // Keep a history of recent tool calls for a more authentic experience
  useEffect(() => {
    if (progress?.toolCall && progress.currentFile) {
      setToolHistory(prev => {
        // Add new tool call if it's different from the last one
        const lastTool = prev[prev.length - 1];
        if (!lastTool || 
            lastTool.name !== progress.toolCall?.name || 
            lastTool.file !== progress.currentFile) {
          return [...prev.slice(-3), { 
            name: progress.toolCall?.name || 'Unknown Tool', 
            file: progress.currentFile 
          }];
        }
        return prev;
      });
    }
  }, [progress?.toolCall, progress?.currentFile]);

  // Clear log when progress ends
  useEffect(() => {
    if (!isVisible) {
      // Keep the log for a few seconds after completion, then clear
      const timer = setTimeout(() => {
        setProgressLog([]);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  if (!isVisible || !progress) {
    return null;
  }

  // Format the tool call display in Cursor AI style
  const renderToolCall = () => {
    if (progress.toolCall && progress.currentFile) {
      return (
        <div className="flex items-center space-x-2 bg-blue-800/50 rounded-lg px-3 py-1.5 border border-blue-600/50">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></div>
          <span className="text-blue-200 font-mono text-sm font-medium">
            {progress.toolCall.name.replace(/_/g, ' ')} {progress.currentFile}
          </span>
        </div>
      );
    }
    
    if (progress.currentFile) {
      return (
        <div className="flex items-center space-x-2 bg-blue-800/50 rounded-lg px-3 py-1.5 border border-blue-600/50">
          <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></div>
          <svg className="w-4 h-4 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-blue-200 font-mono text-sm font-medium">
            {progress.currentFile}
          </span>
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-30 bg-gradient-to-r from-blue-900 via-purple-900 to-blue-900 border-b border-blue-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Header with overall progress */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-white font-medium text-sm">
              {progress.message}
            </span>
          </div>

          {/* Progress bar and percentage */}
          <div className="flex items-center space-x-3 min-w-[200px]">
            <div className="flex-1 bg-blue-800/50 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-green-400 to-blue-400 h-2 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
                style={{ width: `${progress.progress}%` }}
              >
                {/* Animated shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
              </div>
            </div>
            <span className="text-blue-200 font-medium text-sm min-w-[3rem] text-right">
              {progress.progress}%
            </span>
          </div>
        </div>

        {/* Persistent Progress Log */}
        {progressLog.length > 0 && (
          <div className="bg-blue-900/30 rounded-lg p-3 max-h-32 overflow-y-auto">
            <div className="space-y-1">
              {progressLog.map((entry, index) => (
                <div 
                  key={index} 
                  className={`text-sm font-mono flex items-center space-x-2 ${
                    entry.type === 'file' 
                      ? 'text-green-300' 
                      : 'text-blue-200'
                  }`}
                >
                  <span className="text-xs text-blue-300/60">
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { 
                      hour12: false, 
                      minute: '2-digit', 
                      second: '2-digit' 
                    })}
                  </span>
                  <span>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current Tool Call - if active */}
        {renderToolCall() && (
          <div className="mt-2">
            {renderToolCall()}
          </div>
        )}
      </div>
    </div>
  );
}