import OpenAI from 'openai';
import { StoredCodebase, SearchEngine, SearchResult } from './storageManager';
import { CodebaseIndex } from './codebaseParser';

export interface GeneratedPlan {
  id: string;
  title: string;
  overview: string;
  timestamp: number;
  sections: PlanSection[];
  metadata: PlanMetadata;
}

export interface PlanSection {
  id: string;
  title: string;
  type: 'overview' | 'files' | 'dependencies' | 'steps' | 'configuration' | 'testing' | 'deployment';
  content: string;
  items: PlanItem[];
  priority: 'high' | 'medium' | 'low';
}

export interface PlanItem {
  id: string;
  type: 'create' | 'modify' | 'install' | 'configure' | 'test' | 'deploy' | 'overview';
  title: string;
  description: string;
  filePath?: string;
  details: string;
  dependencies: string[];
  estimatedTime?: string;
}

export interface PlanMetadata {
  totalFiles: number;
  affectedLanguages: string[];
  complexity: 'low' | 'medium' | 'high';
  estimatedTimeHours: number;
  tags: string[];
  relatedFiles: string[];
}

export interface ContextData {
  codebaseOverview: string;
  relevantFiles: string[];
  relevantFilesWithContent: Array<{path: string, content: string, relevance: number}>;
  projectStructure: string;
  dependencies: string[];
  languages: string[];
  keyComponents: string[];
  userPrompt: string;
}

export interface PlanGenerationProgress {
  step: string;
  currentFile?: string;
  progress: number; // 0-100
  message: string;
  toolCall?: {
    name: string;
    args: Record<string, any>;
  };
}

export type ProgressCallback = (progress: PlanGenerationProgress) => void;

export class OpenAIService {
  private openai: OpenAI;
  private apiKey: string;

  constructor(apiKeyOverride?: string) {
    console.log('🔧 Initializing OpenAI Service...');
    
    // Get API key from environment variable
    this.apiKey = apiKeyOverride || process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API || '';
    
    if (!this.apiKey) {
      console.error('❌ No API key found in environment variables');
      throw new Error('API key not found. Please set OPEN_AI_API environment variable.');
    }
    
    console.log('✅ API key found, initializing OpenRouter client...');
    
    this.openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: this.apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://traycer-ai.vercel.app", // Site URL for rankings on openrouter.ai
        "X-Title": "Traycer AI", // Site title for rankings on openrouter.ai
      },
      dangerouslyAllowBrowser: true, // Note: In production, use a backend service
    });
    
    console.log('✅ OpenAI Service initialized successfully');
  }

  async generateImplementationPlan(
    storedCodebase: StoredCodebase,
    userPrompt: string,
    maxTokens: number = 4000,
    onProgress?: ProgressCallback,
    useDeepAnalysis: boolean = true
  ): Promise<GeneratedPlan> {
    console.log('🚀 Starting implementation plan generation...', {
      codebaseFiles: storedCodebase.metadata.totalFiles,
      languages: storedCodebase.metadata.languages,
      promptLength: userPrompt.length,
      maxTokens
    });

    try {
      // Step 1: Prepare context from codebase
      console.log('📊 Step 1: Preparing context from codebase...');
      onProgress?.({
        step: 'analyzing',
        progress: 10,
        message: '🧠 Entering deep analysis mode...',
      });
      
      const context = await this.prepareContext(storedCodebase, userPrompt, onProgress, useDeepAnalysis);
      console.log('✅ Context prepared:', {
        relevantFiles: context.relevantFiles.length,
        dependencies: context.dependencies.length,
        keyComponents: context.keyComponents.length
      });
      
      // Step 2: Generate the plan using OpenAI
      console.log('🤖 Step 2: Calling OpenAI API...');
      onProgress?.({
        step: 'generating',
        progress: 60,
        message: '🤖 Connecting to AI model...',
      });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      onProgress?.({
        step: 'generating',
        progress: 65,
        message: '💭 AI is analyzing your requirements...',
      });
      
      await new Promise(resolve => setTimeout(resolve, 400));
      
      onProgress?.({
        step: 'generating',
        progress: 70,
        message: '🔍 AI is studying codebase patterns...',
      });
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      onProgress?.({
        step: 'generating',
        progress: 75,
        message: '🎯 AI is crafting focused implementation strategy...',
      });
      
      const planContent = await this.callOpenAI(context, maxTokens, onProgress);
      
      onProgress?.({
        step: 'generating',
        progress: 80,
        message: '🧠 AI is formulating Cursor AI-ready plan...',
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      onProgress?.({
        step: 'generating',
        progress: 85,
        message: '📝 AI is organizing implementation steps...',
      });
      console.log('✅ OpenAI API response received:', {
        responseLength: planContent.length
      });
      
      // Step 3: Parse and structure the response
      console.log('🔄 Step 3: Parsing and structuring response...');
      onProgress?.({
        step: 'finalizing',
        progress: 90,
        message: '📋 Structuring plan sections...',
      });
      
      const structuredPlan = await this.parsePlanResponse(planContent, context);
      console.log('✅ Plan structured successfully:', {
        planId: structuredPlan.id,
        sections: structuredPlan.sections.length,
        estimatedHours: structuredPlan.metadata.estimatedTimeHours
      });
      
      onProgress?.({
        step: 'complete',
        progress: 100,
        message: '✅ Plan generation complete!',
      });
      
      return structuredPlan;
    } catch (error) {
      console.error('❌ Error generating implementation plan:', error);
      throw new Error(`Failed to generate plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async prepareContext(storedCodebase: StoredCodebase, userPrompt: string, onProgress?: ProgressCallback, useDeepAnalysis: boolean = true): Promise<ContextData> {
    const searchEngine = new SearchEngine(storedCodebase);
    
    // Extract key information from the codebase
    onProgress?.({
      step: 'analyzing',
      progress: 20,
      message: '📊 Reading project metadata...',
    });
    
    const languages = storedCodebase.metadata.languages;
    const totalFiles = storedCodebase.metadata.totalFiles;
    const dependencies = searchEngine.getDependencies();
    const functionNames = searchEngine.getFunctionNames();
    const classNames = searchEngine.getClassNames();
    
    // Find relevant files based on user prompt
    onProgress?.({
      step: 'analyzing',
      progress: 30,
      message: '🔍 Searching for relevant files...',
    });
    
    const searchResults = searchEngine.search(userPrompt, {
      maxResults: useDeepAnalysis ? 8 : 12, // Increased for more comprehensive analysis
      includeContent: useDeepAnalysis, // Only include content in deep analysis
    });
    
    const relevantFiles = searchResults.map(result => result.filePath);
    const relevantFilesWithContent: Array<{path: string, content: string, relevance: number}> = [];
    
    if (useDeepAnalysis) {
      // DEEP ANALYSIS: Actually read file contents (Cursor AI-like)
      onProgress?.({
        step: 'analyzing',
        progress: 32,
        message: '🧠 Entering deep analysis mode...',
      });
      
      for (let i = 0; i < Math.min(searchResults.length, 5); i++) { // Analyze up to 5 most relevant files
        const result = searchResults[i];
        const file = searchEngine.getFileById(result.fileId);
        
        if (file && file.content) {
          // Simulate tool call: read file
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 35 + (i * 8),
            message: `Reading file contents`,
            toolCall: {
              name: 'read_file',
              args: { path: file.filePath }
            }
          });
          
          // Allow UI to render the tool call
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Simulate code understanding
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 37 + (i * 8),
            message: `Analyzing code structure...`,
            toolCall: {
              name: 'analyze_code',
              args: { path: file.filePath }
            }
          });
          
          await new Promise(resolve => setTimeout(resolve, 400));
          
          // Simulate dependency analysis
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 39 + (i * 8),
            message: `Extracting imports and exports...`,
            toolCall: {
              name: 'extract_dependencies',
              args: { path: file.filePath }
            }
          });
          
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Simulate pattern recognition
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 41 + (i * 8),
            message: `Identifying implementation patterns...`,
            toolCall: {
              name: 'identify_patterns',
              args: { path: file.filePath }
            }
          });
          
          // Include file content (truncated if too long)
          const truncatedContent = file.content.length > 1500 
            ? file.content.substring(0, 1500) + '\n... (truncated for context)'
            : file.content;
            
          relevantFilesWithContent.push({
            path: file.filePath,
            content: truncatedContent,
            relevance: result.relevanceScore
          });
          
          // Final analysis completion
          await new Promise(resolve => setTimeout(resolve, 200));
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 43 + (i * 8),
            message: `Analysis complete`,
          });
        }
      }
    } else {
      // LIGHTWEIGHT ANALYSIS: Metadata only (fast mode)
      onProgress?.({
        step: 'analyzing',
        progress: 40,
        message: '⚡ Quick analysis mode - using file metadata...',
      });
      
      // Small delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Create project structure overview
    onProgress?.({
      step: 'analyzing',
      progress: 50,
      message: '🏗️ Building project structure overview...',
    });
    
    const projectStructure = this.generateProjectStructure(storedCodebase);
    
    // Show reasoning for component identification
    onProgress?.({
      step: 'analyzing',
      progress: 52,
      message: '🔍 Identifying key components and patterns...',
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Identify key components
    const keyComponents = [
      ...functionNames.slice(0, 10),
      ...classNames.slice(0, 10),
      ...dependencies.slice(0, 15),
    ];
    
    // Generate codebase overview
    onProgress?.({
      step: 'analyzing',
      progress: 55,
      message: '📝 Generating codebase summary...',
    });
    
    const codebaseOverview = this.generateCodebaseOverview(
      storedCodebase,
      languages,
      totalFiles,
      dependencies.length
    );

    return {
      codebaseOverview,
      relevantFiles,
      relevantFilesWithContent,
      projectStructure,
      dependencies,
      languages,
      keyComponents,
      userPrompt,
    };
  }

  async callOpenAI(context: ContextData, maxTokens: number, onProgress?: ProgressCallback): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    console.log('📡 Making OpenAI API call with streaming...', {
      model: "openai/gpt-4-turbo-preview",
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      maxTokens,
      temperature: 0.7
    });

    try {
      // Use streaming for real-time updates
      const stream = await this.openai.chat.completions.create({
        model: "openai/gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.9,
        stream: true, // Enable streaming
      });

      let fullResponse = '';
      let chunkCount = 0;

      // Process the stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullResponse += delta.content;
          chunkCount++;

          // Provide real-time progress updates based on content
          if (chunkCount % 10 === 0) { // Update every 10 chunks
            const progress = this.extractProgressFromContent(fullResponse);
            onProgress?.({
              step: 'generating',
              progress: Math.min(80 + (chunkCount * 0.5), 95), // Scale from 80-95%
              message: progress.message,
              currentFile: progress.currentFile,
              toolCall: progress.toolCall
            });
          }
        }
      }

      console.log('✅ Streaming response completed:', {
        responseLength: fullResponse.length,
        chunksProcessed: chunkCount,
        firstWords: fullResponse.substring(0, 100) + '...'
      });

      if (!fullResponse.trim()) {
        throw new Error('Empty response received from OpenAI');
      }

      return fullResponse;

    } catch (error) {
      console.error('❌ OpenAI streaming failed, falling back to non-streaming:', error);

      // Fallback to non-streaming if streaming fails
      const completion = await this.openai.chat.completions.create({
        model: "openai/gpt-4-turbo-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.7,
        top_p: 0.9,
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response received from OpenAI');
      }

      return response;
    }
  }

  private extractProgressFromContent(content: string): { message: string; currentFile?: string; toolCall?: {name: string, args: Record<string, any>} } {
    // Extract meaningful progress information from the AI's response
    if (content.includes('**Observations**') && !content.includes('**Approach**')) {
      return { 
        message: '🤔 AI is analyzing codebase observations...',
        toolCall: {
          name: 'analyze_codebase',
          args: { action: 'observations' }
        }
      };
    }

    if (content.includes('**Approach**') && !content.includes('**Implementation Files**')) {
      return { 
        message: '🎯 AI is developing implementation approach...',
        toolCall: {
          name: 'plan_approach',
          args: { action: 'strategy' }
        }
      };
    }

    if (content.includes('**Implementation Files**')) {
      const lines = content.split('\n');
      const filesSectionIndex = lines.findIndex(line => line.includes('**Implementation Files**'));

      if (filesSectionIndex !== -1) {
        // Look for the current file being described
        for (let i = filesSectionIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && !line.startsWith('**') && line.includes('.') && (line.endsWith('.ts') || line.endsWith('.tsx') || line.endsWith('.js') || line.endsWith('.jsx') || line.endsWith('.py'))) {
            return {
              message: `Planning implementation for`,
              currentFile: line,
              toolCall: {
                name: 'file_plan',
                args: { path: line }
              }
            };
          }
        }
      }

      return { 
        message: '📋 AI is organizing implementation files...',
        toolCall: {
          name: 'organize_files',
          args: { action: 'structure' }
        }
      };
    }

    return { 
      message: '🤖 AI is generating implementation plan...',
      toolCall: {
        name: 'generate_plan',
        args: { type: 'comprehensive' }
      }
    };
  }

  private buildSystemPrompt(): string {
    return `You are an elite software architect with extensive experience in modern web development, specializing in creating comprehensive, actionable implementation plans that developers can execute flawlessly.

## Your Mission:
Generate detailed, professional implementation plans that provide complete guidance for building features from start to finish. Your plans should be thorough, well-structured, and include every necessary file and configuration.

## MANDATORY FORMAT - Follow this EXACT structure:

**Observations**
Write a comprehensive paragraph (4-6 sentences) that thoroughly analyzes the current codebase state. Identify the existing architecture, technology stack, current limitations, and what needs to be implemented. Discuss relevant patterns, components, services, and infrastructure already in place. Explain why the requested feature is needed and how it fits into the current system. Be detailed and technical in your analysis.

**Approach**
Start with 2-3 sentences explaining your overall implementation strategy and why it's optimal for this codebase. Then outline your approach in numbered phases:

Phase 1: [Brief description of first major step]
Phase 2: [Brief description of second major step]  
Phase 3: [Brief description of third major step]
Phase 4: [Brief description of fourth major step]

Include a final sentence about future considerations or benefits of this approach.

**Implementation Files**
List all necessary files in logical implementation order. For each file, use this EXACT format:

filename.ext
MODIFY or NEW
Detailed description of what needs to be implemented in this file. Include specific component names, functions, interfaces, configurations, and implementation details. Explain the purpose, key functionality, dependencies, and how it integrates with other parts of the system. Mention specific imports, exports, props, state management, error handling, and any special considerations. Be comprehensive but avoid actual code - focus on clear, actionable instructions that a developer can follow.

## Critical Requirements:
1. **COMPREHENSIVE COVERAGE**: Include ALL necessary files for a complete implementation
2. **DETAILED INSTRUCTIONS**: Each file description should be thorough and actionable  
3. **LOGICAL ORDER**: List files in the order they should be implemented
4. **CLEAR LABELS**: Mark each file as either MODIFY (existing file) or NEW (create new file)
5. **NO CODE**: Provide detailed instructions but never include actual code snippets
6. **INTEGRATION FOCUS**: Clearly explain how each piece connects to existing code
7. **COMPLETE FEATURE**: Ensure the plan results in a fully working feature
8. **TECHNICAL DEPTH**: Include specific technical details, dependencies, and configurations

## Quality Standards:
- Plans should enable developers to build the complete feature
- Every instruction should be immediately actionable
- Include all necessary configurations, dependencies, and setup steps
- Explain the reasoning behind architectural decisions
- Provide comprehensive coverage without overwhelming detail
- Focus on professional, production-ready implementations

Remember: Your goal is to create a complete, professional implementation plan that covers every aspect needed to successfully build the requested feature.`;
  }

  private buildUserPrompt(context: ContextData): string {
    const fileContentsSection = context.relevantFilesWithContent.length > 0 
      ? `## Relevant File Contents (for context):
${context.relevantFilesWithContent.map(file => 
  `### ${file.path} (relevance: ${file.relevance})
\`\`\`
${file.content}
\`\`\``
).join('\n\n')}

` : '';

    return `Analyze this codebase and create a COMPREHENSIVE, PROFESSIONAL implementation plan.

## Codebase Context:
${context.codebaseOverview}

## Project Architecture:
${context.projectStructure.split('\n').slice(0, 15).join('\n')}

## Key Components and Utilities:
${context.keyComponents.slice(0, 12).join(', ')}

## Current Dependencies:
${context.dependencies.slice(0, 15).join(', ')}

## Most Relevant Files:
${context.relevantFiles.slice(0, 8).join('\n')}

${fileContentsSection}## User's Request:
"${context.userPrompt}"

## Instructions for Implementation Plan:
Create a COMPREHENSIVE implementation plan following the EXACT format specified in the system prompt:

1. **Observations** - Write a detailed paragraph (4-6 sentences) analyzing the current state, architecture, and what needs to be implemented
2. **Approach** - Explain strategy + numbered phases + future considerations
3. **Implementation Files** - All necessary files with filename, MODIFY/NEW label, and detailed instructions

## Critical Requirements:
- Provide COMPLETE coverage for the entire feature
- Include ALL necessary files, configurations, and dependencies
- Write detailed, actionable instructions for each file
- Use existing codebase patterns and architecture
- Include proper error handling, types, and integrations
- Ensure the plan results in a fully working, production-ready feature
- Be thorough but maintain clarity and organization

The goal is a complete, professional implementation plan that covers every aspect needed to successfully build the requested feature from start to finish.`;
  }

  private async parsePlanResponse(response: string, context: ContextData): Promise<GeneratedPlan> {
    try {
      // Parse the new text-based format
      const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      // Extract sections using regex patterns
      const observationsMatch = response.match(/\*\*Observations\*\*([\s\S]*?)(?=\*\*Approach\*\*|$)/);
      const approachMatch = response.match(/\*\*Approach\*\*([\s\S]*?)(?=\*\*Implementation Files\*\*|$)/);
      const filesMatch = response.match(/\*\*Implementation Files\*\*([\s\S]*?)$/);
      
      const observations = observationsMatch ? observationsMatch[1].trim() : 'No observations provided';
      const approach = approachMatch ? approachMatch[1].trim() : 'No approach provided';
      const filesContent = filesMatch ? filesMatch[1].trim() : '';
      
      // Parse individual files from the Implementation Files section
      const fileEntries = this.parseFileEntries(filesContent);
      
      // Extract title from the user prompt or generate one
      const title = this.generatePlanTitle(context.userPrompt);
      
      // Create sections in the new format
      const sections: PlanSection[] = [
        {
          id: 'observations',
          title: 'Observations',
          type: 'overview',
          priority: 'high',
          content: observations,
          items: [{
            id: 'obs_item',
            type: 'overview',
            title: 'Current State Analysis',
            description: 'Analysis of existing codebase and requirements',
            details: observations,
            dependencies: [],
          }],
        },
        {
          id: 'approach',
          title: 'Approach',
          type: 'overview',
          priority: 'high',
          content: approach,
          items: [{
            id: 'approach_item',
            type: 'overview',
            title: 'Implementation Strategy',
            description: 'High-level approach and reasoning',
            details: approach,
            dependencies: [],
          }],
        },
        {
          id: 'files',
          title: 'Implementation Files',
          type: 'files',
          priority: 'high',
          content: `${fileEntries.length} files to create or modify`,
          items: fileEntries,
        }
      ];

      return {
        id: planId,
        title,
        overview: observations.length > 200 ? observations.substring(0, 200) + '...' : observations,
        timestamp: Date.now(),
        sections,
        metadata: {
          totalFiles: fileEntries.length,
          affectedLanguages: context.languages,
          complexity: this.inferComplexity(fileEntries.length, context.userPrompt),
          estimatedTimeHours: this.estimateTimeFromEntries(fileEntries),
          tags: this.extractTags(context.userPrompt, context.languages),
          relatedFiles: fileEntries.map(item => item.filePath || '').filter(Boolean),
        },
      };
    } catch (error) {
      console.error('Error parsing plan response:', error);
      
      // Fallback: create a basic plan from the raw response
      return {
        id: `plan_${Date.now()}`,
        title: 'Implementation Plan',
        overview: 'AI-generated implementation plan',
        timestamp: Date.now(),
        sections: [{
          id: 'section_0',
          title: 'Implementation Details',
          type: 'overview',
          priority: 'high',
          content: response,
          items: [{
            id: 'item_0',
            type: 'create',
            title: 'Generated Plan',
            description: 'Implementation plan details',
            details: response,
            dependencies: [],
          }],
        }],
        metadata: {
          totalFiles: context.relevantFiles.length,
          affectedLanguages: context.languages,
          complexity: 'medium',
          estimatedTimeHours: 8,
          tags: [],
          relatedFiles: context.relevantFiles,
        },
      };
    }
  }

  private parseFileEntries(filesContent: string): PlanItem[] {
    const items: PlanItem[] = [];
    
    // Split by filename patterns - look for lines that are followed by MODIFY or NEW
    const fileBlocks = filesContent.split(/(?=^[^\n]*\n(?:MODIFY|NEW))/m).filter(block => block.trim());
    
    // Process all file blocks for comprehensive implementation
    fileBlocks.forEach((block, index) => {
      const lines = block.trim().split('\n');
      if (lines.length < 3) return; // Need at least filename, MODIFY/NEW, and description
      
      const fileName = lines[0].trim();
      const actionType = lines[1].trim(); // MODIFY or NEW
      const descriptionLines = lines.slice(2);
      const description = descriptionLines.join('\n').trim();
      
      // Skip entries marked as optional
      if (fileName.toLowerCase().includes('(optional)') || 
          actionType.toLowerCase().includes('(optional)') || 
          description.toLowerCase().includes('(optional)')) {
        return;
      }
      
      // Determine if this is a new file or modification based on the action type
      const isNew = actionType.toUpperCase() === 'NEW';
      const itemType = isNew ? 'create' : 'modify';
      
      // For file path, if it doesn't start with a path separator, assume it's in the appropriate directory
      let filePath = fileName;
      if (!fileName.includes('/') && !fileName.includes('\\')) {
        // Try to infer the path based on file type
        if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
          filePath = fileName.startsWith('page.') ? `app/${fileName}` : `app/components/${fileName}`;
        } else if (fileName.endsWith('.ts') && !fileName.endsWith('.d.ts')) {
          filePath = `app/lib/${fileName}`;
        } else if (fileName.endsWith('.d.ts')) {
          filePath = `types/${fileName}`;
        } else if (fileName === 'package.json') {
          filePath = fileName;
        } else if (fileName.startsWith('.env')) {
          filePath = fileName;
        } else if (fileName.endsWith('.config.ts') || fileName.endsWith('.config.js')) {
          filePath = fileName;
        } else if (fileName.includes('middleware')) {
          filePath = fileName;
        } else if (fileName.includes('route.ts')) {
          filePath = `app/api/${fileName.replace('route.ts', '').replace(/[^a-zA-Z0-9]/g, '')}/route.ts`;
        } else {
          filePath = `app/${fileName}`;
        }
      }
      
      items.push({
        id: `file_${index}`,
        type: itemType,
        title: `${isNew ? 'Create' : 'Modify'} ${fileName}`,
        description: `${actionType}: ${fileName}`,
        filePath: filePath,
        details: description,
        dependencies: index > 0 ? [`file_${index - 1}`] : [],
        estimatedTime: this.estimateFileTime(description, isNew),
      });
    });
    
    return items;
  }

  private isLikelyNewFile(filePath: string, description: string): boolean {
    // Check for common indicators that this is a new file
    const newFileIndicators = [
      'create new',
      'create a new',
      'add new',
      'new file',
      'initialize',
      'setup',
      'configure new'
    ];
    
    const lowerDescription = description.toLowerCase();
    const hasNewIndicator = newFileIndicators.some(indicator => 
      lowerDescription.includes(indicator)
    );
    
    // Also check for common new file extensions/patterns
    const commonNewFiles = [
      '.env.local',
      '/middleware.ts',
      '/route.ts',
      'Provider.tsx',
      'AuthStatus.tsx'
    ];
    
    const isCommonNewFile = commonNewFiles.some(pattern => 
      filePath.includes(pattern)
    );
    
    return hasNewIndicator || isCommonNewFile;
  }

  private generatePlanTitle(userPrompt: string): string {
    const prompt = userPrompt.toLowerCase();
    if (prompt.includes('auth')) return 'Authentication Implementation';
    if (prompt.includes('api')) return 'API Implementation';
    if (prompt.includes('ui') || prompt.includes('component')) return 'UI Component Implementation';
    if (prompt.includes('database') || prompt.includes('db')) return 'Database Integration';
    if (prompt.includes('test')) return 'Testing Implementation';
    return 'Feature Implementation Plan';
  }

  private inferComplexity(fileCount: number, prompt: string): 'low' | 'medium' | 'high' {
    const complexKeywords = ['auth', 'database', 'api', 'integration', 'deployment'];
    const hasComplexKeywords = complexKeywords.some(keyword => 
      prompt.toLowerCase().includes(keyword)
    );
    
    if (fileCount > 8 || hasComplexKeywords) return 'high';
    if (fileCount > 4) return 'medium';
    return 'low';
  }

  private estimateTimeFromEntries(entries: PlanItem[]): number {
    return entries.reduce((total, entry) => {
      const timeStr = entry.estimatedTime || '1 hour';
      const hours = parseFloat(timeStr.match(/(\d+\.?\d*)/)?.[1] || '1');
      return total + hours;
    }, 0);
  }

  private estimateFileTime(description: string, isNew: boolean): string {
    const length = description.length;
    const complexity = description.toLowerCase();
    
    let baseHours = isNew ? 2 : 1;
    
    if (complexity.includes('complex') || complexity.includes('integration')) {
      baseHours *= 2;
    }
    if (length > 500) {
      baseHours += 1;
    }
    
    return `${baseHours} hours`;
  }

  private extractTags(prompt: string, languages: string[]): string[] {
    const tags = [...languages];
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('auth')) tags.push('authentication');
    if (lowerPrompt.includes('api')) tags.push('api');
    if (lowerPrompt.includes('ui') || lowerPrompt.includes('component')) tags.push('ui');
    if (lowerPrompt.includes('database')) tags.push('database');
    if (lowerPrompt.includes('test')) tags.push('testing');
    
    return [...new Set(tags)];
  }

  private generateCodebaseOverview(
    storedCodebase: StoredCodebase,
    languages: string[],
    totalFiles: number,
    dependencyCount: number
  ): string {
    const { metadata } = storedCodebase;
    
    return `This is a ${languages.join('/')} project with ${totalFiles} files and ${dependencyCount} dependencies.
    
Project Statistics:
- Total Files: ${totalFiles}
- Languages: ${languages.join(', ')}
- Total Size: ${this.formatFileSize(metadata.totalSize)}
- Last Processed: ${new Date(metadata.lastProcessed).toLocaleString()}
- Dependencies Found: ${dependencyCount}

The codebase appears to be a ${this.inferProjectType(languages, storedCodebase.files)} project.`;
  }

  private generateProjectStructure(storedCodebase: StoredCodebase): string {
    const files = storedCodebase.files;
    const structure: { [key: string]: string[] } = {};
    
    // Group files by directory
    files.forEach(file => {
      const pathParts = file.filePath.split('/');
      const dir = pathParts.length > 1 ? pathParts[0] : 'root';
      
      if (!structure[dir]) {
        structure[dir] = [];
      }
      structure[dir].push(file.fileName);
    });

    let structureText = 'Project Structure:\n';
    Object.keys(structure).sort().forEach(dir => {
      structureText += `\n${dir}/\n`;
      structure[dir].slice(0, 10).forEach(file => {
        structureText += `  - ${file}\n`;
      });
      if (structure[dir].length > 10) {
        structureText += `  ... and ${structure[dir].length - 10} more files\n`;
      }
    });

    return structureText;
  }

  private inferProjectType(languages: string[], files: CodebaseIndex[]): string {
    const hasPackageJson = files.some(f => f.fileName === 'package.json');
    const hasPomXml = files.some(f => f.fileName === 'pom.xml');
    const hasCargoToml = files.some(f => f.fileName === 'Cargo.toml');
    const hasSetupPy = files.some(f => f.fileName === 'setup.py');
    const hasDockerfile = files.some(f => f.fileName.toLowerCase().includes('dockerfile'));
    
    if (languages.includes('javascript') || languages.includes('typescript')) {
      if (files.some(f => f.content?.includes('react') || f.content?.includes('React'))) {
        return 'React';
      }
      if (files.some(f => f.content?.includes('next') || f.content?.includes('Next'))) {
        return 'Next.js';
      }
      if (files.some(f => f.content?.includes('vue') || f.content?.includes('Vue'))) {
        return 'Vue.js';
      }
      if (files.some(f => f.content?.includes('express') || f.content?.includes('Express'))) {
        return 'Express.js';
      }
      return 'JavaScript/TypeScript';
    }
    
    if (languages.includes('python')) {
      if (files.some(f => f.content?.includes('django') || f.content?.includes('Django'))) {
        return 'Django';
      }
      if (files.some(f => f.content?.includes('flask') || f.content?.includes('Flask'))) {
        return 'Flask';
      }
      return 'Python';
    }
    
    if (languages.includes('java')) return 'Java';
    if (languages.includes('csharp')) return 'C#/.NET';
    if (languages.includes('go')) return 'Go';
    if (languages.includes('rust')) return 'Rust';
    
    return 'Multi-language';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async generateNewProjectPlan(
    projectPrompt: string,
    requirements: {
      projectType: string;
      techStack: string[];
      database?: string;
      authentication?: string;
      deployment?: string;
    },
    maxTokens: number = 4000,
    onProgress?: ProgressCallback
  ): Promise<GeneratedPlan> {
    console.log('🚀 Starting new project plan generation...', {
      projectType: requirements.projectType,
      techStack: requirements.techStack,
      promptLength: projectPrompt.length,
      maxTokens
    });

    try {
      // Create context for new project
      console.log('📊 Preparing new project context...');
      onProgress?.({
        step: 'analyzing',
        progress: 20,
        message: 'Preparing project requirements...',
      });
      
      const context = this.prepareNewProjectContext(projectPrompt, requirements);
      console.log('✅ New project context prepared');
      
      // Generate the plan using OpenAI
      console.log('🤖 Calling OpenAI API for new project...');
      onProgress?.({
        step: 'generating',
        progress: 60,
        message: 'Generating project plan...',
      });
      
      const planContent = await this.callOpenAIForNewProject(context, maxTokens);
      console.log('✅ OpenAI API response received:', {
        responseLength: planContent.length
      });
      
      // Parse and structure the response
      console.log('🔄 Parsing and structuring new project plan...');
      onProgress?.({
        step: 'finalizing',
        progress: 90,
        message: 'Structuring project plan...',
      });
      
      const structuredPlan = await this.parseNewProjectPlanResponse(planContent, context);
      console.log('✅ New project plan structured successfully:', {
        planId: structuredPlan.id,
        sections: structuredPlan.sections.length,
        estimatedHours: structuredPlan.metadata.estimatedTimeHours
      });
      
      onProgress?.({
        step: 'complete',
        progress: 100,
        message: 'Project plan complete!',
      });
      
      return structuredPlan;
    } catch {
      console.error('❌ Error generating new project plan');
      throw new Error('Failed to generate new project plan: Unknown error');
    }
  }

  private prepareNewProjectContext(projectPrompt: string, requirements: {
    projectType: string;
    techStack: string[];
    database?: string;
    authentication?: string;
    deployment?: string;
  }): ContextData {
    // Create a project structure overview based on requirements
    const projectStructure = this.generateNewProjectStructure(requirements);
    
    // Extract key information
    const languages = requirements.techStack || [];
    const dependencies = this.getRecommendedDependencies(requirements);
    
    // Generate overview for new project
    const codebaseOverview = `New ${requirements.projectType} project using ${languages.join(', ')}`;
    
    const keyComponents = [
      ...languages,
      ...dependencies.slice(0, 10),
      requirements.database,
      requirements.authentication,
      requirements.deployment
    ].filter(Boolean);

    return {
      codebaseOverview,
      relevantFiles: [], // No existing files for new project
      relevantFilesWithContent: [], // No existing files for new project
      projectStructure,
      dependencies,
      languages,
      keyComponents,
      userPrompt: projectPrompt,
    };
  }

  private generateNewProjectStructure(requirements: {
    projectType: string;
    techStack: string[];
    database?: string;
    authentication?: string;
    deployment?: string;
  }): string {
    const projectType = requirements.projectType;
    const techStack = requirements.techStack || [];
    
    let structure = `New Project Structure for ${projectType}:\n`;
    
    if (techStack.includes('React') || techStack.includes('Next.js')) {
      structure += `
├── src/
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── utils/
│   └── styles/
├── public/
├── package.json
└── README.md`;
    } else if (techStack.includes('Python')) {
      structure += `
├── src/
│   ├── main.py
│   ├── models/
│   ├── views/
│   └── utils/
├── requirements.txt
└── README.md`;
    } else {
      structure += `
├── src/
├── tests/
├── docs/
└── README.md`;
    }
    
    return structure;
  }

  private getRecommendedDependencies(requirements: {
    projectType: string;
    techStack: string[];
    database?: string;
    authentication?: string;
    deployment?: string;
  }): string[] {
    const deps: string[] = [];
    const techStack = requirements.techStack || [];
    
    if (techStack.includes('React')) {
      deps.push('react', 'react-dom', 'react-router-dom');
    }
    if (techStack.includes('Next.js')) {
      deps.push('next', 'react', 'react-dom');
    }
    if (techStack.includes('TypeScript')) {
      deps.push('typescript', '@types/react', '@types/node');
    }
    if (techStack.includes('Node.js')) {
      deps.push('express', 'cors', 'dotenv');
    }
    if (techStack.includes('Python')) {
      deps.push('flask', 'requests', 'python-dotenv');
    }
    if (requirements.database === 'PostgreSQL') {
      deps.push('pg', 'sequelize');
    }
    if (requirements.database === 'MongoDB') {
      deps.push('mongoose', 'mongodb');
    }
    
    return deps;
  }

  private async callOpenAIForNewProject(context: ContextData, maxTokens: number): Promise<string> {
    const systemPrompt = this.buildNewProjectSystemPrompt();
    const userPrompt = this.buildNewProjectUserPrompt(context);

    console.log('📡 Making OpenAI API call for new project...', {
      model: "openai/gpt-oss-20b:free",
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      maxTokens,
      temperature: 0.7
    });

    const completion = await this.openai.chat.completions.create({
      model: "openai/gpt-oss-20b:free",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.7,
      top_p: 0.9,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response received from OpenRouter');
    }

    return response;
  }

  private buildNewProjectSystemPrompt(): string {
    return `You are an expert software architect specializing in creating comprehensive project plans for new software projects from scratch. Your role is to generate detailed, step-by-step implementation plans for building complete applications.

## Your Expertise:
- Project setup and scaffolding
- Technology stack integration
- Application architecture design
- Development workflow planning
- Deployment and infrastructure setup
- Requirements analysis and clarification

## CRITICAL: You must format your response in this EXACT structure with these specific headings:

**Observations**
Analyze the user's request and current requirements. Identify what type of application they want to build, what technologies might be suitable, and any gaps or unclear requirements. Be specific about project scope, target audience, and technical considerations.

**Approach**
Explain your recommended strategy and technology choices. Why this approach? What are the benefits? How does it address the user's needs? Start with a paragraph explanation, then include bullet points for key implementation strategy:
• Technology stack recommendation with rationale
• Development approach and methodology
• Key architectural decisions
• Deployment and hosting strategy

**Implementation Files**
List each file/component that needs to be created in logical order. Use EXACTLY this format for each item:

/path/to/file.ext
Add [describe what to add - dependency, component, etc.]
Detailed description of what needs to be done in this file, including specific setup steps, configurations, or implementations. Explain the purpose and how it fits into the overall project architecture.

## Important Formatting Rules:
1. **NO CODE**: Never include actual code - only descriptions and setup instructions
2. **INTELLIGENT RECOMMENDATIONS**: Analyze the user's request and recommend appropriate technologies
3. **CLARIFYING QUESTIONS**: Include specific questions in the Observations when requirements are unclear
4. **Complete Setup**: Include everything from project initialization to deployment
5. **Exact Format**: Follow the file format above precisely - file path, then "Add [description]", then detailed explanation
6. **Progressive Implementation**: Start with MVP setup, then add advanced features

Format exactly as shown above with proper spacing and structure. Always include tech stack recommendations and clarifying questions when the user's request lacks specific technical details.`;
  }

  private buildNewProjectUserPrompt(context: ContextData): string {
    return `Create a comprehensive implementation plan for a new project based on these requirements:

## User's Request:
${context.userPrompt}

## Analysis Instructions:
1. Analyze the user's request and determine what type of application they want to build
2. Recommend an appropriate tech stack based on the requirements
3. If the request is vague or missing details, include specific clarifying questions
4. Provide a complete implementation roadmap

## Required Clarifying Questions (include in the plan):
- What's the target platform? (Web, Mobile, Desktop, API)
- What's the expected user scale? (Small team, hundreds, thousands, millions of users)
- What's the preferred tech stack? (if not specified, recommend one with rationale)
- What kind of database is needed? (SQL, NoSQL, or specific requirements)
- What authentication method? (Social login, email/password, enterprise SSO)
- What's the deployment preference? (Cloud provider, self-hosted, specific platforms)
- What's the timeline and budget considerations?
- What's the team's technical expertise level?

## Create a detailed plan that includes:
1. **Requirements Analysis**: Tech stack recommendations and clarifying questions
2. **Project Setup**: Initialization and environment configuration  
3. **Core Implementation**: Step-by-step feature development
4. **Testing & Quality**: Testing strategy and quality assurance
5. **Deployment**: Production deployment and hosting setup

Make the plan actionable, include time estimates, and provide clear rationale for technology choices. Always include clarifying questions to help the user refine their requirements.`;
  }

  private async parseNewProjectPlanResponse(planContent: string, context: ContextData): Promise<GeneratedPlan> {
    // Use similar parsing logic as the existing method but adapted for new projects
    return this.parsePlanResponse(planContent, context);
  }

  // Utility method to validate API key (supports both OpenAI and OpenRouter)
  static validateApiKey(apiKey: string): boolean {
    return (apiKey.startsWith('sk-') || apiKey.startsWith('or-')) && apiKey.length > 20;
  }

  // Method to estimate token usage
  static estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}
