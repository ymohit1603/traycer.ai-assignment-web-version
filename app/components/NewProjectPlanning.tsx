"use client";

import React, { useState } from "react";
import { ClarifyingQuestionsService, NewProjectRequirements } from "../lib/clarifyingQuestions";
import { PlanTemplatesService } from "../lib/planTemplates";
import ClarifyingQuestions from "./ClarifyingQuestions";

interface NewProjectPlanningProps {
  onPlanGenerate: (requirements: NewProjectRequirements) => void;
  onClose: () => void;
  isOpen: boolean;
  apiKey: string;
}

interface ProjectStep {
  id: string;
  title: string;
  description: string;
  icon: string;
}

const PROJECT_STEPS: ProjectStep[] = [
  {
    id: 'type',
    title: 'Project Type',
    description: 'What kind of application are you building?',
    icon: '🎯'
  },
  {
    id: 'tech-stack',
    title: 'Technology Stack',
    description: 'Choose your preferred technologies',
    icon: '⚙️'
  },
  {
    id: 'features',
    title: 'Key Features',
    description: 'What features do you want to include?',
    icon: '✨'
  },
  {
    id: 'infrastructure',
    title: 'Infrastructure',
    description: 'Database, hosting, and deployment preferences',
    icon: '🏗️'
  },
  {
    id: 'requirements',
    title: 'Requirements',
    description: 'Timeline, complexity, and other requirements',
    icon: '📋'
  }
];

export default function NewProjectPlanning({ onPlanGenerate, onClose, isOpen, apiKey }: NewProjectPlanningProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [showClarifyingQuestions, setShowClarifyingQuestions] = useState(false);
  const [requirements, setRequirements] = useState<Partial<NewProjectRequirements>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  const handleStepComplete = (stepData: Partial<NewProjectRequirements>) => {
    setRequirements(prev => ({ ...prev, ...stepData }));
    
    if (currentStep < PROJECT_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleGeneratePlan();
    }
  };

  const handleGeneratePlan = async () => {
    if (!requirements.projectType || !requirements.techStack) {
      return;
    }

    // Show clarifying questions if the requirements need more details
    if (needsClarification(requirements)) {
      setShowClarifyingQuestions(true);
      return;
    }

    setIsGenerating(true);
    
    try {
      await onPlanGenerate(requirements as NewProjectRequirements);
    } catch (error) {
      console.error('Error generating project plan:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const needsClarification = (reqs: Partial<NewProjectRequirements>): boolean => {
    return !reqs.features || reqs.features.length === 0 || 
           !reqs.database || 
           !reqs.authentication ||
           !reqs.deployment;
  };

  const handleClarificationComplete = async (refinedPrompt: string) => {
    setShowClarifyingQuestions(false);
    setIsGenerating(true);
    
    try {
      // Use the refined prompt to generate the plan
      await onPlanGenerate(requirements as NewProjectRequirements);
    } catch (error) {
      console.error('Error generating project plan:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const getRecommendedTemplates = () => {
    if (requirements.techStack) {
      return PlanTemplatesService.getRecommendedTemplates(
        requirements.techStack,
        requirements.projectType
      );
    }
    return [];
  };

  if (!isOpen) return null;

  if (showClarifyingQuestions) {
    const service = new ClarifyingQuestionsService(apiKey);
    const session = service.createClarificationSession(
      `Create a new ${requirements.projectType} project using ${requirements.techStack?.join(', ')}`,
      [] // We'll generate questions based on the requirements
    );

    return (
      <ClarifyingQuestions
        session={session}
        onResponseUpdate={() => {}}
        onComplete={handleClarificationComplete}
        onCancel={() => setShowClarifyingQuestions(false)}
        isRefining={isGenerating}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-100">New Project Planning</h2>
              <p className="text-gray-400 mt-1">Let's create a comprehensive plan for your new project</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-2 rounded-md hover:bg-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center space-x-4 overflow-x-auto">
            {PROJECT_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center space-x-2 flex-shrink-0">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                  index <= currentStep 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-800 text-gray-400 border border-gray-700'
                }`}>
                  {index < currentStep ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span className={`text-sm font-medium ${
                  index <= currentStep ? 'text-gray-200' : 'text-gray-500'
                }`}>
                  {step.title}
                </span>
                {index < PROJECT_STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 ${
                    index < currentStep ? 'bg-blue-600' : 'bg-gray-800'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
          <ProjectStepContent
            step={PROJECT_STEPS[currentStep]}
            requirements={requirements}
            onComplete={handleStepComplete}
            onBack={currentStep > 0 ? () => setCurrentStep(prev => prev - 1) : undefined}
            isGenerating={isGenerating}
            recommendedTemplates={getRecommendedTemplates()}
          />
        </div>
      </div>
    </div>
  );
}

interface ProjectStepContentProps {
  step: ProjectStep;
  requirements: Partial<NewProjectRequirements>;
  onComplete: (stepData: Partial<NewProjectRequirements>) => void;
  onBack?: () => void;
  isGenerating: boolean;
  recommendedTemplates: any[];
}

function ProjectStepContent({ 
  step, 
  requirements, 
  onComplete, 
  onBack, 
  isGenerating,
  recommendedTemplates 
}: ProjectStepContentProps) {
  const [stepData, setStepData] = useState<any>({});

  const renderStepContent = () => {
    switch (step.id) {
      case 'type':
        return (
          <ProjectTypeSelection
            value={stepData.projectType || requirements.projectType}
            onChange={(projectType) => setStepData({ projectType })}
          />
        );
      
      case 'tech-stack':
        return (
          <TechStackSelection
            value={stepData.techStack || requirements.techStack}
            onChange={(techStack) => setStepData({ techStack })}
            projectType={requirements.projectType}
          />
        );
      
      case 'features':
        return (
          <FeaturesSelection
            value={stepData.features || requirements.features}
            onChange={(features) => setStepData({ features })}
            projectType={requirements.projectType}
          />
        );
      
      case 'infrastructure':
        return (
          <InfrastructureSelection
            value={{
              database: stepData.database || requirements.database,
              authentication: stepData.authentication || requirements.authentication,
              deployment: stepData.deployment || requirements.deployment
            }}
            onChange={(infraData) => setStepData(infraData)}
            techStack={requirements.techStack}
          />
        );
      
      case 'requirements':
        return (
          <RequirementsSelection
            value={{
              timeline: stepData.timeline || requirements.timeline,
              experience: stepData.experience || requirements.experience,
              budget: stepData.budget || requirements.budget,
              teamSize: stepData.teamSize || requirements.teamSize
            }}
            onChange={(reqData) => setStepData(reqData)}
            recommendedTemplates={recommendedTemplates}
          />
        );
      
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (step.id) {
      case 'type':
        return stepData.projectType || requirements.projectType;
      case 'tech-stack':
        return (stepData.techStack || requirements.techStack)?.length > 0;
      case 'features':
        return (stepData.features || requirements.features)?.length > 0;
      case 'infrastructure':
        return stepData.database || stepData.authentication || stepData.deployment;
      case 'requirements':
        return true; // Optional step
      default:
        return false;
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-4xl mb-4">{step.icon}</div>
        <h3 className="text-2xl font-semibold text-gray-100 mb-2">{step.title}</h3>
        <p className="text-gray-400">{step.description}</p>
      </div>

      {renderStepContent()}

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          disabled={!onBack}
          className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
        >
          Back
        </button>

        <button
          onClick={() => onComplete(stepData)}
          disabled={!canProceed() || isGenerating}
          className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900/60 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isGenerating ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Plan...
            </>
          ) : (
            <span>{step.id === 'requirements' ? 'Generate Plan' : 'Continue'}</span>
          )}
        </button>
      </div>
    </div>
  );
}

// Individual step components would be implemented here
// For brevity, I'm showing the interface for these components

function ProjectTypeSelection({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const projectTypes = [
    { id: 'web-frontend', name: 'Web Application (Frontend)', icon: '🌐', description: 'Single-page application with modern UI' },
    { id: 'web-fullstack', name: 'Web Application (Full-stack)', icon: '🔄', description: 'Complete web app with backend and database' },
    { id: 'mobile-app', name: 'Mobile Application', icon: '📱', description: 'iOS and Android mobile app' },
    { id: 'api-backend', name: 'API/Backend Service', icon: '🔌', description: 'REST API or GraphQL backend service' },
    { id: 'desktop-app', name: 'Desktop Application', icon: '💻', description: 'Cross-platform desktop application' },
    { id: 'cli-tool', name: 'Command Line Tool', icon: '⌨️', description: 'Terminal-based utility or tool' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {projectTypes.map(type => (
        <button
          key={type.id}
          onClick={() => onChange(type.id)}
          className={`p-4 rounded-lg border-2 text-left transition-colors ${
            value === type.id
              ? 'border-blue-500 bg-blue-900/20 text-gray-100'
              : 'border-gray-800 hover:border-gray-700 hover:bg-gray-800 text-gray-300'
          }`}
        >
          <div className="flex items-center space-x-3 mb-2">
            <span className="text-2xl">{type.icon}</span>
            <h4 className="font-semibold text-gray-100">{type.name}</h4>
          </div>
          <p className="text-sm text-gray-400">{type.description}</p>
        </button>
      ))}
    </div>
  );
}

function TechStackSelection({ value, onChange, projectType }: { 
  value?: string[]; 
  onChange: (value: string[]) => void;
  projectType?: string;
}) {
  // Implementation would show tech stack options based on project type
  const selectedTech = value || [];
  
  const techOptions = [
    'React', 'Next.js', 'Vue.js', 'Angular', 'TypeScript', 'JavaScript',
    'Node.js', 'Express', 'Python', 'Django', 'Flask', 'Java', 'Spring',
    'PostgreSQL', 'MongoDB', 'MySQL', 'Redis'
  ];

  const toggleTech = (tech: string) => {
    const newSelection = selectedTech.includes(tech)
      ? selectedTech.filter(t => t !== tech)
      : [...selectedTech, tech];
    onChange(newSelection);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {techOptions.map(tech => (
          <button
            key={tech}
            onClick={() => toggleTech(tech)}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedTech.includes(tech)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {tech}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeaturesSelection({ value, onChange, projectType }: { 
  value?: string[]; 
  onChange: (value: string[]) => void;
  projectType?: string;
}) {
  // Similar implementation for features
  return <div>Features selection component</div>;
}

function InfrastructureSelection({ value, onChange, techStack }: { 
  value: any; 
  onChange: (value: any) => void;
  techStack?: string[];
}) {
  // Implementation for database, auth, and deployment selection
  return <div>Infrastructure selection component</div>;
}

function RequirementsSelection({ value, onChange, recommendedTemplates }: { 
  value: any; 
  onChange: (value: any) => void;
  recommendedTemplates: any[];
}) {
  // Implementation for timeline, experience level, etc.
  return <div>Requirements selection component</div>;
}
