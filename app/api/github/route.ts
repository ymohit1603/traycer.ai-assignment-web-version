import { NextRequest, NextResponse } from 'next/server';
import { GitHubService } from '../../lib/githubService';
import { SimilaritySearchService } from '../../lib/similaritySearch';
import { MerkleTreeService } from '../../lib/merkleTree';
import { RepositoryStorageService } from '../../lib/repositoryStorage';

interface SyncResult {
  syncId?: string;
  commit?: string;
  filesCount?: number;
  merkleTreeHash?: string;
  webhookId?: number;
  webhookSetup?: boolean;
  changes?: {
    totalChanges: number;
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

interface SyncProgressData {
  phase: 'fetching' | 'processing' | 'indexing' | 'complete' | 'error';
  progress: number;
  message: string;
  filesProcessed?: number;
  totalFiles?: number;
  errors?: string[];
  result?: SyncResult;
}

// Store sync progress for streaming updates
const syncProgress = new Map<string, SyncProgressData>();

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('github_access_token')?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { error: 'GitHub access token not found. Please authenticate first.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, ...params } = body;

    console.log(`🔧 GitHub API: ${action}`);

    const githubService = new GitHubService(accessToken);

    switch (action) {
      case 'validate-token': {
        const validation = await githubService.validateToken();
        
        return NextResponse.json({
          success: true,
          ...validation
        });
      }

      case 'list-repositories': {
        const { type = 'all', sort = 'updated', per_page = 30 } = params;
        
        const repositories = await githubService.getUserRepositories(type, sort, per_page);
        
        return NextResponse.json({
          success: true,
          repositories,
          count: repositories.length
        });
      }

      case 'sync-repository': {
        const { owner, repo, branch, codebaseId } = params;
        
        if (!owner || !repo) {
          return NextResponse.json(
            { error: 'Owner and repo are required' },
            { status: 400 }
          );
        }

        console.log(`🔄 Starting repository sync: ${owner}/${repo}`);

        const progressId = `sync_${owner}_${repo}_${Date.now()}`;
        
        // Initialize progress tracking
        syncProgress.set(progressId, {
          phase: 'fetching',
          progress: 0,
          message: 'Starting sync...',
          filesProcessed: 0,
          totalFiles: 0,
          errors: []
        });

        // Start sync process (async)
        githubService.syncRepository(
          owner,
          repo,
          branch,
          (progress) => {
            syncProgress.set(progressId, progress);
            console.log(`📊 Sync progress: ${progress.phase} - ${progress.progress}%`);
          }
        ).then(async (syncResult) => {
          // After sync, index the repository in the semantic search
          try {
            const searchService = new SimilaritySearchService(
              process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API,
              process.env.PINECONE_API_KEY,
              process.env.PINECONE_ENVIRONMENT
            );

            await searchService.initialize();

            // Convert GitHub files to CodebaseIndex format
            const codebaseFiles = syncResult.files.map(file => ({
              fileId: file.sha,
              fileName: file.path.split('/').pop() || '',
              filePath: file.path,
              language: detectLanguageFromPath(file.path),
              content: file.content,
              lines: file.content.split('\n').length,
              size: file.size,
              lastModified: file.lastModified,
              functions: [],
              classes: [],
              imports: [],
              exports: [],
              variables: [],
              interfaces: [],
              types: [],
              keywords: [],
              dependencies: []
            }));

            // Index the repository with detailed progress
            console.log(`🔍 Starting indexing for ${codebaseFiles.length} files...`);
            await searchService.indexCodebase(
              codebaseFiles,
              codebaseId || `github_${owner}_${repo}`,
              (indexProgress) => {
                console.log(`📊 Indexing progress: ${indexProgress.progress}% - ${indexProgress.message}`);
                syncProgress.set(progressId, {
                  ...syncProgress.get(progressId),
                  phase: 'indexing',
                  progress: 70 + (indexProgress.progress * 0.15), // 70-85% for indexing
                  message: `🔍 ${indexProgress.message}`,
                  currentFile: indexProgress.currentFile || 'Processing files...'
                });
              }
            );
            console.log('✅ Indexing completed successfully');

            // Set up webhook for automatic updates
            let webhookInfo = null;
            try {
              syncProgress.set(progressId, {
                ...syncProgress.get(progressId),
                phase: 'indexing',
                progress: 85,
                message: '🔗 Setting up webhook for auto-updates...'
              });

              console.log('🔧 Setting up webhook...');
              const webhookUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/github/webhook`;
              
              // Skip webhook setup for localhost development
              if (webhookUrl.includes('localhost') || webhookUrl.includes('127.0.0.1')) {
                console.log('⚠️ Skipping webhook setup for localhost development environment');
                syncProgress.set(progressId, {
                  ...syncProgress.get(progressId),
                  progress: 90,
                  message: '⚠️ Webhook skipped (localhost development)'
                });
              } else {
                webhookInfo = await githubService.setupWebhook(owner, repo, webhookUrl);
                console.log(`✅ Webhook setup successful: ${webhookInfo.webhookId}`);
                syncProgress.set(progressId, {
                  ...syncProgress.get(progressId),
                  progress: 90,
                  message: '🔗 Webhook configured successfully'
                });
              }
            } catch (webhookError) {
              const isLocalhostError = webhookError instanceof Error && 
                (webhookError.message.includes('localhost') || 
                 webhookError.message.includes('public Internet'));
              
              if (isLocalhostError) {
                console.log('⚠️ Webhook setup skipped - localhost not accessible from GitHub');
              } else {
                console.warn(`⚠️ Webhook setup failed (continuing without webhook):`, webhookError);
              }
              syncProgress.set(progressId, {
                ...syncProgress.get(progressId),
                progress: 90,
                message: '⚠️ Webhook setup skipped (manual sync available)'
              });
            }

            // Store repository sync data
            const repositoryInfo = {
              id: Date.now(), // This would be the GitHub repository ID in a real implementation
              full_name: `${owner}/${repo}`,
              name: repo,
              owner: { login: owner },
              default_branch: branch || 'main'
            };

            const syncData = RepositoryStorageService.createRepositorySyncData(
              repositoryInfo,
              codebaseId || `github_${owner}_${repo}`,
              syncResult.merkleTree,
              {
                webhookId: webhookInfo?.webhookId,
                webhookSecret: webhookInfo?.secret,
                webhookUrl: webhookInfo ? `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/github/webhook` : undefined,
                accessToken: accessToken // Store for webhook processing (encrypt in production)
              }
            );

            await RepositoryStorageService.storeRepositorySync(syncData);

            // Mark as complete
            syncProgress.set(progressId, {
              phase: 'complete',
              progress: 100,
              message: 'Repository sync, indexing, and webhook setup complete!',
              filesProcessed: syncResult.files.length,
              totalFiles: syncResult.files.length,
              errors: [],
              result: {
                syncId: syncResult.syncId,
                commit: syncResult.commit,
                filesCount: syncResult.files.length,
                merkleTreeHash: syncResult.merkleTree.rootHash,
                webhookId: webhookInfo?.webhookId,
                webhookSetup: !!webhookInfo
              }
            });

            console.log(`✅ Repository sync, indexing, and webhook setup complete: ${progressId}`);

          } catch (indexError) {
            console.error('❌ Error during indexing:', indexError);
            
            // Provide more specific error information
            let errorMessage = 'Indexing failed';
            if (indexError instanceof Error) {
              if (indexError.message.includes('embedding')) {
                errorMessage = 'Vector embedding generation failed - this may be due to API issues';
              } else if (indexError.message.includes('API')) {
                errorMessage = 'API communication error during indexing';
              } else {
                errorMessage = indexError.message;
              }
            }
            
            syncProgress.set(progressId, {
              phase: 'complete', // Mark as complete since sync worked
              progress: 100,
              message: 'Repository synced successfully (indexing partially failed)',
              filesProcessed: syncResult.files.length,
              totalFiles: syncResult.files.length,
              errors: [`Indexing warning: ${errorMessage}`],
              result: {
                syncId: syncResult.syncId,
                commit: syncResult.commit,
                filesCount: syncResult.files.length,
                merkleTreeHash: syncResult.merkleTree.rootHash,
                webhookId: webhookInfo?.webhookId,
                webhookSetup: !!webhookInfo
              }
            });
            
            console.log(`⚠️ Repository sync completed with indexing warnings: ${progressId}`);
          }
        }).catch((error) => {
          console.error('❌ Repository sync failed:', error);
          syncProgress.set(progressId, {
            phase: 'error',
            progress: 100,
            message: 'Repository sync failed',
            errors: [error instanceof Error ? error.message : 'Unknown error']
          });
        });

        return NextResponse.json({
          success: true,
          progressId,
          message: 'Repository sync started',
          owner,
          repo,
          branch: branch || 'default'
        });
      }

      case 'incremental-sync': {
        const { owner, repo, branch, oldMerkleTreeData, codebaseId } = params;
        
        if (!owner || !repo || !oldMerkleTreeData) {
          return NextResponse.json(
            { error: 'Owner, repo, and oldMerkleTreeData are required' },
            { status: 400 }
          );
        }

        console.log(`🔄 Starting incremental sync: ${owner}/${repo}`);

        const progressId = `inc_sync_${owner}_${repo}_${Date.now()}`;
        
        // Deserialize old merkle tree
        const oldMerkleTree = MerkleTreeService.deserializeMerkleTree(oldMerkleTreeData);

        syncProgress.set(progressId, {
          phase: 'fetching',
          progress: 0,
          message: 'Checking for changes...',
          filesProcessed: 0,
          totalFiles: 0,
          errors: []
        });

        // Start incremental sync
        githubService.incrementalSync(
          owner,
          repo,
          oldMerkleTree,
          branch,
          (progress) => {
            syncProgress.set(progressId, progress);
          }
        ).then(async (incrementalResult) => {
          if (incrementalResult.changes.totalChanges === 0) {
            syncProgress.set(progressId, {
              phase: 'complete',
              progress: 100,
              message: 'No changes detected',
              filesProcessed: 0,
              totalFiles: 0,
              errors: []
            });
            return;
          }

          // Index only changed files
          try {
            const searchService = new SimilaritySearchService(
              process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API,
              process.env.PINECONE_API_KEY,
              process.env.PINECONE_ENVIRONMENT
            );

            await searchService.initialize();

            // Convert changed files to CodebaseIndex format
            const changedCodebaseFiles = incrementalResult.changedFiles.map(file => ({
              fileId: file.sha,
              fileName: file.path.split('/').pop() || '',
              filePath: file.path,
              language: detectLanguageFromPath(file.path),
              content: file.content,
              lines: file.content.split('\n').length,
              size: file.size,
              lastModified: file.lastModified,
              functions: [],
              classes: [],
              imports: [],
              exports: [],
              variables: [],
              interfaces: [],
              keywords: [],
              dependencies: []
            }));

            // Delete old vectors for modified/deleted files
            const filesToDelete = [...incrementalResult.changes.modified, ...incrementalResult.changes.deleted];
            if (filesToDelete.length > 0) {
              // This would require implementing a method to delete specific file chunks
              console.log(`🗑️ Would delete vectors for ${filesToDelete.length} files`);
            }

            // Index only changed files
            if (changedCodebaseFiles.length > 0) {
              await searchService.indexCodebase(
                changedCodebaseFiles,
                codebaseId || `github_${owner}_${repo}`,
                (indexProgress) => {
                  syncProgress.set(progressId, {
                    ...syncProgress.get(progressId),
                    phase: 'indexing',
                    progress: 80 + (indexProgress.progress * 0.2),
                    message: `Indexing changes: ${indexProgress.message}`
                  });
                }
              );
            }

            syncProgress.set(progressId, {
              phase: 'complete',
              progress: 100,
              message: `Incremental sync complete! ${incrementalResult.changes.totalChanges} changes processed`,
              filesProcessed: incrementalResult.changedFiles.length,
              totalFiles: incrementalResult.changedFiles.length,
              errors: [],
              result: {
                changes: incrementalResult.changes,
                commit: incrementalResult.commit,
                merkleTreeHash: incrementalResult.newMerkleTree.rootHash
              }
            });

          } catch (indexError) {
            console.error('❌ Error during incremental indexing:', indexError);
            syncProgress.set(progressId, {
              phase: 'error',
              progress: 100,
              message: 'Incremental sync completed but indexing failed',
              errors: [indexError instanceof Error ? indexError.message : 'Incremental indexing failed']
            });
          }
        });

        return NextResponse.json({
          success: true,
          progressId,
          message: 'Incremental sync started',
          owner,
          repo
        });
      }

      case 'setup-webhook': {
        const { owner, repo, webhookUrl } = params;
        
        if (!owner || !repo || !webhookUrl) {
          return NextResponse.json(
            { error: 'Owner, repo, and webhookUrl are required' },
            { status: 400 }
          );
        }

        const webhookResult = await githubService.setupWebhook(owner, repo, webhookUrl);
        
        return NextResponse.json({
          success: true,
          webhookId: webhookResult.webhookId,
          message: 'Webhook setup successfully'
        });
      }

      case 'remove-webhook': {
        const { owner, repo, webhookId } = params;
        
        if (!owner || !repo || !webhookId) {
          return NextResponse.json(
            { error: 'Owner, repo, and webhookId are required' },
            { status: 400 }
          );
        }

        await githubService.removeWebhook(owner, repo, webhookId);
        
        return NextResponse.json({
          success: true,
          message: 'Webhook removed successfully'
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ GitHub API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const progressId = searchParams.get('progressId');

    if (action === 'progress' && progressId) {
      const progress = syncProgress.get(progressId);
      
      if (!progress) {
        return NextResponse.json(
          { error: 'Progress not found' },
          { status: 404 }
        );
      }

      // Clean up completed progress after 5 minutes
      if (progress.phase === 'complete' || progress.phase === 'error') {
        setTimeout(() => {
          syncProgress.delete(progressId);
        }, 5 * 60 * 1000);
      }

      return NextResponse.json({
        success: true,
        progress,
        progressId
      });
    }

    if (action === 'auth-url') {
      const clientId = process.env.GITHUB_CLIENT_ID;
      const redirectUri = `${request.nextUrl.origin}/api/auth/github/callback`;
      const state = crypto.randomUUID();
      const scope = 'repo,read:user,user:email';

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;

      return NextResponse.json({
        success: true,
        authUrl,
        state
      });
    }

    if (action === 'logout') {
      const response = NextResponse.json({
        success: true,
        message: 'Logged out successfully'
      });

      // Clear cookies
      response.cookies.delete('github_access_token');
      response.cookies.delete('github_token_scope');

      return response;
    }

    return NextResponse.json(
      { error: 'Invalid GET request' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ GitHub GET API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to detect programming language from file path
function detectLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  
  const languageMap: { [key: string]: string } = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'cs': 'csharp',
    'php': 'php',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'swift': 'swift',
    'kt': 'kotlin',
    'scala': 'scala',
    'dart': 'dart',
    'html': 'html',
    'css': 'css',
    'scss': 'css',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
    'sql': 'sql',
    'sh': 'shell',
    'md': 'markdown'
  };
  
  return languageMap[extension || ''] || 'text';
}
