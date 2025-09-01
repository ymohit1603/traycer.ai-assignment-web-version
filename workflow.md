# Traycer AI - Complete Workflow Documentation

## Overview
This document details the complete user journey from GitHub connection through repository import to implementation plan generation and execution tracking.

## User Journey Flow

### Phase 1: Initial Setup & Authentication

#### Step 1.1: GitHub OAuth Authentication
**Files Involved:**
- `app/components/GitHubImport.tsx` (Frontend)
- `app/api/auth/github/callback/route.ts` (OAuth Handler)

**Process Flow:**
```mermaid
graph TD
    A[User clicks 'Import from GitHub'] --> B[Redirect to GitHub OAuth]
    B --> C[GitHub OAuth Page]
    C --> D[User grants permissions]
    D --> E[GitHub redirects to callback]
    E --> F[app/api/auth/github/callback/route.ts]
    F --> G[Exchange code for access token]
    G --> H[Store token securely]
    H --> I[Return to main app]
    I --> J[Display authenticated state]
```

**Key Functions:**
- `GitHubImport.tsx:handleAuth()` - Initiates OAuth flow
- `callback/route.ts:POST()` - Handles OAuth callback and token exchange
- Token validation and storage in browser session

#### Step 1.2: Repository Selection
**Files Involved:**
- `app/components/GitHubImport.tsx`
- `app/api/github/route.ts`

**Process Flow:**
```mermaid
graph TD
    A[Authenticated User] --> B[Fetch user repositories]
    B --> C[app/api/github/route.ts:GET /api/github?type=all]
    C --> D[GitHub API: /user/repos]
    D --> E[Return repository list]
    E --> F[Display repository picker]
    F --> G[User selects repository]
    G --> H[Validate repository access]
    H --> I[Show repository details]
```

### Phase 2: Repository Import & Initial Indexing

#### Step 2.1: Repository Synchronization
**Files Involved:**
- `app/components/GitHubImport.tsx`
- `app/lib/githubService.ts`
- `app/lib/merkleTree.ts`
- `app/lib/similaritySearch.ts`

**Detailed Process Flow:**
```mermaid
graph TD
    A[User clicks 'Import Repository'] --> B[Initialize sync progress]
    B --> C[Create GitHubService instance]
    C --> D[Fetch repository contents]
    D --> E[GitHub API: GET /repos/{owner}/{repo}/contents]
    E --> F[Recursive directory traversal]
    F --> G[Filter binary/excluded files]
    G --> H[Create Merkle tree for change detection]
    H --> I[app/lib/merkleTree.ts:createMerkleTree()]
    I --> J[Process files for indexing]
    J --> K[Extract code structure via AST]
    K --> L[app/lib/codebaseParser.ts:parseFile()]
    L --> M[Generate semantic chunks]
    M --> N[app/lib/semanticChunking.ts:createChunks()]
    N --> O[Create vector embeddings]
    O --> P[app/lib/vectorEmbeddings.ts:generateEmbeddings()]
    P --> Q[Store in Pinecone vector DB]
    Q --> R[app/lib/pineconeService.ts:upsertVectors()]
    R --> S[Setup webhook for auto-sync]
    S --> T[GitHub API: POST /repos/{owner}/{repo}/hooks]
    T --> U[Store sync metadata]
    U --> V[Update UI with completion status]
```

**Key Data Structures:**
```typescript
interface SyncProgress {
  phase: 'fetching' | 'processing' | 'indexing' | 'complete';
  progress: number; // 0-100
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  errors: string[];
}
```

#### Step 2.2: Initial Codebase Analysis
**Files Involved:**
- `app/lib/codebaseParser.ts`
- `app/lib/contextAssembly.ts`
- `app/lib/semanticChunking.ts`

**Analysis Pipeline:**
```mermaid
graph TD
    A[Raw code files] --> B[Language detection]
    B --> C[AST parsing by language]
    C --> D[Extract code entities]
    D --> E[Function definitions]
    E --> F[Class definitions]
    F --> G[Import statements]
    G --> H[Export statements]
    H --> I[Variable declarations]
    I --> J[Type definitions]
    J --> K[Dependency analysis]
    K --> L[Complexity calculation]
    L --> M[Generate code chunks]
    M --> N[Context-aware splitting]
    N --> O[Maintain semantic relationships]
```

### Phase 3: Plan Generation

#### Step 3.1: Context Assembly
**Files Involved:**
- `app/lib/contextAssembly.ts`
- `app/lib/openAIService.ts`
- `app/lib/similaritySearch.ts`

**Context Preparation Flow:**
```mermaid
graph TD
    A[User prompt received] --> B[Analyze prompt intent]
    B --> C[Search for relevant code]
    C --> D[app/lib/similaritySearch.ts:search()]
    D --> E[Pinecone vector similarity search]
    E --> F[Rank and filter results]
    F --> G[Select top-k relevant chunks]
    G --> H[Assemble context window]
    H --> I[Optimize for token limits]
    I --> J[Include file metadata]
    J --> K[Add project structure info]
    K --> L[Prepare final context]
```

**Context Assembly Algorithm:**
1. **Query Expansion**: Enhance user prompt with semantic variations
2. **Multi-modal Search**: Combine vector similarity with keyword matching
3. **Relevance Filtering**: Remove low-relevance chunks based on scores
4. **Context Optimization**: Fit maximum relevant information within token limits
5. **Relationship Preservation**: Include related code chunks and dependencies

#### Step 3.2: AI Plan Generation
**Files Involved:**
- `app/lib/openAIService.ts`
- `app/components/PlanDisplay.tsx`

**Generation Pipeline:**
```mermaid
graph TD
    A[Context ready] --> B[Initialize OpenAI service]
    B --> C[Create structured prompt]
    C --> D[Send to OpenAI API]
    D --> E[Stream response with progress]
    E --> F[Parse structured response]
    F --> G[Validate plan structure]
    G --> H[Extract sections and items]
    H --> I[Calculate metadata]
    I --> J[Store plan in history]
    J --> K[Update UI with plan]
```

**Plan Structure:**
```typescript
interface GeneratedPlan {
  id: string;
  title: string;
  overview: string;
  sections: PlanSection[];
  metadata: PlanMetadata;
}

interface PlanSection {
  id: string;
  title: string;
  type: 'overview' | 'files' | 'dependencies' | 'steps';
  content: string;
  items: PlanItem[];
  priority: 'high' | 'medium' | 'low';
}
```

### Phase 4: Plan Refinement & Interaction

#### Step 4.1: Follow-up Questions
**Files Involved:**
- `app/lib/clarifyingQuestions.ts`
- `app/components/ClarifyingQuestions.tsx`

**Interactive Refinement:**
```mermaid
graph TD
    A[Plan generated] --> B[AI analyzes plan completeness]
    B --> C[Identify ambiguous areas]
    C --> D[Generate clarifying questions]
    D --> E[Present to user]
    E --> F[User provides answers]
    F --> G[Incorporate answers into context]
    G --> H[Regenerate refined plan]
    H --> I[app/lib/openAIService.ts:refinePlan()]
```

#### Step 4.2: Plan Refinement
**Files Involved:**
- `app/page.tsx:handleRefinePlan()`
- `app/lib/openAIService.ts:generateImplementationPlan()`

**Refinement Process:**
```mermaid
graph TD
    A[User provides feedback] --> B[Combine original prompt + feedback]
    B --> C[Create contextual prompt]
    C --> D[Include conversation history]
    D --> E[Generate refined plan]
    E --> F[Compare with original]
    F --> G[Highlight changes]
    G --> H[Save as new version]
    H --> I[app/lib/planHistory.ts:savePlan()]
```

### Phase 5: Implementation Tracking

#### Step 5.1: Progress Tracking
**Files Involved:**
- `app/components/PlanProgress.tsx`
- `app/lib/planHistory.ts`

**Tracking Workflow:**
```mermaid
graph TD
    A[Plan displayed] --> B[User marks items complete]
    B --> C[Update progress state]
    C --> D[Calculate completion percentage]
    D --> E[Store progress in history]
    E --> F[Generate progress reports]
    F --> G[Show remaining tasks]
    G --> H[Estimate time remaining]
```

#### Step 5.2: Plan History & Comparison
**Files Involved:**
- `app/components/PlanHistory.tsx`
- `app/lib/planHistory.ts`

**History Management:**
```mermaid
graph TD
    A[New plan generated] --> B[Auto-save to history]
    B --> C[Create searchable index]
    C --> D[Enable plan comparison]
    D --> E[Show version differences]
    E --> F[Track plan evolution]
    F --> G[Export/Share plans]
```

### Phase 6: Auto-Sync & Webhook Processing

#### Step 6.1: Webhook Event Processing
**Files Involved:**
- `app/api/github/webhook/route.ts`
- `app/lib/githubService.ts`
- `app/lib/merkleTree.ts`

**Webhook Flow:**
```mermaid
graph TD
    A[GitHub push event] --> B[Webhook endpoint receives event]
    B --> C[Verify webhook signature]
    C --> D[Validate event structure]
    D --> E[Queue for processing]
    E --> F[Background processing starts]
    F --> G[Retrieve stored Merkle tree]
    G --> H[Compare with current state]
    H --> I[Detect file changes]
    I --> J[Incremental sync]
    J --> K[Re-index changed files]
    K --> L[Update vector database]
    L --> M[Store new Merkle tree]
    M --> N[Log webhook event]
    N --> O[Update sync status]
```

**Change Detection Algorithm:**
```mermaid
graph TD
    A[New push received] --> B[Get latest commit SHA]
    B --> C[Compare with stored SHA]
    C --> D{Changes detected?}
    D -->|No| E[Skip processing]
    D -->|Yes| F[Fetch changed files]
    F --> G[Update Merkle tree]
    G --> H[Calculate diff]
    H --> I[Identify affected files]
    I --> J[Queue for re-indexing]
    J --> K[Update vector store]
    K --> L[Notify user of changes]
```

#### Step 6.2: Incremental Indexing
**Files Involved:**
- `app/lib/githubService.ts:incrementalSync()`
- `app/lib/similaritySearch.ts`

**Incremental Update Process:**
```mermaid
graph TD
    A[Changed files identified] --> B[Parse changed files]
    B --> C[Extract updated code structure]
    C --> D[Generate new embeddings]
    D --> E[Update Pinecone vectors]
    E --> F[Remove outdated vectors]
    F --> G[Update metadata]
    G --> H[Refresh search index]
    H --> I[Update codebase statistics]
    I --> J[Notify completion]
```

### Phase 7: Semantic Search & Analysis

#### Step 7.1: Natural Language Search
**Files Involved:**
- `app/components/SemanticSearch.tsx`
- `app/api/semantic-search/route.ts`
- `app/lib/similaritySearch.ts`

**Search Process:**
```mermaid
graph TD
    A[User enters query] --> B[Generate query embedding]
    B --> C[Search Pinecone index]
    C --> D[Apply filters and ranking]
    D --> E[Retrieve top results]
    E --> F[Group by file/relevance]
    F --> G[Add context snippets]
    G --> H[Format for display]
    H --> I[Show results with highlighting]
```

#### Step 7.2: Search Result Interaction
**Files Involved:**
- `app/components/SemanticSearchResults.tsx`

**Result Processing:**
```mermaid
graph TD
    A[Results displayed] --> B[User explores code chunks]
    B --> C[View full file context]
    C --> D[Navigate to related files]
    D --> E[Generate follow-up questions]
    E --> F[Refine search query]
    F --> G[Iterative exploration]
```

## Data Flow Architecture

### Storage Layer Interactions

```mermaid
graph TD
    subgraph "Frontend Layer"
        UI[React Components]
        State[Component State]
    end

    subgraph "API Layer"
        Auth[Auth API]
        GitHub[GitHub API]
        Semantic[Semantic Search API]
        Webhook[Webhook API]
    end

    subgraph "Service Layer"
        GitHubSvc[GitHub Service]
        AISvc[AI Service]
        VectorSvc[Vector Service]
        ParserSvc[Parser Service]
    end

    subgraph "Storage Layer"
        Local[Local Storage]
        Pinecone[Vector Database]
        Memory[In-Memory Cache]
    end

    UI --> State
    UI --> Auth
    UI --> GitHub
    UI --> Semantic

    Auth --> GitHubSvc
    GitHub --> GitHubSvc
    Semantic --> AISvc
    Semantic --> VectorSvc

    GitHubSvc --> ParserSvc
    AISvc --> ParserSvc

    GitHubSvc --> Local
    GitHubSvc --> Pinecone
    VectorSvc --> Pinecone
    ParserSvc --> Memory

    Webhook --> GitHubSvc
```

## Error Handling & Recovery

### Comprehensive Error Scenarios

1. **GitHub API Rate Limiting**
   - Automatic retry with exponential backoff
   - Queue processing for rate limit recovery
   - User notification of delays

2. **OpenAI API Quota Exceeded**
   - Graceful degradation to cached responses
   - User notification with upgrade suggestions
   - Alternative model fallback

3. **Vector Database Failures**
   - Local caching of embeddings
   - Retry mechanisms with circuit breakers
   - Offline mode capabilities

4. **Webhook Processing Failures**
   - Comprehensive logging for debugging
   - Manual retry mechanisms
   - Status tracking for failed events

## Performance Optimizations

### Caching Strategies
- **Embedding Cache**: Store frequently accessed embeddings
- **Parsed Code Cache**: Cache AST parsing results
- **Search Result Cache**: Cache common search queries
- **Metadata Cache**: Cache repository and file metadata

### Batch Processing
- **Bulk Vector Operations**: Process multiple files together
- **Parallel API Calls**: Concurrent processing where possible
- **Progressive Loading**: Stream results as they become available

### Incremental Updates
- **Merkle Tree Diffing**: Efficient change detection
- **Selective Re-indexing**: Only update changed files
- **Partial Updates**: Update only affected vector clusters

This comprehensive workflow ensures that Traycer AI provides a seamless, intelligent, and efficient experience for users working with codebases, from initial import through ongoing development and maintenance.
