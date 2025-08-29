import { NextRequest, NextResponse } from 'next/server';
import { VectorEmbeddingService } from '../../lib/vectorEmbeddings';

export async function GET() {
  try {
    console.log('🧪 Testing OpenRouter embedding API...');
    
    const embeddingService = new VectorEmbeddingService();
    
    // Create a simple test chunk
    const testChunk = {
      id: 'test-chunk-1',
      type: 'function' as const,
      filePath: 'test.js',
      content: 'function hello() { return "world"; }',
      startLine: 1,
      endLine: 3,
      metadata: {
        language: 'javascript',
        complexity: 1,
        dependencies: [],
        exports: ['hello'],
        imports: [],
        keywords: ['function', 'return']
      },
      childChunks: []
    };
    
    console.log('📝 Test chunk:', {
      id: testChunk.id,
      type: testChunk.type,
      contentLength: testChunk.content.length
    });
    
    const result = await embeddingService.generateEmbeddings([testChunk]);
    
    console.log('✅ Embedding generation successful!');
    console.log('📊 Result:', {
      embeddingsCount: result.embeddings.length,
      totalTokens: result.totalTokens,
      processingTime: result.processingTime
    });
    
    const response = {
      success: true,
      embeddingsCount: result.embeddings.length,
      totalTokens: result.totalTokens,
      processingTime: result.processingTime
    };
    
    if (result.embeddings.length > 0) {
      const firstEmbedding = {
        chunkId: result.embeddings[0].chunkId,
        embeddingLength: result.embeddings[0].embedding.length,
        model: result.embeddings[0].model
      };
      console.log('🎯 First embedding:', firstEmbedding);
      response.firstEmbedding = firstEmbedding;
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : 'Unknown error');
    console.error('🔧 Full error:', error);
    
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : error
    }, { status: 500 });
  }
}
