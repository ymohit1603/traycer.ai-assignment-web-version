# Traycer AI - Working Architecture

## Overview
Traycer AI is a sophisticated AI-powered code analysis and implementation planning platform that combines semantic search, GitHub integration, and AI-driven plan generation to help developers understand, analyze, and implement changes in their codebases.

## Core Architecture

### 1. Frontend Layer (`/app`)
The main user interface built with Next.js 15 and React 19.

#### Main Components:
- **`page.tsx`** - Main application component handling:
  - File/folder upload processing
  - Codebase indexing workflow
  - Plan generation orchestration
  - GitHub repository import
  - Semantic search mode switching
  - Progress tracking and state management

#### Component Breakdown:
- **`PromptArea.tsx`** - User input interface for implementation requests
- **`FileUpload.tsx`** - Local file/folder selection and processing
- **`FileTree.tsx`** - Visual representation of uploaded files
- **`GitHubImport.tsx`** - GitHub OAuth authentication and repository selection
- **`PlanDisplay.tsx`** - AI-generated implementation plans with interactive features
- **`SemanticSearch.tsx`** - Natural language codebase search interface
- **`PlanProgress.tsx`** - Progress tracking for plan implementation
- **`WebhookStatus.tsx`** - GitHub webhook monitoring and status

### 2. API Layer (`/app/api`)

#### Authentication (`/auth/github/`)
- **`callback/route.ts`** - OAuth callback handler for GitHub authentication
- Handles token exchange and user session management

#### GitHub Integration (`/github/`)
- **`route.ts`** - Main GitHub API endpoints:
  - Repository listing and search
  - Repository synchronization
  - Webhook setup and management
- **`webhook/route.ts`** - Webhook event processing:
  - Push event handling for auto-sync
  - Incremental indexing on repository changes
  - Change detection using Merkle trees

#### AI Services (`/semantic-*`)
- **`semantic-index/route.ts`** - Codebase indexing API
- **`semantic-search/route.ts`** - Vector similarity search API

### 3. Core Services Layer (`/app/lib`)

#### Code Analysis Engine:
- **`codebaseParser.ts`** - AST-based code parsing and analysis
  - Supports multiple languages (JS/TS, Python, Java, etc.)
  - Extracts functions, classes, imports, exports
  - Calculates code complexity and dependencies
- **`semanticChunking.ts`** - Intelligent code chunking for embeddings
  - Context-aware code splitting
  - Maintains semantic relationships
  - Optimizes for vector search

#### AI Integration:
- **`openAIService.ts`** - OpenAI API integration
  - Implementation plan generation
  - Code analysis and suggestions
  - Context-aware prompting
- **`vectorEmbeddings.ts`** - Text embedding generation
  - OpenAI embeddings for semantic search
  - Batch processing and caching

#### Vector Database:
- **`pineconeService.ts`** - Pinecone vector database management
  - Index creation and management
  - Vector upsert and search operations
  - Metadata handling and filtering
- **`similaritySearch.ts`** - Semantic search implementation
  - Hybrid search combining multiple signals
  - Relevance ranking and filtering

#### GitHub Integration:
- **`githubService.ts`** - GitHub API client
  - Repository operations (fetch, sync, webhook setup)
  - Incremental sync with change detection
  - Rate limiting and error handling
- **`merkleTree.ts`** - Change detection system
  - File system state tracking
  - Efficient change detection
  - Incremental sync optimization

#### Storage & Management:
- **`storageManager.ts`** - Local storage abstraction
  - Codebase metadata management
  - Search engine interface
  - Caching and persistence
- **`repositoryStorage.ts`** - GitHub repository data management
  - Repository sync state tracking
  - Webhook event logging
  - Access token management
- **`planHistory.ts`** - Implementation plan history
  - Plan versioning and comparison
  - Progress tracking
  - Metadata and tagging

#### Utility Services:
- **`contextAssembly.ts`** - Context preparation for AI
  - Relevant code snippet selection
  - Context window optimization
  - Multi-file context assembly
- **`clarifyingQuestions.ts`** - Dynamic requirement gathering
  - AI-driven question generation
  - User interaction management

### 4. Data Flow Architecture

#### File Upload Workflow:
1. **File Processing** (`page.tsx:processUploadedFiles`)
   - Filter out unwanted files (node_modules, binaries, etc.)
   - Read text file contents with size limits
   - Create `UploadedFile[]` structure

2. **Codebase Indexing** (`page.tsx:indexCodebaseFiles`)
   - Parse files using `CodebaseParser`
   - Extract functions, classes, imports, exports
   - Store in local storage via `StorageManager`

3. **Vector Indexing** (`semanticChunking.ts`, `pineconeService.ts`)
   - Split code into semantic chunks
   - Generate embeddings using OpenAI
   - Store vectors in Pinecone with metadata

#### GitHub Import Workflow:
1. **Authentication** (`GitHubImport.tsx`, `auth/github/callback/`)
   - OAuth flow with GitHub
   - Token storage and validation

2. **Repository Sync** (`githubService.ts:syncRepository`)
   - Fetch repository contents recursively
   - Create Merkle tree for change detection
   - Index files and generate embeddings

3. **Webhook Setup** (`githubService.ts:setupWebhook`)
   - Register webhook for push events
   - Configure auto-sync triggers

#### Plan Generation Workflow:
1. **Context Assembly** (`contextAssembly.ts`)
   - Find relevant code snippets
   - Prepare context for AI model
   - Optimize token usage

2. **AI Processing** (`openAIService.ts:generateImplementationPlan`)
   - Send context to OpenAI API
   - Generate structured implementation plan
   - Parse and format response

3. **Plan Enhancement** (`planHistory.ts`)
   - Save plan to history
   - Enable comparison and refinement
   - Track implementation progress

#### Semantic Search Workflow:
1. **Query Processing** (`semantic-search/route.ts`)
   - Receive natural language query
   - Generate query embedding

2. **Vector Search** (`pineconeService.ts:search`)
   - Query Pinecone index
   - Apply filters and ranking
   - Retrieve relevant code chunks

3. **Result Formatting** (`SemanticSearchResults.tsx`)
   - Group and rank results
   - Display with context
   - Enable follow-up interactions

### 5. Key Design Patterns

#### Service Layer Pattern:
- Each major functionality encapsulated in service classes
- Dependency injection through constructor parameters
- Async/await for all I/O operations

#### Repository Pattern:
- Abstract data access through service interfaces
- Consistent error handling and logging
- Caching and optimization layers

#### Event-Driven Architecture:
- Webhook events trigger background processing
- Progress callbacks for real-time updates
- Queue-based processing for scalability

#### Context Assembly Pattern:
- Intelligent selection of relevant code
- Token optimization for AI models
- Multi-modal context (code, metadata, relationships)

### 6. Error Handling & Resilience

#### Comprehensive Error Boundaries:
- Try-catch blocks at all API boundaries
- Graceful degradation for failed operations
- User-friendly error messages

#### Rate Limiting & Throttling:
- GitHub API rate limit handling
- OpenAI API quota management
- Batch processing with backoff strategies

#### Data Validation:
- Input sanitization and validation
- Type checking with TypeScript
- Runtime schema validation

### 7. Performance Optimizations

#### Caching Strategies:
- Local storage for parsed codebases
- Vector embedding caching
- Metadata caching for frequent queries

#### Incremental Processing:
- Merkle tree-based change detection
- Selective re-indexing of changed files
- Progressive loading and streaming

#### Batch Operations:
- Bulk vector operations in Pinecone
- Parallel file processing
- Optimized API batching

### 8. Security Considerations

#### API Key Management:
- Environment variable configuration
- Secure token storage
- Access token rotation

#### Webhook Security:
- Signature verification for GitHub webhooks
- Secure webhook secret generation
- Access control for webhook endpoints

#### Data Privacy:
- Local processing where possible
- Secure token handling
- Minimal data retention

This architecture enables Traycer AI to provide intelligent, context-aware code analysis and implementation planning while maintaining high performance, security, and scalability.
