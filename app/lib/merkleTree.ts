import crypto from 'crypto-js';

export interface FileNode {
  path: string;
  content: string;
  size: number;
  lastModified: number;
  hash: string;
}

export interface TreeNode {
  path: string;
  hash: string;
  isDirectory: boolean;
  children?: TreeNode[];
  file?: FileNode;
}

export interface MerkleTree {
  rootHash: string;
  nodes: Map<string, TreeNode>;
  fileHashes: Map<string, string>;
  timestamp: number;
  commit?: string;
  branch?: string;
}

export interface ChangeDetectionResult {
  added: string[];
  modified: string[];
  deleted: string[];
  unchanged: string[];
  totalChanges: number;
}

export class MerkleTreeService {
  /**
   * Create a merkle tree from file structure
   */
  static createMerkleTree(
    files: Array<{ path: string; content: string; size: number; lastModified: number }>,
    commit?: string,
    branch?: string
  ): MerkleTree {
    console.log(`🌳 Creating merkle tree for ${files.length} files...`);
    
    const nodes = new Map<string, TreeNode>();
    const fileHashes = new Map<string, string>();
    
    // Create file nodes with content hashes
    const fileNodes: FileNode[] = files.map(file => {
      const contentHash = this.hashContent(file.content);
      const metadataHash = this.hashMetadata(file.path, file.size, file.lastModified);
      const combinedHash = this.combineHashes([contentHash, metadataHash]);
      
      const fileNode: FileNode = {
        path: file.path,
        content: file.content,
        size: file.size,
        lastModified: file.lastModified,
        hash: combinedHash
      };
      
      fileHashes.set(file.path, combinedHash);
      return fileNode;
    });

    // Build tree structure
    const root = this.buildTreeStructure(fileNodes, nodes);
    
    // Calculate merkle root hash
    const rootHash = this.calculateMerkleRoot(root);
    
    console.log(`✅ Merkle tree created with root hash: ${rootHash.substring(0, 16)}...`);
    
    return {
      rootHash,
      nodes,
      fileHashes,
      timestamp: Date.now(),
      commit,
      branch
    };
  }

  /**
   * Compare two merkle trees to detect changes
   */
  static detectChanges(oldTree: MerkleTree, newTree: MerkleTree): ChangeDetectionResult {
    console.log('🔍 Detecting changes between merkle trees...');
    
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const unchanged: string[] = [];

    // Find added and modified files
    for (const [path, newHash] of newTree.fileHashes.entries()) {
      const oldHash = oldTree.fileHashes.get(path);
      
      if (!oldHash) {
        added.push(path);
      } else if (oldHash !== newHash) {
        modified.push(path);
      } else {
        unchanged.push(path);
      }
    }

    // Find deleted files
    for (const [path] of oldTree.fileHashes.entries()) {
      if (!newTree.fileHashes.has(path)) {
        deleted.push(path);
      }
    }

    const totalChanges = added.length + modified.length + deleted.length;
    
    console.log(`📊 Change detection complete:`, {
      added: added.length,
      modified: modified.length,
      deleted: deleted.length,
      unchanged: unchanged.length,
      total: totalChanges
    });

    return {
      added,
      modified,
      deleted,
      unchanged,
      totalChanges
    };
  }

  /**
   * Build hierarchical tree structure from flat file list
   */
  private static buildTreeStructure(fileNodes: FileNode[], nodes: Map<string, TreeNode>): TreeNode {
    // Create directory structure
    const directories = new Map<string, TreeNode>();
    
    // Process all files to create directory structure
    for (const fileNode of fileNodes) {
      const pathParts = fileNode.path.split('/');
      let currentPath = '';
      
      // Create directory nodes for each path segment
      for (let i = 0; i < pathParts.length - 1; i++) {
        const segment = pathParts[i];
        const parentPath = currentPath;
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        
        if (!directories.has(currentPath)) {
          const dirNode: TreeNode = {
            path: currentPath,
            hash: '', // Will be calculated later
            isDirectory: true,
            children: []
          };
          directories.set(currentPath, dirNode);
          nodes.set(currentPath, dirNode);
        }
      }
      
      // Create file node
      const fileTreeNode: TreeNode = {
        path: fileNode.path,
        hash: fileNode.hash,
        isDirectory: false,
        file: fileNode
      };
      
      nodes.set(fileNode.path, fileTreeNode);
    }

    // Build parent-child relationships
    for (const [path, node] of directories.entries()) {
      const pathParts = path.split('/');
      
      if (pathParts.length > 1) {
        const parentPath = pathParts.slice(0, -1).join('/');
        const parent = directories.get(parentPath);
        if (parent && parent.children) {
          parent.children.push(node);
        }
      }
    }

    // Add files to their parent directories
    for (const fileNode of fileNodes) {
      const pathParts = fileNode.path.split('/');
      if (pathParts.length > 1) {
        const parentPath = pathParts.slice(0, -1).join('/');
        const parent = directories.get(parentPath);
        if (parent && parent.children) {
          const fileTreeNode = nodes.get(fileNode.path)!;
          parent.children.push(fileTreeNode);
        }
      }
    }

    // Create root node
    const rootChildren: TreeNode[] = [];
    
    // Add top-level directories and files
    for (const [path, node] of directories.entries()) {
      if (!path.includes('/')) {
        rootChildren.push(node);
      }
    }
    
    for (const fileNode of fileNodes) {
      if (!fileNode.path.includes('/')) {
        rootChildren.push(nodes.get(fileNode.path)!);
      }
    }

    const root: TreeNode = {
      path: '/',
      hash: '', // Will be calculated
      isDirectory: true,
      children: rootChildren
    };

    return root;
  }

  /**
   * Calculate merkle root hash from tree structure
   */
  private static calculateMerkleRoot(node: TreeNode): string {
    if (!node.isDirectory || !node.children) {
      // Leaf node (file)
      return node.hash;
    }

    // Directory node - hash of all children
    const childHashes = node.children
      .map(child => this.calculateMerkleRoot(child))
      .sort(); // Sort for consistent ordering

    node.hash = this.combineHashes(childHashes);
    return node.hash;
  }

  /**
   * Hash file content
   */
  private static hashContent(content: string): string {
    return crypto.SHA256(content).toString();
  }

  /**
   * Hash file metadata
   */
  private static hashMetadata(path: string, size: number, lastModified: number): string {
    const metadata = `${path}:${size}:${lastModified}`;
    return crypto.SHA256(metadata).toString();
  }

  /**
   * Combine multiple hashes into one
   */
  private static combineHashes(hashes: string[]): string {
    if (hashes.length === 0) return '';
    if (hashes.length === 1) return hashes[0];
    
    const combined = hashes.join('');
    return crypto.SHA256(combined).toString();
  }

  /**
   * Serialize merkle tree for storage
   */
  static serializeMerkleTree(tree: MerkleTree): string {
    const serializable = {
      rootHash: tree.rootHash,
      fileHashes: Array.from(tree.fileHashes.entries()),
      timestamp: tree.timestamp,
      commit: tree.commit,
      branch: tree.branch
    };
    
    return JSON.stringify(serializable);
  }

  /**
   * Deserialize merkle tree from storage
   */
  static deserializeMerkleTree(serialized: string): MerkleTree {
    const data = JSON.parse(serialized);
    
    return {
      rootHash: data.rootHash,
      nodes: new Map(), // Not serialized for space efficiency
      fileHashes: new Map(data.fileHashes),
      timestamp: data.timestamp,
      commit: data.commit,
      branch: data.branch
    };
  }

  /**
   * Get tree statistics
   */
  static getTreeStats(tree: MerkleTree): {
    totalFiles: number;
    totalSize: string;
    depth: number;
    directories: number;
  } {
    const totalFiles = tree.fileHashes.size;
    let totalSize = 0;
    let maxDepth = 0;
    let directories = 0;

    for (const [path, node] of tree.nodes.entries()) {
      if (node.isDirectory) {
        directories++;
      } else if (node.file) {
        totalSize += node.file.size;
      }
      
      const depth = path.split('/').length;
      maxDepth = Math.max(maxDepth, depth);
    }

    return {
      totalFiles,
      totalSize: this.formatFileSize(totalSize),
      depth: maxDepth,
      directories
    };
  }

  /**
   * Format file size for display
   */
  private static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Verify tree integrity
   */
  static verifyTreeIntegrity(tree: MerkleTree): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    // Check if root hash matches calculated hash
    const fileNodes: FileNode[] = [];
    for (const [path, node] of tree.nodes.entries()) {
      if (!node.isDirectory && node.file) {
        fileNodes.push(node.file);
      }
    }
    
    if (fileNodes.length !== tree.fileHashes.size) {
      errors.push('Mismatch between file nodes and file hashes');
    }
    
    // Verify file hashes
    for (const [path, expectedHash] of tree.fileHashes.entries()) {
      const node = tree.nodes.get(path);
      if (node && node.file) {
        const actualHash = this.hashContent(node.file.content);
        const metadataHash = this.hashMetadata(node.file.path, node.file.size, node.file.lastModified);
        const combinedHash = this.combineHashes([actualHash, metadataHash]);
        
        if (combinedHash !== expectedHash) {
          errors.push(`Hash mismatch for file: ${path}`);
        }
      } else {
        errors.push(`Missing file node: ${path}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a patch for incremental updates
   */
  static createPatch(oldTree: MerkleTree, newTree: MerkleTree): {
    changes: ChangeDetectionResult;
    patch: {
      added: Array<{ path: string; file: FileNode }>;
      modified: Array<{ path: string; file: FileNode }>;
      deleted: string[];
    };
  } {
    const changes = this.detectChanges(oldTree, newTree);
    
    const patch = {
      added: changes.added.map(path => {
        const file = newTree.nodes.get(path)?.file;
        return file ? { path, file } : null;
      }).filter((item): item is { path: string; file: FileNode } => item !== null),

      modified: changes.modified.map(path => {
        const file = newTree.nodes.get(path)?.file;
        return file ? { path, file } : null;
      }).filter((item): item is { path: string; file: FileNode } => item !== null),
      
      deleted: changes.deleted
    };

    return { changes, patch };
  }
}
