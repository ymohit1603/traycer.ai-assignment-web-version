"use client";

import React, { useState, useRef, useEffect } from "react";

interface PromptAreaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const EXAMPLE_PROMPTS = [
  "Implement user authentication with email and password",
  "Add dark mode support to the application",
  "Create a REST API for user management",
  "Fix the authentication error in login component",
  "Add form validation to the contact form",
  "Implement file upload functionality",
  "Create a dashboard with charts and analytics",
  "Add search functionality with filters",
  "Implement real-time notifications",
  "Create a responsive navigation menu",
];

export default function PromptArea({ value, onChange, placeholder }: PromptAreaProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [value]);

  const handleFocus = () => {
    setIsExpanded(true);
    setShowExamples(!value.trim());
  };

  const handleBlur = () => {
    setTimeout(() => {
      setIsExpanded(!!value.trim());
      setShowExamples(false);
    }, 150);
  };

  const handleExampleClick = (example: string) => {
    onChange(example);
    setShowExamples(false);
    setIsExpanded(true);
    textareaRef.current?.focus();
  };

  const clearPrompt = () => {
    onChange('');
    textareaRef.current?.focus();
  };

  return (
    <div className="w-full space-y-4">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder || "Describe what you want to implement..."}
          className={`w-full px-4 py-3 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all duration-200 ${
            isExpanded ? 'min-h-[120px]' : 'min-h-[80px]'
          }`}
          style={{ maxHeight: '300px' }}
        />
        
        {value && (
          <button
            onClick={clearPrompt}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-300 transition-colors"
            title="Clear prompt"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {showExamples && (
        <div className="bg-gray-700 rounded-lg border border-gray-600 p-4">
          <h4 className="text-sm font-medium text-gray-300 mb-3">
            💡 Example prompts to get you started:
          </h4>
          <div className="space-y-2">
            {EXAMPLE_PROMPTS.slice(0, 5).map((example, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(example)}
                className="w-full text-left text-sm text-gray-300 hover:text-blue-400 hover:bg-gray-600 px-3 py-2 rounded transition-colors"
              >
                &ldquo;{example}&rdquo;
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              const randomExample = EXAMPLE_PROMPTS[Math.floor(Math.random() * EXAMPLE_PROMPTS.length)];
              handleExampleClick(randomExample);
            }}
            className="mt-3 text-xs text-blue-400 hover:text-blue-300 font-medium"
          >
            🎲 Try a random example
          </button>
        </div>
      )}

      {isExpanded && value && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <div className="flex items-center space-x-4">
            <span>{value.length} characters</span>
            <span>{value.split(/\s+/).filter(word => word.length > 0).length} words</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="flex items-center text-green-400">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs">Ready to generate plan</span>
            </div>
          </div>
        </div>
      )}

      {!value && !showExamples && (
        <div className="text-center py-4">
          <div className="text-gray-500 mb-2">
            <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <p className="text-sm text-gray-400">
            Click here to start describing your implementation needs
          </p>
        </div>
      )}
    </div>
  );
}
