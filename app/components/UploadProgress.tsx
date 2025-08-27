"use client";

import React from "react";
import { UploadProgress } from "../page";

interface UploadProgressProps {
  progress: UploadProgress;
}

export default function UploadProgressComponent({ progress }: UploadProgressProps) {
  const { total, completed, currentFile, isUploading } = progress;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  console.log('📊 Upload progress update:', {
    total,
    completed,
    percentage,
    currentFile,
    isUploading
  });

  if (!isUploading && completed === 0) {
    console.log('⏭️ Upload progress hidden - not uploading and no files completed');
    return null;
  }

  return (
    <div className="w-full space-y-4">
      {/* Progress Bar */}
      <div className="w-full bg-gray-600 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      {/* Progress Stats */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <span className="font-medium text-gray-300">
            {completed} of {total} files
          </span>
          <span className="text-gray-400">
            ({percentage}%)
          </span>
        </div>
        
        <div className="flex items-center text-gray-300">
          {isUploading ? (
            <>
              <div className="animate-spin mr-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v4m0 12v4M4.22 4.22l2.83 2.83m8.49 8.49l2.83 2.83M2 12h4m12 0h4M4.22 19.78l2.83-2.83m8.49-8.49l2.83-2.83" />
                </svg>
              </div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400">Complete</span>
            </>
          )}
        </div>
      </div>

      {/* Current File */}
      {currentFile && isUploading && (
        <div className="bg-gray-700 border border-gray-600 rounded-lg p-3">
          <div className="flex items-center">
            <div className="flex-shrink-0 mr-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-blue-300 font-medium">Processing:</p>
              <p className="text-sm text-gray-300 truncate" title={currentFile}>
                {currentFile}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {!isUploading && completed === total && total > 0 && (
        <div className="bg-gray-700 border border-green-500 rounded-lg p-3">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-green-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-green-300">
                Upload Complete!
              </p>
              <p className="text-sm text-gray-300">
                Successfully processed {total} files. Ready to generate your plan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Processing Steps Indicator */}
      {isUploading && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className={`text-center p-2 rounded ${completed > 0 ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
            <div className="font-medium mb-1">📂 Reading Files</div>
            <div className={completed > 0 ? 'text-green-400' : 'text-gray-500'}>
              {completed > 0 ? '✓' : '●'}
            </div>
          </div>
          
          <div className={`text-center p-2 rounded ${percentage > 50 ? 'bg-yellow-800 text-yellow-300' : 'bg-gray-700 text-gray-400'}`}>
            <div className="font-medium mb-1">🔍 Processing</div>
            <div className={percentage > 50 ? 'text-yellow-400' : 'text-gray-500'}>
              {percentage > 50 ? '⚡' : '●'}
            </div>
          </div>
          
          <div className={`text-center p-2 rounded ${percentage === 100 ? 'bg-green-800 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
            <div className="font-medium mb-1">✨ Indexing</div>
            <div className={percentage === 100 ? 'text-green-400' : 'text-gray-500'}>
              {percentage === 100 ? '✓' : '●'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
