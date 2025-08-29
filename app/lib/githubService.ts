import { Octokit } from '@octokit/rest';
import { MerkleTreeService, MerkleTree, ChangeDetectionResult } from './merkleTree';
import crypto from 'crypto';
export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  description?: string;
  private: boolean;
  language?: string;
  size: number;
  updatedAt: string;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

export interface GitHubFile {
  path: string;
  content: string;
  size: number;
  sha: string;
  lastModified: number;
  url: string;
  type: 'file' | 'dir';
}

export interface RepositorySync {
  repositoryId: string;
  fullName: string;
  lastSyncCommit: string;
  lastSyncTimestamp: number;
  merkleTree: MerkleTree;
  branch: string;
  webhookId?: number;
  status: 'synced' | 'syncing' | 'error' | 'pending';
}

export interface SyncProgress {
  phase: 'fetching' | 'processing' | 'indexing' | 'complete' | 'error';
  progress: number;
  message: string;
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  errors: string[];
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export class GitHubService {
  private octokit: Octokit;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.octokit = new Octokit({
      auth: accessToken
    });
  }

  /**
   * Get user's repositories
   */
  async getUserRepositories(
    type: 'all' | 'owner' | 'public' | 'private' = 'all',
    sort: 'created' | 'updated' | 'pushed' | 'full_name' = 'updated',
    per_page: number = 30
  ): Promise<GitHubRepository[]> {
    try {
      console.log(`📚 Fetching user repositories (${type}, ${sort})...`);
      
      const response = await this.octokit.repos.listForAuthenticatedUser({
        type,
        sort,
        per_page,
        page: 1
      });

      const repositories: GitHubRepository[] = response.data.map(repo => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || undefined,
        private: repo.private,
        language: repo.language || undefined,
        size: repo.size,
        updatedAt: repo.updated_at,
        defaultBranch: repo.default_branch,
        cloneUrl: repo.clone_url,
        htmlUrl: repo.html_url,
        owner: {
          login: repo.owner.login,
          avatarUrl: repo.owner.avatar_url
        }
      }));

      console.log(`✅ Fetched ${repositories.length} repositories`);
      return repositories;
    } catch (error) {
      console.error('❌ Error fetching repositories:', error);
      throw new Error(`Failed to fetch repositories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get repository contents recursively
   */
  async getRepositoryContents(
    owner: string,
    repo: string,
    path: string = '',
    ref?: string
  ): Promise<GitHubFile[]> {
    try {
      console.log(`📁 Fetching repository contents: ${owner}/${repo}${path ? `/${path}` : ''}`);
      
      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      const files: GitHubFile[] = [];
      
      if (Array.isArray(response.data)) {
        // Directory listing
        for (const item of response.data) {
          if (item.type === 'file') {
            // Get file content
            const fileContent = await this.getFileContent(owner, repo, item.path, ref);
            if (fileContent) {
              files.push(fileContent);
            }
          } else if (item.type === 'dir') {
            // Recursively get directory contents
            const subFiles = await this.getRepositoryContents(owner, repo, item.path, ref);
            files.push(...subFiles);
          }
        }
      } else if (response.data.type === 'file') {
        // Single file
        const fileContent = await this.getFileContent(owner, repo, response.data.path, ref);
        if (fileContent) {
          files.push(fileContent);
        }
      }

      return files;
    } catch (error) {
      console.error(`❌ Error fetching repository contents:`, error);
      throw new Error(`Failed to fetch repository contents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get file content with proper decoding
   */
  private async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<GitHubFile | null> {
    try {
      // Skip binary files and large files
      if (this.isBinaryFile(path) || this.isExcludedFile(path)) {
        return null;
      }

      const response = await this.octokit.repos.getContent({
        owner,
        repo,
        path,
        ref
      });

      if (!Array.isArray(response.data) && response.data.type === 'file') {
        const content = response.data.content;
        const decodedContent = Buffer.from(content, 'base64').toString('utf-8');
        
        // Skip very large files (>1MB)
        if (decodedContent.length > 1024 * 1024) {
          console.log(`⏭️ Skipping large file: ${path} (${decodedContent.length} bytes)`);
          return null;
        }

        return {
          path,
          content: decodedContent,
          size: response.data.size,
          sha: response.data.sha,
          lastModified: Date.now(), // GitHub doesn't provide last modified in this API
          url: response.data.html_url || '',
          type: 'file'
        };
      }

      return null;
    } catch (error) {
      console.warn(`⚠️ Failed to fetch file content for ${path}:`, error);
      return null;
    }
  }

  /**
   * Get latest commit for a branch
   */
  async getLatestCommit(owner: string, repo: string, branch?: string): Promise<{
    sha: string;
    message: string;
    author: string;
    date: string;
  }> {
    try {
      const response = await this.octokit.repos.listCommits({
        owner,
        repo,
        sha: branch,
        per_page: 1
      });

      if (response.data.length === 0) {
        throw new Error('No commits found');
      }

      const commit = response.data[0];
      return {
        sha: commit.sha,
        message: commit.commit.message,
        author: commit.commit.author?.name || 'Unknown',
        date: commit.commit.author?.date || new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error fetching latest commit:', error);
      throw new Error(`Failed to fetch latest commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Sync repository and create merkle tree
   */
  async syncRepository(
    owner: string,
    repo: string,
    branch?: string,
    onProgress?: SyncProgressCallback
  ): Promise<{
    merkleTree: MerkleTree;
    files: GitHubFile[];
    commit: string;
    syncId: string;
  }> {
    const syncId = `sync_${owner}_${repo}_${Date.now()}`;
    
    try {
      console.log(`🔄 Starting repository sync: ${owner}/${repo}${branch ? ` (${branch})` : ''}`);
      
      onProgress?.({
        phase: 'fetching',
        progress: 10,
        message: 'Fetching repository information...',
        filesProcessed: 0,
        totalFiles: 0,
        errors: []
      });

      // Get latest commit
      const latestCommit = await this.getLatestCommit(owner, repo, branch);
      
      onProgress?.({
        phase: 'fetching',
        progress: 20,
        message: `Fetching files from commit ${latestCommit.sha.substring(0, 8)}...`,
        filesProcessed: 0,
        totalFiles: 0,
        errors: []
      });

      // Get all repository files
      const files = await this.getRepositoryContents(owner, repo, '', latestCommit.sha);
      
      onProgress?.({
        phase: 'processing',
        progress: 60,
        message: `Processing ${files.length} files...`,
        filesProcessed: 0,
        totalFiles: files.length,
        errors: []
      });

      // Create merkle tree
      const merkleTreeFiles = files.map(file => ({
        path: file.path,
        content: file.content,
        size: file.size,
        lastModified: file.lastModified
      }));

      const merkleTree = MerkleTreeService.createMerkleTree(
        merkleTreeFiles,
        latestCommit.sha,
        branch
      );

      onProgress?.({
        phase: 'complete',
        progress: 100,
        message: `Sync complete! ${files.length} files processed`,
        filesProcessed: files.length,
        totalFiles: files.length,
        errors: []
      });

      console.log(`✅ Repository sync complete: ${syncId}`);
      
      return {
        merkleTree,
        files,
        commit: latestCommit.sha,
        syncId
      };

    } catch (error) {
      console.error(`❌ Repository sync failed: ${syncId}`, error);
      
      onProgress?.({
        phase: 'error',
        progress: 100,
        message: 'Sync failed',
        filesProcessed: 0,
        totalFiles: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      });

      throw error;
    }
  }

  /**
   * Check for repository changes since last sync
   */
  async checkForChanges(
    owner: string,
    repo: string,
    lastSyncCommit: string,
    branch?: string
  ): Promise<{
    hasChanges: boolean;
    newCommits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
    }>;
    latestCommit: string;
  }> {
    try {
      console.log(`🔍 Checking for changes since ${lastSyncCommit.substring(0, 8)}...`);
      
      const response = await this.octokit.repos.listCommits({
        owner,
        repo,
        sha: branch,
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Last 24 hours
        per_page: 50
      });

      const newCommits = response.data
        .filter(commit => commit.sha !== lastSyncCommit)
        .map(commit => ({
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author?.name || 'Unknown',
          date: commit.commit.author?.date || new Date().toISOString()
        }));

      const hasChanges = newCommits.length > 0;
      const latestCommit = response.data.length > 0 ? response.data[0].sha : lastSyncCommit;

      console.log(`📊 Change check result: ${hasChanges ? `${newCommits.length} new commits` : 'no changes'}`);

      return {
        hasChanges,
        newCommits,
        latestCommit
      };
    } catch (error) {
      console.error('❌ Error checking for changes:', error);
      throw new Error(`Failed to check for changes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Perform incremental sync with change detection
   */
  async incrementalSync(
    owner: string,
    repo: string,
    oldMerkleTree: MerkleTree,
    branch?: string,
    onProgress?: SyncProgressCallback
  ): Promise<{
    newMerkleTree: MerkleTree;
    changes: ChangeDetectionResult;
    changedFiles: GitHubFile[];
    commit: string;
  }> {
    try {
      console.log(`🔄 Starting incremental sync for ${owner}/${repo}...`);
      
      onProgress?.({
        phase: 'fetching',
        progress: 10,
        message: 'Checking for changes...',
        filesProcessed: 0,
        totalFiles: 0,
        errors: []
      });

      // Check if there are new commits
      const changeCheck = await this.checkForChanges(
        owner,
        repo,
        oldMerkleTree.commit || '',
        branch
      );

      if (!changeCheck.hasChanges) {
        console.log('✅ No changes detected, skipping sync');
        return {
          newMerkleTree: oldMerkleTree,
          changes: {
            added: [],
            modified: [],
            deleted: [],
            unchanged: [],
            totalChanges: 0
          },
          changedFiles: [],
          commit: oldMerkleTree.commit || ''
        };
      }

      onProgress?.({
        phase: 'fetching',
        progress: 30,
        message: `Found ${changeCheck.newCommits.length} new commits, fetching latest state...`,
        filesProcessed: 0,
        totalFiles: 0,
        errors: []
      });

      // Perform full sync to get current state
      const { merkleTree: newMerkleTree, files } = await this.syncRepository(
        owner,
        repo,
        branch,
        (progress) => {
          onProgress?.({
            ...progress,
            progress: 30 + (progress.progress * 0.6), // Scale to 30-90%
          });
        }
      );

      onProgress?.({
        phase: 'processing',
        progress: 90,
        message: 'Detecting changes...',
        filesProcessed: 0,
        totalFiles: files.length,
        errors: []
      });

      // Detect changes
      const changes = MerkleTreeService.detectChanges(oldMerkleTree, newMerkleTree);
      
      // Get only changed files
      const changedFilePaths = [...changes.added, ...changes.modified];
      const changedFiles = files.filter(file => changedFilePaths.includes(file.path));

      onProgress?.({
        phase: 'complete',
        progress: 100,
        message: `Incremental sync complete! ${changes.totalChanges} changes detected`,
        filesProcessed: files.length,
        totalFiles: files.length,
        errors: []
      });

      console.log(`✅ Incremental sync complete: ${changes.totalChanges} changes detected`);

      return {
        newMerkleTree,
        changes,
        changedFiles,
        commit: changeCheck.latestCommit
      };

    } catch (error) {
      console.error('❌ Incremental sync failed:', error);
      throw error;
    }
  }

  /**
   * Setup webhook for repository push notifications
   */
  async setupWebhook(
    owner: string,
    repo: string,
    webhookUrl: string
  ): Promise<{ webhookId: number; secret: string }> {
    try {
      console.log(`🔗 Setting up webhook for ${owner}/${repo}...`);
      
      const secret = this.generateWebhookSecret();
      
      const response = await this.octokit.repos.createWebhook({
        owner,
        repo,
        name: 'web',
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret: secret,
          insecure_ssl: '0'
        },
        events: ['push', 'pull_request'],
        active: true
      });

      console.log(`✅ Webhook created with ID: ${response.data.id}`);
      
      return {
        webhookId: response.data.id,
        secret
      };
    } catch (error) {
      console.error('❌ Error setting up webhook:', error);
      throw new Error(`Failed to setup webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove webhook
   */
  async removeWebhook(owner: string, repo: string, webhookId: number): Promise<void> {
    try {
      await this.octokit.repos.deleteWebhook({
        owner,
        repo,
        hook_id: webhookId
      });
      
      console.log(`✅ Webhook ${webhookId} removed`);
    } catch (error) {
      console.error('❌ Error removing webhook:', error);
      throw new Error(`Failed to remove webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if file should be excluded from sync
   */
  private isExcludedFile(path: string): boolean {
    const excludedPatterns = [
      /node_modules/,
      /\.git/,
      /\.DS_Store/,
      /\.env/,
      /\.log$/,
      /\.lock$/,
      /dist\//, 
      /build\//,
      /coverage\//,
      /\.cache\//,
      /__pycache__\//,
      /\.pyc$/,
      /\.class$/,
      /\.jar$/,
      /\.war$/,
      /\.exe$/,
      /\.dll$/,
      /\.so$/,
      /\.zip$/,
      /\.tar\.gz$/,
      /\.rar$/
    ];

    return excludedPatterns.some(pattern => pattern.test(path));
  }

  /**
   * Check if file is binary
   */
  private isBinaryFile(path: string): boolean {
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
      '.mp3', '.mp4', '.wav', '.avi', '.mov', '.wmv',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.ttf', '.otf', '.woff', '.woff2',
      '.bin', '.dat', '.db', '.sqlite'
    ];

    const extension = path.toLowerCase().split('.').pop();
    return extension ? binaryExtensions.includes(`.${extension}`) : false;
  }

  /**
   * Generate webhook secret
   */
  private generateWebhookSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate GitHub access token
   */
  async validateToken(): Promise<{
    valid: boolean;
    user?: {
      login: string;
      name?: string;
      email?: string;
      avatarUrl: string;
    };
    scopes?: string[];
  }> {
    try {
      const response = await this.octokit.users.getAuthenticated();
      
      return {
        valid: true,
        user: {
          login: response.data.login,
          name: response.data.name || undefined,
          email: response.data.email || undefined,
          avatarUrl: response.data.avatar_url
        },
        scopes: [] // GitHub API v4 doesn't return scopes in this endpoint
      };
    } catch {
      return { valid: false };
    }
  }
}
