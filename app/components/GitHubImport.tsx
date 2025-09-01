"use client";

import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import Image from 'next/image';
import { StorageManager } from '../lib/storageManager';
import { CodebaseIndex } from '../lib/codebaseParser';

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
  htmlUrl: string;
  owner: {
    login: string;
    avatarUrl: string;
  };
}

export interface GitHubUser {
  login: string;
  name?: string;
  email?: string;
  avatarUrl: string;
}

export interface SyncProgress {
  phase: 'fetching' | 'processing' | 'indexing' | 'complete' | 'error';
  progress: number;
  message: string;
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  errors: string[];
  endTime?: number;
  result?: {
    syncId: string;
    commit: string;
    filesCount: number;
    merkleTreeHash: string;
    webhookId?: number;
    webhookSetup?: boolean;
    codebaseFiles?: CodebaseIndex[]; // Files for client-side storage
    targetCodebaseId?: string; // Codebase ID for storage
    indexingCompleted?: boolean;
    webhookInfo?: any;
  };
}

interface GitHubImportProps {
  onRepositoryImported: (repository: GitHubRepository, syncProgress: SyncProgress) => void;
  className?: string;
  disabled?: boolean;
}

export default function GitHubImport({ onRepositoryImported, className, disabled }: GitHubImportProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepository | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [showRepoList, setShowRepoList] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'validate-token' })
      });

      const data = await response.json();
      
      if (data.success && data.valid) {
        setIsAuthenticated(true);
        setUser(data.user);
        console.log('✅ GitHub authenticated:', data.user.login);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const handleGitHubAuth = async () => {
    setIsAuthenticating(true);
    
    try {
      const response = await fetch('/api/github?action=auth-url');
      const data = await response.json();
      
      if (data.success) {
        // Open GitHub OAuth in a popup
        const popup = window.open(
          data.authUrl,
          'github-auth',
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Listen for popup close or message
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            setIsAuthenticating(false);
            // Check auth status after popup closes
            setTimeout(checkAuthStatus, 1000);
          }
        }, 1000);

        // Listen for auth success message
        const messageHandler = (event: MessageEvent) => {
          if (event.origin === window.location.origin && event.data.type === 'github-auth-success') {
            popup?.close();
            clearInterval(checkClosed);
            setIsAuthenticating(false);
            checkAuthStatus();
            window.removeEventListener('message', messageHandler);
          }
        };

        window.addEventListener('message', messageHandler);

      } else {
        throw new Error('Failed to get auth URL');
      }
    } catch (error) {
      console.error('GitHub auth error:', error);
      setIsAuthenticating(false);
      toast.error('Failed to start GitHub authentication');
    }
  };

  const loadRepositories = async () => {
    if (!isAuthenticated) return;

    setIsLoadingRepos(true);
    
    try {
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'list-repositories',
          type: 'owner',
          sort: 'updated',
          per_page: 50
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setRepositories(data.repositories);
        setShowRepoList(true);
        console.log(`📚 Loaded ${data.repositories.length} repositories`);
      } else {
        throw new Error(data.error || 'Failed to load repositories');
      }
    } catch (error) {
      console.error('Error loading repositories:', error);
      toast.error('Failed to load repositories');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const syncRepository = async (repository: GitHubRepository) => {
    setIsSyncing(true);
    setSelectedRepo(repository);
    setSyncProgress(null);

    try {
      console.log(`🔄 Starting sync for ${repository.fullName}`);
      
      const response = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync-repository',
          owner: repository.owner.login,
          repo: repository.name,
          branch: repository.defaultBranch,
          codebaseId: `github_${repository.owner.login}_${repository.name}`
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.message || 'Failed to start sync');
      }

      const progressId = data.progressId;
      console.log(`📊 Sync started, tracking progress: ${progressId}`);

      // Poll for progress with improved error handling
      let pollAttempts = 0;
      const maxPollAttempts = 600; // 10 minutes with 1s intervals

      const pollInterval = setInterval(async () => {
        try {
          pollAttempts++;

          const progressResponse = await fetch(`/api/github?action=progress&progressId=${progressId}`);
          const progressData = await progressResponse.json();

          if (progressData.success && progressData.progress) {
            const progress = progressData.progress;
            console.log(`📊 Progress update: ${progress.phase} - ${progress.progress}% - ${progress.message}`);
            setSyncProgress(progress);

            // Check if sync is complete AND has the required result data
            const isCompleteWithData = progress.phase === 'complete' && 
              progress.result && 
              progress.result.codebaseFiles && 
              progress.result.targetCodebaseId;

            const isCompleteWithError = progress.phase === 'complete' && 
              (!progress.result || !progress.result.codebaseFiles || !progress.result.targetCodebaseId);

            if (isCompleteWithData) {
              clearInterval(pollInterval);
              setIsSyncing(false);
              setShowRepoList(false);

              // Store codebase metadata in localStorage
              console.log('🔍 Sync complete with all required data:', {
                hasResult: !!progress.result,
                hasCodebaseFiles: !!progress.result?.codebaseFiles,
                codebaseFilesCount: progress.result?.codebaseFiles?.length,
                hasTargetCodebaseId: !!progress.result?.targetCodebaseId,
                targetCodebaseId: progress.result?.targetCodebaseId
              });

              try {
                console.log('💾 Storing codebase metadata in localStorage...');
                console.log(`📁 Files to store: ${progress.result.codebaseFiles.length}`);
                console.log(`🆔 Target codebase ID: ${progress.result.targetCodebaseId}`);
                
                await StorageManager.storeCodebaseWithId(
                  progress.result.targetCodebaseId,
                  repository.fullName,
                  progress.result.codebaseFiles,
                  true // Replace existing
                );
                console.log(`✅ Codebase metadata stored with ID: ${progress.result.targetCodebaseId}`);

                // Verify storage by trying to retrieve it
                const storedCodebase = await StorageManager.getCodebase(progress.result.targetCodebaseId);
                console.log('🔍 Verification - stored codebase found:', !!storedCodebase);
              } catch (storageError) {
                console.warn('⚠️ Failed to store codebase metadata:', storageError);
                // Don't fail the entire sync for storage issues
              }

              onRepositoryImported(repository, progress);
              toast.success(`Repository ${repository.name} imported successfully!`);
              console.log('✅ GitHub sync completed successfully');
            } else if (isCompleteWithError) {
              // Sync marked as complete but missing essential data - continue polling for a bit longer
              console.warn('⚠️ Sync marked complete but missing data - waiting for complete result...', {
                hasResult: !!progress.result,
                hasCodebaseFiles: !!progress.result?.codebaseFiles,
                hasTargetCodebaseId: !!progress.result?.targetCodebaseId,
                pollAttempts
              });
              
              // Give it a few more attempts (30 seconds) to get the complete data
              if (pollAttempts >= maxPollAttempts + 30) {
                clearInterval(pollInterval);
                setIsSyncing(false);
                console.error('❌ Sync completed but result data is incomplete after extended wait');
                toast.error('Sync completed but some data may be missing. Please try again.');
              }
            } else if (progress.phase === 'complete') {
              // This shouldn't happen based on our logic above, but just in case
              console.warn('⚠️ Unexpected complete state without proper validation');
              clearInterval(pollInterval);
              setIsSyncing(false);
              onRepositoryImported(repository, progress);
              toast.success(`Repository ${repository.name} imported successfully!`);
              console.log('✅ GitHub sync completed (with possible missing data)');
            } else if (progress.phase === 'error') {
              clearInterval(pollInterval);
              setIsSyncing(false);
              const errorMsg = progress.errors?.join(', ') || 'Unknown error occurred';
              toast.error(`Sync failed: ${errorMsg}`);
              console.error('❌ GitHub sync failed:', progress.errors);
            }
          } else if (pollAttempts >= maxPollAttempts) {
            // Timeout after 10 minutes
            clearInterval(pollInterval);
            setIsSyncing(false);
            toast.error('Sync timed out. Please try again.');
            console.error('❌ GitHub sync timed out after 10 minutes');
          }
        } catch (error) {
          console.error('Error polling progress:', error);

          // Continue polling even if there's a network error, but limit consecutive failures
          if (pollAttempts >= maxPollAttempts) {
            clearInterval(pollInterval);
            setIsSyncing(false);
            toast.error('Network error during sync. Please try again.');
            console.error('❌ Max polling attempts reached with network errors');
          } else {
            console.warn(`⚠️ Polling error (attempt ${pollAttempts}/${maxPollAttempts}), continuing...`);
          }
        }
      }, 1000);

      // Cleanup after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setIsSyncing(false);
      }, 10 * 60 * 1000);

    } catch (error) {
      console.error('Sync error:', error);
      setIsSyncing(false);
      toast.error(`Failed to sync repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/github?action=logout');
      setIsAuthenticated(false);
      setUser(null);
      setRepositories([]);
      setShowRepoList(false);
      toast.success('Logged out from GitHub');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes * k) / Math.log(k));
    return parseFloat(((bytes * k) / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i - 1];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className={className}>
      {!isAuthenticated ? (
        <button
          onClick={handleGitHubAuth}
          disabled={disabled || isAuthenticating}
          className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center space-x-2 border border-gray-600"
        >
          {isAuthenticating ? (
            <>
              <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>Import from GitHub</span>
            </>
          )}
        </button>
      ) : (
        <div className="relative">
          <button
            onClick={loadRepositories}
            disabled={disabled || isLoadingRepos}
            className="bg-green-700 hover:bg-green-600 disabled:bg-green-600 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center space-x-2 border border-green-600"
          >
            {isLoadingRepos ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Loading...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>GitHub ({user?.login})</span>
              </>
            )}
          </button>

          {/* User Info & Logout */}
          {user && (
            <div className="absolute top-full right-0 mt-2 bg-gray-700 rounded-lg p-3 border border-gray-600 min-w-48 z-10 opacity-0 hover:opacity-100 transition-opacity">
              <div className="flex items-center space-x-2 mb-2">
                <Image src={user.avatarUrl} alt={user.login} width={32} height={32} className="rounded-full" />
                <div>
                  <div className="text-sm font-medium text-white">{user.name || user.login}</div>
                  <div className="text-xs text-gray-400">@{user.login}</div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Logout from GitHub
              </button>
            </div>
          )}
        </div>
      )}

      {/* Repository List Modal */}
      {showRepoList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-96 overflow-hidden border border-gray-700">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Select Repository to Import</h3>
              <button
                onClick={() => setShowRepoList(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="overflow-y-auto max-h-80">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  className="p-4 border-b border-gray-700 hover:bg-gray-700 transition-colors cursor-pointer"
                  onClick={() => syncRepository(repo)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className="font-medium text-white">{repo.name}</h4>
                        {repo.private && (
                          <span className="px-2 py-1 text-xs bg-yellow-600 text-yellow-100 rounded">Private</span>
                        )}
                        {repo.language && (
                          <span className="px-2 py-1 text-xs bg-blue-600 text-blue-100 rounded">{repo.language}</span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-sm text-gray-400 mb-2">{repo.description}</p>
                      )}
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{formatFileSize(repo.size)}</span>
                        <span>Updated {formatDate(repo.updatedAt)}</span>
                        <span>Branch: {repo.defaultBranch}</span>
                      </div>
                    </div>
                    <div className="ml-4">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sync Progress Modal */}
      {isSyncing && syncProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6 border border-gray-700">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-white mb-4">
                Importing {selectedRepo?.name}
              </h3>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>{syncProgress.message}</span>
                  <span>{Math.round(syncProgress.progress)}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${syncProgress.progress}%` }}
                  />
                </div>
              </div>

              {syncProgress.currentFile && (
                <div className="text-xs text-gray-400 mb-2">
                  Processing: {syncProgress.currentFile}
                </div>
              )}

              <div className="text-sm text-gray-400">
                {syncProgress.filesProcessed}/{syncProgress.totalFiles} files
              </div>

              {syncProgress.errors.length > 0 && (
                <div className="mt-4 p-3 bg-red-900 bg-opacity-20 border border-red-700 rounded">
                  <div className="text-red-400 text-sm">
                    {syncProgress.errors.slice(-1)[0]}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
