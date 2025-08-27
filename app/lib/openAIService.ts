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
}

export type ProgressCallback = (progress: PlanGenerationProgress) => void;

export class OpenAIService {
  private openai: OpenAI;
  private apiKey: string;

  constructor() {
    console.log('🔧 Initializing OpenAI Service...');
    
    // Get API key from environment variable
    this.apiKey = process.env.OPEN_AI_API || process.env.NEXT_PUBLIC_OPEN_AI_API || '';
    
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
        message: 'Analyzing codebase structure...',
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
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      onProgress?.({
        step: 'generating',
        progress: 65,
        message: '💭 AI is analyzing your requirements...',
      });
      
      const planContent = await this.callOpenAI(context, maxTokens);
      
      onProgress?.({
        step: 'generating',
        progress: 80,
        message: '🧠 AI is formulating implementation strategy...',
      });
      console.log('✅ OpenAI API response received:', {
        responseLength: planContent.length
      });
      
      // Step 3: Parse and structure the response
      console.log('🔄 Step 3: Parsing and structuring response...');
      onProgress?.({
        step: 'finalizing',
        progress: 90,
        message: 'Structuring plan sections...',
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
        message: 'Plan generation complete!',
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
      message: 'Reading project metadata...',
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
      message: 'Searching for relevant files...',
    });
    
    const searchResults = searchEngine.search(userPrompt, {
      maxResults: useDeepAnalysis ? 10 : 20, // More results for lightweight mode
      includeContent: useDeepAnalysis, // Only include content in deep analysis
    });
    
    const relevantFiles = searchResults.map(result => result.filePath);
    const relevantFilesWithContent: Array<{path: string, content: string, relevance: number}> = [];
    
    if (useDeepAnalysis) {
      // DEEP ANALYSIS: Actually read file contents (Cursor AI-like)
      onProgress?.({
        step: 'analyzing',
        progress: 30,
        message: '🧠 Entering deep analysis mode...',
      });
      
      for (let i = 0; i < Math.min(searchResults.length, 5); i++) {
        const result = searchResults[i];
        const file = searchEngine.getFileById(result.fileId);
        
        if (file && file.content) {
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 35 + (i * 5),
            message: `📄 Reading ${file.filePath}...`,
          });
          
          // Show reasoning steps
          await new Promise(resolve => setTimeout(resolve, 200));
          onProgress?.({
            step: 'analyzing',
            currentFile: file.filePath,
            progress: 35 + (i * 5),
            message: `💭 Analyzing patterns in ${file.filePath}...`,
          });
          
          // Include file content (truncated if too long)
          const truncatedContent = file.content.length > 2000 
            ? file.content.substring(0, 2000) + '\n... (truncated)'
            : file.content;
            
          relevantFilesWithContent.push({
            path: file.filePath,
            content: truncatedContent,
            relevance: result.relevanceScore
          });
          
          // Small delay to make the reading indicator visible
          await new Promise(resolve => setTimeout(resolve, 300));
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

  async callOpenAI(context: ContextData, maxTokens: number): Promise<string> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(context);

    console.log('📡 Making OpenAI API call...', {
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

    console.log('📨 OpenAI API response received:', {
      choices: completion.choices.length,
      usage: completion.usage,
      model: completion.model
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      console.error('❌ No response content from OpenRouter');
      throw new Error('No response received from OpenRouter');
    }

    console.log('✅ Response extracted successfully:', {
      responseLength: response.length,
      firstWords: response.substring(0, 100) + '...'
    });

    return response;
  }

  private buildSystemPrompt(): string {
    return `You are an expert software architect and technical lead specializing in creating detailed, actionable implementation plans. Your role is to analyze codebases and generate comprehensive plans that developers can follow to implement new features or fix issues.

## Your Expertise:
- Full-stack development across multiple languages and frameworks
- Software architecture and design patterns
- Project planning and task breakdown
- Dependency management and configuration
- Testing strategies and deployment practices

## Plan Generation Rules:
1. **NO CODE**: Never include actual code in your plans - only descriptions and instructions
2. **Be Specific**: Provide exact file paths, function names, and detailed steps
3. **Logical Order**: Arrange files in dependency order (what must be done first)
4. **Comprehensive Coverage**: Include files to create/modify, dependencies, configuration, testing
5. **Actionable Items**: Each step should be clear and implementable
6. **Context Awareness**: Use the provided file contents to understand existing patterns

## Required Plan Structure:

**Observations**
Analyze the current codebase structure, technology stack, patterns, and identify what exists and what's missing for the requested feature. Be specific about current architecture, existing components, data flow, and any limitations or opportunities.

**Approach**
Explain your high-level strategy and reasoning. Why this approach? What are the benefits? How does it fit with the existing architecture? Include bullet points for key implementation points:
• Strategy point 1
• Strategy point 2
• Strategy point 3

**Implementation Files**
List each file that needs to be created or modified, in logical dependency order:

/path/to/file.ext
STATUS (NEW/MODIFY)
Add file or resource
Detailed description of what needs to be done in this file, including specific functions, components, or configurations to add/modify. Explain the purpose and how it integrates with the existing codebase.

Format exactly as shown above with proper spacing and structure. Be thorough, specific, and ensure all recommendations are actionable and follow existing code patterns.`;
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

    return `Analyze this codebase and create a detailed implementation plan for the user's request.

## Codebase Analysis:
${context.codebaseOverview}

## Project Structure:
${context.projectStructure}

## Key Components Found:
${context.keyComponents.slice(0, 20).join(', ')}

## Existing Dependencies:
${context.dependencies.slice(0, 20).join(', ')}

## Relevant Files Found:
${context.relevantFiles.slice(0, 15).join('\n')}

${fileContentsSection}## User Request:
"${context.userPrompt}"

## Instructions:
Create a comprehensive implementation plan using the EXACT format specified in the system prompt:
1. Start with **Observations** - analyze current state and what's needed
2. Follow with **Approach** - explain strategy with bullet points
3. List **Implementation Files** in dependency order with exact format

Use the provided file contents to understand existing patterns, naming conventions, and architecture. Be specific about file paths, function names, and how new code integrates with existing code.

The plan should be actionable enough that any developer can follow it to implement the requested feature while maintaining consistency with the existing codebase.`;
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
    
    // Split by file path patterns (lines starting with /)
    const fileBlocks = filesContent.split(/(?=^\/)/m).filter(block => block.trim());
    
    fileBlocks.forEach((block, index) => {
      const lines = block.trim().split('\n');
      if (lines.length < 3) return;
      
      const filePath = lines[0].trim();
      const status = lines[1].trim();
      const reference = lines.length > 2 ? lines[2].trim() : '';
      const description = lines.slice(3).join('\n').trim();
      
      const isNew = status.includes('NEW');
      const itemType = isNew ? 'create' : 'modify';
      
      items.push({
        id: `file_${index}`,
        type: itemType,
        title: `${isNew ? 'Create' : 'Modify'} ${filePath.split('/').pop() || filePath}`,
        description: `${isNew ? 'Create new file:' : 'Modify existing file:'} ${filePath}`,
        filePath: filePath,
        details: description,
        dependencies: index > 0 ? [`file_${index - 1}`] : [],
        estimatedTime: this.estimateFileTime(description, isNew),
      });
    });
    
    return items;
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
    requirements: any,
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
    } catch (error) {
      console.error('❌ Error generating new project plan:', error);
      throw new Error(`Failed to generate new project plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private prepareNewProjectContext(projectPrompt: string, requirements: any): ContextData {
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

  private generateNewProjectStructure(requirements: any): string {
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

  private getRecommendedDependencies(requirements: any): string[] {
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

## New Project Planning Rules:
1. **NO CODE**: Never include actual code - only descriptions and setup instructions
2. **INTELLIGENT RECOMMENDATIONS**: Analyze the user's request and recommend appropriate technologies
3. **CLARIFYING QUESTIONS**: When requirements are unclear, include specific questions in the overview
4. **Complete Setup**: Include everything from project initialization to deployment
5. **Technology-Specific**: Tailor instructions to the recommended tech stack
6. **Best Practices**: Include industry standards and conventions
7. **Development Workflow**: Include testing, linting, and CI/CD considerations
8. **Progressive Implementation**: Start with MVP, then add advanced features

## Plan Structure (use this EXACT format):
\`\`\`json
{
  "title": "Project setup and implementation plan",
  "overview": "Complete plan for building the project from scratch. If the user's requirements are vague, include specific clarifying questions they should consider, such as: preferred tech stack, target platform, database requirements, authentication needs, deployment preferences, etc.",
  "sections": [
    {
      "title": "Requirements & Tech Stack Clarification",
      "type": "overview", 
      "priority": "high",
      "content": "Based on your request, here are my recommendations and questions to consider",
      "items": [
        {
          "type": "overview",
          "title": "Recommended Tech Stack",
          "description": "Suggested technologies based on your requirements",
          "details": "List recommended frameworks, languages, databases, etc. with rationale",
          "dependencies": [],
          "estimatedTime": "Planning phase"
        },
        {
          "type": "overview", 
          "title": "Clarifying Questions",
          "description": "Questions to help refine the implementation approach",
          "details": "List specific questions about: target audience, scale, performance requirements, budget, timeline, team expertise, etc.",
          "dependencies": [],
          "estimatedTime": "Planning phase"
        }
      ]
    },
    {
      "title": "Project Setup",
      "type": "configuration",
      "priority": "high",
      "content": "Initial project setup and environment configuration",
      "items": [
        {
          "type": "create",
          "title": "Initialize project",
          "description": "Set up project structure and configuration",
          "details": "Step-by-step project initialization",
          "dependencies": [],
          "estimatedTime": "1-2 hours"
        }
      ]
    },
    {
      "title": "Core Implementation",
      "type": "steps",
      "priority": "high",
      "content": "Main application development steps",
      "items": []
    },
    {
      "title": "Testing & Quality",
      "type": "testing",
      "priority": "medium",
      "content": "Testing setup and quality assurance",
      "items": []
    },
    {
      "title": "Deployment",
      "type": "deployment",
      "priority": "low",
      "content": "Production deployment and hosting setup",
      "items": []
    }
  ]
}
\`\`\`

Focus on creating a production-ready application with proper architecture, testing, and deployment strategies. Always include tech stack recommendations and clarifying questions when the user's request lacks specific technical details.`;
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
