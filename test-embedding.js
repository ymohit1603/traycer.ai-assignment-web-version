const { VectorEmbeddingService } = require('./app/lib/vectorEmbeddings.ts');

async function testEmbedding() {
  try {
    console.log('🧪 Testing OpenRouter embedding API...');
    
    const embeddingService = new VectorEmbeddingService();
    
    // Create a simple test chunk
    const testChunk = {
      id: 'test-chunk-1',
      type: 'function',
      filePath: 'test.js',
      content: 'function hello() { return "world"; }',
      startLine: 1,
      endLine: 3,
      language: 'javascript'
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
    
    if (result.embeddings.length > 0) {
      console.log('🎯 First embedding:', {
        chunkId: result.embeddings[0].chunkId,
        embeddingLength: result.embeddings[0].embedding.length,
        model: result.embeddings[0].model
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('🔧 Full error:', error);
  }
}

testEmbedding();
