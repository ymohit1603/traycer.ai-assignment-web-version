import { NextRequest, NextResponse } from 'next/server';
import { SimilaritySearchService, IndexingProgress } from '../../lib/similaritySearch';
import { StorageManager } from '../../lib/storageManager';

// Store indexing progress for streaming updates
const indexingProgress = new Map<string, IndexingProgress>();

// Initialize search service
let searchService: SimilaritySearchService | null = null;

function initializeSearchService() {
  if (!searchService) {
    searchService = new SimilaritySearchService(
      process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API,
      process.env.PINECONE_API_KEY,
      process.env.PINECONE_ENVIRONMENT
    );
  }
  return searchService;
}

export async function POST(request: NextRequest) {
  try {
    const searchService = initializeSearchService();
    
    const body = await request.json();
    const { action, codebaseId } = body;

    console.log(`🔧 Semantic indexing API: ${action} for codebase ${codebaseId}`);

    switch (action) {
      case 'initialize': {
        console.log('🚀 Initializing search service...');
        
        await searchService.initialize();
        
        return NextResponse.json({
          success: true,
          message: 'Search service initialized successfully'
        });
      }

      case 'index-codebase': {
        if (!codebaseId) {
          return NextResponse.json(
            { error: 'CodebaseId is required for indexing' },
            { status: 400 }
          );
        }

        console.log(`📊 Starting indexing for codebase: ${codebaseId}`);

        // Get codebase from storage
        const storedCodebase = await StorageManager.getCodebase(codebaseId);
        if (!storedCodebase) {
          return NextResponse.json(
            { error: `Codebase not found: ${codebaseId}` },
            { status: 404 }
          );
        }

        // Initialize progress tracking
        const progressId = `index_${codebaseId}_${Date.now()}`;
        indexingProgress.set(progressId, {
          phase: 'chunking',
          progress: 0,
          message: 'Starting indexing...',
          errors: []
        });

        // Start indexing (async)
        searchService.indexCodebase(
          storedCodebase.files,
          codebaseId,
          (progress) => {
            indexingProgress.set(progressId, progress);
            console.log(`📊 Progress: ${progress.phase} - ${progress.progress}% - ${progress.message}`);
          }
        );

        // Return immediately with progress ID
        return NextResponse.json({
          success: true,
          progressId,
          message: 'Indexing started',
          codebaseId,
          filesCount: storedCodebase.files.length
        });
      }

      case 'reindex-codebase': {
        if (!codebaseId) {
          return NextResponse.json(
            { error: 'CodebaseId is required for reindexing' },
            { status: 400 }
          );
        }

        console.log(`🔄 Reindexing codebase: ${codebaseId}`);

        // First, delete existing vectors
        try {
          await searchService.deleteCodebaseChunks(codebaseId);
          console.log(`🗑️ Deleted existing vectors for codebase: ${codebaseId}`);
        } catch (error) {
          console.warn(`⚠️ Error deleting existing vectors: ${error}`);
        }

        // Then proceed with normal indexing
        const storedCodebase = await StorageManager.getCodebase(codebaseId);
        if (!storedCodebase) {
          return NextResponse.json(
            { error: `Codebase not found: ${codebaseId}` },
            { status: 404 }
          );
        }

        const progressId = `reindex_${codebaseId}_${Date.now()}`;
        indexingProgress.set(progressId, {
          phase: 'chunking',
          progress: 0,
          message: 'Starting reindexing...',
          errors: []
        });

        searchService.indexCodebase(
          storedCodebase.files,
          codebaseId,
          (progress) => {
            indexingProgress.set(progressId, progress);
          }
        );

        return NextResponse.json({
          success: true,
          progressId,
          message: 'Reindexing started',
          codebaseId
        });
      }

      case 'delete-index': {
        if (!codebaseId) {
          return NextResponse.json(
            { error: 'CodebaseId is required for deletion' },
            { status: 400 }
          );
        }

        console.log(`🗑️ Deleting index for codebase: ${codebaseId}`);

        await searchService.deleteCodebaseChunks(codebaseId);

        return NextResponse.json({
          success: true,
          message: `Index deleted for codebase: ${codebaseId}`
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ Semantic indexing API error:', error);
    
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
    const codebaseId = searchParams.get('codebaseId');

    switch (action) {
      case 'progress': {
        if (!progressId) {
          return NextResponse.json(
            { error: 'ProgressId is required' },
            { status: 400 }
          );
        }

        const progress = indexingProgress.get(progressId);
        
        if (!progress) {
          return NextResponse.json(
            { error: 'Progress not found' },
            { status: 404 }
          );
        }

        // Clean up completed progress after 5 minutes
        if (progress.phase === 'complete') {
          setTimeout(() => {
            indexingProgress.delete(progressId);
          }, 5 * 60 * 1000);
        }

        return NextResponse.json({
          success: true,
          progress,
          progressId
        });
      }

      case 'status': {
        if (!codebaseId) {
          // If no codebaseId provided, return a graceful response instead of an error
          return NextResponse.json({
            success: true,
            codebaseId: '',
            indexed: false,
            message: 'No codebase ID provided',
            timestamp: new Date().toISOString()
          });
        }

        const searchService = initializeSearchService();
        await searchService.initialize();
        
        // Check if codebase is indexed by checking Pinecone
        try {
          const chunks = await searchService.getChunksByCodebase(codebaseId, {
            topK: 1
          });

          const isIndexed = chunks && chunks.length > 0;
          
          // Get more detailed stats if indexed
          let stats = { totalVectors: chunks.length };
          if (isIndexed) {
            console.log(`Found ${chunks.length} chunks for codebase ${codebaseId}`);
          }

          return NextResponse.json({
            success: true,
            codebaseId,
            indexed: isIndexed,
            stats,
            timestamp: new Date().toISOString()
          });

        } catch (error) {
          console.error(`❌ Error checking status for ${codebaseId}:`, error);
          
          return NextResponse.json({
            success: true,
            codebaseId,
            indexed: false,
            error: 'Could not determine index status',
            timestamp: new Date().toISOString()
          });
        }
      }

      case 'health': {
        const searchService = initializeSearchService();
        const health = await searchService.healthCheck();
        
        return NextResponse.json({
          success: true,
          health,
          activeIndexing: indexingProgress.size,
          timestamp: new Date().toISOString()
        });
      }

      case 'list-progress': {
        const activeProgress = Array.from(indexingProgress.entries()).map(([id, progress]) => ({
          progressId: id,
          ...progress
        }));

        return NextResponse.json({
          success: true,
          activeIndexing: activeProgress,
          count: activeProgress.length
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown GET action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ Semantic indexing GET error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE endpoint for cleanup
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const codebaseId = searchParams.get('codebaseId');
    const progressId = searchParams.get('progressId');

    if (codebaseId) {
      console.log(`🗑️ DELETE: Removing index for codebase: ${codebaseId}`);
      
      const searchService = initializeSearchService();
      await searchService.deleteCodebaseChunks(codebaseId);

      return NextResponse.json({
        success: true,
        message: `Index deleted for codebase: ${codebaseId}`
      });
    }

    if (progressId) {
      console.log(`🗑️ DELETE: Removing progress tracking: ${progressId}`);
      
      const existed = indexingProgress.delete(progressId);
      
      return NextResponse.json({
        success: true,
        message: `Progress tracking ${existed ? 'deleted' : 'was not found'}: ${progressId}`
      });
    }

    return NextResponse.json(
      { error: 'Either codebaseId or progressId is required' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Semantic indexing DELETE error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
