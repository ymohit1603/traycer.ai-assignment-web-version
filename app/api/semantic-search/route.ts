import { NextRequest, NextResponse } from 'next/server';
import { SimilaritySearchService, SearchContext } from '../../lib/similaritySearch';
import { ContextAssemblyService, AssemblyOptions } from '../../lib/contextAssembly';

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
      assemblyOptions = {}
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

        console.log(`🧠 Searching with intelligent context assembly...`);

        // First, perform the semantic search
        const searchContext: SearchContext = {
          codebaseId,
          maxResults: options.maxResults || 15,
          relevanceThreshold: options.relevanceThreshold || 0.7,
          includeRelated: true,
          contextWindow: options.contextWindow || 5
        };

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

        const assembledContext = await contextAssemblyService.assembleContext(
          searchResults,
          codebaseId,
          assemblyOpts
        );

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
