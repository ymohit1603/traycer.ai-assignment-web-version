# Traycer AI - Codebase Implementation Planner

🚀 **Dark-themed AI-powered tool for generating detailed implementation plans from your codebase.**

Upload your project folder and get comprehensive, actionable plans for implementing new features or fixing issues using AI.

## ✨ Features

- **🌙 Dark Theme Interface** - Beautiful dark UI optimized for developers
- **📁 Direct Folder Upload** - One-click folder selection, no drag-and-drop needed
- **🤖 AI-Powered Planning** - Uses OpenRouter's free gpt-oss-20b:free model
- **🔍 Smart File Filtering** - Automatically excludes node_modules, build files, etc.
- **📊 Real-time Progress** - Live upload progress with detailed logging
- **🎯 Toast Notifications** - Instant feedback for all operations
- **🔧 Comprehensive Logging** - Detailed console logs for debugging

## 🛠️ Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env.local` file in the project root:

```bash
# Get your API key from https://openrouter.ai/keys
NEXT_PUBLIC_OPEN_AI_API=sk-or-v1-your-openrouter-api-key-here
```

### 3. Get Your OpenRouter API Key
1. Visit [OpenRouter Keys](https://openrouter.ai/keys)
2. Create a new API key (free tier available!)
3. Copy the key to your `.env.local` file

### 4. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start using Traycer AI!

## 🚀 How to Use

1. **Enter Your Prompt** - Describe what you want to implement in the central text area
2. **Upload Codebase** - Click "Upload Codebase" to select your project folder
3. **Generate Plan** - Click "Send" to index your codebase and generate an AI implementation plan
4. **Follow the Plan** - Get detailed, step-by-step instructions for your implementation

## 📋 Supported File Types

**Automatically processes:**
- JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C/C++ (`.c`, `.cpp`, `.h`, `.hpp`)
- C# (`.cs`)
- PHP (`.php`)
- Ruby (`.rb`)
- Go (`.go`)
- Rust (`.rs`)
- HTML/CSS (`.html`, `.css`, `.scss`)
- Configuration files (`.json`, `.yaml`, `.toml`)
- Documentation (`.md`, `.txt`)

**Automatically excludes:**
- Dependencies (`node_modules/`, `vendor/`)
- Build artifacts (`dist/`, `build/`, `.next/`)
- IDE files (`.vscode/`, `.idea/`)
- Binary files (`.exe`, `.dll`, images, videos)
- Lock files (`package-lock.json`, `yarn.lock`)

## 🔍 Development Features

### Console Logging
Every operation is logged with emojis for easy debugging:
- 🔄 Process start/progress
- ✅ Success operations  
- ❌ Error conditions
- 📁 File operations
- 🤖 AI API calls
- 📊 Statistics and metrics

### Toast Notifications
Real-time feedback for:
- ✅ Successful uploads
- ❌ Error messages
- 📊 Progress updates
- 🎉 Plan generation complete

## 📁 Project Structure

```
app/
├── components/
│   ├── PromptArea.tsx      # Dark-themed prompt input
│   ├── UploadProgress.tsx  # Progress tracking with logging
│   └── PlanDisplay.tsx     # AI-generated plan viewer
├── lib/
│   ├── openAIService.ts    # OpenRouter API integration
│   ├── codebaseParser.ts   # File parsing and indexing
│   └── storageManager.ts   # Local storage management
└── page.tsx                # Main application with upload logic
```

## 🌟 Key Improvements

- **One-Click Upload**: Direct folder selection without drag-and-drop
- **Smart Filtering**: Automatic exclusion of unwanted files
- **Environment-Based Auth**: API key from environment variables
- **Comprehensive Logging**: Full operation visibility in console
- **Toast Feedback**: Instant user notifications
- **Dark Theme**: Professional dark interface
- **Error Handling**: Robust error handling with user feedback

## 🚨 Troubleshooting

**Upload Issues:**
- Check console logs for detailed error information
- Ensure you're selecting a folder (not individual files)
- Verify the folder contains supported file types

**API Errors:**
- Verify your OpenRouter API key in `.env.local`
- Check console for API-specific error messages
- Ensure you have credits/quota remaining

**Performance:**
- Large codebases (>1000 files) may take longer to process
- Files over 1MB are automatically skipped for content reading
- All operations are logged for performance monitoring

## 📄 License

This project is built with [Next.js](https://nextjs.org) and uses [OpenRouter](https://openrouter.ai) for AI functionality.
