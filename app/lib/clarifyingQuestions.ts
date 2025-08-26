import { OpenAIService } from './openAIService';
import { StoredCodebase } from './storageManager';

export interface ClarifyingQuestion {
  id: string;
  question: string;
  type: 'single-choice' | 'multiple-choice' | 'text' | 'yes-no';
  options?: string[];
  required: boolean;
  category: 'technical' | 'scope' | 'requirements' | 'preferences';
}

export interface QuestionResponse {
  questionId: string;
  answer: string | string[];
}

export interface ClarificationSession {
  id: string;
  originalPrompt: string;
  questions: ClarifyingQuestion[];
  responses: QuestionResponse[];
  isComplete: boolean;
  refinedPrompt?: string;
  timestamp: number;
}

export interface NewProjectRequirements {
  projectType: string;
  techStack: string[];
  features: string[];
  database?: string;
  authentication?: string;
  deployment?: string;
  budget?: 'low' | 'medium' | 'high';
  timeline?: string;
  teamSize?: number;
  experience?: 'beginner' | 'intermediate' | 'advanced';
}

export class ClarifyingQuestionsService {
  private openAIService: OpenAIService;

  constructor(apiKey: string) {
    this.openAIService = new OpenAIService(apiKey);
  }

  async analyzePromptAndGenerateQuestions(
    prompt: string,
    codebase?: StoredCodebase
  ): Promise<ClarifyingQuestion[]> {
    const systemPrompt = this.buildQuestionGenerationPrompt();
    const userPrompt = this.buildUserPromptForQuestions(prompt, codebase);

    try {
      const response = await this.openAIService.callOpenAI(
        { 
          codebaseOverview: codebase ? `Existing ${codebase.metadata.languages.join('/')} project with ${codebase.metadata.totalFiles} files` : 'New project',
          relevantFiles: [],
          projectStructure: codebase ? 'Existing codebase structure available' : 'No existing codebase',
          dependencies: codebase?.files.flatMap(f => f.dependencies) || [],
          languages: codebase?.metadata.languages || [],
          keyComponents: [],
          userPrompt: userPrompt
        },
        2000
      );

      return this.parseQuestionsFromResponse(response);
    } catch (error) {
      console.error('Error generating clarifying questions:', error);
      return this.getFallbackQuestions(prompt, !!codebase);
    }
  }

  async generateNewProjectQuestions(): Promise<ClarifyingQuestion[]> {
    return [
      {
        id: 'project_type',
        question: 'What type of project are you building?',
        type: 'single-choice',
        options: [
          'Web Application (Frontend)',
          'Web Application (Full-stack)',
          'Mobile Application (React Native/Flutter)',
          'Desktop Application',
          'API/Backend Service',
          'CLI Tool',
          'Chrome Extension',
          'WordPress Plugin/Theme',
          'E-commerce Store',
          'Portfolio/Blog Website',
          'Dashboard/Admin Panel',
          'Other'
        ],
        required: true,
        category: 'technical'
      },
      {
        id: 'tech_stack',
        question: 'Which technologies would you prefer to use?',
        type: 'multiple-choice',
        options: [
          'React/Next.js',
          'Vue.js/Nuxt.js',
          'Angular',
          'Svelte/SvelteKit',
          'Node.js/Express',
          'Python/Django',
          'Python/Flask',
          'PHP/Laravel',
          'Java/Spring',
          'C#/.NET',
          'Go',
          'Rust',
          'TypeScript',
          'JavaScript'
        ],
        required: true,
        category: 'technical'
      },
      {
        id: 'database',
        question: 'What type of database do you need?',
        type: 'single-choice',
        options: [
          'None (static site)',
          'PostgreSQL',
          'MySQL',
          'MongoDB',
          'SQLite',
          'Firebase/Firestore',
          'Supabase',
          'Redis',
          'Not sure'
        ],
        required: false,
        category: 'technical'
      },
      {
        id: 'authentication',
        question: 'What authentication method do you prefer?',
        type: 'single-choice',
        options: [
          'None needed',
          'Email/Password',
          'Social Login (Google, GitHub, etc.)',
          'JWT Tokens',
          'Session-based',
          'OAuth 2.0',
          'Firebase Auth',
          'Auth0',
          'Not sure'
        ],
        required: false,
        category: 'requirements'
      },
      {
        id: 'key_features',
        question: 'What are the main features you want to implement?',
        type: 'text',
        required: true,
        category: 'requirements'
      },
      {
        id: 'deployment',
        question: 'Where do you plan to deploy your application?',
        type: 'single-choice',
        options: [
          'Vercel',
          'Netlify',
          'AWS',
          'Google Cloud',
          'Azure',
          'DigitalOcean',
          'Heroku',
          'Local/Self-hosted',
          'Not sure'
        ],
        required: false,
        category: 'technical'
      },
      {
        id: 'experience_level',
        question: 'What is your development experience level?',
        type: 'single-choice',
        options: [
          'Beginner (0-1 years)',
          'Intermediate (1-3 years)',
          'Advanced (3+ years)',
          'Expert (5+ years)'
        ],
        required: false,
        category: 'preferences'
      },
      {
        id: 'timeline',
        question: 'What is your expected timeline for this project?',
        type: 'single-choice',
        options: [
          '1-2 weeks',
          '1 month',
          '2-3 months',
          '3-6 months',
          '6+ months',
          'No specific timeline'
        ],
        required: false,
        category: 'scope'
      }
    ];
  }

  async refinePromptWithAnswers(
    originalPrompt: string,
    responses: QuestionResponse[],
    codebase?: StoredCodebase
  ): Promise<string> {
    const answersText = this.formatAnswersForRefinement(responses);
    const contextText = codebase ? 
      `This is for an existing ${codebase.metadata.languages.join('/')} project with ${codebase.metadata.totalFiles} files.` :
      `This is for a new project.`;

    const refinementPrompt = `
    Original request: "${originalPrompt}"
    
    ${contextText}
    
    Additional details gathered:
    ${answersText}
    
    Please create a refined, detailed implementation request that combines the original prompt with the additional details provided. Make it specific and actionable.
    `;

    try {
      const response = await this.openAIService.callOpenAI(
        {
          codebaseOverview: contextText,
          relevantFiles: [],
          projectStructure: '',
          dependencies: [],
          languages: codebase?.metadata.languages || [],
          keyComponents: [],
          userPrompt: refinementPrompt
        },
        1000
      );

      return response.trim();
    } catch (error) {
      console.error('Error refining prompt:', error);
      return this.createFallbackRefinedPrompt(originalPrompt, responses);
    }
  }

  createClarificationSession(
    prompt: string,
    questions: ClarifyingQuestion[]
  ): ClarificationSession {
    return {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      originalPrompt: prompt,
      questions,
      responses: [],
      isComplete: false,
      timestamp: Date.now()
    };
  }

  updateSessionResponse(
    session: ClarificationSession,
    questionId: string,
    answer: string | string[]
  ): ClarificationSession {
    const existingResponseIndex = session.responses.findIndex(r => r.questionId === questionId);
    const newResponse: QuestionResponse = { questionId, answer };

    const updatedResponses = existingResponseIndex >= 0
      ? session.responses.map((r, i) => i === existingResponseIndex ? newResponse : r)
      : [...session.responses, newResponse];

    return {
      ...session,
      responses: updatedResponses,
      isComplete: this.checkSessionCompletion(session.questions, updatedResponses)
    };
  }

  private buildQuestionGenerationPrompt(): string {
    return `You are an expert software architect who helps developers clarify their implementation requirements. 

When given a vague or incomplete development request, generate 3-5 clarifying questions that will help create a detailed implementation plan.

Focus on questions that clarify:
1. Technical specifications and requirements
2. Scope and boundaries of the implementation  
3. User experience and business requirements
4. Integration points and dependencies
5. Performance and scalability needs

Return a JSON array of questions in this exact format:
[
  {
    "id": "unique_question_id",
    "question": "Clear, specific question text",
    "type": "single-choice|multiple-choice|text|yes-no",
    "options": ["option1", "option2"] // only for choice types,
    "required": true|false,
    "category": "technical|scope|requirements|preferences"
  }
]

Make questions specific to the development context and avoid generic questions.`;
  }

  private buildUserPromptForQuestions(prompt: string, codebase?: StoredCodebase): string {
    const contextInfo = codebase 
      ? `This is for an existing ${codebase.metadata.languages.join('/')} project with ${codebase.metadata.totalFiles} files.`
      : 'This is for a new project.';

    return `${contextInfo}

User's request: "${prompt}"

Generate clarifying questions to help create a detailed implementation plan for this request.`;
  }

  private parseQuestionsFromResponse(response: string): ClarifyingQuestion[] {
    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const questions = JSON.parse(jsonMatch[0]);
        return questions.map((q: any, index: number) => ({
          ...q,
          id: q.id || `question_${index}`,
        }));
      }
    } catch (error) {
      console.error('Error parsing questions from AI response:', error);
    }

    return [];
  }

  private getFallbackQuestions(prompt: string, hasCodebase: boolean): ClarifyingQuestion[] {
    const baseQuestions: ClarifyingQuestion[] = [
      {
        id: 'scope',
        question: 'What is the main scope of this implementation?',
        type: 'single-choice',
        options: [
          'Single feature addition',
          'Multiple related features',
          'Complete system overhaul',
          'Bug fix and improvements',
          'Performance optimization'
        ],
        required: true,
        category: 'scope'
      },
      {
        id: 'priority',
        question: 'What is the priority level for this implementation?',
        type: 'single-choice',
        options: ['High (urgent)', 'Medium (planned)', 'Low (nice to have)'],
        required: false,
        category: 'preferences'
      },
      {
        id: 'constraints',
        question: 'Are there any specific constraints or requirements?',
        type: 'text',
        required: false,
        category: 'requirements'
      }
    ];

    if (!hasCodebase) {
      baseQuestions.unshift({
        id: 'tech_preference',
        question: 'What technology stack would you prefer?',
        type: 'text',
        required: true,
        category: 'technical'
      });
    }

    return baseQuestions;
  }

  private formatAnswersForRefinement(responses: QuestionResponse[]): string {
    return responses.map(response => {
      const answer = Array.isArray(response.answer) 
        ? response.answer.join(', ')
        : response.answer;
      return `- ${response.questionId}: ${answer}`;
    }).join('\n');
  }

  private createFallbackRefinedPrompt(
    originalPrompt: string, 
    responses: QuestionResponse[]
  ): string {
    const answersText = this.formatAnswersForRefinement(responses);
    return `${originalPrompt}\n\nAdditional requirements:\n${answersText}`;
  }

  private checkSessionCompletion(
    questions: ClarifyingQuestion[],
    responses: QuestionResponse[]
  ): boolean {
    const requiredQuestions = questions.filter(q => q.required);
    const answeredRequiredQuestions = requiredQuestions.filter(q =>
      responses.some(r => r.questionId === q.id && r.answer)
    );

    return answeredRequiredQuestions.length === requiredQuestions.length;
  }

  // Method to determine if a prompt needs clarification
  static needsClarification(prompt: string): boolean {
    const indicators = [
      'add', 'create', 'build', 'implement', 'make', 'develop',
      'fix', 'improve', 'optimize', 'update', 'modify'
    ];
    
    const words = prompt.toLowerCase().split(' ');
    const hasVagueVerb = indicators.some(indicator => words.includes(indicator));
    const isShort = words.length < 5;
    const lacksSpecifics = !prompt.match(/\b(component|function|class|file|api|database|auth|login|signup|dashboard|form|button|modal|page|route|endpoint|service|util|hook|context|state|style|css|html|js|ts|jsx|tsx|py|java|cpp|cs|php|rb|go|rs)\b/i);

    return hasVagueVerb && (isShort || lacksSpecifics);
  }
}
