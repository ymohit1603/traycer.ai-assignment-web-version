import { MerkleTree, MerkleTreeService } from './merkleTree';
import { GitHubRepository } from './githubService';

/**
 * Repository Storage Service
 *
 * This service handles persistent storage of repository sync data, merkle trees,
 * and webhook configurations. In a production environment, this would use a
 * proper database like PostgreSQL, MongoDB, or Supabase.
 *
 * For this demo, we use localStorage with server-side simulation.
 */

export interface RepositorySyncData {
  id: string;
  repositoryId: string;
  fullName: string;
  owner: string;
  name: string;
  branch: string;
  lastSyncCommit: string;
  lastSyncTimestamp: number;
  merkleTreeSerialized: string;
  merkleTreeHash: string;
  codebaseId: string;
  webhookId?: number;
  webhookSecret?: string;
  webhookUrl?: string;
  accessToken?: string; // Encrypted in production
  filesCount: number;
  status: 'active' | 'inactive' | 'error';
  created: number;
  updated: number;
}

export interface WebhookEventLog {
  id: string;
  repositoryId: string;
  eventType: string;
  deliveryId: string;
  branch: string;
  commits: number;
  changesDetected: number;
  filesReindexed: number;
  processingTime: number;
  status: 'completed' | 'failed' | 'processing';
  error?: string;
  timestamp: number;
}

export class RepositoryStorageService {
  private static readonly SYNC_DATA_KEY = 'traycer_repository_sync_data';
  private static readonly WEBHOOK_LOGS_KEY = 'traycer_webhook_logs';

  /**
   * Store repository sync data
   */
  static async storeRepositorySync(data: RepositorySyncData): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        // Server-side: store in memory/file system (demo only)
        console.log(`💾 [SERVER] Storing repository sync data: ${data.fullName}`);
        return;
      }

      const existingData = this.getAllRepositorySyncData();
      const updatedData = existingData.filter(item => item.id !== data.id);
      updatedData.push(data);

      localStorage.setItem(this.SYNC_DATA_KEY, JSON.stringify(updatedData));
      console.log(`💾 Stored repository sync data: ${data.fullName}`);
    } catch (error) {
      console.error('❌ Error storing repository sync data:', error);
      throw error;
    }
  }

  /**
   * Get repository sync data by codebase ID
   */
  static async getRepositorySyncByCodebaseId(codebaseId: string): Promise<RepositorySyncData | null> {
    try {
      if (typeof window === 'undefined') {
        // Server-side: retrieve from memory/database (demo only)
        console.log(`🔍 [SERVER] Getting repository sync data for: ${codebaseId}`);
        return null; // Simulate no data found for demo
      }

      const allData = this.getAllRepositorySyncData();
      return allData.find(data => data.codebaseId === codebaseId) || null;
    } catch (error) {
      console.error('❌ Error getting repository sync data:', error);
      return null;
    }
  }

  /**
   * Get repository sync data by repository full name
   */
  static async getRepositorySyncByFullName(fullName: string): Promise<RepositorySyncData | null> {
    try {
      if (typeof window === 'undefined') {
        // Server-side simulation
        console.log(`🔍 [SERVER] Getting repository sync data for: ${fullName}`);
        return null;
      }

      const allData = this.getAllRepositorySyncData();
      return allData.find(data => data.fullName === fullName) || null;
    } catch (error) {
      console.error('❌ Error getting repository sync data:', error);
      return null;
    }
  }

  /**
   * Get all repository sync data
   */
  static getAllRepositorySyncData(): RepositorySyncData[] {
    try {
      if (typeof window === 'undefined') {
        return []; // Server-side returns empty for demo
      }

      const data = localStorage.getItem(this.SYNC_DATA_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('❌ Error getting all repository sync data:', error);
      return [];
    }
  }

  /**
   * Update repository sync data
   */
  static async updateRepositorySync(id: string, updates: Partial<RepositorySyncData>): Promise<void> {
    try {
      const existingData = this.getAllRepositorySyncData();
      const index = existingData.findIndex(data => data.id === id);
      
      if (index === -1) {
        throw new Error(`Repository sync data not found: ${id}`);
      }

      existingData[index] = {
        ...existingData[index],
        ...updates,
        updated: Date.now()
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(this.SYNC_DATA_KEY, JSON.stringify(existingData));
      }

      console.log(`✅ Updated repository sync data: ${id}`);
    } catch (error) {
      console.error('❌ Error updating repository sync data:', error);
      throw error;
    }
  }

  /**
   * Delete repository sync data
   */
  static async deleteRepositorySync(id: string): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        console.log(`🗑️ [SERVER] Deleting repository sync data: ${id}`);
        return;
      }

      const existingData = this.getAllRepositorySyncData();
      const filteredData = existingData.filter(data => data.id !== id);
      
      localStorage.setItem(this.SYNC_DATA_KEY, JSON.stringify(filteredData));
      console.log(`🗑️ Deleted repository sync data: ${id}`);
    } catch (error) {
      console.error('❌ Error deleting repository sync data:', error);
      throw error;
    }
  }

  /**
   * Store merkle tree for repository
   */
  static async storeMerkleTree(codebaseId: string, merkleTree: MerkleTree): Promise<void> {
    try {
      const syncData = await this.getRepositorySyncByCodebaseId(codebaseId);
      if (!syncData) {
        throw new Error(`Repository sync data not found for: ${codebaseId}`);
      }

      const serializedTree = MerkleTreeService.serializeMerkleTree(merkleTree);
      
      await this.updateRepositorySync(syncData.id, {
        merkleTreeSerialized: serializedTree,
        merkleTreeHash: merkleTree.rootHash,
        lastSyncCommit: merkleTree.commit || syncData.lastSyncCommit,
        lastSyncTimestamp: Date.now()
      });

      console.log(`💾 Stored merkle tree for ${codebaseId}: ${merkleTree.rootHash.substring(0, 16)}...`);
    } catch (error) {
      console.error('❌ Error storing merkle tree:', error);
      throw error;
    }
  }

  /**
   * Get merkle tree for repository
   */
  static async getMerkleTree(codebaseId: string): Promise<MerkleTree | null> {
    try {
      const syncData = await this.getRepositorySyncByCodebaseId(codebaseId);
      if (!syncData || !syncData.merkleTreeSerialized) {
        return null;
      }

      return MerkleTreeService.deserializeMerkleTree(syncData.merkleTreeSerialized);
    } catch (error) {
      console.error('❌ Error getting merkle tree:', error);
      return null;
    }
  }

  /**
   * Log webhook event
   */
  static async logWebhookEvent(event: WebhookEventLog): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        console.log(`📝 [SERVER] Logging webhook event: ${event.id}`);
        return;
      }

      const existingLogs = this.getWebhookLogs();
      existingLogs.push(event);

      // Keep only last 100 logs to prevent localStorage bloat
      const trimmedLogs = existingLogs.slice(-100);
      
      localStorage.setItem(this.WEBHOOK_LOGS_KEY, JSON.stringify(trimmedLogs));
      console.log(`📝 Logged webhook event: ${event.id}`);
    } catch (error) {
      console.error('❌ Error logging webhook event:', error);
    }
  }

  /**
   * Get webhook logs for repository
   */
  static getWebhookLogs(repositoryId?: string): WebhookEventLog[] {
    try {
      if (typeof window === 'undefined') {
        return []; // Server-side returns empty for demo
      }

      const data = localStorage.getItem(this.WEBHOOK_LOGS_KEY);
      const logs = data ? JSON.parse(data) : [];
      
      if (repositoryId) {
        return logs.filter((log: WebhookEventLog) => log.repositoryId === repositoryId);
      }
      
      return logs;
    } catch (error) {
      console.error('❌ Error getting webhook logs:', error);
      return [];
    }
  }

  /**
   * Create repository sync data from GitHub repository
   */
  static createRepositorySyncData(
    repository: GitHubRepository,
    codebaseId: string,
    merkleTree: MerkleTree,
    options: {
      webhookId?: number;
      webhookSecret?: string;
      webhookUrl?: string;
      accessToken?: string;
    } = {}
  ): RepositorySyncData {
    const now = Date.now();
    
    return {
      id: `sync_${repository.id}_${now}`,
      repositoryId: repository.id.toString(),
      fullName: repository.full_name || repository.fullName,
      owner: repository.owner.login,
      name: repository.name,
      branch: repository.default_branch || repository.defaultBranch,
      lastSyncCommit: merkleTree.commit || '',
      lastSyncTimestamp: now,
      merkleTreeSerialized: MerkleTreeService.serializeMerkleTree(merkleTree),
      merkleTreeHash: merkleTree.rootHash,
      codebaseId,
      webhookId: options.webhookId,
      webhookSecret: options.webhookSecret,
      webhookUrl: options.webhookUrl,
      accessToken: options.accessToken, // Should be encrypted in production
      filesCount: merkleTree.fileHashes.size,
      status: 'active',
      created: now,
      updated: now
    };
  }

  /**
   * Get repository statistics
   */
  static getRepositoryStats(): {
    totalRepositories: number;
    activeRepositories: number;
    totalWebhooks: number;
    recentActivity: number;
  } {
    try {
      const allData = this.getAllRepositorySyncData();
      const recentLogs = this.getWebhookLogs();
      const recentActivity = recentLogs.filter(
        log => log.timestamp > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
      ).length;

      return {
        totalRepositories: allData.length,
        activeRepositories: allData.filter(data => data.status === 'active').length,
        totalWebhooks: allData.filter(data => data.webhookId).length,
        recentActivity
      };
    } catch (error) {
      console.error('❌ Error getting repository stats:', error);
      return {
        totalRepositories: 0,
        activeRepositories: 0,
        totalWebhooks: 0,
        recentActivity: 0
      };
    }
  }

  /**
   * Export all data (for backup/migration)
   */
  static exportAllData(): {
    repositories: RepositorySyncData[];
    webhookLogs: WebhookEventLog[];
    exportTimestamp: number;
  } {
    return {
      repositories: this.getAllRepositorySyncData(),
      webhookLogs: this.getWebhookLogs(),
      exportTimestamp: Date.now()
    };
  }

  /**
   * Import data (for backup/migration)
   */
  static async importAllData(data: {
    repositories: RepositorySyncData[];
    webhookLogs: WebhookEventLog[];
  }): Promise<void> {
    try {
      if (typeof window === 'undefined') {
        console.log('📥 [SERVER] Importing data...');
        return;
      }

      localStorage.setItem(this.SYNC_DATA_KEY, JSON.stringify(data.repositories));
      localStorage.setItem(this.WEBHOOK_LOGS_KEY, JSON.stringify(data.webhookLogs));
      
      console.log(`📥 Imported ${data.repositories.length} repositories and ${data.webhookLogs.length} webhook logs`);
    } catch (error) {
      console.error('❌ Error importing data:', error);
      throw error;
    }
  }

  /**
   * Clear all data (for development/testing)
   */
  static clearAllData(): void {
    try {
      if (typeof window === 'undefined') {
        console.log('🧹 [SERVER] Clearing all data...');
        return;
      }

      localStorage.removeItem(this.SYNC_DATA_KEY);
      localStorage.removeItem(this.WEBHOOK_LOGS_KEY);
      
      console.log('🧹 Cleared all repository storage data');
    } catch (error) {
      console.error('❌ Error clearing data:', error);
    }
  }
}
