"use client";

import React, { useState } from "react";
import { GeneratedPlan } from "../lib/openAIService";

interface IntegrationExamplesProps {
  plan: GeneratedPlan;
  onClose: () => void;
  isOpen: boolean;
}

interface IntegrationExample {
  id: string;
  name: string;
  description: string;
  icon: string;
  prompt: string;
  instructions: string[];
  website: string;
  apiFormat?: string;
}

const INTEGRATION_EXAMPLES: IntegrationExample[] = [
  {
    id: 'cursor',
    name: 'Cursor AI',
    description: 'Use with Cursor\'s AI-powered IDE for seamless code generation',
    icon: '🖱️',
    prompt: `I need to implement the following plan step by step. Please implement each section one at a time and ask for confirmation before proceeding:

[PLAN_CONTENT]`,
    instructions: [
      'Copy the formatted plan below',
      'Open Cursor IDE and your project',
      'Press Cmd/Ctrl + K to open AI chat',
      'Paste the plan with your specific instructions',
      'Ask Cursor to implement each section incrementally',
      'Review each implementation before proceeding to the next section'
    ],
    website: 'https://cursor.sh/',
  },
  {
    id: 'copilot-chat',
    name: 'GitHub Copilot Chat',
    description: 'Use with VS Code and GitHub Copilot Chat extension',
    icon: '🐙',
    prompt: `I have an implementation plan that I need to execute. Can you help me implement this step by step?

Plan Overview: [PLAN_OVERVIEW]

Please start with the first section and implement the required files:

[PLAN_CONTENT]

After implementing each section, I'll ask you to proceed to the next one.`,
    instructions: [
      'Copy the formatted plan below',
      'Open VS Code with Copilot Chat extension',
      'Open the chat panel (Ctrl/Cmd + Shift + I)',
      'Paste the plan and ask Copilot to implement incrementally',
      'Use @workspace to give context about your project',
      'Ask for explanations when needed'
    ],
    website: 'https://marketplace.visualstudio.com/items?itemName=GitHub.copilot-chat',
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    description: 'Use with ChatGPT for detailed code implementation',
    icon: '🤖',
    prompt: `I'm a developer working on implementing the following plan. Please help me implement this systematically:

Context: [PLAN_OVERVIEW]

Implementation Plan:
[PLAN_CONTENT]

Let's start with the first section. Please provide the code implementation and explain any important decisions. After I confirm, we'll move to the next section.`,
    instructions: [
      'Copy the formatted plan below',
      'Go to ChatGPT (chat.openai.com)',
      'Start a new conversation',
      'Paste the plan and ask for step-by-step implementation',
      'Ask for code explanations when needed',
      'Request modifications or alternatives as needed'
    ],
    website: 'https://chat.openai.com/',
  },
  {
    id: 'claude',
    name: 'Claude AI',
    description: 'Use with Anthropic Claude for thorough code analysis and implementation',
    icon: '🧠',
    prompt: `I need help implementing this development plan. Can you work with me to implement each section systematically?

Project Context: [PLAN_OVERVIEW]

Detailed Implementation Plan:
[PLAN_CONTENT]

Please start by reviewing the plan and then implement the first section. I'd appreciate explanations of your implementation choices.`,
    instructions: [
      'Copy the formatted plan below',
      'Go to Claude.ai',
      'Start a new conversation',
      'Paste the plan and request systematic implementation',
      'Ask Claude to explain complex implementations',
      'Use Claude\'s analysis capabilities for code review'
    ],
    website: 'https://claude.ai/',
  },
  {
    id: 'codeium',
    name: 'Codeium Chat',
    description: 'Use with Codeium\'s free AI coding assistant',
    icon: '💫',
    prompt: `I have a detailed implementation plan that I need to execute. Can you help me implement this in my codebase?

Plan Summary: [PLAN_OVERVIEW]

Full Plan:
[PLAN_CONTENT]

Please start with the first section and provide the implementation. I'll review and then ask for the next section.`,
    instructions: [
      'Copy the formatted plan below',
      'Install Codeium extension in your IDE',
      'Open the chat feature in Codeium',
      'Paste the plan and request implementation',
      'Use Codeium\'s codebase awareness for better context',
      'Iterate through each section systematically'
    ],
    website: 'https://codeium.com/',
  },
  {
    id: 'custom-api',
    name: 'Custom API Integration',
    description: 'Format for custom API integration or automation',
    icon: '🔧',
    prompt: ``,
    apiFormat: `{
  "plan": {
    "title": "[PLAN_TITLE]",
    "overview": "[PLAN_OVERVIEW]",
    "sections": [
      {
        "title": "[SECTION_TITLE]",
        "type": "[SECTION_TYPE]",
        "priority": "[PRIORITY]",
        "items": [
          {
            "type": "[ITEM_TYPE]",
            "title": "[ITEM_TITLE]",
            "description": "[DESCRIPTION]",
            "details": "[IMPLEMENTATION_DETAILS]",
            "filePath": "[FILE_PATH]",
            "dependencies": ["[DEPENDENCIES]"]
          }
        ]
      }
    ]
  }
}`,
    instructions: [
      'Copy the JSON format below',
      'Use in your custom automation or API integration',
      'Parse the structured data programmatically',
      'Implement your own processing logic',
      'Integrate with your preferred development workflow'
    ],
    website: '',
  }
];

export default function IntegrationExamples({ plan, onClose, isOpen }: IntegrationExamplesProps) {
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationExample>(INTEGRATION_EXAMPLES[0]);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'text'>('markdown');

  const formatPlanForIntegration = (integration: IntegrationExample): string => {
    if (integration.id === 'custom-api') {
      return JSON.stringify({
        plan: {
          title: plan.title,
          overview: plan.overview,
          sections: plan.sections.map(section => ({
            title: section.title,
            type: section.type,
            priority: section.priority,
            items: section.items.map(item => ({
              type: item.type,
              title: item.title,
              description: item.description,
              details: item.details,
              filePath: item.filePath,
              dependencies: item.dependencies
            }))
          }))
        }
      }, null, 2);
    }

    let formatted = integration.prompt;
    formatted = formatted.replace('[PLAN_TITLE]', plan.title);
    formatted = formatted.replace('[PLAN_OVERVIEW]', plan.overview);
    
    let planContent = '';
    
    if (exportFormat === 'markdown') {
      planContent = formatAsMarkdown();
    } else if (exportFormat === 'json') {
      planContent = JSON.stringify(plan, null, 2);
    } else {
      planContent = formatAsText();
    }
    
    formatted = formatted.replace('[PLAN_CONTENT]', planContent);
    
    return formatted;
  };

  const formatAsMarkdown = (): string => {
    let markdown = `# ${plan.title}\n\n${plan.overview}\n\n`;
    
    plan.sections.forEach((section, index) => {
      markdown += `## ${index + 1}. ${section.title}\n\n`;
      markdown += `**Priority:** ${section.priority}\n\n`;
      markdown += `${section.content}\n\n`;
      
      section.items.forEach((item, itemIndex) => {
        markdown += `### ${index + 1}.${itemIndex + 1} ${item.title}\n\n`;
        markdown += `**Type:** ${item.type}\n\n`;
        markdown += `**Description:** ${item.description}\n\n`;
        
        if (item.filePath) {
          markdown += `**File:** \`${item.filePath}\`\n\n`;
        }
        
        markdown += `**Details:**\n${item.details}\n\n`;
        
        if (item.dependencies.length > 0) {
          markdown += `**Dependencies:** ${item.dependencies.join(', ')}\n\n`;
        }
        
        if (item.estimatedTime) {
          markdown += `**Estimated Time:** ${item.estimatedTime}\n\n`;
        }
        
        markdown += '---\n\n';
      });
    });
    
    return markdown;
  };

  const formatAsText = (): string => {
    let text = `${plan.title}\n${'='.repeat(plan.title.length)}\n\n${plan.overview}\n\n`;
    
    plan.sections.forEach((section, index) => {
      text += `${index + 1}. ${section.title}\n${'-'.repeat(section.title.length + 3)}\n\n`;
      text += `Priority: ${section.priority}\n\n`;
      text += `${section.content}\n\n`;
      
      section.items.forEach((item, itemIndex) => {
        text += `  ${index + 1}.${itemIndex + 1} ${item.title}\n`;
        text += `  Type: ${item.type}\n`;
        text += `  Description: ${item.description}\n`;
        
        if (item.filePath) {
          text += `  File: ${item.filePath}\n`;
        }
        
        text += `  Details: ${item.details}\n`;
        
        if (item.dependencies.length > 0) {
          text += `  Dependencies: ${item.dependencies.join(', ')}\n`;
        }
        
        if (item.estimatedTime) {
          text += `  Estimated Time: ${item.estimatedTime}\n`;
        }
        
        text += '\n';
      });
      
      text += '\n';
    });
    
    return text;
  };

  const copyToClipboard = async () => {
    const formattedPlan = formatPlanForIntegration(selectedIntegration);
    try {
      await navigator.clipboard.writeText(formattedPlan);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const exportAsFile = () => {
    const formattedPlan = formatPlanForIntegration(selectedIntegration);
    const filename = `${plan.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-plan.${
      exportFormat === 'markdown' ? 'md' : 
      exportFormat === 'json' ? 'json' : 'txt'
    }`;
    
    const blob = new Blob([formattedPlan], { 
      type: exportFormat === 'json' ? 'application/json' : 'text/plain' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">AI Integration Examples</h2>
              <p className="text-gray-600 mt-1">Copy your plan to popular AI coding assistants</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-md hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Format Selection */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Export Format:</span>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as any)}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm"
            >
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="text">Plain Text</option>
            </select>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Integration List */}
          <div className="w-80 border-r border-gray-200 bg-gray-50 overflow-y-auto">
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3">AI Assistants</h3>
              <div className="space-y-2">
                {INTEGRATION_EXAMPLES.map(integration => (
                  <button
                    key={integration.id}
                    onClick={() => setSelectedIntegration(integration)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedIntegration.id === integration.id
                        ? 'bg-blue-100 border-blue-300'
                        : 'bg-white hover:bg-gray-100'
                    } border`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{integration.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-gray-900 text-sm">{integration.name}</h4>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{integration.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Integration Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-3xl">{selectedIntegration.icon}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{selectedIntegration.name}</h3>
                    <p className="text-gray-600">{selectedIntegration.description}</p>
                  </div>
                </div>
                
                <div className="flex space-x-3">
                  {selectedIntegration.website && (
                    <a
                      href={selectedIntegration.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      <span>Visit</span>
                    </a>
                  )}
                  
                  <button
                    onClick={exportAsFile}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export</span>
                  </button>
                  
                  <button
                    onClick={copyToClipboard}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="p-6 border-b border-gray-200 bg-blue-50">
              <h4 className="font-semibold text-blue-900 mb-3">How to use with {selectedIntegration.name}:</h4>
              <ol className="text-sm text-blue-800 space-y-2">
                {selectedIntegration.instructions.map((instruction, index) => (
                  <li key={index} className="flex items-start space-x-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-200 text-blue-800 rounded-full flex items-center justify-center text-xs font-semibold mt-0.5">
                      {index + 1}
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Formatted Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-400">
                    {selectedIntegration.id === 'custom-api' ? 'JSON Format' : 'Formatted Plan'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {exportFormat.toUpperCase()}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed">
                  {formatPlanForIntegration(selectedIntegration)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
