"use client";

import { useState, useEffect } from "react";
import FileUpload from "./components/FileUpload";
import FileTree from "./components/FileTree";
import PromptArea from "./components/PromptArea";
import UploadProgress from "./components/UploadProgress";
import CodebaseSearch from "./components/CodebaseSearch";
import FileViewer from "./components/FileViewer";
import PlanDisplay from "./components/PlanDisplay";
import ApiKeyConfig from "./components/ApiKeyConfig";
import ClarifyingQuestions from "./components/ClarifyingQuestions";
import NewProjectPlanning from "./components/NewProjectPlanning";
import PlanTemplatesSelector from "./components/PlanTemplatesSelector";
import PlanHistory from "./components/PlanHistory";
import PlanProgress from "./components/PlanProgress";
import IntegrationExamples from "./components/IntegrationExamples";
import { StorageManager, StoredCodebase } from "./lib/storageManager";
import { CodebaseIndex } from "./lib/codebaseParser";
import { OpenAIService, GeneratedPlan } from "./lib/openAIService";
import { 
  ClarifyingQuestionsService, 
  ClarificationSession,
  NewProjectRequirements 
} from "./lib/clarifyingQuestions";
import { PlanTemplate, PlanTemplatesService } from "./lib/planTemplates";
import { PlanHistoryService, SavedPlan, PlanComparison } from "./lib/planHistory";

export interface UploadedFile {
  name: string;
  path: string;
  size: number;
  type: string;
  content?: string;
  children?: UploadedFile[];
}

export interface UploadProgress {
  total: number;
  completed: number;
  currentFile: string;
  isUploading: boolean;
}

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    total: 0,
    completed: 0,
    currentFile: "",
    isUploading: false,
  });
  const [prompt, setPrompt] = useState<string>("");
  const [storedCodebase, setStoredCodebase] = useState<StoredCodebase | null>(null);
  const [selectedFile, setSelectedFile] = useState<CodebaseIndex | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'search' | 'viewer' | 'plan'>('upload');
  const [codebaseStats, setCodebaseStats] = useState<{
    totalFiles: number;
    totalSize: number;
    languages: string[];
  } | null>(null);
  
  // AI Integration State
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKeyConfig, setShowApiKeyConfig] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Advanced Features State
  const [clarificationSession, setClarificationSession] = useState<ClarificationSession | null>(null);
  const [showNewProjectPlanning, setShowNewProjectPlanning] = useState(false);
  const [showTemplatesSelector, setShowTemplatesSelector] = useState(false);
  const [showPlanHistory, setShowPlanHistory] = useState(false);
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [progressPlan, setProgressPlan] = useState<SavedPlan | null>(null);
  const [showIntegrationExamples, setShowIntegrationExamples] = useState(false);
  const [planComparison, setPlanComparison] = useState<PlanComparison | null>(null);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);

  const handleFilesUploaded = (files: UploadedFile[]) => {
    setUploadedFiles(files);
  };

  const handleProgressUpdate = (progress: UploadProgress) => {
    setUploadProgress(progress);
  };

  const handleCodebaseProcessed = async (codebaseId: string) => {
    try {
      const codebase = await StorageManager.getCodebase(codebaseId);
      if (codebase) {
        setStoredCodebase(codebase);
        setCodebaseStats({
          totalFiles: codebase.metadata.totalFiles,
          totalSize: codebase.metadata.totalSize,
          languages: codebase.metadata.languages,
        });
        setActiveTab('search'); // Switch to search tab after processing
      }
    } catch (error) {
      console.error('Error loading processed codebase:', error);
    }
  };

  const handleFileSelect = (fileId: string) => {
    if (storedCodebase) {
      const file = storedCodebase.files.find(f => f.fileId === fileId);
      if (file) {
        setSelectedFile(file);
        setActiveTab('viewer');
      }
    }
  };

  // Load saved API key on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('traycer_openai_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt");
      return;
    }
    
    // Check if API key is available
    if (!apiKey) {
      setShowApiKeyConfig(true);
      return;
    }

    // Check if we need clarifying questions for vague prompts
    if (ClarifyingQuestionsService.needsClarification(prompt) && storedCodebase) {
      try {
        const questionsService = new ClarifyingQuestionsService(apiKey);
        const questions = await questionsService.analyzePromptAndGenerateQuestions(prompt, storedCodebase);
        
        if (questions.length > 0) {
          const session = questionsService.createClarificationSession(prompt, questions);
          setClarificationSession(session);
          return;
        }
      } catch (error) {
        console.warn('Could not generate clarifying questions, proceeding with original prompt');
      }
    }

    // If no codebase is uploaded, suggest new project planning
    if (!storedCodebase) {
      setShowNewProjectPlanning(true);
      return;
    }

    await generatePlanFromPrompt(prompt, storedCodebase);
  };

  const generatePlanFromPrompt = async (promptText: string, codebase?: StoredCodebase) => {
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);

    try {
      const openAIService = new OpenAIService(apiKey);
      const plan = await openAIService.generateImplementationPlan(
        codebase!,
        promptText,
        4000 // max tokens
      );
      
      setGeneratedPlan(plan);
      setActiveTab('plan');
    } catch (error) {
      console.error('Error generating plan:', error);
      setPlanError(error instanceof Error ? error.message : 'Failed to generate plan');
      
      // If it's an API key error, show the config modal
      if (error instanceof Error && error.message.includes('API key')) {
        setShowApiKeyConfig(true);
      }
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleApiKeySet = (newApiKey: string) => {
    setApiKey(newApiKey);
    setShowApiKeyConfig(false);
  };

  const handleRegeneratePlan = async () => {
    if (prompt && storedCodebase && apiKey) {
      await handleSubmit();
    }
  };

  const handleClosePlan = () => {
    setGeneratedPlan(null);
    setPlanError(null);
    setActiveTab('upload');
  };

  // Clarifying Questions Handlers
  const handleClarificationResponse = (questionId: string, answer: string | string[]) => {
    if (clarificationSession) {
      const questionsService = new ClarifyingQuestionsService(apiKey);
      const updatedSession = questionsService.updateSessionResponse(clarificationSession, questionId, answer);
      setClarificationSession(updatedSession);
    }
  };

  const handleClarificationComplete = async (refinedPrompt: string) => {
    setClarificationSession(null);
    
    if (refinedPrompt && storedCodebase) {
      await generatePlanFromPrompt(refinedPrompt, storedCodebase);
    }
  };

  const handleClarificationCancel = () => {
    setClarificationSession(null);
  };

  // New Project Planning Handlers
  const handleNewProjectPlan = async (requirements: NewProjectRequirements) => {
    setShowNewProjectPlanning(false);
    
    // Convert requirements to a comprehensive prompt
    const projectPrompt = `Create a new ${requirements.projectType} project with the following requirements:
    
Technology Stack: ${requirements.techStack?.join(', ')}
Key Features: ${requirements.features?.join(', ')}
Database: ${requirements.database}
Authentication: ${requirements.authentication}
Deployment: ${requirements.deployment}
Experience Level: ${requirements.experience}
Timeline: ${requirements.timeline}`;

    // Generate plan without existing codebase
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);

    try {
      const openAIService = new OpenAIService(apiKey);
      // Create a mock codebase for new projects
      const mockCodebase: StoredCodebase = {
        metadata: {
          id: 'new-project',
          name: 'New Project',
          totalFiles: 0,
          totalSize: 0,
          languages: requirements.techStack || [],
          lastProcessed: Date.now(),
          version: '1.0.0'
        },
        files: [],
        searchIndex: {
          byKeyword: {},
          byLanguage: {},
          byFunction: {},
          byClass: {},
          byDependency: {},
          byFileName: {},
          byFilePath: {}
        }
      };

      const plan = await openAIService.generateImplementationPlan(
        mockCodebase,
        projectPrompt,
        4000
      );
      
      setGeneratedPlan(plan);
      setActiveTab('plan');
    } catch (error) {
      console.error('Error generating new project plan:', error);
      setPlanError(error instanceof Error ? error.message : 'Failed to generate plan');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  // Template Handlers
  const handleTemplateSelect = (template: PlanTemplate) => {
    const plan = PlanTemplatesService.templateToPlan(template);
    setGeneratedPlan(plan);
    setActiveTab('plan');
    setShowTemplatesSelector(false);
  };

  // Plan History Handlers
  const handlePlanSelect = (plan: SavedPlan) => {
    setGeneratedPlan(plan);
    setActiveTab('plan');
    setShowPlanHistory(false);
  };

  const handlePlanCompare = (comparison: PlanComparison) => {
    setPlanComparison(comparison);
    setShowPlanHistory(false);
    // You could create a comparison view here
  };

  const handleSavePlan = async () => {
    if (generatedPlan) {
      const planName = (window as any).prompt(`Enter a name for this plan:`, generatedPlan.title);
      if (planName) {
        try {
          await PlanHistoryService.savePlan(
            generatedPlan,
            planName,
            'Generated implementation plan',
            [],
            storedCodebase?.metadata.id,
            prompt
          );
          
          // Refresh saved plans
          setSavedPlans(PlanHistoryService.getAllPlans());
          alert('Plan saved successfully!');
        } catch (error) {
          alert('Failed to save plan');
        }
      }
    }
  };

  const handleShowProgress = (plan: SavedPlan) => {
    setProgressPlan(plan);
    setShowProgressTracker(true);
  };

  // Load saved plans on mount
  useEffect(() => {
    setSavedPlans(PlanHistoryService.getAllPlans());
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4">
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Traycer
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
            Upload your codebase and get detailed AI-powered implementation plans. 
            No coding required - just comprehensive planning and instructions.
          </p>
        </div>

        {/* Codebase Stats */}
        {codebaseStats && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{codebaseStats.totalFiles}</div>
                  <div className="text-sm text-gray-500">Files</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{formatFileSize(codebaseStats.totalSize)}</div>
                  <div className="text-sm text-gray-500">Size</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{codebaseStats.languages.length}</div>
                  <div className="text-sm text-gray-500">Languages</div>
                </div>
              </div>
              
              <div className="flex space-x-2">
                {codebaseStats.languages.slice(0, 5).map(lang => (
                  <span key={lang} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                    {lang}
                  </span>
                ))}
                {codebaseStats.languages.length > 5 && (
                  <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                    +{codebaseStats.languages.length - 5}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-t-xl shadow-lg border border-gray-200 border-b-0">
          <div className="flex">
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'upload'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              📁 Upload & Structure
            </button>
            
            <button
              onClick={() => setActiveTab('search')}
              disabled={!storedCodebase}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'search'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              🔍 Search & Explore
            </button>
            
            <button
              onClick={() => setActiveTab('viewer')}
              disabled={!selectedFile}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'viewer'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              📄 File Viewer
            </button>
            
            <button
              onClick={() => setActiveTab('plan')}
              disabled={!generatedPlan && !isGeneratingPlan}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'plan'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              🚀 Implementation Plan
              {isGeneratingPlan && (
                <div className="ml-2 inline-block w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-b-xl shadow-lg border border-gray-200 border-t-0 p-6 min-h-[600px]">
          {activeTab === 'upload' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 h-full">
              {/* Left Column - File Upload */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                    Upload Codebase
                  </h2>
                  <FileUpload
                    onFilesUploaded={handleFilesUploaded}
                    onProgressUpdate={handleProgressUpdate}
                    onCodebaseProcessed={handleCodebaseProcessed}
                  />
                </div>

                {uploadProgress.isUploading && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Processing Files
                    </h3>
                    <UploadProgress progress={uploadProgress} />
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      File Structure ({uploadedFiles.length} files)
                    </h3>
                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                      <FileTree files={uploadedFiles} />
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Prompt Area */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-800 mb-4">
                    What do you want to implement?
                  </h2>
                  <PromptArea
                    value={prompt}
                    onChange={setPrompt}
                    placeholder="e.g., 'Implement user authentication with email and password' or 'Fix the auth error in login component' or 'Add dark mode support'"
                  />
                  
                  <div className="space-y-4 mt-6">
                    {/* Quick Action Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setShowNewProjectPlanning(true)}
                        className="flex items-center space-x-2 px-3 py-2 bg-green-100 text-green-700 hover:bg-green-200 rounded-lg text-sm transition-colors"
                      >
                        <span>🆕</span>
                        <span>New Project</span>
                      </button>
                      
                      <button
                        onClick={() => setShowTemplatesSelector(true)}
                        className="flex items-center space-x-2 px-3 py-2 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-lg text-sm transition-colors"
                      >
                        <span>📋</span>
                        <span>Templates</span>
                      </button>
                      
                      <button
                        onClick={() => setShowPlanHistory(true)}
                        className="flex items-center space-x-2 px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm transition-colors"
                      >
                        <span>📚</span>
                        <span>History ({savedPlans.length})</span>
                      </button>
                    </div>

                    {/* Main Generate Button */}
                    <div className="flex space-x-3">
                      <button
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || uploadProgress.isUploading || isGeneratingPlan}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {isGeneratingPlan ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating Plan...
                          </>
                        ) : uploadProgress.isUploading ? "Processing Files..." : storedCodebase ? "Generate Plan" : "Plan New Project"}
                      </button>
                      
                      <button
                        onClick={() => setShowApiKeyConfig(true)}
                        className="px-4 py-3 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-2"
                        title={apiKey ? "Update API Key" : "Set API Key"}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span className="text-sm">
                          {apiKey ? '🟢' : '🔴'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                  <h3 className="text-lg font-semibold text-blue-800 mb-3">
                    💡 Tips for better plans
                  </h3>
                  <ul className="text-blue-700 space-y-2 text-sm">
                    <li>• Be specific about what you want to implement</li>
                    <li>• Mention your preferred tech stack if relevant</li>
                    <li>• Include any constraints or requirements</li>
                    <li>• Ask for clarification on complex features</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'search' && (
            <div>
              <h2 className="text-2xl font-semibold text-gray-800 mb-6">
                Search Your Codebase
              </h2>
              <CodebaseSearch 
                storedCodebase={storedCodebase} 
                onFileSelect={handleFileSelect}
              />
            </div>
          )}

          {activeTab === 'viewer' && (
            <div>
              <FileViewer 
                file={selectedFile} 
                onClose={() => setSelectedFile(null)}
              />
            </div>
          )}

          {activeTab === 'plan' && (
            <div className="space-y-4">
              {/* Plan Actions */}
              {generatedPlan && !isGeneratingPlan && (
                <div className="flex justify-end space-x-3 p-4 bg-gray-50 rounded-lg">
                  <button
                    onClick={handleSavePlan}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>Save Plan</span>
                  </button>
                  
                  <button
                    onClick={() => setShowIntegrationExamples(true)}
                    className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy to AI Assistant</span>
                  </button>
                </div>
              )}

              <PlanDisplay
                plan={generatedPlan}
                isLoading={isGeneratingPlan}
                error={planError}
                onClose={handleClosePlan}
                onRegeneratePlan={handleRegeneratePlan}
              />
            </div>
          )}
        </div>

        {/* Modals and Advanced Features */}
        <ApiKeyConfig
          onApiKeySet={handleApiKeySet}
          isOpen={showApiKeyConfig}
          onClose={() => setShowApiKeyConfig(false)}
        />

        {clarificationSession && (
          <ClarifyingQuestions
            session={clarificationSession}
            onResponseUpdate={handleClarificationResponse}
            onComplete={handleClarificationComplete}
            onCancel={handleClarificationCancel}
            isRefining={isGeneratingPlan}
          />
        )}

        <NewProjectPlanning
          onPlanGenerate={handleNewProjectPlan}
          onClose={() => setShowNewProjectPlanning(false)}
          isOpen={showNewProjectPlanning}
          apiKey={apiKey}
        />

        <PlanTemplatesSelector
          onTemplateSelect={handleTemplateSelect}
          onClose={() => setShowTemplatesSelector(false)}
          isOpen={showTemplatesSelector}
          projectLanguages={storedCodebase?.metadata.languages}
        />

        <PlanHistory
          onPlanSelect={handlePlanSelect}
          onPlanCompare={handlePlanCompare}
          isOpen={showPlanHistory}
          onClose={() => setShowPlanHistory(false)}
          currentCodebaseId={storedCodebase?.metadata.id}
        />

        {progressPlan && (
          <PlanProgress
            plan={progressPlan}
            onClose={() => {
              setShowProgressTracker(false);
              setProgressPlan(null);
            }}
            isOpen={showProgressTracker}
          />
        )}

        {generatedPlan && (
          <IntegrationExamples
            plan={generatedPlan}
            onClose={() => setShowIntegrationExamples(false)}
            isOpen={showIntegrationExamples}
          />
        )}
      </div>
    </div>
  );
}