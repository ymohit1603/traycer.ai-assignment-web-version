import { CodeChunk } from './semanticChunking';

export interface EmbeddingResult {
  chunkId: string;
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingBatch {
  chunks: CodeChunk[];
  embeddings: EmbeddingResult[];
  totalTokens: number;
  processingTime: number;
}

export class VectorEmbeddingService {
  private apiKey: string;
  private baseURL: string = 'https://api.voyageai.com/v1';
  private model: string = 'voyage-3-large';
  
  /**
   * Get the expected embedding dimension for the current model
   */
  getExpectedDimension(): number {
    const modelDimensions: { [key: string]: number } = {
      'voyage-3-large': 1024,
      'voyage-3': 1024,
      'voyage-2': 1024,
      'voyage-large-2-instruct': 1024,
      'text-embedding-3-small': 1536,
      'text-embedding-3-large': 3072,
      'text-embedding-ada-002': 1536
    };
    
    return modelDimensions[this.model] || 1024;
  }
  private maxTokensPerRequest: number = 2500; // Conservative limit for 10K TPM (leaves buffer)
  private maxTokensPerChunk: number = 8000; // Model context limit
  private requestDelay: number = 20000; // Exactly 20 seconds for 3 RPM
  private maxRetries: number = 5;
  private maxBatchRetries: number = 10; // More retries for batch processing
  private requestsThisMinute: number = 0;
  private tokensThisMinute: number = 0;
  private minuteStartTime: number = Date.now();

  constructor(apiKey?: string) {
    const key = apiKey || process.env.VOYAGE_API_KEY;
    
    if (!key) {
      throw new Error('Voyage AI API key not found. Please set VOYAGE_API_KEY environment variable.');
    }

    this.apiKey = key;
    
    // Log optimized rate limiting info
    console.log('🚀 Voyage AI Optimized: Using token-aware batching (3 RPM, 10K TPM)');
    console.log(`📊 Target: ~${this.maxTokensPerRequest} tokens per request, ${this.requestDelay/1000}s intervals`);
    console.log(`📏 Model: ${this.model} (${this.getExpectedDimension()} dimensions)`);
  }

  /**
   * Estimate token count for a text string
   */
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }

  /**
   * Create optimal batches based on token limits
   */
  private createOptimalBatches(chunks: CodeChunk[]): CodeChunk[][] {
    const batches: CodeChunk[][] = [];
    let currentBatch: CodeChunk[] = [];
    let currentBatchTokens = 0;

    for (const chunk of chunks) {
      const chunkText = this.prepareTextForEmbedding(chunk);
      const chunkTokens = this.estimateTokenCount(chunkText);
      
      // If adding this chunk would exceed token limit, start new batch
      if (currentBatchTokens + chunkTokens > this.maxTokensPerRequest && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [chunk];
        currentBatchTokens = chunkTokens;
      } else {
        currentBatch.push(chunk);
        currentBatchTokens += chunkTokens;
      }
    }

    // Add the last batch if it has chunks
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Check and update rate limiting counters
   */
  private checkRateLimit(estimatedTokens: number): { canProceed: boolean; waitTime: number } {
    const now = Date.now();
    
    // Reset counters if a minute has passed
    if (now - this.minuteStartTime >= 60000) {
      this.requestsThisMinute = 0;
      this.tokensThisMinute = 0;
      this.minuteStartTime = now;
    }

    // Check if we can make this request
    const wouldExceedRequests = this.requestsThisMinute >= 3;
    const wouldExceedTokens = this.tokensThisMinute + estimatedTokens > 10000;

    if (wouldExceedRequests || wouldExceedTokens) {
      // Calculate wait time until next minute
      const timeUntilReset = 60000 - (now - this.minuteStartTime);
      return { canProceed: false, waitTime: timeUntilReset };
    }

    return { canProceed: true, waitTime: 0 };
  }

  /**
   * Update rate limiting counters after successful request
   */
  private updateRateLimitCounters(tokensUsed: number): void {
    this.requestsThisMinute++;
    this.tokensThisMinute += tokensUsed;
  }

  /**
   * Generate embeddings for an array of code chunks
   */
  async generateEmbeddings(chunks: CodeChunk[]): Promise<EmbeddingBatch> {
    const startTime = Date.now();
    const embeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    console.log(`🔢 Generating embeddings for ${chunks.length} chunks...`);

    // Prioritize chunks by importance (main files first)
    const prioritizedChunks = VectorEmbeddingService.prioritizeChunks(chunks);
    console.log(`📋 Prioritized chunks: processing important files first`);

    // Create optimal batches based on token limits
    const optimalBatches = this.createOptimalBatches(prioritizedChunks);
    console.log(`📊 Created ${optimalBatches.length} optimal batches (avg ${Math.round(chunks.length / optimalBatches.length)} chunks per batch)`);
    
    for (let i = 0; i < optimalBatches.length; i++) {
      const batch = optimalBatches[i];
      const batchNum = i + 1;
      
      // Estimate tokens for this batch
      const batchText = batch.map(chunk => this.prepareTextForEmbedding(chunk)).join(' ');
      const estimatedTokens = this.estimateTokenCount(batchText);
      
      console.log(`📦 Processing batch ${batchNum}/${optimalBatches.length} (${batch.length} chunks, ~${estimatedTokens} tokens)`);
      
      // Check rate limits
      const rateLimitCheck = this.checkRateLimit(estimatedTokens);
      if (!rateLimitCheck.canProceed) {
        console.log(`⏱️ Rate limit reached, waiting ${Math.ceil(rateLimitCheck.waitTime/1000)}s for reset...`);
        await new Promise(resolve => setTimeout(resolve, rateLimitCheck.waitTime + 1000)); // +1s buffer
      }
      
      try {
        const batchResults = await this.processBatch(batch);
        embeddings.push(...batchResults.embeddings);
        totalTokens += batchResults.totalTokens;
        
        // Update rate limit counters
        this.updateRateLimitCounters(estimatedTokens);
        
        console.log(`✅ Generated ${batchResults.embeddings.length} embeddings in batch ${batchNum}`);
        
        // Log progress with time estimation
        const progress = Math.round((embeddings.length / chunks.length) * 100);
        const timePerChunk = (Date.now() - startTime) / embeddings.length;
        const estimatedTimeRemaining = timePerChunk * (chunks.length - embeddings.length);
        console.log(`📊 Progress: ${progress}% (${embeddings.length}/${chunks.length} chunks) - ETA: ${Math.ceil(estimatedTimeRemaining/1000/60)}min`);
        
        // Add delay for next request (unless it's the last batch)
        if (i < optimalBatches.length - 1) {
          console.log(`⏱️ Rate limiting: waiting ${this.requestDelay/1000}s before next batch...`);
          await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        }
        
      } catch (error) {
        console.error(`❌ Error processing batch ${batchNum}:`, error);
        // Continue with other batches, but log the failed chunks
        batch.forEach(chunk => {
          console.warn(`⚠️ Failed to generate embedding for chunk: ${chunk.id}`);
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Generated ${embeddings.length} embeddings in ${processingTime}ms`);
    console.log(`📊 Total tokens used: ${totalTokens}`);
    console.log(`⚡ Processing speed: ${Math.round(embeddings.length / (processingTime/1000))} chunks/second`);

    return {
      chunks: prioritizedChunks,
      embeddings,
      totalTokens,
      processingTime
    };
  }

  /**
   * Generate embedding for a single chunk
   */
  async generateSingleEmbedding(chunk: CodeChunk): Promise<EmbeddingResult> {
    const text = this.prepareTextForEmbedding(chunk);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🔢 Generating embedding for chunk: ${chunk.id} (attempt ${attempt}/${this.maxRetries})`);
        
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            input: text,
          }),
        });

        if (response.status === 429) {
          const errorText = await response.text();
          const waitTime = Math.min(this.requestDelay * Math.pow(2, attempt - 1), 120000); // Max 2 minutes
          console.log(`⏱️ Rate limited (429), waiting ${waitTime/1000}s before retry ${attempt}/${this.maxRetries}...`);
          
          if (attempt === this.maxRetries) {
            throw new Error(`Rate limit exceeded after ${this.maxRetries} attempts. Consider adding payment method to Voyage AI for higher limits.`);
          }
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Voyage AI API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        
        // Parse Voyage AI response format
        let embedding;
        
        // Standard Voyage AI format: { data: [{ embedding: [...] }] }
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const firstItem = data.data[0];
          if (firstItem?.embedding && Array.isArray(firstItem.embedding)) {
            embedding = firstItem.embedding;
          }
        }
        
        // Alternative formats (fallbacks)
        if (!embedding && data?.embeddings && Array.isArray(data.embeddings)) {
          embedding = data.embeddings[0];
        }
        
        if (!embedding && Array.isArray(data?.embedding)) {
          embedding = data.embedding;
        }
        
        if (!embedding) {
          throw new Error('Invalid Voyage AI response: could not find embedding vector');
        }

        // Validate embedding
        if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
          throw new Error(`Invalid embedding: not an array or empty array. Type: ${typeof embedding}, Length: ${embedding?.length}`);
        }
        
        if (!embedding.every(val => typeof val === 'number')) {
          throw new Error('Invalid embedding: contains non-numeric values');
        }

        console.log('✅ Successfully generated embedding:', embedding.length, 'dimensions');
        
        return {
          chunkId: chunk.id,
          embedding,
          model: this.model,
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0
          }
        };
      } catch (error) {
        if (attempt === this.maxRetries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Error generating embedding for chunk ${chunk.id} after ${this.maxRetries} attempts:`, errorMessage);
          throw error;
        }
        
        // If it's not a 429 error, wait a bit and retry
        console.log(`⚠️ Attempt ${attempt} failed, retrying in 5s...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  /**
   * Process a batch of chunks with robust retry logic
   */
  private async processBatch(chunks: CodeChunk[]): Promise<{embeddings: EmbeddingResult[], totalTokens: number}> {
    const texts = chunks.map(chunk => this.prepareTextForEmbedding(chunk));

    for (let attempt = 1; attempt <= this.maxBatchRetries; attempt++) {
      try {
        console.log(`🔢 Processing batch of ${chunks.length} chunks with Voyage AI (attempt ${attempt}/${this.maxBatchRetries})`);
        
        const response = await fetch(`${this.baseURL}/embeddings`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
          }),
        });

        if (response.status === 429) {
          const errorText = await response.text();
          const baseWaitTime = this.requestDelay;
          const jitter = Math.random() * 5000; // 0-5 second jitter
          const waitTime = Math.min(baseWaitTime * Math.pow(2, attempt - 1) + jitter, 300000); // Max 5 minutes
          
          console.log(`⏱️ Rate limited (429), waiting ${Math.ceil(waitTime/1000)}s before retry ${attempt}/${this.maxBatchRetries}...`);
          console.log(`📊 Rate limit details: ${errorText}`);
          
          if (attempt === this.maxBatchRetries) {
            throw new Error(`Rate limit exceeded after ${this.maxBatchRetries} attempts. API response: ${errorText}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ API error ${response.status}: ${errorText}`);
          
          // For non-rate-limit errors, retry with shorter delay
          if (attempt < this.maxBatchRetries) {
            const retryWait = Math.min(5000 * attempt, 30000); // 5s, 10s, 15s, etc., max 30s
            console.log(`⏱️ Retrying in ${retryWait/1000}s due to API error...`);
            await new Promise(resolve => setTimeout(resolve, retryWait));
            continue;
          }
          
          throw new Error(`Voyage AI batch API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // Validate response structure
        if (!data.data || !Array.isArray(data.data)) {
          throw new Error(`Invalid batch API response: missing or invalid data array`);
        }

        if (data.data.length !== chunks.length) {
          console.warn(`⚠️ Response data length (${data.data.length}) doesn't match chunks length (${chunks.length})`);
        }

        const embeddings: EmbeddingResult[] = [];
        let totalTokens = 0;

        for (let i = 0; i < Math.min(data.data.length, chunks.length); i++) {
          const item = data.data[i];
          const chunk = chunks[i];

          if (!item || !item.embedding) {
            console.error(`❌ Invalid response item at index ${i}:`, item);
            continue;
          }

          // Validate embedding
          if (!Array.isArray(item.embedding) || item.embedding.length === 0) {
            console.error(`❌ Invalid embedding at index ${i}: not an array or empty`);
            continue;
          }

          const avgPromptTokens = Math.floor((data.usage?.prompt_tokens || 0) / chunks.length);
          const avgTotalTokens = Math.floor((data.usage?.total_tokens || 0) / chunks.length);

          embeddings.push({
            chunkId: chunk.id,
            embedding: item.embedding,
            model: this.model,
            usage: {
              promptTokens: avgPromptTokens,
              totalTokens: avgTotalTokens
            }
          });

          totalTokens += avgTotalTokens;
        }

        console.log(`✅ Batch processed successfully: ${embeddings.length}/${chunks.length} embeddings generated`);

        return {
          embeddings,
          totalTokens: data.usage?.total_tokens || totalTokens
        };
      } catch (error) {
        if (attempt === this.maxBatchRetries) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`❌ Batch processing failed after ${this.maxBatchRetries} attempts:`, errorMessage);
          throw error;
        }
        
        console.log(`⚠️ Attempt ${attempt} failed, retrying...`);
      }
    }
    
    throw new Error('Batch processing failed after all retry attempts');
  }

  /**
   * Prepare text content for embedding generation
   */
  private prepareTextForEmbedding(chunk: CodeChunk): string {
    const components = [];

    // Add chunk type and name
    if (chunk.name) {
      components.push(`${chunk.type}: ${chunk.name}`);
    } else {
      components.push(`${chunk.type}`);
    }

    // Add file path context
    components.push(`File: ${chunk.filePath}`);

    // Add language context
    components.push(`Language: ${chunk.metadata.language}`);

    // Add keywords for better semantic understanding
    if (chunk.metadata.keywords.length > 0) {
      components.push(`Keywords: ${chunk.metadata.keywords.slice(0, 10).join(', ')}`);
    }

    // Add imports/dependencies for context
    if (chunk.metadata.imports.length > 0) {
      components.push(`Imports: ${chunk.metadata.imports.slice(0, 5).join(', ')}`);
    }

    // Add the actual code content
    components.push('Code:');
    components.push(chunk.content);

    let text = components.join('\n');

    // Truncate if too long (approximate token limit)
    if (text.length > this.maxTokensPerChunk * 4) { // Rough estimate: 1 token ≈ 4 chars
      text = text.substring(0, this.maxTokensPerChunk * 4) + '... [truncated]';
    }

    return text;
  }

  /**
   * Prioritize chunks by importance (main files first, then components, then tests)
   */
  static prioritizeChunks(chunks: CodeChunk[]): CodeChunk[] {
    const priorityOrder = {
      // Main application files (highest priority)
      main: 1,
      index: 1,
      app: 1,
      
      // Core library files
      service: 2,
      lib: 2,
      util: 2,
      helper: 2,
      
      // Components and UI
      component: 3,
      ui: 3,
      
      // API and routes
      api: 4,
      route: 4,
      
      // Configuration and types
      config: 5,
      type: 5,
      interface: 5,
      
      // Tests and specs (lowest priority)
      test: 6,
      spec: 6,
      mock: 6
    };

    return chunks.sort((a, b) => {
      const aPath = a.filePath.toLowerCase();
      const bPath = b.filePath.toLowerCase();
      
      // Get priority scores
      let aPriority = 7; // Default lowest priority
      let bPriority = 7;
      
      for (const [keyword, priority] of Object.entries(priorityOrder)) {
        if (aPath.includes(keyword)) {
          aPriority = Math.min(aPriority, priority);
        }
        if (bPath.includes(keyword)) {
          bPriority = Math.min(bPriority, priority);
        }
      }
      
      // Secondary sort by file type preference
      if (aPriority === bPriority) {
        const aIsMainCode = /\.(ts|tsx|js|jsx)$/.test(aPath);
        const bIsMainCode = /\.(ts|tsx|js|jsx)$/.test(bPath);
        
        if (aIsMainCode && !bIsMainCode) return -1;
        if (!aIsMainCode && bIsMainCode) return 1;
      }
      
      return aPriority - bPriority;
    });
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  static calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  /**
   * Find most similar chunks to a query embedding
   */
  static findSimilarChunks(
    queryEmbedding: number[],
    chunkEmbeddings: Array<{chunkId: string, embedding: number[]}>,
    topK: number = 10,
    threshold: number = 0.7
  ): Array<{chunkId: string, similarity: number}> {
    const similarities = chunkEmbeddings.map(item => ({
      chunkId: item.chunkId,
      similarity: this.calculateSimilarity(queryEmbedding, item.embedding)
    }));

    return similarities
      .filter(item => item.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /**
   * Generate embedding for a text query (for similarity search)
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      console.log(`🔢 Generating query embedding for: "${query.substring(0, 50)}..."`);
      
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          input: query,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voyage AI query API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();

      // Validate response structure
      if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
        throw new Error(`Invalid query API response: no data array or empty data array`);
      }

      const firstItem = data.data[0];
      if (!firstItem || !firstItem.embedding) {
        throw new Error(`Invalid query API response: missing embedding in response`);
      }

      const embedding = firstItem.embedding;

      // Validate embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(`Invalid query embedding: not an array or empty array`);
      }

      console.log(`✅ Query embedding generated successfully, dimension: ${embedding.length}`);
      return embedding;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ Error generating query embedding:', errorMessage);
      console.error('Query length:', query.length);
      throw error;
    }
  }

  /**
   * Validate embedding dimensions
   */
  static validateEmbedding(embedding: number[]): boolean {
    return Array.isArray(embedding) && 
           embedding.length > 0 && 
           embedding.every(val => typeof val === 'number' && !isNaN(val));
  }

  /**
   * Normalize embedding vector
   */
  static normalizeEmbedding(embedding: number[]): number[] {
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? embedding : embedding.map(val => val / norm);
  }

  /**
   * Get embedding statistics
   */
  static getEmbeddingStats(embeddings: number[][]): {
    dimensions: number;
    count: number;
    avgMagnitude: number;
    minValue: number;
    maxValue: number;
  } {
    if (embeddings.length === 0) {
      return { dimensions: 0, count: 0, avgMagnitude: 0, minValue: 0, maxValue: 0 };
    }

    const dimensions = embeddings[0].length;
    const count = embeddings.length;
    
    let totalMagnitude = 0;
    let minValue = Infinity;
    let maxValue = -Infinity;

    embeddings.forEach(embedding => {
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      totalMagnitude += magnitude;

      embedding.forEach(val => {
        minValue = Math.min(minValue, val);
        maxValue = Math.max(maxValue, val);
      });
    });

    return {
      dimensions,
      count,
      avgMagnitude: totalMagnitude / count,
      minValue,
      maxValue
    };
  }
}
