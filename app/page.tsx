"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import PromptArea from "./components/PromptArea";
import UploadProgress from "./components/UploadProgress";
import FileUpload from "./components/FileUpload";
import FileTree from "./components/FileTree";
import StreamingProgressTicker from "./components/StreamingProgressTicker";
import PlanDisplay from "./components/PlanDisplay";
import { StorageManager, StoredCodebase } from "./lib/storageManager";
import { CodebaseIndex, CodebaseParser } from "./lib/codebaseParser";
import { OpenAIService, GeneratedPlan, PlanGenerationProgress } from "./lib/openAIService";
import { NewProjectRequirements } from "./lib/clarifyingQuestions";
import PlanHistory from "./components/PlanHistory";
import IntegrationExamples from "./components/IntegrationExamples";
import PlanProgressTracker from "./components/PlanProgress";
import { PlanHistoryService, SavedPlan, PlanComparison } from "./lib/planHistory";
import SemanticSearch, { SemanticSearchResult } from "./components/SemanticSearch";
import SemanticSearchResults from "./components/SemanticSearchResults";
import GitHubImport, { GitHubRepository, SyncProgress } from "./components/GitHubImport";

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

// Helper function to index uploaded files into a codebase
async function indexCodebaseFiles(uploadedFiles: UploadedFile[]): Promise<StoredCodebase> {
  console.log(`🔍 Starting codebase indexing for ${uploadedFiles.length} files...`);
  const parsedFiles: CodebaseIndex[] = [];
  
  // Parse each file with content
  for (const file of uploadedFiles) {
    if (file.content && file.content.trim()) {
      console.log(`📝 Parsing file: ${file.path} (${file.content.length} characters)`);
      try {
        const parsedFile = CodebaseParser.parseFile(file.path, file.content);
        parsedFiles.push(parsedFile);
        console.log(`✅ Parsed ${file.path}: ${parsedFile.functions.length} functions, ${parsedFile.classes.length} classes`);
      } catch (error) {
        console.error(`❌ Error parsing file ${file.path}:`, error);
      }
    } else {
      console.log(`⏭️ Skipping file with no content: ${file.path}`);
    }
  }
  
  console.log(`📊 Parsed ${parsedFiles.length} files successfully`);
  
  // Store the parsed codebase
  const codebaseName = `Codebase_${Date.now()}`;
  console.log(`💾 Storing codebase as: ${codebaseName}`);
  
  const codebaseId = await StorageManager.storeCodebase(codebaseName, parsedFiles, true);
  console.log(`✅ Codebase stored with ID: ${codebaseId}`);
  
  // Retrieve and return the stored codebase
  const storedCodebase = await StorageManager.getCodebase(codebaseId);
  if (!storedCodebase) {
    console.error('❌ Failed to retrieve stored codebase');
    throw new Error('Failed to store and retrieve codebase');
  }
  
  console.log(`🎉 Codebase indexing completed:`, {
    totalFiles: storedCodebase.metadata.totalFiles,
    languages: storedCodebase.metadata.languages,
    totalSize: storedCodebase.metadata.totalSize
  });
  
  return storedCodebase;
}

// Helper functions for file processing
function isExcludedFile(filePath: string): boolean {
  const path = filePath.toLowerCase();
  const fileName = path.split('/').pop() || '';
  
  const excludedDirs = [
    'node_modules', 'vendor', 'dist', 'build', '.next', '.out', 
    'target', '.cache', '__pycache__', '.parcel-cache', '.idea', '.vscode'
  ];
  
  for (const dir of excludedDirs) {
    if (path.includes(`/${dir}/`) || path.startsWith(`${dir}/`) || path === dir) {
      return true;
    }
  }
  
  const excludedExtensions = [
    '.exe', '.dll', '.so', '.zip', '.tar.gz', '.rar',
    '.png', '.jpg', '.jpeg', '.gif', '.svg',
    '.mp3', '.mp4', '.pdf', '.log'
  ];
  
  for (const ext of excludedExtensions) {
    if (fileName.endsWith(ext)) {
      return true;
    }
  }
  
  const excludedFiles = [
    '.ds_store', 'thumbs.db', '.env', '.env.local',
    'npm-debug.log', 'yarn-error.log', 'package-lock.json',
    'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'pipfile.lock'
  ];
  
  if (excludedFiles.includes(fileName)) {
    return true;
  }
  
  if (fileName.startsWith('.env.')) {
    return true;
  }
  
  return false;
}

function isTextFileType(file: File): boolean {
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.php', '.rb', '.go', '.rs', '.kt', '.swift', '.dart', '.scala',
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.xml', '.json',
    '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.md', '.txt',
    '.sql', '.sh', '.bat', '.ps1', '.dockerfile', '.gitignore', '.gitattributes'
  ];
  
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  return textExtensions.includes(extension) || file.type.startsWith('text/');
}

function getFileTypeFromExtension(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const typeMap: { [key: string]: string } = {
    'js': 'text/javascript',
    'jsx': 'text/javascript',
    'ts': 'text/typescript',
    'tsx': 'text/typescript',
    'py': 'text/x-python',
    'html': 'text/html',
    'css': 'text/css',
    'json': 'application/json',
    'md': 'text/markdown',
  };
  
  return typeMap[extension || ''] || 'text/plain';
}

function readFileContent(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
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
  
  // Upload and Indexing State
  const [isIndexing, setIsIndexing] = useState(false);
  const [isIndexed, setIsIndexed] = useState(false);
  
  // New Project Planning State
  const [showNewProjectPlanning, setShowNewProjectPlanning] = useState(false);
  
  // AI Integration State
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [isRefiningPlan, setIsRefiningPlan] = useState(false);
  
  // Conversation History
  const [conversationHistory, setConversationHistory] = useState<string[]>([]);
  
  // Plan Generation Progress
  const [planProgress, setPlanProgress] = useState<PlanGenerationProgress | null>(null);
  
  // Analysis Mode (always deep analysis)
  const useDeepAnalysis = true;

  // Plan History State
  const [showPlanHistory, setShowPlanHistory] = useState(false);
  const [showIntegration, setShowIntegration] = useState(false);
  const [showProgressTracker, setShowProgressTracker] = useState(false);
  const [selectedSavedPlan, setSelectedSavedPlan] = useState<SavedPlan | null>(null);

  // Semantic Search State
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [semanticSearchResults, setSemanticSearchResults] = useState<SemanticSearchResult | null>(null);
  const [searchMode, setSearchMode] = useState<'plan' | 'semantic'>('plan');

  // GitHub Integration State
  const [importedFromGitHub, setImportedFromGitHub] = useState(false);
  const [importedRepository, setImportedRepository] = useState<GitHubRepository | null>(null);
  const [githubSyncProgress, setGithubSyncProgress] = useState<SyncProgress | null>(null);


  const handleFilesUploaded = (files: UploadedFile[]) => {
    setUploadedFiles(files);
  };

  const handleProgressUpdate = (progress: UploadProgress) => {
    setUploadProgress(progress);
  };







  const handleDirectFolderUpload = () => {
    console.log('🔄 Initiating direct folder upload...');
    toast.loading('Opening folder selector...');
    
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      
      input.onchange = (e) => {
        console.log('📂 Folder selection completed');
        toast.dismiss(); // Dismiss loading toast
        
        const files = (e.target as HTMLInputElement).files;
        if (files && files.length > 0) {
          console.log(`📁 Selected ${files.length} files from folder`);
          const fileArray = Array.from(files);
          processUploadedFiles(fileArray);
        } else {
          console.warn('⚠️ No files selected');
          toast.error('No files selected');
        }
      };
      
      input.oncancel = () => {
        console.log('❌ Folder selection cancelled');
        toast.dismiss();
        toast.error('Folder selection cancelled');
      };
      
      input.click();
      console.log('🖱️ Folder selector opened');
    } catch (error) {
      console.error('❌ Error opening folder selector:', error);
      toast.dismiss();
      toast.error('Failed to open folder selector');
    }
  };

  const processUploadedFiles = async (files: File[]) => {
    console.log(`🔄 Starting to process ${files.length} files...`);
    
    try {
      // Filter out unwanted files
      const filteredFiles = files.filter(file => {
        const path = file.webkitRelativePath || file.name;
        const isExcluded = isExcludedFile(path);
        if (isExcluded) {
          console.log(`🚫 Excluded file: ${path}`);
        }
        return !isExcluded;
      });

      const excludedCount = files.length - filteredFiles.length;
      if (excludedCount > 0) {
        console.log(`🗂️ Filtered out ${excludedCount} unwanted files`);
        toast.success(`Filtered out ${excludedCount} unwanted files`);
      }

      const totalFiles = filteredFiles.length;
      let processedFiles = 0;
      const uploadedFiles: UploadedFile[] = [];

      console.log(`📁 Processing ${totalFiles} valid files...`);
      toast.loading(`Processing ${totalFiles} files...`);

      setUploadProgress({
        total: totalFiles,
        completed: 0,
        currentFile: "",
        isUploading: true,
      });

      // Process files
      for (const file of filteredFiles) {
        const relativePath = file.webkitRelativePath || file.name;
        console.log(`📄 Processing file: ${relativePath} (${file.size} bytes)`);
        
        setUploadProgress({
          total: totalFiles,
          completed: processedFiles,
          currentFile: file.name,
          isUploading: true,
        });

        try {
          let content = "";
          const isText = isTextFileType(file);
          const isSizeValid = file.size < 1024 * 1024; // 1MB limit
          
          if (isText && isSizeValid) {
            console.log(`📖 Reading content of text file: ${file.name}`);
            content = await readFileContent(file);
            console.log(`✅ Successfully read ${content.length} characters from ${file.name}`);
          } else if (!isText) {
            console.log(`🚫 Skipping non-text file: ${file.name}`);
          } else if (!isSizeValid) {
            console.log(`⚠️ Skipping large file (${file.size} bytes): ${file.name}`);
          }

          const uploadedFile: UploadedFile = {
            name: file.name,
            path: relativePath,
            size: file.size,
            type: file.type || getFileTypeFromExtension(file.name),
            content: content,
          };

          uploadedFiles.push(uploadedFile);
          console.log(`✅ Successfully processed: ${relativePath}`);
        } catch (error) {
          console.error(`❌ Error processing file ${file.name}:`, error);
          toast.error(`Failed to process: ${file.name}`);
        }

        processedFiles++;
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      setUploadProgress({
        total: totalFiles,
        completed: totalFiles,
        currentFile: "",
        isUploading: false,
      });

      setUploadedFiles(uploadedFiles);
      
      const textFilesCount = uploadedFiles.filter(f => f.content).length;
      console.log(`🎉 Upload completed! ${uploadedFiles.length} files processed, ${textFilesCount} with content`);
      toast.dismiss();
      toast.success(`Successfully uploaded ${uploadedFiles.length} files (${textFilesCount} text files)`);
      
    } catch (error) {
      console.error('❌ Error during file processing:', error);
      toast.dismiss();
      toast.error('Failed to process uploaded files');
      
      setUploadProgress({
        total: 0,
        completed: 0,
        currentFile: "",
        isUploading: false,
      });
    }
  };

    const handleSubmit = async () => {
    console.log('🚀 Starting plan generation process...');
    
    if (!prompt.trim()) {
      console.warn('⚠️ Empty prompt provided');
      toast.error("Please enter a prompt");
      return;
    }

    console.log(`📝 Prompt: "${prompt}"`);

    // If no files are uploaded, start from scratch automatically
    if (!uploadedFiles.length && !isIndexed) {
      console.log('🆕 No codebase uploaded, starting from scratch...');
      // Instead of showing project planning modal, handle it directly with clarifying questions
      await handleStartFromScratch();
      return;
    }

    console.log(`📁 Found ${uploadedFiles.length} uploaded files`);

    // First, index the uploaded codebase
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);

    const loadingToast = toast.loading('Indexing codebase and generating plan...');

    try {
      console.log('🔍 Starting codebase indexing...');
      setIsIndexing(true);
      setIsIndexed(false);
      
      // Index the uploaded files
      const indexedCodebase = await indexCodebaseFiles(uploadedFiles);
      console.log(`✅ Codebase indexed successfully: ${indexedCodebase.metadata.totalFiles} files, ${indexedCodebase.metadata.languages.join(', ')}`);
      setStoredCodebase(indexedCodebase);
      setIsIndexing(false);
      setIsIndexed(true);
      
      toast.dismiss(loadingToast);
      toast.loading('Generating implementation plan...');
      
      console.log('🤖 Starting plan generation...');
      // Then generate the plan
      await generatePlanFromPrompt(prompt, indexedCodebase);
    } catch (error) {
      console.error('❌ Error during codebase indexing or plan generation:', error);
      toast.dismiss(loadingToast);
      toast.error(error instanceof Error ? error.message : 'Failed to process codebase and generate plan');
      setPlanError(error instanceof Error ? error.message : 'Failed to process codebase and generate plan');
      setIsGeneratingPlan(false);
      setIsIndexing(false);
    }
  };

  const generatePlanFromPrompt = async (promptText: string, codebase?: StoredCodebase) => {
    console.log('🤖 Generating plan from prompt...', { promptText, codebaseFiles: codebase?.metadata.totalFiles });
    
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);
    setPlanProgress(null);

    try {
      console.log('🔧 Initializing OpenAI service...');
      const openAIService = new OpenAIService();
      
      console.log('📊 Sending request to OpenAI API...');
      const plan = await openAIService.generateImplementationPlan(
        codebase!,
        promptText,
        4000, // max tokens
        (progress) => setPlanProgress(progress), // progress callback
        useDeepAnalysis // analysis mode
      );
      
      console.log('✅ Plan generated successfully:', {
        planId: plan.id,
        title: plan.title,
        sectionsCount: plan.sections.length,
        estimatedTime: plan.metadata.estimatedTimeHours
      });
      
      setGeneratedPlan(plan);
      setConversationHistory([promptText]); // Initialize conversation history
      
      // Automatically save the plan to history
      try {
        const saved = await PlanHistoryService.savePlan(
          plan,
          plan.title,
          plan.overview,
          plan.metadata.tags || [],
          storedCodebase?.metadata.id,
          promptText
        );
        setSelectedSavedPlan(saved);
        console.log('✅ Plan saved to history');
      } catch (error) {
        console.warn('⚠️ Failed to save plan to history:', error);
      }
      
      toast.dismiss(); // Dismiss any loading toasts
      toast.success(`Plan generated successfully! ${plan.sections.length} sections created`);
      
    } catch (error) {
      console.error('❌ Error generating plan:', error);
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to generate plan');
      setPlanError(error instanceof Error ? error.message : 'Failed to generate plan');
    } finally {
      setIsGeneratingPlan(false);
      setPlanProgress(null);
      console.log('🏁 Plan generation process completed');
    }
  };

  const handleRegeneratePlan = async () => {
    if (prompt && storedCodebase) {
      await handleSubmit();
    }
  };

  const handleClosePlan = () => {
    setGeneratedPlan(null);
    setPlanError(null);
    setConversationHistory([]);
  };

  const handleStartFromScratch = async () => {
    console.log('🆕 Starting from scratch with clarifying questions...');
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);
    setPlanProgress(null);

    const loadingToast = toast.loading('Generating plan based on your requirements...');

    try {
      console.log('🤖 Starting new project plan generation from scratch...');
      const openAIService = new OpenAIService();
      
      // Use the user's prompt to generate a plan and ask clarifying questions through AI
      const contextualPrompt = `The user wants to start a new project from scratch. Their request: "${prompt}"
      
Based on this request, create a comprehensive implementation plan. If the request is vague or missing technical details, make reasonable assumptions about the tech stack and project structure, but include clarifying questions in the plan overview about what technologies, frameworks, or specific requirements they might want to consider.
      
Generate a complete project plan including:
1. Recommended tech stack based on the request
2. Project structure
3. Step-by-step implementation guide
4. Any clarifying questions for the user to consider`;
      
      // Generate plan for new project (without existing codebase)
      const plan = await openAIService.generateNewProjectPlan(
        contextualPrompt,
        {
          projectType: 'web-application', // default
          techStack: [], // Let AI decide
          features: [],
          database: '',
          authentication: '',
          deployment: ''
        },
        4000,
        (progress) => setPlanProgress(progress) // progress callback
      );
      
      console.log('✅ New project plan generated successfully:', {
        planId: plan.id,
        title: plan.title,
        sectionsCount: plan.sections.length,
        estimatedTime: plan.metadata.estimatedTimeHours
      });
      
      setGeneratedPlan(plan);
      setConversationHistory([prompt]); // Initialize conversation history 
      
      // Automatically save the plan to history
      try {
        await PlanHistoryService.savePlan(
          plan,
          plan.title,
          plan.overview,
          plan.metadata.tags || [],
          undefined, // No codebase for new projects
          prompt
        );
        console.log('✅ New project plan saved to history');
      } catch (error) {
        console.warn('⚠️ Failed to save new project plan to history:', error);
      }
      
      toast.dismiss();
      toast.success(`Project plan generated! ${plan.sections.length} sections created`);
      
    } catch (error) {
      console.error('❌ Error generating new project plan:', error);
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to generate project plan');
      setPlanError(error instanceof Error ? error.message : 'Failed to generate project plan');
    } finally {
      setIsGeneratingPlan(false);
      setPlanProgress(null);
      console.log('🏁 New project plan generation completed');
    }
  };

  const handleNewProjectPlan = async (requirements: NewProjectRequirements) => {
    console.log('🆕 Generating plan for new project...', requirements);
    setShowNewProjectPlanning(false);
    setIsGeneratingPlan(true);
    setPlanError(null);
    setGeneratedPlan(null);

    const loadingToast = toast.loading('Generating project plan...');

    try {
      console.log('🤖 Starting new project plan generation...');
      const openAIService = new OpenAIService();
      
      // Create a prompt based on the requirements
      const projectPrompt = `Create a new ${requirements.projectType} project using ${requirements.techStack?.join(', ')}. 

Project Requirements:
- Features: ${requirements.features?.join(', ')}
- Database: ${requirements.database}
- Authentication: ${requirements.authentication}
- Deployment: ${requirements.deployment}
- Timeline: ${requirements.timeline}
- Experience Level: ${requirements.experience}

User Request: ${prompt}`;
      
      // Generate plan for new project (without existing codebase)
      const plan = await openAIService.generateNewProjectPlan(
        projectPrompt,
        requirements,
        4000,
        (progress) => setPlanProgress(progress) // progress callback
      );
      
      console.log('✅ New project plan generated successfully:', {
        planId: plan.id,
        title: plan.title,
        sectionsCount: plan.sections.length,
        estimatedTime: plan.metadata.estimatedTimeHours
      });
      
      setGeneratedPlan(plan);
      setConversationHistory([prompt]); // Initialize conversation history 
      
      // Automatically save the plan to history
      try {
        await PlanHistoryService.savePlan(
          plan,
          plan.title,
          plan.overview,
          plan.metadata.tags || [],
          undefined, // No codebase for new projects
          projectPrompt
        );
        console.log('✅ New project plan with requirements saved to history');
      } catch (error) {
        console.warn('⚠️ Failed to save new project plan to history:', error);
      }
      
      toast.dismiss();
      toast.success(`Project plan generated! ${plan.sections.length} sections created`);
      
    } catch (error) {
      console.error('❌ Error generating new project plan:', error);
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to generate project plan');
      setPlanError(error instanceof Error ? error.message : 'Failed to generate project plan');
    } finally {
      setIsGeneratingPlan(false);
      setPlanProgress(null);
      console.log('🏁 New project plan generation completed');
    }
  };

  const handleRefinePlan = async (followUpPrompt: string) => {
    console.log('🔄 Refining plan with follow-up prompt...', followUpPrompt);
    
    if (!generatedPlan) {
      console.warn('⚠️ No existing plan to refine');
      toast.error('No plan to refine');
      return;
    }

    setIsRefiningPlan(true);
    setPlanError(null);

    const loadingToast = toast.loading('Refining plan based on your feedback...');

    try {
      console.log('🤖 Starting plan refinement...');
      const openAIService = new OpenAIService();
      
      // Add the new prompt to conversation history
      const newHistory = [...conversationHistory, prompt, followUpPrompt];
      setConversationHistory(newHistory);
      
      // Create a combined prompt with context
      const contextualPrompt = `Previous conversation:
${newHistory.slice(0, -1).map((msg, i) => `${i % 2 === 0 ? 'User' : 'Assistant'}: ${msg}`).join('\n')}\n\nUser: ${followUpPrompt}\n\nPlease update the existing plan based on this feedback. Keep the good parts and improve/add what's requested.`;
      
      let refinedPlan: GeneratedPlan;
      
      if (storedCodebase) {
        // Refine plan for existing codebase
        refinedPlan = await openAIService.generateImplementationPlan(
          storedCodebase,
          contextualPrompt,
          4000,
          (progress) => setPlanProgress(progress), // progress callback
          useDeepAnalysis // analysis mode
        );
      } else {
        // This shouldn't happen, but handle gracefully
        toast.error('Cannot refine plan without codebase context');
        return;
      }
      
      console.log('✅ Plan refined successfully:', {
        planId: refinedPlan.id,
        title: refinedPlan.title,
        sectionsCount: refinedPlan.sections.length,
        estimatedTime: refinedPlan.metadata.estimatedTimeHours
      });
      
      setGeneratedPlan(refinedPlan);
      
      // Save the refined plan as a new version
      try {
        const saved = await PlanHistoryService.savePlan(
          refinedPlan,
          refinedPlan.title + ' (Refined)',
          refinedPlan.overview,
          refinedPlan.metadata.tags || [],
          storedCodebase?.metadata.id,
          contextualPrompt
        );
        setSelectedSavedPlan(saved);
        console.log('✅ Refined plan saved to history');
      } catch (error) {
        console.warn('⚠️ Failed to save refined plan to history:', error);
      }
      
      toast.dismiss();
      toast.success('Plan refined successfully!');
      
    } catch (error) {
      console.error('❌ Error refining plan:', error);
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to refine plan');
      setPlanError(error instanceof Error ? error.message : 'Failed to refine plan');
    } finally {
      setIsRefiningPlan(false);
      setPlanProgress(null);
      console.log('🏁 Plan refinement completed');
    }
  };

  // Plan History Event Handlers
  const handlePlanSelect = (selectedPlan: SavedPlan) => {
    console.log('📋 Loading plan from history:', selectedPlan.name);
    setGeneratedPlan(selectedPlan);
    setSelectedSavedPlan(selectedPlan);
    setShowPlanHistory(false);
    toast.success(`Loaded plan: ${selectedPlan.name}`);
  };

  const handlePlanCompare = (comparison: PlanComparison) => {
    console.log('🔄 Comparing plans:', comparison.planA.name, 'vs', comparison.planB.name);
    // For now, just show the first plan. In a more complete implementation,
    // you might want to show a comparison view
    setGeneratedPlan(comparison.planA);
    setShowPlanHistory(false);
    toast.success(`Comparing plans: ${comparison.planA.name} vs ${comparison.planB.name}`);
  };

  // Semantic Search Event Handlers
  const handleSemanticSearchResults = (results: SemanticSearchResult) => {
    console.log('🧠 Semantic search results received:', results);
    setSemanticSearchResults(results);
    toast.success(`Found ${results.searchResults.chunks.length} relevant code segments`);
  };

  const handleCloseSemanticResults = () => {
    setSemanticSearchResults(null);
  };

  const toggleSearchMode = () => {
    const newMode = searchMode === 'plan' ? 'semantic' : 'plan';
    setSearchMode(newMode);
    
    // Clear current results when switching modes
    if (newMode === 'semantic') {
      setGeneratedPlan(null);
      setPlanError(null);
    } else {
      setSemanticSearchResults(null);
    }
    
    console.log(`🔄 Switched to ${newMode} mode`);
    toast.success(`Switched to ${newMode === 'plan' ? 'Plan Generation' : 'Semantic Search'} mode`);
  };

  // GitHub Event Handlers
  const handleRepositoryImported = async (repository: GitHubRepository, syncProgress: SyncProgress) => {
    console.log('📁 Repository imported from GitHub:', repository.fullName);
    
    setImportedFromGitHub(true);
    setImportedRepository(repository);
    setGithubSyncProgress(syncProgress);
    
    // Create a synthetic stored codebase from the GitHub repository
    if (syncProgress.result) {
      const githubCodebase = {
        metadata: {
          id: `github_${repository.owner.login}_${repository.name}`,
          name: repository.fullName,
          totalFiles: syncProgress.result.filesCount,
          totalSize: repository.size * 1024, // GitHub size is in KB
          languages: repository.language ? [repository.language.toLowerCase()] : ['unknown'],
          lastProcessed: Date.now(),
          created: Date.now(),
          source: 'github' as const,
          repositoryUrl: repository.htmlUrl,
          commit: syncProgress.result.commit,
          merkleTreeHash: syncProgress.result.merkleTreeHash
        },
        files: [] // Files are already indexed in Pinecone, no need to store locally
      };
      
      setStoredCodebase(githubCodebase as any);
      setIsIndexed(true);
      
      toast.success(`🎉 Repository ${repository.name} imported and indexed successfully! ${syncProgress.result.filesCount} files processed.`);
    }
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-800 p-4 sm:p-6 lg:p-8 ${(isGeneratingPlan || isRefiningPlan) ? 'body-with-ticker' : ''}`}>
      {/* Streaming Progress Ticker */}
      <StreamingProgressTicker 
        progress={planProgress} 
        isVisible={isGeneratingPlan || isRefiningPlan} 
      />
      
      <div className="max-w-4xl mx-auto">
        {/* Header */}
      
        {/* Main Content - Centered Prompt Area */}
        <div className="space-y-8">
          {/* Mode Toggle */}
          <div className="flex justify-center">
            <div className="bg-gray-800 rounded-lg p-1 border border-gray-700">
              <div className="flex">
                <button
                  onClick={() => searchMode === 'semantic' && toggleSearchMode()}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    searchMode === 'plan'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  🔧 Plan Generation
                </button>
                <button
                  onClick={() => searchMode === 'plan' && toggleSearchMode()}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${
                    searchMode === 'semantic'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  🧠 Semantic Search
                </button>
              </div>
            </div>
          </div>

          {searchMode === 'plan' ? (
            <>
              {/* Plan Generation Mode */}
              <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-8">
                <PromptArea
                  value={prompt}
                  onChange={setPrompt}
                  placeholder="Describe what you want to implement in your codebase..."
                />
         
                {/* Buttons */}
                <div className="flex justify-center items-center space-x-4 mt-6">
              {/* Plan History Button */}
                      <button
                onClick={() => setShowPlanHistory(true)}
                className="bg-gray-700 hover:bg-gray-600 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center space-x-2 border border-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Plan History</span>
              </button>

              {/* Upload Codebase Button */}
              <button
                onClick={isIndexed ? undefined : handleDirectFolderUpload}
                disabled={isIndexing || uploadProgress.isUploading || isIndexed || importedFromGitHub}
                className={`${isIndexed || importedFromGitHub
                  ? 'bg-green-600 cursor-default' 
                  : 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600'
                } disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center space-x-2 border ${isIndexed || importedFromGitHub ? 'border-green-500' : 'border-gray-600'}`}
              >
                {isIndexed || importedFromGitHub ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{importedFromGitHub ? 'GitHub Imported' : 'Codebase Uploaded'}</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span>{isIndexing ? 'Indexing...' : 'Upload Codebase'}</span>
                  </>
                )}
              </button>

              {/* GitHub Import Button */}
              <GitHubImport
                onRepositoryImported={handleRepositoryImported}
                disabled={isIndexing || uploadProgress.isUploading || isIndexed || importedFromGitHub}
              />
                      
              {/* Send Button */}
                      <button
                        onClick={handleSubmit}
                        disabled={!prompt.trim() || uploadProgress.isUploading || isGeneratingPlan || isIndexing}
                className="bg-gray-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-200 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                      >
                        {isGeneratingPlan ? (
                          <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating Plan...
                          </>
                ) : uploadProgress.isUploading ? "Processing Files..." : "Send"}
                      </button>
                  </div>
                </div>
            </>
          ) : (
            <>
              {/* Semantic Search Mode */}
              <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-8">
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-semibold text-gray-200 mb-2">🧠 Semantic Codebase Search</h2>
                  <p className="text-sm text-gray-400">
                    Ask natural language questions about your codebase and get intelligent, context-aware answers
                  </p>
                </div>
                
                <SemanticSearch
                  codebaseId={storedCodebase?.metadata.id || ''}
                  onResultsFound={handleSemanticSearchResults}
                  className="w-full"
                />
              </div>
            </>
          )}

                    {/* Upload Progress */}
          {uploadProgress.isUploading && (
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6">
              <UploadProgress progress={uploadProgress} />
            </div>
          )}

          {/* Files Uploaded Info - Always visible after upload */}
          {uploadedFiles.length > 0 && !uploadProgress.isUploading && (
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-blue-500 p-6">
              <div className="flex items-center space-x-2 text-blue-400 mb-3">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="font-medium">Files Uploaded</span>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-300">
                  {uploadedFiles.length} files uploaded • {uploadedFiles.filter(f => f.content).length} text files with content
                </p>
                <div className="flex flex-wrap gap-2">
                  {uploadedFiles.slice(0, 10).map((file, index) => (
                    <span key={index} className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded">
                      {file.name}
                    </span>
                  ))}
                  {uploadedFiles.length > 10 && (
                    <span className="px-2 py-1 bg-gray-600 text-gray-400 text-xs rounded">
                      +{uploadedFiles.length - 10} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Indexing Progress */}
          {isIndexing && (
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-blue-500 p-6">
              <div className="flex items-center space-x-2 text-blue-400">
                <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-medium">Indexing codebase...</span>
              </div>
              <p className="text-sm text-gray-300 mt-1">
                Processing files and creating searchable index...
              </p>
            </div>
          )}



          {/* Indexing Success Message */}
          {isIndexed && storedCodebase && (
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-green-500 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-green-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">
                    {importedFromGitHub ? 'GitHub Repository Indexed' : 'Codebase Indexed'}
                  </span>
                </div>
                
                {importedFromGitHub && importedRepository && (
                  <div className="flex items-center space-x-2">
                    <a
                      href={importedRepository.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-sm flex items-center space-x-1"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      <span>View on GitHub</span>
                    </a>
                  </div>
                )}
              </div>
              
              <div className="mt-2">
                {importedFromGitHub && importedRepository ? (
                  <div className="space-y-1">
                    <p className="text-sm text-gray-300">
                      {importedRepository.fullName} • {storedCodebase.metadata.totalFiles} files processed
                    </p>
                    <div className="flex items-center space-x-4 text-xs text-gray-400">
                      <span>{storedCodebase.metadata.languages.join(', ')}</span>
                      {importedRepository.language && (
                        <span className="px-2 py-1 bg-blue-600 bg-opacity-30 text-blue-300 rounded">
                          {importedRepository.language}
                        </span>
                      )}
                      {importedRepository.private && (
                        <span className="px-2 py-1 bg-yellow-600 bg-opacity-30 text-yellow-300 rounded">
                          Private
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 mt-1">
                    {storedCodebase.metadata.totalFiles} files processed • {storedCodebase.metadata.languages.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Plan Display */}
          {(generatedPlan || isGeneratingPlan || planError) && searchMode === 'plan' && (
            <div className="bg-gray-800 rounded-xl shadow-2xl border border-gray-700 p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold text-gray-100">Implementation Plan</h3>
                {generatedPlan && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowIntegration(true)}
                      className="px-3 py-2 text-sm text-gray-200 border border-gray-700 rounded hover:bg-gray-700"
                    >
                      Export / Copy
                    </button>
                    <button
                      onClick={() => {
                        setSelectedSavedPlan((prev) => {
                          const plans = PlanHistoryService.getAllPlans();
                          const found = plans.find(p => p.id === (generatedPlan as any).id) || null;
                          return found;
                        });
                        setShowProgressTracker(true);
                      }}
                      className="px-3 py-2 text-sm text-gray-200 border border-gray-700 rounded hover:bg-gray-700"
                    >
                      Track Progress
                    </button>
                  </div>
                )}
              </div>
              <PlanDisplay
                plan={generatedPlan}
                isLoading={isGeneratingPlan}
                error={planError}
                onClose={handleClosePlan}
                onRegeneratePlan={handleRegeneratePlan}
                onRefinePlan={handleRefinePlan}
                isRefining={isRefiningPlan}
                progress={planProgress}
              />
            </div>
          )}

          {/* Semantic Search Results */}
          {semanticSearchResults && searchMode === 'semantic' && (
            <SemanticSearchResults
              results={semanticSearchResults}
              onClose={handleCloseSemanticResults}
            />
          )}
        </div>
      </div>
      
     
      {/* Plan History Modal */}
      {showPlanHistory && (
        <PlanHistory
          isOpen={showPlanHistory}
          onClose={() => setShowPlanHistory(false)}
          onPlanSelect={handlePlanSelect}
          onPlanCompare={handlePlanCompare}
          currentCodebaseId={storedCodebase?.metadata.id}
        />
      )}

      {/* Integration Examples Modal */}
      {showIntegration && generatedPlan && (
        <IntegrationExamples
          plan={generatedPlan}
          isOpen={showIntegration}
          onClose={() => setShowIntegration(false)}
        />
      )}
      
      {/* Plan Progress Tracker Modal */}
      {showProgressTracker && selectedSavedPlan && (
        <PlanProgressTracker
          plan={selectedSavedPlan}
          isOpen={showProgressTracker}
          onClose={() => setShowProgressTracker(false)}
        />
      )}
    </div>
  );
}