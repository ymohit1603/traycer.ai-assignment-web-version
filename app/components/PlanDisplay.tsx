"use client";

import React, { useState } from "react";
import { GeneratedPlan, PlanSection, PlanItem, PlanGenerationProgress } from "../lib/openAIService";

// Helper function to get action type for display
const getActionType = (item: PlanItem): string => {
  return item.type === 'create' ? 'NEW' : 'MODIFY';
};

// Helper function to process text and make file paths blue
const processFilePathsInText = (text: string): React.ReactElement => {
  // Enhanced pattern to match various file path formats
  const filePathPattern = /(\*\*`[^`]+\.[a-zA-Z0-9]+`\*\*|`[^`]+\.[a-zA-Z0-9]+`|\*\*[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\/-]*\.[a-zA-Z0-9]+\*\*|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\/-]*\.[a-zA-Z0-9]+|\b[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+\b)/g;
  
  const parts = text.split(filePathPattern);
  
  return (
    <>
      {parts.map((part, index) => {
        // Create a new regex for testing since we need a fresh instance
        const testPattern = /(\*\*`[^`]+\.[a-zA-Z0-9]+`\*\*|`[^`]+\.[a-zA-Z0-9]+`|\*\*[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\/-]*\.[a-zA-Z0-9]+\*\*|[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.\/-]*\.[a-zA-Z0-9]+|\b[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+\b)/;
        
        if (testPattern.test(part)) {
          // This is a file path - clean up the markdown and style it
          const cleanPath = part.replace(/\*\*`|`\*\*|`|\*\*/g, '');
          return (
            <span 
              key={index} 
              className="text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded font-mono font-semibold"
            >
              {cleanPath}
            </span>
          );
        }
        return part;
      })}
    </>
  );
};

interface PlanDisplayProps {
  plan: GeneratedPlan | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onRegeneratePlan?: () => void;
  onRefinePlan?: (followUpPrompt: string) => void;
  isRefining?: boolean;
  progress?: PlanGenerationProgress | null;
}

export default function PlanDisplay({ plan, isLoading, error, onClose, onRegeneratePlan, onRefinePlan, isRefining, progress }: PlanDisplayProps) {
  const [expandedSections, setExpandedSections] = useState<{ [key: string]: boolean }>({});
  const [copiedItems, setCopiedItems] = useState<{ [key: string]: boolean }>({});
  const [followUpPrompt, setFollowUpPrompt] = useState<string>('');
  const [showFollowUp, setShowFollowUp] = useState<boolean>(false);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  const copyToClipboard = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => ({ ...prev, [itemId]: true }));
      setTimeout(() => {
        setCopiedItems(prev => ({ ...prev, [itemId]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const copyFullPlan = async () => {
    if (!plan) return;
    
    let fullPlanText = `# ${plan.title}\n\n`;
    
    // Observations section
    const observationsSection = plan.sections.find(s => s.id === 'observations');
    if (observationsSection) {
      fullPlanText += `**Observations**\n${observationsSection.content}\n\n`;
    }
    
    // Approach section
    const approachSection = plan.sections.find(s => s.id === 'approach');
    if (approachSection) {
      fullPlanText += `**Approach**\n${approachSection.content}\n\n`;
    }
    
    // Implementation Files section
    const filesSection = plan.sections.find(s => s.id === 'files');
    if (filesSection) {
      filesSection.items
        .filter(item => {
          // Only filter out entries that are EXPLICITLY marked as optional in parentheses or brackets
          const fileName = item.filePath?.split('/').pop() || item.filePath || '';
          const actionType = getActionType(item);
          const description = item.details || '';
          
          // More restrictive filtering - only exclude if explicitly marked as optional
          const isExplicitlyOptional = (
            fileName.includes('(optional)') || fileName.includes('[optional]') ||
            actionType.includes('(optional)') || actionType.includes('[optional]') ||
            description.includes('(optional)') || description.includes('[optional]')
          );
          
          return !isExplicitlyOptional;
        })
        .forEach(item => {
          const fileName = item.filePath?.split('/').pop() || item.filePath || 'Unknown file';
          fullPlanText += `${fileName}\n`;
          fullPlanText += `${getActionType(item)}\n`;
          fullPlanText += `${item.details}\n\n`;
        });
    }
    
    await copyToClipboard(fullPlanText, 'full-plan');
  };

  const getSectionIcon = (type: string): string => {
    const icons: { [key: string]: string } = {
      overview: '📋',
      files: '📁',
      dependencies: '📦',
      steps: '🚀',
      configuration: '⚙️',
      testing: '🧪',
      deployment: '🌐',
    };
    return icons[type] || '📄';
  };

  const getSectionTitle = (section: PlanSection): string => {
    // For the new format, use specific titles
    if (section.id === 'observations') return 'Observations';
    if (section.id === 'approach') return 'Approach';
    if (section.id === 'files') return 'Implementation Files';
    return section.title;
  };

  const getItemIcon = (type: string): string => {
    const icons: { [key: string]: string } = {
      create: '✨',
      modify: '✏️',
      install: '📦',
      configure: '⚙️',
      test: '🧪',
      deploy: '🚀',
      overview: '📋',
    };
    return icons[type] || '•';
  };

  const getPriorityColor = (priority: string): string => {
    const colors: { [key: string]: string } = {
      high: 'text-red-600 bg-red-100',
      medium: 'text-yellow-600 bg-yellow-100',
      low: 'text-green-600 bg-green-100',
    };
    return colors[priority] || 'text-gray-600 bg-gray-100';
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 p-8">
        <div className="text-center">
          {isRefining && (
            <div className="mb-6 p-4 bg-purple-900/30 border border-purple-800 rounded-lg">
              <div className="flex items-center justify-center space-x-2 text-purple-300">
                <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-semibold">🔄 Refining Your Plan</span>
              </div>
              <p className="text-sm text-purple-300 mt-2">
                Taking your feedback into account and updating the implementation plan...
              </p>
            </div>
          )}
          
          <div className={`inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white ${
            isRefining ? 'bg-purple-600' : 'bg-blue-600'
          }`}>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {isRefining ? 'Refining Plan...' : 'Generating Implementation Plan...'}
          </div>
          <p className="text-gray-300 mt-4">{isRefining ? 'Incorporating your suggestions and improving the plan...' : 'Analyzing your codebase and creating a detailed plan...'}</p>
          
          {/* Cursor AI-like Progress Display */}
          {progress && (
            <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
              {/* Current Action - Large and Prominent */}
              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-2">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  <span className="text-lg font-medium text-gray-100">{progress.message}</span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-700 rounded-full h-1.5">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${progress.progress}%` }}
                  ></div>
                </div>
                <div className="text-right text-xs text-gray-400 mt-1">{progress.progress}%</div>
              </div>
              
              {/* Current File Being Read - Prominent Display */}
              {progress.currentFile && (
                <div className="bg-gray-900 rounded-lg p-3 border border-blue-900/40 shadow-sm">
                  <div className="flex items-center space-x-2">
                    <div className="w-1 h-1 bg-green-400 rounded-full animate-ping"></div>
                    <svg className="w-4 h-4 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-mono text-blue-300 font-medium">{progress.currentFile}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-400 ml-6">Reading and analyzing file contents...</div>
                </div>
              )}
              
              {/* Step Information */}
              <div className="mt-3 text-xs text-gray-400 uppercase tracking-wide">
                {progress.step === 'analyzing' && 'ANALYZING CODEBASE'}
                {progress.step === 'generating' && 'GENERATING PLAN'}
                {progress.step === 'finalizing' && 'FINALIZING PLAN'}
                {progress.step === 'complete' && 'COMPLETE'}
              </div>
            </div>
          )}
          
          {/* Fallback progress display when no specific progress */}
          {!progress && (
            <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="space-y-3">
                {isRefining ? (
                  <>
                    <div className="flex items-center space-x-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                      <span className="text-sm font-medium">🔄 Reviewing your feedback...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <span className="text-sm font-medium">🧠 Updating plan sections...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-purple-300">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <span className="text-sm font-medium">✨ Improving recommendations...</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center space-x-3 text-blue-300">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <span className="text-sm font-medium">🔍 Analyzing codebase structure...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-blue-300">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <span className="text-sm font-medium">🧠 Processing with AI...</span>
                    </div>
                    <div className="flex items-center space-x-3 text-blue-300">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                      <span className="text-sm font-medium">📋 Generating detailed plan...</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800 p-8">
        <div className="text-center">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5C3.312 16.333 4.274 18 5.814 18z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-100 mb-2">Plan Generation Failed</h3>
          <p className="text-gray-300 mb-6">{error}</p>
          
          <div className="flex justify-center space-x-4">
            {onRegeneratePlan && (
              <button
                onClick={onRegeneratePlan}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-6 py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!plan) {
    return null;
  }

  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-800">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gradient-to-r from-gray-900 via-gray-900 to-gray-900">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-100 mb-2">{plan.title}</h2>
            <p className="text-gray-300 mb-4">{plan.overview}</p>
          </div>
          
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={copyFullPlan}
              className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
            >
              {copiedItems['full-plan'] ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy Full Plan</span>
                </>
              )}
            </button>
            
            {onRefinePlan && (
              <button
                onClick={() => setShowFollowUp(!showFollowUp)}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{showFollowUp ? 'Hide Chat' : 'Continue Chat'}</span>
              </button>
            )}
            
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-200 p-2 rounded-md hover:bg-gray-800"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Clean Plan Display */}
      <div className="p-6 space-y-8">
        {/* Observations Section */}
        {plan.sections.find(s => s.id === 'observations') && (
          <div>
            <h2 className="text-xl font-bold text-gray-100 mb-4">Observations</h2>
            <div className="plan-content text-gray-300 leading-relaxed whitespace-pre-wrap">
              {processFilePathsInText(plan.sections.find(s => s.id === 'observations')?.content || '')}
            </div>
          </div>
        )}

        {/* Approach Section */}
        {plan.sections.find(s => s.id === 'approach') && (
          <div>
            <h2 className="text-xl font-bold text-gray-100 mb-4">Approach</h2>
            <div className="plan-content text-gray-300 leading-relaxed whitespace-pre-wrap">
              {processFilePathsInText(plan.sections.find(s => s.id === 'approach')?.content || '')}
            </div>
          </div>
        )}

        {/* Implementation Files Section */}
        {plan.sections.find(s => s.id === 'files') && (
                <div>
            <h2 className="text-xl font-bold text-gray-100 mb-4">Implementation Files</h2>
            {plan.sections.find(s => s.id === 'files')?.items
              .filter(item => {
                // Only filter out entries that are EXPLICITLY marked as optional in parentheses or brackets
                const fileName = item.filePath?.split('/').pop() || item.filePath || '';
                const actionType = getActionType(item);
                const description = item.details || '';
                
                // More restrictive filtering - only exclude if explicitly marked as optional
                const isExplicitlyOptional = (
                  fileName.includes('(optional)') || fileName.includes('[optional]') ||
                  actionType.includes('(optional)') || actionType.includes('[optional]') ||
                  description.includes('(optional)') || description.includes('[optional]')
                );
                
                if (isExplicitlyOptional) {
                  console.log(`🚫 Filtering out explicitly optional file: ${fileName}`);
                }
                
                return !isExplicitlyOptional;
              })
              .map((item) => (
              <div key={item.id} className="mb-8">
                {/* File Name */}
                <div className="font-mono text-blue-400 font-semibold text-lg mb-2">
                  {item.filePath?.split('/').pop() || item.filePath || 'Unknown file'}
                </div>
                
                {/* Action Type (MODIFY/NEW) */}
                <div className="inline-block px-3 py-1 rounded-md text-sm font-bold mb-3 bg-blue-900/30 border border-blue-500 text-blue-400">
                  {getActionType(item)}
                </div>
                
                {/* Description */}
                <div className="plan-content text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {processFilePathsInText(item.details || '')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Follow-up conversation area */}
      {showFollowUp && onRefinePlan && (
        <div className="border-t border-gray-800 p-6 bg-gray-900">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>Continue the conversation</span>
            </h4>
            
            <p className="text-sm text-gray-400">
              Ask for modifications, clarifications, or additional features for your plan.
            </p>
            
            <div className="space-y-4">
              <textarea
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                placeholder="e.g., 'Add error handling to the authentication', 'Include tests for the API endpoints', 'Make it mobile responsive'..."
                className="w-full px-4 py-3 border border-gray-700 bg-gray-900 text-gray-200 placeholder-gray-500 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-purple-600 resize-none"
                rows={3}
                disabled={isRefining}
              />
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-400">
                  {followUpPrompt.length} characters
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setFollowUpPrompt('');
                      setShowFollowUp(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                    disabled={isRefining}
                  >
                    Cancel
                  </button>
                  
                  <button
                    onClick={() => {
                      if (followUpPrompt.trim()) {
                        onRefinePlan(followUpPrompt.trim());
                        setFollowUpPrompt('');
                        setShowFollowUp(false);
                      }
                    }}
                    disabled={!followUpPrompt.trim() || isRefining}
                    className="px-6 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800/60 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isRefining ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Refining...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Example prompts */}
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-2">💡 Quick suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Add error handling',
                  'Include unit tests', 
                  'Make it responsive',
                  'Add documentation',
                  'Optimize performance',
                  'Add security features'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setFollowUpPrompt(suggestion)}
                    className="px-3 py-1 text-xs bg-gray-900 border border-gray-700 text-gray-300 rounded-full hover:bg-gray-800 transition-colors"
                    disabled={isRefining}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlanItemComponentProps {
  item: PlanItem;
  onCopy: (text: string) => void;
  isCopied: boolean;
}

function PlanItemComponent({ item, onCopy, isCopied }: PlanItemComponentProps) {
  const getItemText = (item: PlanItem): string => {
    let text = `${item.title}\n${item.description}\n\n${item.details}`;
    
    if (item.filePath) {
      text += `\n\nFile: ${item.filePath}`;
    }
    
    if (item.dependencies.length > 0) {
      text += `\n\nDependencies: ${item.dependencies.join(', ')}`;
    }
    
    if (item.estimatedTime) {
      text += `\n\nEstimated Time: ${item.estimatedTime}`;
    }
    
    return text;
  };

  const getItemIcon = (type: string): string => {
    const icons: { [key: string]: string } = {
      create: '✨',
      modify: '✏️',
      install: '📦',
      configure: '⚙️',
      test: '🧪',
      deploy: '🚀',
      overview: '📋',
    };
    return icons[type] || '•';
  };

  const getItemTypeColor = (type: string): string => {
    const colors: { [key: string]: string } = {
      create: 'bg-green-900/30 text-green-300',
      modify: 'bg-blue-900/30 text-blue-300',
      install: 'bg-purple-900/30 text-purple-300',
      configure: 'bg-yellow-900/30 text-yellow-300',
      test: 'bg-indigo-900/30 text-indigo-300',
      deploy: 'bg-red-900/30 text-red-300',
      overview: 'bg-gray-800 text-gray-300',
    };
    return colors[type] || 'bg-gray-800 text-gray-300';
  };

  return (
    <div className="p-4 hover:bg-gray-800 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <span className="text-lg">{getItemIcon(item.type)}</span>
            <h4 className="font-semibold text-gray-100">{item.title}</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getItemTypeColor(item.type)}`}>
              {item.type.toUpperCase()}
            </span>
          </div>
          
          <p className="text-gray-300 mb-3">{item.description}</p>
          
          {item.filePath && (
            <div className="mb-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-900 border border-gray-700 text-gray-300">
                📁 {item.filePath}
              </span>
            </div>
          )}
          
          <div className="bg-gray-900 border border-gray-700 rounded-md p-3 mb-3">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">{item.details}</pre>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            {item.dependencies.length > 0 && (
              <div>
                <span className="font-medium">Dependencies:</span> {item.dependencies.join(', ')}
              </div>
            )}
            
            {item.estimatedTime && (
              <div>
                <span className="font-medium">Time:</span> {item.estimatedTime}
              </div>
            )}
          </div>
        </div>
        
        <button
          onClick={() => onCopy(getItemText(item))}
          className="ml-4 flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
        >
          {isCopied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
