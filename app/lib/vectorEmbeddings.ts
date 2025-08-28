import OpenAI from 'openai';
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
  private openai: OpenAI;
  private model: string = 'text-embedding-3-small';
  private maxBatchSize: number = 100; // OpenAI batch limit
  private maxTokensPerChunk: number = 8000; // Model context limit

  constructor(apiKey?: string) {
    const key = apiKey || process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API;
    
    if (!key) {
      throw new Error('OpenAI API key not found. Please set OPEN_AI_API environment variable.');
    }

    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: key,
      defaultHeaders: {
        "HTTP-Referer": "https://traycer-ai.vercel.app",
        "X-Title": "Traycer AI",
      },
      dangerouslyAllowBrowser: true,
    });
  }

  /**
   * Generate embeddings for an array of code chunks
   */
  async generateEmbeddings(chunks: CodeChunk[]): Promise<EmbeddingBatch> {
    const startTime = Date.now();
    const embeddings: EmbeddingResult[] = [];
    let totalTokens = 0;

    console.log(`🔢 Generating embeddings for ${chunks.length} chunks...`);

    // Process chunks in batches
    const batches = this.createBatches(chunks);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`📦 Processing batch ${i + 1}/${batches.length} (${batch.length} chunks)`);
      
      try {
        const batchResults = await this.processBatch(batch);
        embeddings.push(...batchResults.embeddings);
        totalTokens += batchResults.totalTokens;
        
        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Error processing batch ${i + 1}:`, error);
        // Continue with other batches, but log the failed chunks
        batch.forEach(chunk => {
          console.warn(`⚠️ Failed to generate embedding for chunk: ${chunk.id}`);
        });
      }
    }

    const processingTime = Date.now() - startTime;
    
    console.log(`✅ Generated ${embeddings.length} embeddings in ${processingTime}ms`);
    console.log(`📊 Total tokens used: ${totalTokens}`);

    return {
      chunks,
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
    
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
        encoding_format: 'float'
      });

      const embedding = response.data[0].embedding;
      const usage = response.usage;

      return {
        chunkId: chunk.id,
        embedding,
        model: this.model,
        usage: {
          promptTokens: usage.prompt_tokens,
          totalTokens: usage.total_tokens
        }
      };
    } catch (error) {
      console.error(`❌ Error generating embedding for chunk ${chunk.id}:`, error);
      throw error;
    }
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(chunks: CodeChunk[]): Promise<{embeddings: EmbeddingResult[], totalTokens: number}> {
    const texts = chunks.map(chunk => this.prepareTextForEmbedding(chunk));
    
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float'
      });

      const embeddings: EmbeddingResult[] = response.data.map((item, index) => ({
        chunkId: chunks[index].id,
        embedding: item.embedding,
        model: this.model,
        usage: {
          promptTokens: Math.floor(response.usage.prompt_tokens / chunks.length),
          totalTokens: Math.floor(response.usage.total_tokens / chunks.length)
        }
      }));

      return {
        embeddings,
        totalTokens: response.usage.total_tokens
      };
    } catch (error) {
      console.error('❌ Batch processing failed:', error);
      
      // Fallback: process chunks individually
      console.log('⚠️ Falling back to individual processing...');
      const embeddings: EmbeddingResult[] = [];
      let totalTokens = 0;

      for (const chunk of chunks) {
        try {
          const result = await this.generateSingleEmbedding(chunk);
          embeddings.push(result);
          totalTokens += result.usage.totalTokens;
          
          // Small delay between individual requests
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (chunkError) {
          console.error(`❌ Failed to process chunk ${chunk.id}:`, chunkError);
        }
      }

      return { embeddings, totalTokens };
    }
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
   * Create batches from chunks, respecting size limits
   */
  private createBatches(chunks: CodeChunk[]): CodeChunk[][] {
    const batches: CodeChunk[][] = [];
    let currentBatch: CodeChunk[] = [];
    let currentBatchTokens = 0;

    for (const chunk of chunks) {
      const chunkText = this.prepareTextForEmbedding(chunk);
      const estimatedTokens = Math.ceil(chunkText.length / 4);

      // Check if adding this chunk would exceed batch limits
      if (currentBatch.length >= this.maxBatchSize || 
          currentBatchTokens + estimatedTokens > this.maxTokensPerChunk * this.maxBatchSize) {
        
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBatchTokens = 0;
        }
      }

      currentBatch.push(chunk);
      currentBatchTokens += estimatedTokens;
    }

    // Add the last batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
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
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: query,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('❌ Error generating query embedding:', error);
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
