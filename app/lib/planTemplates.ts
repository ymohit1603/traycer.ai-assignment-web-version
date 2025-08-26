export interface PlanTemplate {
  id: string;
  name: string;
  description: string;
  category: 'authentication' | 'api' | 'database' | 'deployment' | 'ui' | 'performance' | 'testing' | 'security';
  tags: string[];
  applicableFrameworks: string[];
  estimatedTimeHours: number;
  complexity: 'low' | 'medium' | 'high';
  sections: TemplatePlanSection[];
}

export interface TemplatePlanSection {
  title: string;
  type: 'overview' | 'files' | 'dependencies' | 'steps' | 'configuration' | 'testing' | 'deployment';
  priority: 'high' | 'medium' | 'low';
  content: string;
  items: TemplatePlanItem[];
}

export interface TemplatePlanItem {
  type: 'create' | 'modify' | 'install' | 'configure' | 'test' | 'deploy';
  title: string;
  description: string;
  filePath?: string;
  details: string;
  dependencies: string[];
  estimatedTime?: string;
}

export class PlanTemplatesService {
  private static templates: PlanTemplate[] = [
    // Authentication Templates
    {
      id: 'jwt-auth-nextjs',
      name: 'JWT Authentication with Next.js',
      description: 'Complete JWT-based authentication system with login, signup, and protected routes',
      category: 'authentication',
      tags: ['nextjs', 'jwt', 'authentication', 'typescript'],
      applicableFrameworks: ['next.js', 'react'],
      estimatedTimeHours: 8,
      complexity: 'medium',
      sections: [
        {
          title: 'Project Overview',
          type: 'overview',
          priority: 'high',
          content: 'Implement a complete JWT authentication system with secure login, registration, and route protection.',
          items: [
            {
              type: 'overview',
              title: 'Authentication Strategy',
              description: 'JWT-based authentication with HTTP-only cookies',
              details: 'Use JWT tokens stored in HTTP-only cookies for security. Implement refresh token rotation and automatic token refresh.',
              dependencies: [],
              estimatedTime: '1 hour'
            }
          ]
        },
        {
          title: 'Dependencies to Install',
          type: 'dependencies',
          priority: 'high',
          content: 'Install required packages for JWT authentication and password hashing',
          items: [
            {
              type: 'install',
              title: 'Install JWT and Crypto Libraries',
              description: 'Add libraries for JWT handling and password security',
              details: 'npm install jsonwebtoken bcryptjs jose @types/jsonwebtoken @types/bcryptjs',
              dependencies: [],
              estimatedTime: '5 minutes'
            },
            {
              type: 'install',
              title: 'Install Form Validation',
              description: 'Add form validation library',
              details: 'npm install react-hook-form @hookform/resolvers zod',
              dependencies: [],
              estimatedTime: '5 minutes'
            }
          ]
        },
        {
          title: 'Files to Create/Modify',
          type: 'files',
          priority: 'high',
          content: 'Create authentication components, API routes, and middleware',
          items: [
            {
              type: 'create',
              title: 'Create Auth Context',
              description: 'Global authentication state management',
              filePath: 'contexts/AuthContext.tsx',
              details: 'Create React context for managing user authentication state, login/logout functions, and user data. Include loading states and error handling.',
              dependencies: ['jsonwebtoken'],
              estimatedTime: '1 hour'
            },
            {
              type: 'create',
              title: 'Create Login API Route',
              description: 'Server-side login endpoint',
              filePath: 'pages/api/auth/login.ts',
              details: 'Create API endpoint that validates credentials, generates JWT token, and sets HTTP-only cookie. Include rate limiting and brute force protection.',
              dependencies: ['bcryptjs', 'jsonwebtoken'],
              estimatedTime: '45 minutes'
            },
            {
              type: 'create',
              title: 'Create Registration API Route',
              description: 'Server-side user registration endpoint',
              filePath: 'pages/api/auth/register.ts',
              details: 'Create endpoint for user registration with email validation, password hashing, and duplicate email checking.',
              dependencies: ['bcryptjs'],
              estimatedTime: '45 minutes'
            },
            {
              type: 'create',
              title: 'Create Middleware for Protected Routes',
              description: 'Route protection middleware',
              filePath: 'middleware.ts',
              details: 'Create Next.js middleware to protect routes by verifying JWT tokens. Redirect unauthenticated users to login page.',
              dependencies: ['jose'],
              estimatedTime: '30 minutes'
            },
            {
              type: 'create',
              title: 'Create Login Component',
              description: 'Login form component',
              filePath: 'components/auth/LoginForm.tsx',
              details: 'Create responsive login form with email/password fields, validation, error handling, and loading states.',
              dependencies: ['react-hook-form'],
              estimatedTime: '1 hour'
            },
            {
              type: 'create',
              title: 'Create Registration Component',
              description: 'User registration form',
              filePath: 'components/auth/RegisterForm.tsx',
              details: 'Create registration form with email, password, confirm password, validation, and terms acceptance.',
              dependencies: ['react-hook-form', 'zod'],
              estimatedTime: '1 hour'
            }
          ]
        },
        {
          title: 'Configuration Changes',
          type: 'configuration',
          priority: 'high',
          content: 'Environment variables and security configuration',
          items: [
            {
              type: 'configure',
              title: 'Environment Variables',
              description: 'Set up authentication secrets',
              filePath: '.env.local',
              details: 'Add JWT_SECRET, JWT_EXPIRES_IN, NEXTAUTH_URL, and database connection string. Generate strong random secrets.',
              dependencies: [],
              estimatedTime: '10 minutes'
            },
            {
              type: 'configure',
              title: 'Next.js Configuration',
              description: 'Configure security headers',
              filePath: 'next.config.js',
              details: 'Add security headers for CSRF protection, content security policy, and secure cookies configuration.',
              dependencies: [],
              estimatedTime: '15 minutes'
            }
          ]
        },
        {
          title: 'Testing Strategy',
          type: 'testing',
          priority: 'medium',
          content: 'Comprehensive testing for authentication flows',
          items: [
            {
              type: 'test',
              title: 'Unit Tests for Auth Logic',
              description: 'Test authentication helper functions',
              details: 'Create unit tests for JWT generation/verification, password hashing, and validation functions.',
              dependencies: ['jest'],
              estimatedTime: '2 hours'
            },
            {
              type: 'test',
              title: 'Integration Tests for API Routes',
              description: 'Test authentication endpoints',
              details: 'Test login/register API routes with various scenarios: valid/invalid credentials, edge cases, and error conditions.',
              dependencies: ['jest', 'supertest'],
              estimatedTime: '2 hours'
            }
          ]
        }
      ]
    },

    // API Integration Template
    {
      id: 'rest-api-integration',
      name: 'REST API Integration',
      description: 'Complete REST API integration with error handling, loading states, and data management',
      category: 'api',
      tags: ['api', 'rest', 'axios', 'react-query'],
      applicableFrameworks: ['react', 'next.js', 'vue.js'],
      estimatedTimeHours: 6,
      complexity: 'medium',
      sections: [
        {
          title: 'Project Overview',
          type: 'overview',
          priority: 'high',
          content: 'Implement robust REST API integration with proper error handling and caching.',
          items: [
            {
              type: 'overview',
              title: 'API Integration Strategy',
              description: 'Use React Query for data fetching with Axios for HTTP requests',
              details: 'Implement centralized API client with automatic retry, caching, background updates, and optimistic updates.',
              dependencies: [],
              estimatedTime: '30 minutes'
            }
          ]
        },
        {
          title: 'Dependencies to Install',
          type: 'dependencies',
          priority: 'high',
          content: 'Install API client and data fetching libraries',
          items: [
            {
              type: 'install',
              title: 'Install API Client Libraries',
              description: 'Add HTTP client and data fetching libraries',
              details: 'npm install axios @tanstack/react-query @tanstack/react-query-devtools',
              dependencies: [],
              estimatedTime: '5 minutes'
            }
          ]
        },
        {
          title: 'Files to Create/Modify',
          type: 'files',
          priority: 'high',
          content: 'Create API client, hooks, and error handling',
          items: [
            {
              type: 'create',
              title: 'Create API Client',
              description: 'Centralized HTTP client configuration',
              filePath: 'lib/api-client.ts',
              details: 'Create Axios instance with base URL, timeout, interceptors for auth tokens, and error handling.',
              dependencies: ['axios'],
              estimatedTime: '45 minutes'
            },
            {
              type: 'create',
              title: 'Create API Hooks',
              description: 'React Query hooks for API operations',
              filePath: 'hooks/useApi.ts',
              details: 'Create custom hooks for GET, POST, PUT, DELETE operations with proper TypeScript types and error handling.',
              dependencies: ['@tanstack/react-query'],
              estimatedTime: '1.5 hours'
            },
            {
              type: 'create',
              title: 'Create Error Boundary',
              description: 'Global error handling component',
              filePath: 'components/ErrorBoundary.tsx',
              details: 'Create error boundary component to catch and handle API errors gracefully with retry options.',
              dependencies: [],
              estimatedTime: '30 minutes'
            }
          ]
        }
      ]
    },

    // Database Setup Template
    {
      id: 'prisma-postgres-setup',
      name: 'Prisma + PostgreSQL Setup',
      description: 'Complete database setup with Prisma ORM and PostgreSQL',
      category: 'database',
      tags: ['prisma', 'postgresql', 'database', 'orm'],
      applicableFrameworks: ['next.js', 'node.js'],
      estimatedTimeHours: 4,
      complexity: 'medium',
      sections: [
        {
          title: 'Dependencies to Install',
          type: 'dependencies',
          priority: 'high',
          content: 'Install Prisma ORM and PostgreSQL client',
          items: [
            {
              type: 'install',
              title: 'Install Prisma',
              description: 'Add Prisma ORM and PostgreSQL client',
              details: 'npm install prisma @prisma/client && npx prisma init',
              dependencies: [],
              estimatedTime: '10 minutes'
            }
          ]
        },
        {
          title: 'Files to Create/Modify',
          type: 'files',
          priority: 'high',
          content: 'Create database schema and client configuration',
          items: [
            {
              type: 'create',
              title: 'Define Database Schema',
              description: 'Create Prisma schema with models',
              filePath: 'prisma/schema.prisma',
              details: 'Define database models with relationships, constraints, and indexes. Include User, Post, Comment models as examples.',
              dependencies: [],
              estimatedTime: '1 hour'
            },
            {
              type: 'create',
              title: 'Create Database Client',
              description: 'Prisma client singleton',
              filePath: 'lib/prisma.ts',
              details: 'Create reusable Prisma client instance with connection pooling and error handling.',
              dependencies: ['@prisma/client'],
              estimatedTime: '20 minutes'
            }
          ]
        },
        {
          title: 'Step-by-Step Implementation',
          type: 'steps',
          priority: 'high',
          content: 'Database setup and migration process',
          items: [
            {
              type: 'configure',
              title: 'Configure Database Connection',
              description: 'Set up PostgreSQL connection string',
              details: 'Add DATABASE_URL to .env file with PostgreSQL connection string. Set up local PostgreSQL or use cloud service.',
              dependencies: [],
              estimatedTime: '30 minutes'
            },
            {
              type: 'deploy',
              title: 'Run Database Migrations',
              description: 'Apply schema to database',
              details: 'Run npx prisma migrate dev --name init to create and apply initial migration.',
              dependencies: ['prisma'],
              estimatedTime: '15 minutes'
            }
          ]
        }
      ]
    },

    // Deployment Template
    {
      id: 'vercel-deployment',
      name: 'Vercel Deployment',
      description: 'Deploy Next.js application to Vercel with CI/CD',
      category: 'deployment',
      tags: ['vercel', 'deployment', 'cicd', 'nextjs'],
      applicableFrameworks: ['next.js'],
      estimatedTimeHours: 2,
      complexity: 'low',
      sections: [
        {
          title: 'Project Overview',
          type: 'overview',
          priority: 'high',
          content: 'Deploy Next.js application to Vercel with automatic deployments from Git.',
          items: [
            {
              type: 'overview',
              title: 'Deployment Strategy',
              description: 'Automated deployment with preview URLs',
              details: 'Set up automatic deployments from Git repository with preview deployments for pull requests.',
              dependencies: [],
              estimatedTime: '15 minutes'
            }
          ]
        },
        {
          title: 'Configuration Changes',
          type: 'configuration',
          priority: 'high',
          content: 'Prepare application for production deployment',
          items: [
            {
              type: 'configure',
              title: 'Environment Variables',
              description: 'Set up production environment variables',
              details: 'Configure production environment variables in Vercel dashboard for database URLs, API keys, and secrets.',
              dependencies: [],
              estimatedTime: '20 minutes'
            },
            {
              type: 'configure',
              title: 'Build Configuration',
              description: 'Optimize build settings',
              filePath: 'next.config.js',
              details: 'Configure Next.js for production with image optimization, bundle analysis, and performance settings.',
              dependencies: [],
              estimatedTime: '15 minutes'
            }
          ]
        },
        {
          title: 'Step-by-Step Implementation',
          type: 'steps',
          priority: 'high',
          content: 'Deployment process steps',
          items: [
            {
              type: 'deploy',
              title: 'Connect Git Repository',
              description: 'Link repository to Vercel',
              details: 'Import project from Git repository (GitHub, GitLab, or Bitbucket) to Vercel dashboard.',
              dependencies: [],
              estimatedTime: '10 minutes'
            },
            {
              type: 'deploy',
              title: 'Configure Domain',
              description: 'Set up custom domain',
              details: 'Add custom domain in Vercel dashboard and configure DNS settings if needed.',
              dependencies: [],
              estimatedTime: '30 minutes'
            }
          ]
        }
      ]
    }
  ];

  static getAllTemplates(): PlanTemplate[] {
    return this.templates;
  }

  static getTemplatesByCategory(category: string): PlanTemplate[] {
    return this.templates.filter(template => template.category === category);
  }

  static getTemplateById(id: string): PlanTemplate | undefined {
    return this.templates.find(template => template.id === id);
  }

  static getTemplatesByFramework(framework: string): PlanTemplate[] {
    return this.templates.filter(template => 
      template.applicableFrameworks.some(f => 
        f.toLowerCase().includes(framework.toLowerCase())
      )
    );
  }

  static searchTemplates(query: string): PlanTemplate[] {
    const searchTerm = query.toLowerCase();
    return this.templates.filter(template =>
      template.name.toLowerCase().includes(searchTerm) ||
      template.description.toLowerCase().includes(searchTerm) ||
      template.tags.some(tag => tag.toLowerCase().includes(searchTerm))
    );
  }

  static getTemplatesByComplexity(complexity: 'low' | 'medium' | 'high'): PlanTemplate[] {
    return this.templates.filter(template => template.complexity === complexity);
  }

  // Convert template to GeneratedPlan format
  static templateToPlan(template: PlanTemplate, customTitle?: string): any {
    return {
      id: `plan_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      title: customTitle || template.name,
      overview: template.description,
      timestamp: Date.now(),
      sections: template.sections.map((section, sectionIndex) => ({
        ...section,
        id: `section_${sectionIndex}`,
        items: section.items.map((item, itemIndex) => ({
          ...item,
          id: `item_${sectionIndex}_${itemIndex}`,
        })),
      })),
      metadata: {
        totalFiles: template.sections
          .flatMap(s => s.items)
          .filter(item => item.filePath).length,
        affectedLanguages: template.applicableFrameworks,
        complexity: template.complexity,
        estimatedTimeHours: template.estimatedTimeHours,
        tags: template.tags,
        relatedFiles: template.sections
          .flatMap(s => s.items)
          .filter(item => item.filePath)
          .map(item => item.filePath!)
      }
    };
  }

  // Get recommended templates based on project characteristics
  static getRecommendedTemplates(
    languages: string[],
    projectType?: string,
    existingFeatures?: string[]
  ): PlanTemplate[] {
    let recommendations = [...this.templates];

    // Filter by languages/frameworks
    if (languages.length > 0) {
      recommendations = recommendations.filter(template =>
        template.applicableFrameworks.some(framework =>
          languages.some(lang => 
            framework.toLowerCase().includes(lang.toLowerCase()) ||
            lang.toLowerCase().includes(framework.toLowerCase())
          )
        )
      );
    }

    // Sort by relevance and return top 6
    return recommendations
      .sort((a, b) => {
        // Prioritize by complexity (low first for beginners)
        const complexityOrder = { low: 0, medium: 1, high: 2 };
        return complexityOrder[a.complexity] - complexityOrder[b.complexity];
      })
      .slice(0, 6);
  }
}
