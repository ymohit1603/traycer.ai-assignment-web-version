"use client";

import React, { useState } from "react";
import { GeneratedPlan, PlanSection, PlanItem, PlanGenerationProgress } from "../lib/openAIService";

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
    
    let fullPlanText = `# ${plan.title}\n\n${plan.overview}\n\n`;
    
    plan.sections.forEach(section => {
      fullPlanText += `## ${section.title}\n\n${section.content}\n\n`;
      
      section.items.forEach(item => {
        fullPlanText += `### ${item.title}\n`;
        fullPlanText += `${item.description}\n\n`;
        if (item.filePath) {
          fullPlanText += `**File:** ${item.filePath}\n\n`;
        }
        fullPlanText += `${item.details}\n\n`;
        if (item.dependencies.length > 0) {
          fullPlanText += `**Dependencies:** ${item.dependencies.join(', ')}\n\n`;
        }
        if (item.estimatedTime) {
          fullPlanText += `**Estimated Time:** ${item.estimatedTime}\n\n`;
        }
        fullPlanText += '---\n\n';
      });
    });
    
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
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="text-center">
          {isRefining && (
            <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-center space-x-2 text-purple-700">
                <svg className="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="font-semibold">🔄 Refining Your Plan</span>
              </div>
              <p className="text-sm text-purple-600 mt-2">
                Taking your feedback into account and updating the implementation plan...
              </p>
            </div>
          )}
          
          <div className={`inline-flex items-center px-4 py-2 font-semibold leading-6 text-sm shadow rounded-md text-white ${
            isRefining ? 'bg-purple-500' : 'bg-blue-500'
          }`}>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {isRefining ? 'Refining Plan...' : 'Generating Implementation Plan...'}
          </div>
          <p className="text-gray-600 mt-4">{isRefining ? 'Incorporating your suggestions and improving the plan...' : 'Analyzing your codebase and creating a detailed plan...'}</p>
          
          {/* Progress Information */}
          {progress && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{progress.message}</span>
                <span className="text-blue-500 font-medium">{progress.progress}%</span>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${progress.progress}%` }}
                ></div>
              </div>
              
              {/* Current File Being Read */}
              {progress.currentFile && (
                <div className="flex items-center space-x-2 text-sm text-blue-600">
                  <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Reading {progress.currentFile}</span>
                </div>
              )}
            </div>
          )}
          
          {/* Fallback progress display when no specific progress */}
          {!progress && (
            <div className="mt-6 space-y-2">
              {isRefining ? (
                <>
                  <div className="text-sm text-purple-600">🔄 Reviewing your feedback...</div>
                  <div className="text-sm text-purple-600">🧠 Updating plan sections...</div>
                  <div className="text-sm text-purple-600">✨ Improving recommendations...</div>
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-500">🔍 Analyzing codebase structure...</div>
                  <div className="text-sm text-gray-500">🧠 Processing with AI...</div>
                  <div className="text-sm text-gray-500">📋 Generating detailed plan...</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5C3.312 16.333 4.274 18 5.814 18z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Plan Generation Failed</h3>
          <p className="text-gray-600 mb-6">{error}</p>
          
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
              className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg transition-colors"
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
    <div className="bg-white rounded-xl shadow-lg border border-gray-200">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{plan.title}</h2>
            <p className="text-gray-600 mb-4">{plan.overview}</p>
            
            {/* Metadata */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">Complexity:</span>
                <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(plan.metadata.complexity)}`}>
                  {plan.metadata.complexity.toUpperCase()}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">Estimated Time:</span>
                <span className="text-blue-600">{plan.metadata.estimatedTimeHours}h</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">Languages:</span>
                <span className="text-purple-600">{plan.metadata.affectedLanguages.join(', ')}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="font-medium text-gray-700">Generated:</span>
                <span className="text-gray-500">{formatTime(plan.timestamp)}</span>
              </div>
            </div>
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
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="p-6 space-y-6">
        {plan.sections.map((section, index) => (
          <div key={section.id} className="border border-gray-200 rounded-lg">
            {/* Section Header */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              <div className="flex items-center space-x-3">
                <span className="text-2xl">{getSectionIcon(section.type)}</span>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{getSectionTitle(section)}</h3>
                  <p className="text-sm text-gray-600">
                    {section.id === 'observations' || section.id === 'approach' 
                      ? 'Analysis section' 
                      : `${section.items.length} items`
                    }
                  </p>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className={`px-2 py-1 rounded-full text-xs ${getPriorityColor(section.priority)}`}>
                  {section.priority.toUpperCase()}
                </span>
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedSections[section.id] ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Section Content */}
            {(expandedSections[section.id] || index === 0) && (
              <div className="border-t border-gray-200">
                {/* For Observations and Approach sections, show content prominently */}
                {(section.id === 'observations' || section.id === 'approach') ? (
                  <div className="p-6">
                    <div className="prose max-w-none">
                      <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                        {section.content}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-4 bg-gray-50">
                      <p className="text-gray-700">{section.content}</p>
                    </div>
                    
                    <div className="divide-y divide-gray-200">
                      {section.items.map((item) => (
                        <PlanItemComponent
                          key={item.id}
                          item={item}
                          onCopy={(text) => copyToClipboard(text, item.id)}
                          isCopied={copiedItems[item.id] || false}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Follow-up conversation area */}
      {showFollowUp && onRefinePlan && (
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>Continue the conversation</span>
            </h4>
            
            <p className="text-sm text-gray-600">
              Ask for modifications, clarifications, or additional features for your plan.
            </p>
            
            <div className="space-y-4">
              <textarea
                value={followUpPrompt}
                onChange={(e) => setFollowUpPrompt(e.target.value)}
                placeholder="e.g., 'Add error handling to the authentication', 'Include tests for the API endpoints', 'Make it mobile responsive'..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none"
                rows={3}
                disabled={isRefining}
              />
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  {followUpPrompt.length} characters
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setFollowUpPrompt('');
                      setShowFollowUp(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
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
                    className="px-6 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center space-x-2"
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
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <p className="text-xs text-gray-500 mb-2">💡 Quick suggestions:</p>
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
                    className="px-3 py-1 text-xs bg-white border border-gray-200 rounded-full hover:bg-gray-50 transition-colors"
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
      create: 'bg-green-100 text-green-800',
      modify: 'bg-blue-100 text-blue-800',
      install: 'bg-purple-100 text-purple-800',
      configure: 'bg-yellow-100 text-yellow-800',
      test: 'bg-indigo-100 text-indigo-800',
      deploy: 'bg-red-100 text-red-800',
      overview: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <span className="text-lg">{getItemIcon(item.type)}</span>
            <h4 className="font-semibold text-gray-900">{item.title}</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getItemTypeColor(item.type)}`}>
              {item.type.toUpperCase()}
            </span>
          </div>
          
          <p className="text-gray-700 mb-3">{item.description}</p>
          
          {item.filePath && (
            <div className="mb-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                📁 {item.filePath}
              </span>
            </div>
          )}
          
          <div className="bg-white border border-gray-200 rounded-md p-3 mb-3">
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">{item.details}</pre>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
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
          className="ml-4 flex items-center space-x-1 text-blue-600 hover:text-blue-800 text-sm"
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
