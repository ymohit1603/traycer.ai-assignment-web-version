# Semantic Codebase Search & GitHub Integration Setup

This application provides semantic search capabilities for codebases with GitHub integration for automatic repository syncing and incremental indexing.

## Features

### ✨ Core Features
- **Semantic Chunking**: Code is broken down into meaningful chunks using AST parsing
- **Vector Embeddings**: Code chunks are converted to vector embeddings that capture semantic meaning
- **Pinecone Storage**: Embeddings stored in Pinecone vector database with metadata
- **Similarity Search**: Query using natural language to find semantically similar code
- **Intelligent Context Assembly**: Retrieves and assembles relevant code context for AI models
- **File Reading Indicator**: Shows progress similar to Cursor AI when processing files

### 🔄 GitHub Integration
- **OAuth Authentication**: Secure GitHub integration using OAuth
- **Repository Import**: Direct import from GitHub repositories (like Vercel)
- **Merkle Tree Change Detection**: Efficient change detection using cryptographic hashes
- **Incremental Indexing**: Only re-index changed files on new commits
- **Webhook Support**: Automatic re-indexing on push notifications (COMPLETED)
- **Real-time Sync**: Keeps codebase index synchronized with repository changes
- **Background Processing**: Webhook events processed asynchronously
- **Event Logging**: Complete audit trail of all webhook activities

## Required Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# OpenAI/OpenRouter API Configuration
OPEN_AI_API=your_openrouter_or_openai_api_key_here
NEXT_PUBLIC_OPEN_AI_API=your_openrouter_or_openai_api_key_here

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ENVIRONMENT=your_pinecone_environment_here

# GitHub OAuth Configuration (for repository integration)
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret

# GitHub Webhook Configuration (for auto-sync)
GITHUB_WEBHOOK_SECRET=your_webhook_secret_for_security
NEXTAUTH_URL=http://localhost:3000

# Optional: Custom Pinecone Index Name
PINECONE_INDEX_NAME=traycer-codebase-vectors
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set up OpenAI/OpenRouter API

1. Get an API key from [OpenRouter](https://openrouter.ai/) or [OpenAI](https://platform.openai.com/)
2. Add the key to your `.env.local` file

### 3. Set up Pinecone Vector Database

1. Create a free account at [Pinecone](https://www.pinecone.io/)
2. Create a new index with these settings:
   - **Dimensions**: 1536 (for text-embedding-3-small model)
   - **Metric**: cosine
   - **Cloud**: AWS (recommended)
   - **Region**: us-east-1 (recommended)
3. Get your API key and environment from the Pinecone dashboard
4. Add them to your `.env.local` file

### 4. Set up GitHub OAuth (for repository integration)

1. Go to GitHub → Settings → Developer settings → OAuth Apps
2. Create a new OAuth App with these settings:
   - **Application name**: Your app name
   - **Homepage URL**: `http://localhost:3000` (for development)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/github/callback`
3. Copy the Client ID and Client Secret to your `.env.local` file

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Use

### 1. Upload or Import Codebase

Choose one of two options:
- **Upload Files**: Click "Upload Codebase" to select a folder from your computer
- **Import from GitHub**: Click "Import from GitHub" to authenticate and select a repository

### 2. Semantic Indexing

The application will automatically:
- Parse code using AST to create semantic chunks
- Generate vector embeddings for each chunk
- Store embeddings in Pinecone with metadata
- Create a merkle tree for change detection (GitHub repos)

### 3. Search Your Codebase

Switch to "Semantic Search" mode and ask natural language questions:
- "How does user authentication work?"
- "Find similar error handling patterns"
- "Show me components that use the UserService"
- "Where is data validation implemented?"

### 4. View Results

The application provides:
- **Overview**: Statistics, languages, key patterns
- **Files**: Relevant files with sections and relevance scores
- **Code Segments**: Individual code chunks with context
- **Full Context**: Formatted text ready for AI consumption

### 5. GitHub Auto-Sync (✅ IMPLEMENTED)

For GitHub repositories, the system automatically:
- **Webhook Setup**: Automatically creates webhooks during repository import
- **Push Monitoring**: Receives notifications when code is pushed to the repository
- **Change Detection**: Uses merkle tree comparison to identify exactly what changed
- **Incremental Processing**: Only re-indexes modified, added, or deleted files
- **Background Processing**: Webhook events processed asynchronously without blocking
- **Real-time Updates**: Your semantic search stays synchronized with the latest code
- **Activity Monitoring**: View webhook activity and processing status in the UI

#### Webhook Workflow:
1. **Push Event**: Developer pushes changes to GitHub repository
2. **Webhook Triggered**: GitHub sends push notification to your application
3. **Change Analysis**: System compares new merkle tree with stored version
4. **Smart Indexing**: Only changed files are downloaded and re-indexed
5. **Vector Update**: Pinecone database updated with new/modified embeddings
6. **Search Ready**: Semantic search immediately reflects latest changes

## Architecture

### Semantic Chunking Pipeline
1. **AST Parsing**: Code → Semantic Chunks
2. **Embedding Generation**: Chunks → Vector Embeddings
3. **Vector Storage**: Embeddings → Pinecone Database
4. **Similarity Search**: Query → Relevant Chunks
5. **Context Assembly**: Chunks → Intelligent Context

### GitHub Integration Pipeline
1. **OAuth Authentication**: User → GitHub Access Token
2. **Repository Sync**: GitHub API → Local Merkle Tree
3. **Change Detection**: Old Tree vs New Tree → Change Set
4. **Incremental Indexing**: Changed Files → Vector Updates
5. **Webhook Monitoring**: Push Events → Auto Re-sync

## API Endpoints

### Semantic Search
- `POST /api/semantic-search` - Perform semantic search
- `POST /api/semantic-index` - Index codebase for search
- `GET /api/semantic-index?action=progress` - Check indexing progress

### GitHub Integration
- `GET /api/github?action=auth-url` - Get OAuth authorization URL
- `POST /api/github` - Repository operations (list, sync, etc.)
- `GET /api/auth/github/callback` - OAuth callback handler

### Webhook Processing
- `POST /api/github/webhook` - GitHub webhook endpoint (push events)
- `GET /api/github/webhook?action=status&eventId=X` - Check webhook processing status
- `GET /api/github/webhook?action=queue` - View webhook processing queue

## Troubleshooting

### Common Issues

1. **"No API key found"**: Make sure your `.env.local` file has the correct API keys
2. **"Failed to create index"**: Check your Pinecone configuration and API key
3. **"GitHub authentication failed"**: Verify your GitHub OAuth app settings
4. **"Search returns no results"**: Ensure your codebase has been properly indexed
5. **"Webhook setup failed"**: Check repository permissions and OAuth scopes
6. **"Webhook not receiving events"**: Verify NEXTAUTH_URL is publicly accessible
7. **"Auto-sync not working"**: Check webhook status in the UI and processing logs

### Debug Mode

Set `NODE_ENV=development` to see detailed logs in the console.

## Production Deployment

### Environment Setup
1. Set all environment variables in your hosting platform
2. For GitHub OAuth, update the callback URL to your production domain
3. Ensure your Pinecone index can handle production load

### Security Considerations
- GitHub access tokens are stored in HTTP-only cookies
- API keys should never be exposed to the client
- Consider implementing rate limiting for API endpoints

## Implementation Status

### ✅ Completed Features
- **Semantic chunking and vector embeddings** - Full AST-based code analysis
- **Pinecone integration** - Vector storage and similarity search
- **GitHub OAuth authentication** - Secure repository access
- **Repository import and sync** - Full codebase processing
- **Merkle tree change detection** - Efficient file change tracking
- **Incremental indexing** - Process only changed files
- **Webhook auto-sync** - Real-time repository synchronization
- **Background processing** - Async webhook event handling
- **Activity monitoring** - UI for webhook status and logs
- **Persistent storage** - Repository sync data management

### 🔧 Production Enhancements Needed
- **Database integration** - Replace localStorage with PostgreSQL/MongoDB
- **User authentication** - Multi-user support with proper auth
- **Enhanced security** - Encrypted token storage and webhook validation
- **Rate limiting** - API endpoint protection
- **Error monitoring** - Comprehensive error tracking and alerts
- **Performance optimization** - Caching and batch processing
- **Multi-repository dashboard** - Manage multiple connected repositories

## License

MIT License - feel free to use and modify as needed.
