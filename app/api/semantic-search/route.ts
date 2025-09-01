import { NextRequest, NextResponse } from 'next/server';
import { SimilaritySearchService, SearchContext } from '../../lib/similaritySearch';
import { ContextAssemblyService, AssemblyOptions } from '../../lib/contextAssembly';
import { PrunedStoredCodebase } from '../../lib/payloadPruning';

// Initialize services
let searchService: SimilaritySearchService | null = null;
let contextAssemblyService: ContextAssemblyService | null = null;

function initializeServices() {
  if (!searchService) {
    searchService = new SimilaritySearchService(
      process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API,
      process.env.PINECONE_API_KEY,
      process.env.PINECONE_ENVIRONMENT
    );
  }
  
  if (!contextAssemblyService) {
    contextAssemblyService = new ContextAssemblyService();
  }
  
  return { searchService, contextAssemblyService };
}

export async function POST(request: NextRequest) {
  try {
    const { searchService, contextAssemblyService } = initializeServices();
    
    const body = await request.json();
    const { 
      action, 
      query, 
      codebaseId, 
      options = {},
      assemblyOptions = {},
      prunedCodebase
    } = body;

    console.log(`🔍 Semantic search API: ${action} for codebase ${codebaseId}`);

    switch (action) {
      case 'search': {
        if (!query || !codebaseId) {
          return NextResponse.json(
            { error: 'Query and codebaseId are required for search' },
            { status: 400 }
          );
        }

        const searchContext: SearchContext = {
          codebaseId,
          maxResults: options.maxResults || 10,
          relevanceThreshold: options.relevanceThreshold || 0.7,
          includeRelated: options.includeRelated || false,
          contextWindow: options.contextWindow || 3,
          language: options.language,
          fileType: options.fileType
        };

        console.log(`🔍 Searching for: "${query.substring(0, 100)}..."`);
        
        const searchResults = await searchService.search(query, searchContext);
        
        return NextResponse.json({
          success: true,
          results: searchResults,
          metadata: {
            query,
            codebaseId,
            resultsCount: searchResults.chunks.length,
            searchTime: searchResults.searchTime
          }
        });
      }

      case 'search-with-context': {
        if (!query || !codebaseId) {
          return NextResponse.json(
            { error: 'Query and codebaseId are required' },
            { status: 400 }
          );
        }

        // Validate client-provided codebase if present
        if (prunedCodebase) {
          const payloadSize = JSON.stringify(prunedCodebase).length;
          console.log(`📦 Client provided codebase payload: ${(payloadSize / 1024).toFixed(1)}KB`);
          
          // Safety: Check payload size limit (2MB)
          const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024; // 2MB
          if (payloadSize > MAX_PAYLOAD_SIZE) {
            console.warn(`⚠️ Payload too large: ${(payloadSize / 1024 / 1024).toFixed(1)}MB exceeds ${(MAX_PAYLOAD_SIZE / 1024 / 1024).toFixed(1)}MB limit`);
            return NextResponse.json(
              { 
                error: 'Payload too large',
                message: `Payload size ${(payloadSize / 1024 / 1024).toFixed(1)}MB exceeds ${(MAX_PAYLOAD_SIZE / 1024 / 1024).toFixed(1)}MB limit`,
                success: false
              },
              { status: 413 }
            );
          }

          // Validate that the codebase IDs match
          if (prunedCodebase.metadata?.id !== codebaseId) {
            console.warn(`⚠️ Codebase ID mismatch: expected ${codebaseId}, got ${prunedCodebase.metadata?.id}`);
            return NextResponse.json(
              { 
                error: 'Codebase ID mismatch',
                message: `Expected ${codebaseId}, but received ${prunedCodebase.metadata?.id}`,
                success: false
              },
              { status: 400 }
            );
          }

          // Safety: Validate codebase structure
          if (!prunedCodebase.metadata || !Array.isArray(prunedCodebase.files)) {
            console.warn(`⚠️ Invalid codebase structure`);
            return NextResponse.json(
              { 
                error: 'Invalid codebase structure',
                message: 'Client-provided codebase must have valid metadata and files array',
                success: false
              },
              { status: 400 }
            );
          }

          // Log payload stats for debugging (no sensitive content)
          if (prunedCodebase.payloadStats) {
            console.log(`📊 Payload stats:`, {
              size: `${(prunedCodebase.payloadStats.prunedSize / 1024).toFixed(1)}KB`,
              files: `${prunedCodebase.payloadStats.filesIncluded}/${prunedCodebase.payloadStats.filesIncluded + prunedCodebase.payloadStats.filesExcluded}`,
              compression: `${(prunedCodebase.payloadStats.compressionRatio * 100).toFixed(1)}%`
            });
          }

          // Safety: Note that client data is used temporarily and not persisted
          console.log(`🔒 Using client codebase data temporarily for search context (not persisted)`);
        } else {
          console.log(`🔍 No client payload provided, will attempt server-side codebase lookup`);
        }

        console.log(`🧠 Searching with intelligent context assembly...`);
        console.log(`🔍 Query: "${query}" | Codebase: ${codebaseId} | Max results: ${options.maxResults || 15}`);

        // First, perform the semantic search with improved thresholds
        const searchContext: SearchContext = {
          codebaseId,
          maxResults: options.maxResults || 15,
          relevanceThreshold: options.relevanceThreshold || 0.5, // Lowered from 0.7 to 0.5
          includeRelated: true,
          contextWindow: options.contextWindow || 5
        };

        console.log(`📊 Search context: relevance threshold ${searchContext.relevanceThreshold}, include related: ${searchContext.includeRelated}`);
        const searchResults = await searchService.search(query, searchContext);

        // Then, assemble intelligent context
        const assemblyOpts: AssemblyOptions = {
          maxFiles: assemblyOptions.maxFiles || 8,
          maxSnippets: assemblyOptions.maxSnippets || 20,
          contextLines: assemblyOptions.contextLines || 5,
          includeFullFiles: assemblyOptions.includeFullFiles || false,
          relevanceThreshold: assemblyOptions.relevanceThreshold || 0.7,
          groupByFile: assemblyOptions.groupByFile !== false
        };

        // Assemble context with proper error handling
        let assembledContext;
        try {
          assembledContext = await contextAssemblyService.assembleContext(
            searchResults,
            codebaseId,
            assemblyOpts,
            undefined, // onFileRead callback
            prunedCodebase // Pass client-provided codebase
          );
        } catch (contextError) {
          console.error(`❌ Context assembly failed:`, contextError);
          
          // If client provided codebase but context assembly failed, provide helpful error
          if (prunedCodebase) {
            return NextResponse.json(
              { 
                error: 'Context assembly failed with client data',
                message: 'Failed to process client-provided codebase data. Please try re-importing your repository.',
                success: false,
                details: contextError instanceof Error ? contextError.message : 'Unknown error'
              },
              { status: 500 }
            );
          }
          
          // For server-side failures, suggest client-side solution
          return NextResponse.json(
            { 
              error: 'Codebase not found on server',
              message: 'Codebase metadata not available on server. Please ensure your repository is properly imported and indexed.',
              success: false,
              suggestions: [
                'Re-import your GitHub repository to ensure metadata is stored locally',
                'Check that the codebase ID matches your imported repository',
                'Verify that the repository sync completed successfully'
              ]
            },
            { status: 404 }
          );
        }

        return NextResponse.json({
          success: true,
          searchResults,
          assembledContext,
          textContext: contextAssemblyService.exportAsText(assembledContext),
          metadata: {
            query,
            codebaseId,
            searchResultsCount: searchResults.chunks.length,
            contextFilesCount: assembledContext.relevantFiles.length,
            totalSearchTime: searchResults.searchTime,
            totalAssemblyTime: assembledContext.assemblyTime,
            confidence: assembledContext.confidence
          }
        });
      }

      case 'intelligent-context': {
        const { filePath, contextType = 'file', targetName } = body;
        
        if (!filePath || !codebaseId) {
          return NextResponse.json(
            { error: 'FilePath and codebaseId are required' },
            { status: 400 }
          );
        }

        console.log(`🎯 Getting intelligent context for ${contextType}: ${filePath}`);

        const contextResults = await searchService.getIntelligentContext(
          filePath,
          codebaseId,
          contextType,
          targetName
        );

        const assembledContext = await contextAssemblyService.assembleContext(
          contextResults,
          codebaseId,
          assemblyOptions
        );

        return NextResponse.json({
          success: true,
          contextResults,
          assembledContext,
          textContext: contextAssemblyService.exportAsText(assembledContext)
        });
      }

      case 'find-patterns': {
        const { codeExample, patternType = 'pattern' } = body;
        
        if (!codeExample || !codebaseId) {
          return NextResponse.json(
            { error: 'CodeExample and codebaseId are required' },
            { status: 400 }
          );
        }

        console.log(`🔍 Finding similar patterns...`);

        const patternResults = await searchService.findSimilarPatterns(
          codeExample,
          codebaseId,
          patternType
        );

        return NextResponse.json({
          success: true,
          results: patternResults,
          metadata: {
            patternType,
            resultsCount: patternResults.chunks.length
          }
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('❌ Semantic search API error:', error);
    
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
    const { searchService } = initializeServices();
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const codebaseId = searchParams.get('codebaseId');

    if (action === 'health') {
      console.log('🏥 Performing health check...');
      
      const health = await searchService.healthCheck();
      
      return NextResponse.json({
        success: true,
        health,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'status' && codebaseId) {
      console.log(`📊 Getting status for codebase: ${codebaseId}`);
      
      // This would check if the codebase is indexed
      // For now, return a simple status
      return NextResponse.json({
        success: true,
        codebaseId,
        indexed: true, // This should be checked from Pinecone
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json(
      { error: 'Invalid GET request. Use POST for search operations.' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ Semantic search GET error:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
