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
  private model: string = 'text-embedding-ada-002';
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
      console.log(`🔢 Generating embedding for chunk: ${chunk.id}`);
      let response;
      try {
        response = await this.openai.embeddings.create({
          model: this.model,
          input: text,
          encoding_format: 'float'
        });
      } catch (error) {
        console.error('Error from OpenAI API:', error);
        throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      
      if (!response) {
        throw new Error('Received null or undefined response from OpenAI API');
      }

      // DEBUG: OpenRouter response structure (safe logging)
      console.log('🔍 Response analysis:');
      console.log('- Type:', typeof response);
      console.log('- Keys:', Object.keys(response || {}));
      console.log('- Has data array:', Array.isArray(response?.data));
      console.log('- Data length:', response?.data?.length);
      console.log('- Object field:', response?.object);
      console.log('- Model field:', response?.model);
      
      if (response?.data?.[0]) {
        const firstItem = response.data[0];
        console.log('- First item type:', firstItem?.object);
        console.log('- Has embedding:', !!firstItem?.embedding);
        console.log('- Embedding type:', typeof firstItem?.embedding);
        console.log('- Embedding length:', firstItem?.embedding?.length);
      }

      // Handle different response formats
      // OpenRouter and OpenAI might have different response structures
      let embedding;
      
      // Parse OpenRouter response format
      if (response?.data && Array.isArray(response.data) && response.data.length > 0) {
        const firstItem = response.data[0];
        
        // OpenRouter standard format: { object: "embedding", embedding: [...], index: 0 }
        if (firstItem?.embedding && Array.isArray(firstItem.embedding)) {
          embedding = firstItem.embedding;
          console.log('✅ Found embedding in OpenRouter data[0].embedding');
        }
        // Fallback: check if data[0] is directly an array (unlikely but possible)
        else if (Array.isArray(firstItem) && firstItem.length > 100) {
          embedding = firstItem;
          console.log('✅ Found embedding as direct array in data[0]');
        }
      } 
      
      if (!embedding && response.embeddings && Array.isArray(response.embeddings) && response.embeddings.length > 0) {
        // Alternative format: { embeddings: [[...]] }
        const embeddingData = response.embeddings[0];
        if (Array.isArray(embeddingData)) {
          embedding = embeddingData;
          console.log('✅ Found embedding in embeddings[0] array format');
        } else if (embeddingData && embeddingData.embedding) {
          embedding = embeddingData.embedding;
          console.log('✅ Found embedding in embeddings[0].embedding format');
        }
      } 
      
      if (!embedding && Array.isArray(response.embedding)) {
        // Direct array format: { embedding: [...] }
        embedding = response.embedding;
        // Found embedding in direct format
      } 
      
      if (!embedding && response.choices && Array.isArray(response.choices) && response.choices.length > 0) {
        // OpenRouter might use choices format: { choices: [{ embedding: [...] }] }
        const firstChoice = response.choices[0];
        if (firstChoice && firstChoice.embedding) {
          embedding = firstChoice.embedding;
          // Found embedding in choices format
        }
      }
      
      if (!embedding && response.result && Array.isArray(response.result)) {
        // Another possible format: { result: [...] }
        embedding = response.result;
        // Found embedding in result format
      }
      
      if (!embedding) {
        console.error('❌ Could not find embedding in expected locations');
        
        // Try to find any array-like structure that could be an embedding
        for (const [key, value] of Object.entries(response)) {
          if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
            // Found embedding at alternate key
            embedding = value;
            break;
          }
          if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0]) && typeof value[0][0] === 'number') {
            // Found embedding at nested key
            embedding = value[0];
            break;
          }
        }
      }
      
      if (!embedding) {
        console.error('❌ No valid embedding found in API response');
        throw new Error('Invalid API response: could not find embedding vector');
      }

      // Validate embedding
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.error('❌ Embedding validation failed - Type:', typeof embedding, 'Length:', embedding?.length);
        throw new Error(`Invalid embedding: not an array or empty array. Type: ${typeof embedding}, Length: ${embedding?.length}`);
      }
      
      // Additional validation - check if it looks like a real embedding
      if (embedding.length < 100) {
        console.warn('⚠️ Embedding seems unusually short:', embedding.length, 'dimensions');
      }
      
      if (!embedding.every(val => typeof val === 'number')) {
        console.error('❌ Embedding contains non-numeric values');
        throw new Error('Invalid embedding: contains non-numeric values');
      }

      // Successfully generated embedding

      return {
        chunkId: chunk.id,
        embedding,
        model: this.model,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        }
      };
    } catch (error) {
      console.error(`❌ Error generating embedding for chunk ${chunk.id}:`, error.message || error);
      throw error;
    }
  }

  /**
   * Process a batch of chunks
   */
  private async processBatch(chunks: CodeChunk[]): Promise<{embeddings: EmbeddingResult[], totalTokens: number}> {
    const texts = chunks.map(chunk => this.prepareTextForEmbedding(chunk));

    try {
      console.log(`🔢 Processing batch of ${chunks.length} chunks`);
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
        encoding_format: 'float'
      });

      // Validate response structure
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error(`Invalid batch API response: missing or invalid data array`);
      }

      if (response.data.length !== chunks.length) {
        console.warn(`⚠️ Response data length (${response.data.length}) doesn't match chunks length (${chunks.length})`);
      }

      const embeddings: EmbeddingResult[] = [];
      let totalTokens = 0;

      for (let i = 0; i < Math.min(response.data.length, chunks.length); i++) {
        const item = response.data[i];
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

        const avgPromptTokens = Math.floor((response.usage?.prompt_tokens || 0) / chunks.length);
        const avgTotalTokens = Math.floor((response.usage?.total_tokens || 0) / chunks.length);

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
        totalTokens: response.usage?.total_tokens || totalTokens
      };
    } catch (error) {
      console.error('❌ Batch processing failed:', error.message || error);

      // Fallback: process chunks individually
      console.log('⚠️ Falling back to individual processing...');
      const embeddings: EmbeddingResult[] = [];
      let totalTokens = 0;
      let failedChunks = 0;

      for (const chunk of chunks) {
        try {
          const result = await this.generateSingleEmbedding(chunk);
          embeddings.push(result);
          totalTokens += result.usage.totalTokens;
              // Individual processing success

          // Small delay between individual requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (chunkError) {
          failedChunks++;
          console.error(`❌ Failed to process chunk ${chunk.id}:`, chunkError);
          
          // Log chunk details for debugging (concise)
          console.log(`❌ Failed chunk: ${chunk.id} (${chunk.type}, ${chunk.content?.length || 0} chars)`);
          
          // Continue processing other chunks
        }
      }
      
      console.log(`📊 Individual processing complete: ${embeddings.length} success, ${failedChunks} failed`);
      
      // If we have at least some embeddings, continue
      if (embeddings.length === 0) {
        throw new Error('All chunks failed to generate embeddings');
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
      console.log(`🔢 Generating query embedding for: "${query.substring(0, 50)}..."`);
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: query,
        encoding_format: 'float'
      });

      // Validate response structure
      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        throw new Error(`Invalid query API response: no data array or empty data array`);
      }

      const firstItem = response.data[0];
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
      console.error('❌ Error generating query embedding:', error);
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
