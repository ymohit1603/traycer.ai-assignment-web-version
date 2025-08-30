import { Pinecone } from '@pinecone-database/pinecone';
import { CodeChunk } from './semanticChunking';
import { EmbeddingResult } from './vectorEmbeddings';

export interface PineconeChunkMetadata {
  filePath: string;
  fileName: string;
  language: string;
  type: string;
  name?: string;
  startLine: number;
  endLine: number;
  complexity: number;
  keywords: string[];
  imports: string[];
  exports: string[];
  dependencies: string[];
  parentChunk?: string;
  codebaseId: string;
  timestamp: number;
  contentPreview: string; // First 200 chars of content
}

export interface PineconeVector {
  id: string;
  values: number[];
  metadata: PineconeChunkMetadata;
}

export interface SearchOptions {
  topK?: number;
  filter?: Record<string, string | number | boolean | string[] | { $eq?: string | number | boolean; $in?: string[] }>;
  includeMetadata?: boolean;
  includeValues?: boolean;
  namespace?: string;
}

export interface SearchResult {
  chunkId: string;
  score: number;
  chunk?: CodeChunk;
  metadata: PineconeChunkMetadata;
}

export interface UpsertProgress {
  processed: number;
  total: number;
  currentChunk?: string;
  errors: number;
}

export type ProgressCallback = (progress: UpsertProgress) => void;

export class PineconeService {
  private pinecone: Pinecone;
  private indexName: string;
  private dimension: number = 1024; // Voyage AI embedding dimension
  private batchSize: number = 100; // Pinecone batch upsert limit

  constructor(
    apiKey?: string, 
    environment?: string, 
    indexName: string = 'traycer-codebase-vectors',
    dimension?: number
  ) {
    const key = apiKey || process.env.PINECONE_API_KEY;
    
    if (!key) {
      throw new Error('Pinecone API key not found. Please set PINECONE_API_KEY environment variable.');
    }

    this.pinecone = new Pinecone({
      apiKey: key,
    });

    this.indexName = indexName;
    
    // Update dimension if provided
    if (dimension) {
      this.dimension = dimension;
      console.log(`📏 Pinecone dimension set to: ${this.dimension}`);
    }
  }

  /**
   * Initialize Pinecone index (create if it doesn't exist)
   */
  async initializeIndex(): Promise<void> {
    try {
      console.log(`🔧 Initializing Pinecone index: ${this.indexName}`);

      // Check if index exists
      const indexList = await this.pinecone.listIndexes();
      const existingIndex = indexList.indexes?.find(idx => idx.name === this.indexName);

      if (existingIndex) {
        // Check if dimensions match
        try {
          const indexInfo = await this.pinecone.describeIndex(this.indexName);
          const indexDimension = indexInfo.dimension;
          
          if (indexDimension !== this.dimension) {
            console.warn(`⚠️ Dimension mismatch: Index has ${indexDimension}, but we need ${this.dimension}`);
            console.log(`🗑️ Deleting existing index to recreate with correct dimensions...`);
            
            await this.pinecone.deleteIndex(this.indexName);
            console.log(`✅ Deleted existing index: ${this.indexName}`);
            
            // Wait a moment for deletion to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Will create new index below
          } else {
            console.log(`✅ Index ${this.indexName} already exists with correct dimensions (${indexDimension})`);
            return;
          }
        } catch (describeError) {
          console.warn(`⚠️ Could not describe existing index, proceeding to recreate:`, describeError);
          
          try {
            await this.pinecone.deleteIndex(this.indexName);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (deleteError) {
            console.warn(`⚠️ Could not delete existing index:`, deleteError);
          }
        }
      }

      // Create index if it doesn't exist
      console.log(`📝 Creating new index: ${this.indexName}`);
      await this.pinecone.createIndex({
        name: this.indexName,
        dimension: this.dimension,
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });

      // Wait for index to be ready
      console.log('⏳ Waiting for index to be ready...');
      await this.waitForIndexReady();
      
      console.log(`✅ Index ${this.indexName} created and ready`);
    } catch (error) {
      console.error('❌ Error initializing Pinecone index:', error);
      throw error;
    }
  }

  /**
   * Wait for index to be ready for operations
   */
  private async waitForIndexReady(maxAttempts: number = 60): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const indexInfo = await this.pinecone.describeIndex(this.indexName);
        if (indexInfo.status?.ready) {
          return;
        }
      } catch (error) {
        // Index might not be visible yet
      }

      console.log(`⏳ Waiting for index... (attempt ${attempt}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }

    throw new Error(`Index ${this.indexName} not ready after ${maxAttempts} attempts`);
  }

  /**
   * Store code chunks with embeddings in Pinecone
   */
  async storeChunks(
    chunks: CodeChunk[],
    embeddings: EmbeddingResult[],
    codebaseId: string,
    onProgress?: ProgressCallback
  ): Promise<void> {
    console.log(`🚀 Storing ${chunks.length} chunks in Pinecone...`);

    // Validate embedding dimensions
    if (embeddings.length > 0) {
      const firstEmbedding = embeddings[0].embedding;
      if (firstEmbedding.length !== this.dimension) {
        throw new Error(
          `Embedding dimension mismatch: Expected ${this.dimension}, got ${firstEmbedding.length}. ` +
          `Please ensure your embedding service and Pinecone index use the same dimensions.`
        );
      }
      console.log(`✅ Embedding dimensions validated: ${firstEmbedding.length}`);
    }

    const index = this.pinecone.index(this.indexName);
    
    // Create vectors from chunks and embeddings
    const vectors: PineconeVector[] = [];
    const embeddingMap = new Map(embeddings.map(e => [e.chunkId, e.embedding]));

    for (const chunk of chunks) {
      const embedding = embeddingMap.get(chunk.id);
      if (!embedding) {
        console.warn(`⚠️ No embedding found for chunk ${chunk.id}, skipping`);
        continue;
      }

      const vector: PineconeVector = {
        id: chunk.id,
        values: embedding,
        metadata: {
          filePath: this.obfuscateFilePath(chunk.filePath),
          fileName: chunk.filePath.split('/').pop() || '',
          language: chunk.metadata.language,
          type: chunk.type,
          name: chunk.name,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          complexity: chunk.metadata.complexity,
          keywords: chunk.metadata.keywords.slice(0, 20), // Limit for metadata size
          imports: chunk.metadata.imports.slice(0, 10),
          exports: chunk.metadata.exports.slice(0, 10),
          dependencies: chunk.metadata.dependencies.slice(0, 10),
          parentChunk: chunk.parentChunk,
          codebaseId,
          timestamp: Date.now(),
          contentPreview: chunk.content.substring(0, 200)
        }
      };

      vectors.push(vector);
    }

    console.log(`📦 Created ${vectors.length} vectors for storage`);

    // Store vectors in batches
    const batches = this.createBatches(vectors, this.batchSize);
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        console.log(`📥 Upserting batch ${i + 1}/${batches.length} (${batch.length} vectors)`);
        
        onProgress?.({
          processed,
          total: vectors.length,
          currentChunk: batch[0]?.metadata.fileName,
          errors
        });

        await index.upsert(batch);
        processed += batch.length;
        
        console.log(`✅ Batch ${i + 1} completed`);
        
        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error upserting batch ${i + 1}:`, error);
        errors += batch.length;
      }
    }

    onProgress?.({
      processed,
      total: vectors.length,
      errors
    });

    console.log(`✅ Stored ${processed} vectors (${errors} errors) in Pinecone`);
  }

  /**
   * Search for similar code chunks
   */
  async searchSimilarChunks(
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 10,
      filter = {},
      includeMetadata = true,
      includeValues = false,
      namespace = ''
    } = options;

    try {
      console.log(`🔍 Searching for similar chunks (topK: ${topK})`);
      
      const index = this.pinecone.index(this.indexName);
      
      const queryRequest: {
        vector: number[];
        topK: number;
        includeMetadata: boolean;
        includeValues: boolean;
        filter?: Record<string, string | number | boolean | string[] | { $eq?: string | number | boolean; $in?: string[] }>;
        namespace?: string;
      } = {
        vector: queryEmbedding,
        topK,
        includeMetadata,
        includeValues
      };

      if (Object.keys(filter).length > 0) {
        queryRequest.filter = filter;
      }

      if (namespace) {
        queryRequest.namespace = namespace;
      }

      const response = await index.query(queryRequest);
      
      const results: SearchResult[] = response.matches?.map(match => ({
        chunkId: match.id,
        score: match.score || 0,
        metadata: match.metadata as PineconeChunkMetadata
      })) || [];

      console.log(`✅ Found ${results.length} similar chunks`);
      
      return results;
    } catch (error) {
      console.error('❌ Error searching similar chunks:', error);
      throw error;
    }
  }

  /**
   * Search by text query (first generate embedding, then search)
   */
  async searchByQuery(
    query: string,
    generateEmbedding: (text: string) => Promise<number[]>,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    console.log(`🔤 Searching by text query: "${query.substring(0, 100)}..."`);
    
    try {
      const queryEmbedding = await generateEmbedding(query);
      return await this.searchSimilarChunks(queryEmbedding, options);
    } catch (error) {
      console.error('❌ Error in query search:', error);
      throw error;
    }
  }

  /**
   * Get chunks by codebase ID
   */
  async getChunksByCodebase(
    codebaseId: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const filter = {
      ...options.filter,
      codebaseId: { $eq: codebaseId }
    };

    // Use a dummy query vector to get all chunks (we're filtering by metadata)
    const dummyQuery = new Array(this.dimension).fill(0);
    
    return await this.searchSimilarChunks(dummyQuery, {
      ...options,
      topK: 10000, // Large number to get all chunks
      filter
    });
  }

  /**
   * Delete chunks by codebase ID
   */
  async deleteCodebaseChunks(codebaseId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting chunks for codebase: ${codebaseId}`);
      
      const index = this.pinecone.index(this.indexName);
      
      await index.deleteMany({
        filter: {
          codebaseId: { $eq: codebaseId }
        }
      });

      console.log(`✅ Deleted chunks for codebase: ${codebaseId}`);
    } catch (error) {
      console.error('❌ Error deleting codebase chunks:', error);
      throw error;
    }
  }

  /**
   * Delete specific chunks by IDs
   */
  async deleteChunks(chunkIds: string[]): Promise<void> {
    try {
      console.log(`🗑️ Deleting ${chunkIds.length} specific chunks`);
      
      const index = this.pinecone.index(this.indexName);
      
      await index.deleteMany({
        ids: chunkIds
      });

      console.log(`✅ Deleted ${chunkIds.length} chunks`);
    } catch (error) {
      console.error('❌ Error deleting chunks:', error);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  async getIndexStats(): Promise<{
    vectorCount: number;
    dimension: number;
    indexFullness: number;
  }> {
    try {
      const index = this.pinecone.index(this.indexName);
      const stats = await index.describeIndexStats();
      
      return {
        vectorCount: stats.totalVectorCount || 0,
        dimension: this.dimension,
        indexFullness: stats.indexFullness || 0
      };
    } catch (error) {
      console.error('❌ Error getting index stats:', error);
      throw error;
    }
  }

  /**
   * Update chunk metadata
   */
  async updateChunkMetadata(
    chunkId: string,
    metadata: Partial<PineconeChunkMetadata>
  ): Promise<void> {
    try {
      const index = this.pinecone.index(this.indexName);
      
      await index.update({
        id: chunkId,
        setMetadata: metadata
      });

      console.log(`✅ Updated metadata for chunk: ${chunkId}`);
    } catch (error) {
      console.error(`❌ Error updating chunk metadata:`, error);
      throw error;
    }
  }

  /**
   * Create batches for batch operations
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  /**
   * Obfuscate file paths for privacy
   */
  private obfuscateFilePath(filePath: string): string {
    // Replace actual path with generic structure
    const parts = filePath.split('/');
    const fileName = parts.pop() || '';
    const extension = fileName.split('.').pop() || '';
    
    // Keep structure but obfuscate names
    const obfuscatedParts = parts.map((part, index) => {
      if (index === 0) return 'project';
      return `dir${index}`;
    });
    
    return `${obfuscatedParts.join('/')}/${fileName}`;
  }

  /**
   * Search with advanced filters
   */
  async advancedSearch(options: {
    query?: string;
    generateEmbedding?: (text: string) => Promise<number[]>;
    fileTypes?: string[];
    languages?: string[];
    chunkTypes?: string[];
    codebaseId?: string;
    minComplexity?: number;
    maxComplexity?: number;
    keywords?: string[];
    topK?: number;
  }): Promise<SearchResult[]> {
    const filters: Record<string, unknown> = {};

    // Build filters
    if (options.codebaseId) {
      filters.codebaseId = { $eq: options.codebaseId };
    }

    if (options.languages && options.languages.length > 0) {
      filters.language = { $in: options.languages };
    }

    if (options.chunkTypes && options.chunkTypes.length > 0) {
      filters.type = { $in: options.chunkTypes };
    }

    if (options.minComplexity !== undefined) {
      filters.complexity = { $gte: options.minComplexity };
    }

    if (options.maxComplexity !== undefined) {
      filters.complexity = { ...filters.complexity, $lte: options.maxComplexity };
    }

    if (options.keywords && options.keywords.length > 0) {
      // Note: Pinecone metadata filters have limitations with array searches
      // This is a simplified approach
      filters.keywords = { $in: options.keywords };
    }

    const searchOptions: SearchOptions = {
      topK: options.topK || 10,
      filter: filters,
      includeMetadata: true
    };

    if (options.query && options.generateEmbedding) {
      return await this.searchByQuery(options.query, options.generateEmbedding, searchOptions);
    } else {
      // Return chunks based on filters only
      const dummyQuery = new Array(this.dimension).fill(0);
      return await this.searchSimilarChunks(dummyQuery, searchOptions);
    }
  }

  /**
   * Health check for Pinecone connection
   */
  async healthCheck(): Promise<{
    connected: boolean;
    indexExists: boolean;
    indexReady: boolean;
    vectorCount?: number;
    error?: string;
  }> {
    try {
      // Check connection by listing indexes
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(idx => idx.name === this.indexName) || false;
      
      if (!indexExists) {
        return {
          connected: true,
          indexExists: false,
          indexReady: false
        };
      }

      // Check if index is ready
      const indexInfo = await this.pinecone.describeIndex(this.indexName);
      const indexReady = indexInfo.status?.ready || false;

      if (!indexReady) {
        return {
          connected: true,
          indexExists: true,
          indexReady: false
        };
      }

      // Get vector count
      const stats = await this.getIndexStats();

      return {
        connected: true,
        indexExists: true,
        indexReady: true,
        vectorCount: stats.vectorCount
      };
    } catch (error) {
      return {
        connected: false,
        indexExists: false,
        indexReady: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
