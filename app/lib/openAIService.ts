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
  type: 'create' | 'modify' | 'install' | 'configure' | 'test' | 'deploy';
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
  projectStructure: string;
  dependencies: string[];
  languages: string[];
  keyComponents: string[];
  userPrompt: string;
}

export class OpenAIService {
  private openai: OpenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // Note: In production, use a backend service
    });
  }

  async generateImplementationPlan(
    storedCodebase: StoredCodebase,
    userPrompt: string,
    maxTokens: number = 4000
  ): Promise<GeneratedPlan> {
    try {
      // Step 1: Prepare context from codebase
      const context = await this.prepareContext(storedCodebase, userPrompt);
      
      // Step 2: Generate the plan using OpenAI
      const planContent = await this.callOpenAI(context, maxTokens);
      
      // Step 3: Parse and structure the response
      const structuredPlan = await this.parsePlanResponse(planContent, context);
      
      return structuredPlan;
    } catch (error) {
      console.error('Error generating implementation plan:', error);
      throw new Error(`Failed to generate plan: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async prepareContext(storedCodebase: StoredCodebase, userPrompt: string): Promise<ContextData> {
    const searchEngine = new SearchEngine(storedCodebase);
    
    // Extract key information from the codebase
    const languages = storedCodebase.metadata.languages;
    const totalFiles = storedCodebase.metadata.totalFiles;
    const dependencies = searchEngine.getDependencies();
    const functionNames = searchEngine.getFunctionNames();
    const classNames = searchEngine.getClassNames();
    
    // Find relevant files based on user prompt
    const searchResults = searchEngine.search(userPrompt, {
      maxResults: 20,
      includeContent: false,
    });
    
    const relevantFiles = searchResults.map(result => result.filePath);
    
    // Create project structure overview
    const projectStructure = this.generateProjectStructure(storedCodebase);
    
    // Identify key components
    const keyComponents = [
      ...functionNames.slice(0, 10),
      ...classNames.slice(0, 10),
      ...dependencies.slice(0, 15),
    ];
    
    // Generate codebase overview
    const codebaseOverview = this.generateCodebaseOverview(
      storedCodebase,
      languages,
      totalFiles,
      dependencies.length
    );

    return {
      codebaseOverview,
      relevantFiles,
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

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4-1106-preview",
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
3. **Logical Order**: Arrange tasks in dependency order (what must be done first)
4. **Comprehensive Coverage**: Include files to create/modify, dependencies, configuration, testing
5. **Actionable Items**: Each step should be clear and implementable
6. **Risk Assessment**: Mention potential issues and how to handle them

## Plan Structure (use this EXACT format):
\`\`\`json
{
  "title": "Brief descriptive title",
  "overview": "2-3 sentence summary of what will be implemented",
  "sections": [
    {
      "title": "Project Overview",
      "type": "overview",
      "priority": "high",
      "content": "Detailed explanation of the implementation approach",
      "items": [
        {
          "type": "overview",
          "title": "Implementation Strategy",
          "description": "How this feature will be implemented",
          "details": "Detailed explanation of the approach and architecture",
          "dependencies": [],
          "estimatedTime": "X hours"
        }
      ]
    },
    {
      "title": "Files to Create/Modify",
      "type": "files",
      "priority": "high",
      "content": "List of all files that need to be created or modified",
      "items": [
        {
          "type": "create",
          "title": "Create new component/file",
          "description": "What this file will contain",
          "filePath": "exact/path/to/file.ext",
          "details": "Detailed description of what goes in this file",
          "dependencies": ["list", "of", "dependencies"],
          "estimatedTime": "X hours"
        },
        {
          "type": "modify",
          "title": "Update existing file",
          "description": "What changes to make",
          "filePath": "exact/path/to/existing/file.ext",
          "details": "Specific changes to make in this file",
          "dependencies": [],
          "estimatedTime": "X hours"
        }
      ]
    },
    {
      "title": "Dependencies to Install",
      "type": "dependencies",
      "priority": "high",
      "content": "All packages and dependencies needed",
      "items": [
        {
          "type": "install",
          "title": "Install package-name",
          "description": "Why this package is needed",
          "details": "npm install package-name --save or other install command",
          "dependencies": [],
          "estimatedTime": "5 minutes"
        }
      ]
    },
    {
      "title": "Step-by-Step Implementation",
      "type": "steps",
      "priority": "high",
      "content": "Detailed implementation steps in logical order",
      "items": [
        {
          "type": "configure",
          "title": "Step description",
          "description": "What to accomplish in this step",
          "details": "Detailed instructions for this step",
          "dependencies": ["previous", "steps"],
          "estimatedTime": "X hours"
        }
      ]
    },
    {
      "title": "Configuration Changes",
      "type": "configuration",
      "priority": "medium",
      "content": "Configuration files and environment setup",
      "items": [
        {
          "type": "configure",
          "title": "Update config file",
          "description": "What configuration to add/change",
          "filePath": "config/file/path",
          "details": "Specific configuration changes needed",
          "dependencies": [],
          "estimatedTime": "15 minutes"
        }
      ]
    },
    {
      "title": "Testing Strategy",
      "type": "testing",
      "priority": "medium",
      "content": "How to test the implementation",
      "items": [
        {
          "type": "test",
          "title": "Test type (unit/integration/e2e)",
          "description": "What to test",
          "details": "Specific testing approach and scenarios",
          "dependencies": ["implementation", "steps"],
          "estimatedTime": "X hours"
        }
      ]
    }
  ],
  "metadata": {
    "complexity": "low|medium|high",
    "estimatedTimeHours": total_hours_number,
    "tags": ["relevant", "technology", "tags"],
    "affectedLanguages": ["list", "of", "languages"],
    "relatedFiles": ["list", "of", "file", "paths"]
  }
}
\`\`\`

Always respond with valid JSON in exactly this format. Be thorough, specific, and actionable.`;
  }

  private buildUserPrompt(context: ContextData): string {
    return `Analyze this codebase and create a detailed implementation plan for the user's request.

## Codebase Analysis:
${context.codebaseOverview}

## Project Structure:
${context.projectStructure}

## Key Components Found:
${context.keyComponents.slice(0, 20).join(', ')}

## Existing Dependencies:
${context.dependencies.slice(0, 20).join(', ')}

## Relevant Files (based on search):
${context.relevantFiles.slice(0, 15).join('\n')}

## User Request:
"${context.userPrompt}"

## Instructions:
Create a comprehensive implementation plan that:
1. Analyzes the existing codebase structure
2. Identifies exactly which files need to be created or modified
3. Lists all dependencies that need to be installed
4. Provides step-by-step implementation instructions
5. Includes configuration changes needed
6. Suggests testing approaches
7. Estimates time for each task

Focus on being specific about file paths, function names, and implementation details. Remember: NO actual code, only detailed descriptions and instructions.

The plan should be actionable enough that any developer can follow it to implement the requested feature.`;
  }

  private async parsePlanResponse(response: string, context: ContextData): Promise<GeneratedPlan> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response;
      
      const parsedPlan = JSON.parse(jsonString);
      
      // Add IDs and additional processing
      const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      
      const processedSections = parsedPlan.sections.map((section: any, sectionIndex: number) => ({
        ...section,
        id: `section_${sectionIndex}`,
        items: section.items.map((item: any, itemIndex: number) => ({
          ...item,
          id: `item_${sectionIndex}_${itemIndex}`,
        })),
      }));

      return {
        id: planId,
        title: parsedPlan.title || 'Implementation Plan',
        overview: parsedPlan.overview || 'Generated implementation plan',
        timestamp: Date.now(),
        sections: processedSections,
        metadata: {
          totalFiles: context.relevantFiles.length,
          affectedLanguages: context.languages,
          complexity: parsedPlan.metadata?.complexity || 'medium',
          estimatedTimeHours: parsedPlan.metadata?.estimatedTimeHours || 8,
          tags: parsedPlan.metadata?.tags || [],
          relatedFiles: parsedPlan.metadata?.relatedFiles || context.relevantFiles,
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
            type: 'create' as const, // Changed from 'overview' to 'create'
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

  // Utility method to validate API key
  static validateApiKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 20;
  }

  // Method to estimate token usage
  static estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}
