"use client";

import React, { useEffect, useState } from "react";
import { PlanGenerationProgress } from "../lib/openAIService";

interface StreamingProgressTickerProps {
  progress: PlanGenerationProgress | null;
  isVisible: boolean;
}

export default function StreamingProgressTicker({ progress, isVisible }: StreamingProgressTickerProps) {
  const [toolHistory, setToolHistory] = useState<{name: string, file?: string}[]>([]);
  
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
            name: progress.toolCall.name, 
            file: progress.currentFile 
          }];
        }
        return prev;
      });
    }
  }, [progress?.toolCall, progress?.currentFile]);

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
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 via-purple-900 to-blue-900 border-b border-blue-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left side - Current action */}
          <div className="flex items-center space-x-4 flex-1">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
              <span className="text-white font-medium text-sm">
                {progress.message}
              </span>
            </div>
            
            {/* Current file being read - Cursor-style prominent display */}
            {renderToolCall()}
          </div>

          {/* Right side - Progress bar and percentage */}
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
        
        {/* Recent tool calls - Cursor AI style */}
        {toolHistory.length > 0 && (
          <div className="mt-1.5 flex items-center space-x-3 text-xs text-blue-300/70">
            <span className="text-blue-400 font-medium">Recent:</span>
            {toolHistory.map((tool, index) => (
              <div key={index} className="flex items-center space-x-1">
                <span className="opacity-70">{tool.name.replace(/_/g, ' ')}</span>
                {tool.file && (
                  <span className="font-mono opacity-80">{tool.file.split('/').pop()}</span>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Step indicator */}
        <div className="mt-1 flex items-center justify-between">
          <div className="text-xs text-blue-300 uppercase tracking-wide font-medium">
            {progress.step === 'analyzing' && '🔍 ANALYZING CODEBASE'}
            {progress.step === 'generating' && '🤖 GENERATING PLAN'}
            {progress.step === 'finalizing' && '📋 FINALIZING PLAN'}
            {progress.step === 'complete' && '✅ COMPLETE'}
          </div>
          
          {progress.toolCall && (
            <div className="text-xs text-blue-400">
              {progress.toolCall.name.replace(/_/g, ' ')} operation in progress...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}