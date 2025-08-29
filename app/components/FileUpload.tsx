"use client";

import React, { useState, useRef, useCallback } from "react";
import { UploadedFile, UploadProgress } from "../page";
import { CodebaseParser, CodebaseIndex } from "../lib/codebaseParser";
import { StorageManager } from "../lib/storageManager";

interface FileUploadProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  onProgressUpdate: (progress: UploadProgress) => void;
}

export default function FileUpload({ onFilesUploaded, onProgressUpdate }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    
    // Filter out unwanted files
    const filteredFiles = files.filter(file => {
      const path = file.webkitRelativePath || file.name;
      return !isExcludedFile(path);
    });

    const totalFiles = filteredFiles.length;
    let processedFiles = 0;
    const uploadedFiles: UploadedFile[] = [];

    // Show how many files were filtered out
    if (files.length !== filteredFiles.length) {
      console.log(`Filtered out ${files.length - filteredFiles.length} unwanted files`);
    }

    onProgressUpdate({
      total: totalFiles,
      completed: 0,
      currentFile: "",
      isUploading: true,
    });

    // Process files one by one
    for (const file of filteredFiles) {
      const relativePath = file.webkitRelativePath || file.name;
      onProgressUpdate({
        total: totalFiles,
        completed: processedFiles,
        currentFile: file.name,
        isUploading: true,
      });

      try {
        let content = "";
        const isTextFile = isTextFileType(file);
        
        if (isTextFile && file.size < 1024 * 1024) { // Only read text files under 1MB
          content = await readFileContent(file);
        }

        const uploadedFile: UploadedFile = {
          name: file.name,
          path: relativePath,
          size: file.size,
          type: file.type || getFileTypeFromExtension(file.name),
          content: content,
        };

        uploadedFiles.push(uploadedFile);
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
      }

      processedFiles++;
      
      // Processing delay for better UX
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Organize files into tree structure
    const fileTree = organizeFilesIntoTree(uploadedFiles);

    onProgressUpdate({
      total: totalFiles,
      completed: totalFiles,
      currentFile: "",
      isUploading: false,
    });

    onFilesUploaded(fileTree);
  }, [onFilesUploaded, onProgressUpdate]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = Array.from(e.dataTransfer.items);
    const files: File[] = [];

    Promise.all(
      items.map(item => {
        if (item.kind === "file") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            return traverseFileTree(entry);
          }
        }
        return Promise.resolve([]);
      })
    ).then(fileArrays => {
      const allFiles = fileArrays.flat();
      if (allFiles.length > 0) {
        processFiles(allFiles);
      }
    });
  }, [processFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  }, [processFiles]);

  const openFileDialog = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full">
      <div
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
          dragActive
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          {...({ webkitdirectory: "" } as { webkitdirectory?: string })}
          onChange={handleChange}
          className="hidden"
        />
        
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 text-gray-400">
            <svg
              className="w-full h-full"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-gray-700 mb-2">
              {dragActive ? "Drop your codebase here" : "Upload Your Codebase"}
            </h3>
            <p className="text-gray-500 mb-4">
              Drag and drop your project folder here, or click to browse
            </p>
            
            <button
              onClick={openFileDialog}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
            >
              Choose Folder
            </button>
          </div>
          
          <div className="text-xs text-gray-400 max-w-sm mx-auto">
            <p>Supported: All text files including .js, .ts, .py, .java, .cpp, .html, .css, .json, .md, etc.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function isTextFileType(file: File): boolean {
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.php', '.rb', '.go', '.rs', '.kt', '.swift', '.dart', '.scala',
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.json',
    '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.md', '.txt',
    '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore', '.gitattributes'
  ];
  
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return textExtensions.includes(extension) || file.type.startsWith('text/');
}

function getFileTypeFromExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const typeMap: { [key: string]: string } = {
    'js': 'text/javascript',
    'jsx': 'text/javascript',
    'ts': 'text/typescript',
    'tsx': 'text/typescript',
    'py': 'text/x-python',
    'html': 'text/html',
    'css': 'text/css',
    'json': 'application/json',
    'md': 'text/markdown',
  };
  
  return typeMap[extension || ''] || 'text/plain';
}

function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

function traverseFileTree(entry: FileSystemEntry): Promise<File[]> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      (entry as FileSystemFileEntry).file((file) => {
        resolve([file]);
      });
    } else if (entry.isDirectory) {
      const dirReader = (entry as FileSystemDirectoryEntry).createReader();
      dirReader.readEntries((entries) => {
        Promise.all(entries.map(traverseFileTree)).then((results) => {
          resolve(results.flat());
        });
      });
    } else {
      resolve([]);
    }
  });
}

function organizeFilesIntoTree(files: UploadedFile[]): UploadedFile[] {
  const tree: UploadedFile[] = [];
  const pathMap: { [key: string]: UploadedFile } = {};

  // Sort files by path depth to ensure parent directories are processed first
  files.sort((a, b) => a.path.split('/').length - b.path.split('/').length);

  for (const file of files) {
    const pathParts = file.path.split('/');
    let currentPath = '';
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      currentPath += (i > 0 ? '/' : '') + part;
      
      if (!pathMap[currentPath]) {
        const isFile = i === pathParts.length - 1;
        
        if (isFile) {
          pathMap[currentPath] = file;
        } else {
          // Create directory entry
          pathMap[currentPath] = {
            name: part,
            path: currentPath,
            size: 0,
            type: 'directory',
            children: [],
          };
        }
        
        if (i === 0) {
          tree.push(pathMap[currentPath]);
        } else {
          const parentPath = pathParts.slice(0, i).join('/');
          const parent = pathMap[parentPath];
          if (parent && parent.children) {
            parent.children.push(pathMap[currentPath]);
          }
        }
      }
    }
  }

  return tree;
}

function isExcludedFile(filePath: string): boolean {
  const path = filePath.toLowerCase();
  const fileName = path.split('/').pop() || '';
  
  // Excluded directories (should be anywhere in the path)
  const excludedDirs = [
    'node_modules',
    'vendor',
    'dist',
    'build',
    '.next',
    '.out', 
    'target',
    '.cache',
    '__pycache__',
    '.parcel-cache',
    '.idea',
    '.vscode'
  ];
  
  // Check if path contains any excluded directory
  for (const dir of excludedDirs) {
    if (path.includes(`/${dir}/`) || path.startsWith(`${dir}/`) || path === dir) {
      return true;
    }
  }
  
  // Excluded file extensions
  const excludedExtensions = [
    '.exe', '.dll', '.so', '.zip', '.tar.gz', '.rar',
    '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.mp3', '.mp4', '.pdf', '.log'
  ];
  
  for (const ext of excludedExtensions) {
    if (fileName.endsWith(ext)) {
      return true;
    }
  }
  
  // Excluded specific files
  const excludedFiles = [
    '.ds_store',
    'thumbs.db',
    '.env',
    '.env.local',
    'npm-debug.log',
    'yarn-error.log',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'poetry.lock',
    'pipfile.lock'
  ];
  
  if (excludedFiles.includes(fileName)) {
    return true;
  }
  
  // Excluded patterns
  if (fileName.startsWith('.env.')) {
    return true;
  }
  
  return false;
}
