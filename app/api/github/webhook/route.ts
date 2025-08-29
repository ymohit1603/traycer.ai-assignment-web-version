import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { GitHubService } from '../../../lib/githubService';
import { SimilaritySearchService } from '../../../lib/similaritySearch';
import { MerkleTreeService } from '../../../lib/merkleTree';
import { RepositoryStorageService } from '../../../lib/repositoryStorage';

interface GitHubWebhookRepository {
  id: number;
  full_name: string;
  name: string;
  owner: {
    login: string;
  };
  default_branch: string;
}

interface GitHubWebhookCommit {
  id: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  added?: string[];
  modified?: string[];
  removed?: string[];
  timestamp?: string;
}

interface GitHubWebhookPusher {
  name: string;
  email: string;
}

interface GitHubPushPayload {
  repository: GitHubWebhookRepository;
  commits: GitHubWebhookCommit[];
  ref: string;
  before: string;
  after: string;
  forced?: boolean;
  created?: boolean;
  deleted?: boolean;
  compare: string;
  head_commit?: GitHubWebhookCommit;
  pusher: GitHubWebhookPusher;
}

interface GitHubPingPayload {
  zen: string;
}

interface GitHubCommitPayload {
  id: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  added?: string[];
  modified?: string[];
  removed?: string[];
  timestamp?: string;
}

// Store webhook processing queue
const webhookQueue = new Map<string, WebhookEvent>();
const processingQueue = new Map<string, WebhookProcessingStatus>();

interface WebhookEvent {
  id: string;
  repository: {
    id: number;
    fullName: string;
    name: string;
    owner: {
      login: string;
    };
    defaultBranch: string;
  };
  commits: Array<{
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    added: string[];
    modified: string[];
    removed: string[];
    timestamp: string;
  }>;
  ref: string;
  before: string;
  after: string;
  forced: boolean;
  created: boolean;
  deleted: boolean;
  compare: string;
  headCommit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
    timestamp: string;
  };
  pusher: {
    name: string;
    email: string;
  };
  timestamp: number;
}

interface WebhookProcessingStatus {
  eventId: string;
  repository: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  startTime: number;
  endTime?: number;
  error?: string;
  result?: {
    changesDetected: number;
    filesReindexed: number;
    newMerkleHash: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔗 Received GitHub webhook');

    // Get headers
    const signature = request.headers.get('x-hub-signature-256');
    const githubEvent = request.headers.get('x-github-event');
    const githubDelivery = request.headers.get('x-github-delivery');

    if (!signature) {
      console.error('❌ Missing webhook signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 401 }
      );
    }

    if (!githubEvent) {
      console.error('❌ Missing GitHub event type');
      return NextResponse.json(
        { error: 'Missing event type' },
        { status: 400 }
      );
    }

    // Get raw body for signature verification
    const body = await request.text();
    const payload = JSON.parse(body);

    // Verify webhook signature
    const isValid = verifyWebhookSignature(body, signature);
    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    console.log(`✅ Verified webhook: ${githubEvent} from ${githubDelivery}`);

    // Handle different event types
    switch (githubEvent) {
      case 'push':
        return await handlePushEvent(payload as GitHubPushPayload, githubDelivery || 'unknown');

      case 'ping':
        console.log('🏓 Webhook ping received');
        return NextResponse.json({
          message: 'Webhook endpoint is active',
          zen: (payload as GitHubPingPayload).zen
        });

      default:
        console.log(`⏭️ Ignoring event type: ${githubEvent}`);
        return NextResponse.json({
          message: `Event ${githubEvent} ignored`
        });
    }

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return NextResponse.json(
      { 
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const eventId = searchParams.get('eventId');

    if (action === 'status' && eventId) {
      const status = processingQueue.get(eventId);
      
      if (!status) {
        return NextResponse.json(
          { error: 'Event not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        status
      });
    }

    if (action === 'queue') {
      const queueStatus = Array.from(processingQueue.values()).map(status => ({
        eventId: status.eventId,
        repository: status.repository,
        status: status.status,
        progress: status.progress,
        message: status.message,
        duration: status.endTime ? status.endTime - status.startTime : Date.now() - status.startTime
      }));

      return NextResponse.json({
        success: true,
        queue: queueStatus,
        active: queueStatus.filter(s => s.status === 'processing').length,
        completed: queueStatus.filter(s => s.status === 'completed').length,
        failed: queueStatus.filter(s => s.status === 'failed').length
      });
    }

    return NextResponse.json(
      { error: 'Invalid GET request' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Webhook GET error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function handlePushEvent(payload: GitHubPushPayload, deliveryId: string): Promise<NextResponse> {
  try {
    const repository = payload.repository;
    const commits = payload.commits || [];
    const ref = payload.ref;
    const before = payload.before;
    const after = payload.after;

    console.log(`📨 Push event: ${repository.full_name} (${commits.length} commits)`);
    console.log(`🔀 Branch: ${ref}, ${before.substring(0, 8)} → ${after.substring(0, 8)}`);

    // Only process pushes to the default branch
    const defaultBranchRef = `refs/heads/${repository.default_branch}`;
    if (ref !== defaultBranchRef) {
      console.log(`⏭️ Ignoring push to non-default branch: ${ref}`);
      return NextResponse.json({
        message: `Ignoring push to ${ref} (not default branch)`
      });
    }

    // Create webhook event
    const webhookEvent: WebhookEvent = {
      id: deliveryId,
      repository: {
        id: repository.id,
        fullName: repository.full_name,
        name: repository.name,
        owner: {
          login: repository.owner.login
        },
        defaultBranch: repository.default_branch
      },
      commits: commits.map((commit: GitHubCommitPayload) => ({
        id: commit.id,
        message: commit.message,
        author: commit.author,
        added: commit.added || [],
        modified: commit.modified || [],
        removed: commit.removed || [],
        timestamp: commit.timestamp
      })),
      ref,
      before,
      after,
      forced: payload.forced || false,
      created: payload.created || false,
      deleted: payload.deleted || false,
      compare: payload.compare,
      headCommit: payload.head_commit,
      pusher: payload.pusher,
      timestamp: Date.now()
    };

    // Store the event
    webhookQueue.set(deliveryId, webhookEvent);

    // Initialize processing status
    const processingStatus: WebhookProcessingStatus = {
      eventId: deliveryId,
      repository: repository.full_name,
      status: 'queued',
      progress: 0,
      message: 'Webhook received, queuing for processing...',
      startTime: Date.now()
    };

    processingQueue.set(deliveryId, processingStatus);

    // Start background processing (don't await)
    processWebhookEvent(webhookEvent)
      .catch(error => {
        console.error(`❌ Background processing failed for ${deliveryId}:`, error);
        const status = processingQueue.get(deliveryId);
        if (status) {
          status.status = 'failed';
          status.error = error instanceof Error ? error.message : 'Unknown error';
          status.endTime = Date.now();
          processingQueue.set(deliveryId, status);
        }
      });

    console.log(`✅ Webhook queued for processing: ${deliveryId}`);

    return NextResponse.json({
      message: 'Webhook received and queued for processing',
      eventId: deliveryId,
      repository: repository.full_name,
      commits: commits.length
    });

  } catch (error) {
    console.error('❌ Push event handling error:', error);
    throw error;
  }
}

async function processWebhookEvent(event: WebhookEvent): Promise<void> {
  const status = processingQueue.get(event.id);
  if (!status) return;

  try {
    console.log(`🔄 Processing webhook event: ${event.id} for ${event.repository.fullName}`);

    // Update status
    status.status = 'processing';
    status.progress = 10;
    status.message = 'Checking for repository sync data...';
    processingQueue.set(event.id, status);

    // Check if we have existing sync data for this repository
    const codebaseId = `github_${event.repository.owner.login}_${event.repository.name}`;
    
    // For now, we'll simulate checking stored merkle tree data
    // In a real implementation, you'd retrieve this from a database
    const hasExistingSync = await checkExistingRepositorySync(codebaseId);

    if (!hasExistingSync) {
      console.log(`⚠️ No existing sync data found for ${event.repository.fullName}`);
      status.status = 'completed';
      status.progress = 100;
      status.message = 'No existing sync data found. Repository needs to be manually imported first.';
      status.endTime = Date.now();
      processingQueue.set(event.id, status);
      return;
    }

    // Update status
    status.progress = 30;
    status.message = 'Retrieving stored merkle tree...';
    processingQueue.set(event.id, status);

    // Get stored merkle tree (this would come from database in real implementation)
    const oldMerkleTreeData = await getStoredMerkleTree(codebaseId);
    if (!oldMerkleTreeData) {
      throw new Error('Could not retrieve stored merkle tree');
    }

    // Update status
    status.progress = 50;
    status.message = 'Performing incremental sync...';
    processingQueue.set(event.id, status);

    // Create a temporary GitHub access token for the webhook processing
    // In a real implementation, you'd store this securely per repository
    const accessToken = await getRepositoryAccessToken(event.repository.fullName);
    if (!accessToken) {
      throw new Error('No access token available for repository');
    }

    const githubService = new GitHubService(accessToken);
    const oldMerkleTree = MerkleTreeService.deserializeMerkleTree(oldMerkleTreeData);

    // Perform incremental sync
    const incrementalResult = await githubService.incrementalSync(
      event.repository.owner.login,
      event.repository.name,
      oldMerkleTree,
      event.repository.defaultBranch,
      (progress) => {
        status.progress = 50 + (progress.progress * 0.3); // 50-80%
        status.message = `Incremental sync: ${progress.message}`;
        processingQueue.set(event.id, status);
      }
    );

    if (incrementalResult.changes.totalChanges === 0) {
      console.log(`✅ No changes detected for ${event.repository.fullName}`);
      status.status = 'completed';
      status.progress = 100;
      status.message = 'No changes detected';
      status.endTime = Date.now();
      status.result = {
        changesDetected: 0,
        filesReindexed: 0,
        newMerkleHash: oldMerkleTree.rootHash
      };
      processingQueue.set(event.id, status);
      return;
    }

    // Update status
    status.progress = 80;
    status.message = `Processing ${incrementalResult.changes.totalChanges} changes...`;
    processingQueue.set(event.id, status);

    // Index changed files
    if (incrementalResult.changedFiles.length > 0) {
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
        types: [],
        keywords: [],
        dependencies: []
      }));

      // Index changed files
      await searchService.indexCodebase(
        changedCodebaseFiles,
        codebaseId,
        (indexProgress) => {
          status.progress = 80 + (indexProgress.progress * 0.15); // 80-95%
          status.message = `Indexing changes: ${indexProgress.message}`;
          processingQueue.set(event.id, status);
        }
      );
    }

    // Store updated merkle tree
    await storeUpdatedMerkleTree(codebaseId, incrementalResult.newMerkleTree);

    // Log webhook event
    await RepositoryStorageService.logWebhookEvent({
      id: event.id,
      repositoryId: event.repository.id.toString(),
      eventType: 'push',
      deliveryId: event.id,
      branch: event.repository.defaultBranch,
      commits: event.commits.length,
      changesDetected: incrementalResult.changes.totalChanges,
      filesReindexed: incrementalResult.changedFiles.length,
      processingTime: Date.now() - status.startTime,
      status: 'completed',
      timestamp: Date.now()
    });

    // Update status - completed
    status.status = 'completed';
    status.progress = 100;
    status.message = `Successfully processed ${incrementalResult.changes.totalChanges} changes`;
    status.endTime = Date.now();
    status.result = {
      changesDetected: incrementalResult.changes.totalChanges,
      filesReindexed: incrementalResult.changedFiles.length,
      newMerkleHash: incrementalResult.newMerkleTree.rootHash
    };
    processingQueue.set(event.id, status);

    console.log(`✅ Webhook processing completed: ${event.id}`);
    console.log(`📊 Changes: +${incrementalResult.changes.added.length} ~${incrementalResult.changes.modified.length} -${incrementalResult.changes.deleted.length}`);

  } catch (error) {
    console.error(`❌ Webhook processing failed: ${event.id}`, error);
    
    // Log failed webhook event
    try {
      await RepositoryStorageService.logWebhookEvent({
        id: event.id,
        repositoryId: event.repository.id.toString(),
        eventType: 'push',
        deliveryId: event.id,
        branch: event.repository.defaultBranch,
        commits: event.commits.length,
        changesDetected: 0,
        filesReindexed: 0,
        processingTime: Date.now() - status.startTime,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    } catch (logError) {
      console.error('❌ Error logging failed webhook event:', logError);
    }
    
    status.status = 'failed';
    status.error = error instanceof Error ? error.message : 'Unknown error';
    status.endTime = Date.now();
    processingQueue.set(event.id, status);
    throw error;
  }
}

function verifyWebhookSignature(payload: string, signature: string): boolean {
  try {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.warn('⚠️ GITHUB_WEBHOOK_SECRET not set, skipping signature verification');
      return true; // Allow webhooks without secret in development
    }

    const expectedSignature = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

// Storage service functions
async function checkExistingRepositorySync(codebaseId: string): Promise<boolean> {
  try {
    const syncData = await RepositoryStorageService.getRepositorySyncByCodebaseId(codebaseId);
    return syncData !== null && syncData.status === 'active';
  } catch {
    console.error('❌ Error checking existing repository sync');
    return false;
  }
}

async function getStoredMerkleTree(codebaseId: string): Promise<string | null> {
  try {
    const syncData = await RepositoryStorageService.getRepositorySyncByCodebaseId(codebaseId);
    return syncData?.merkleTreeSerialized || null;
  } catch (error) {
    console.error('❌ Error getting stored merkle tree:', error);
    return null;
  }
}

async function storeUpdatedMerkleTree(codebaseId: string, merkleTree: MerkleTree): Promise<void> {
  try {
    await RepositoryStorageService.storeMerkleTree(codebaseId, merkleTree);
    console.log(`💾 Stored updated merkle tree for ${codebaseId}: ${merkleTree.rootHash.substring(0, 16)}...`);
  } catch (error) {
    console.error('❌ Error storing updated merkle tree:', error);
    throw error;
  }
}

async function getRepositoryAccessToken(fullName: string): Promise<string | null> {
  try {
    const syncData = await RepositoryStorageService.getRepositorySyncByFullName(fullName);
    return syncData?.accessToken || null;
  } catch (error) {
    console.error('❌ Error getting repository access token:', error);
    return null;
  }
}

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
