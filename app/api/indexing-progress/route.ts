import { NextRequest, NextResponse } from 'next/server';

interface IndexingProgress {
  codebaseId: string;
  status: 'idle' | 'chunking' | 'embedding' | 'storing' | 'completed' | 'error';
  phase: string;
  progress: number; // 0-100
  message: string;
  chunksProcessed: number;
  totalChunks: number;
  errors: string[];
  startTime: number;
  estimatedTimeRemaining?: number;
}

// In-memory store for indexing progress (in production, use Redis or similar)
const indexingProgress = new Map<string, IndexingProgress>();

// Cleanup old progress entries (older than 1 hour)
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [codebaseId, progress] of indexingProgress.entries()) {
    if (now - progress.startTime > CLEANUP_INTERVAL) {
      indexingProgress.delete(codebaseId);
    }
  }
}, 5 * 60 * 1000); // Run cleanup every 5 minutes

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const codebaseId = searchParams.get('codebaseId');

    if (!codebaseId) {
      return NextResponse.json({ 
        error: 'Missing codebaseId parameter' 
      }, { status: 400 });
    }

    const progress = indexingProgress.get(codebaseId);
    
    if (!progress) {
      return NextResponse.json({
        success: true,
        progress: {
          codebaseId,
          status: 'idle',
          phase: 'waiting',
          progress: 0,
          message: 'No indexing in progress',
          chunksProcessed: 0,
          totalChunks: 0,
          errors: [],
          startTime: Date.now()
        }
      });
    }

    // Calculate estimated time remaining
    if (progress.chunksProcessed > 0 && progress.totalChunks > 0 && progress.startTime) {
      const elapsed = Date.now() - progress.startTime;
      const rate = progress.chunksProcessed / elapsed; // chunks per ms
      const remaining = progress.totalChunks - progress.chunksProcessed;
      progress.estimatedTimeRemaining = Math.ceil(remaining / rate);
    }

    return NextResponse.json({
      success: true,
      progress
    });

  } catch (error) {
    console.error('Error getting indexing progress:', error);
    return NextResponse.json({ 
      error: 'Failed to get indexing progress' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { codebaseId, status, phase, progress, message, chunksProcessed, totalChunks, errors } = body;

    if (!codebaseId) {
      return NextResponse.json({ 
        error: 'Missing codebaseId' 
      }, { status: 400 });
    }

    const existingProgress = indexingProgress.get(codebaseId);
    const now = Date.now();

    const updatedProgress: IndexingProgress = {
      codebaseId,
      status: status || 'idle',
      phase: phase || 'waiting',
      progress: Math.max(0, Math.min(100, progress || 0)),
      message: message || 'Processing...',
      chunksProcessed: Math.max(0, chunksProcessed || 0),
      totalChunks: Math.max(0, totalChunks || 0),
      errors: Array.isArray(errors) ? errors : [],
      startTime: existingProgress?.startTime || now,
      estimatedTimeRemaining: existingProgress?.estimatedTimeRemaining
    };

    indexingProgress.set(codebaseId, updatedProgress);

    console.log(`📊 Indexing progress update: ${codebaseId} - ${updatedProgress.status} - ${updatedProgress.progress}% - ${updatedProgress.message}`);

    return NextResponse.json({
      success: true,
      progress: updatedProgress
    });

  } catch (error) {
    console.error('Error updating indexing progress:', error);
    return NextResponse.json({ 
      error: 'Failed to update indexing progress' 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const codebaseId = searchParams.get('codebaseId');

    if (!codebaseId) {
      return NextResponse.json({ 
        error: 'Missing codebaseId parameter' 
      }, { status: 400 });
    }

    indexingProgress.delete(codebaseId);

    console.log(`🗑️ Cleared indexing progress for codebase: ${codebaseId}`);

    return NextResponse.json({
      success: true,
      message: 'Indexing progress cleared'
    });

  } catch (error) {
    console.error('Error clearing indexing progress:', error);
    return NextResponse.json({ 
      error: 'Failed to clear indexing progress' 
    }, { status: 500 });
  }
}

// Export the progress store for internal use
export { indexingProgress };
