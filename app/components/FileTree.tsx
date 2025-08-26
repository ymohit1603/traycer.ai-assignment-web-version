"use client";

import React, { useState } from "react";
import { UploadedFile } from "../page";

interface FileTreeProps {
  files: UploadedFile[];
  level?: number;
}

interface FileIconProps {
  fileName: string;
  isDirectory: boolean;
  isOpen?: boolean;
}

function FileIcon({ fileName, isDirectory, isOpen = false }: FileIconProps) {
  if (isDirectory) {
    return (
      <span className="text-blue-600 mr-2">
        {isOpen ? "📂" : "📁"}
      </span>
    );
  }

  const extension = fileName.split('.').pop()?.toLowerCase();
  const iconMap: { [key: string]: string } = {
    'js': '🟨',
    'jsx': '🟨',
    'ts': '🟦',
    'tsx': '🟦',
    'py': '🐍',
    'java': '☕',
    'html': '🌐',
    'css': '🎨',
    'json': '📋',
    'md': '📝',
    'txt': '📄',
    'yml': '⚙️',
    'yaml': '⚙️',
    'xml': '📜',
    'sql': '🗃️',
    'sh': '⚡',
    'env': '🔧',
  };

  return (
    <span className="mr-2">
      {iconMap[extension || ''] || '📄'}
    </span>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function FileTreeItem({ file, level = 0 }: { file: UploadedFile; level?: number }) {
  const [isOpen, setIsOpen] = useState(level < 2); // Auto-expand first 2 levels
  const isDirectory = Boolean(file.type === 'directory' && file.children && file.children.length > 0);
  const hasChildren = Boolean(file.children && file.children.length > 0);

  const toggleOpen = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className={`${level > 0 ? 'ml-4' : ''}`}>
      <div
        className={`flex items-center py-1 px-2 rounded hover:bg-gray-50 cursor-pointer group ${
          isDirectory ? 'font-medium' : ''
        }`}
        onClick={toggleOpen}
      >
        {hasChildren && (
          <span className="text-gray-400 mr-1 text-xs">
            {isOpen ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="w-3 mr-1"></span>}
        
        <FileIcon 
          fileName={file.name} 
          isDirectory={isDirectory} 
          isOpen={!!isOpen} 
        />
        
        <span className="flex-1 text-sm text-gray-700 truncate">
          {file.name}
        </span>
        
        {!isDirectory && (
          <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatFileSize(file.size)}
          </span>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="border-l border-gray-200 ml-2">
          {file.children!.map((child, index) => (
            <FileTreeItem 
              key={`${child.path}-${index}`} 
              file={child} 
              level={level + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ files, level = 0 }: FileTreeProps) {
  if (!files || files.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8">
        <div className="text-4xl mb-2">📁</div>
        <p>No files uploaded yet</p>
      </div>
    );
  }

  const totalFiles = countFiles(files);
  const totalSize = calculateTotalSize(files);

  return (
    <div className="w-full">
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{totalFiles} files</span>
          <span>{formatFileSize(totalSize)}</span>
        </div>
      </div>
      
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {files.map((file, index) => (
          <FileTreeItem key={`${file.path}-${index}`} file={file} level={level} />
        ))}
      </div>
    </div>
  );
}

// Helper functions
function countFiles(files: UploadedFile[]): number {
  let count = 0;
  for (const file of files) {
    if (file.type !== 'directory') {
      count++;
    }
    if (file.children) {
      count += countFiles(file.children);
    }
  }
  return count;
}

function calculateTotalSize(files: UploadedFile[]): number {
  let totalSize = 0;
  for (const file of files) {
    totalSize += file.size;
    if (file.children) {
      totalSize += calculateTotalSize(file.children);
    }
  }
  return totalSize;
}
