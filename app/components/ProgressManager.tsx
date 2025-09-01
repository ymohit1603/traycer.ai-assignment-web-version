"use client";

import { useState, useRef } from 'react';
import FileReadingIndicator, { FileReadingProgress } from './FileReadingIndicator';
import CompletedFileProgressIndicator from './CompletedFileProgressIndicator';

interface ProgressManagerProps {
  children: React.ReactNode;
}

export default function ProgressManager({ children }: ProgressManagerProps) {
  const [fileProgress, setFileProgress] = useState<FileReadingProgress | null>(null);
  const [isFileProgressVisible, setIsFileProgressVisible] = useState(false);
  const [completedFiles, setCompletedFiles] = useState<any[]>([]);
  const [showCompletedFiles, setShowCompletedFiles] = useState(false);
  
  const handleFileProgressComplete = () => {
    // When file reading completes, move it to the completed files indicator
    if (fileProgress?.completedFiles) {
      setCompletedFiles(fileProgress.completedFiles);
      setShowCompletedFiles(true);
    }
    
    // Hide the main file progress indicator
    setIsFileProgressVisible(false);
    setFileProgress(null);
  };

  return (
    <>
      {children}
      
      {/* Active File Reading Progress - Top right */}
      <FileReadingIndicator
        isVisible={isFileProgressVisible}
        progress={fileProgress || undefined}
        onClose={() => setIsFileProgressVisible(false)}
      />
      
      {/* Completed Files Progress - Lower right */}
      <CompletedFileProgressIndicator
        completedFiles={completedFiles}
        isVisible={showCompletedFiles}
        onClose={() => setShowCompletedFiles(false)}
      />
    </>
  );
}
