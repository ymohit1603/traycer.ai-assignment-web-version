"use client";

import React, { useState, useEffect } from "react";
import { 
  ClarifyingQuestion, 
  QuestionResponse, 
  ClarificationSession,
  ClarifyingQuestionsService 
} from "../lib/clarifyingQuestions";

interface ClarifyingQuestionsProps {
  session: ClarificationSession;
  onResponseUpdate: (questionId: string, answer: string | string[]) => void;
  onComplete: (refinedPrompt: string) => void;
  onCancel: () => void;
  isRefining: boolean;
}

export default function ClarifyingQuestions({ 
  session, 
  onResponseUpdate, 
  onComplete, 
  onCancel,
  isRefining 
}: ClarifyingQuestionsProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<{ [questionId: string]: string | string[] }>({});

  const currentQuestion = session.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === session.questions.length - 1;
  const canProceed = responses[currentQuestion?.id] !== undefined || !currentQuestion?.required;

  useEffect(() => {
    // Initialize responses from session
    const initialResponses: { [questionId: string]: string | string[] } = {};
    session.responses.forEach(response => {
      initialResponses[response.questionId] = response.answer;
    });
    setResponses(initialResponses);
  }, [session.responses]);

  const handleResponseChange = (questionId: string, answer: string | string[]) => {
    setResponses(prev => ({ ...prev, [questionId]: answer }));
    onResponseUpdate(questionId, answer);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      handleComplete();
    } else {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    // Convert responses to QuestionResponse array and trigger refinement
    const finalResponses: QuestionResponse[] = Object.entries(responses).map(([questionId, answer]) => ({
      questionId,
      answer,
    }));
    
    // This will be handled by the parent component
    onComplete(''); // Placeholder - actual refinement happens in parent
  };

  const getProgressPercentage = (): number => {
    const answeredQuestions = session.questions.filter(q => responses[q.id] !== undefined).length;
    return Math.round((answeredQuestions / session.questions.length) * 100);
  };

  if (!currentQuestion) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Let's clarify your requirements
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${getProgressPercentage()}%` }}
            />
          </div>

          <div className="flex justify-between text-sm text-gray-600">
            <span>Question {currentQuestionIndex + 1} of {session.questions.length}</span>
            <span>{getProgressPercentage()}% complete</span>
          </div>
        </div>

        {/* Question Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <div className="flex items-start space-x-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-blue-600 font-semibold text-sm">
                  {currentQuestionIndex + 1}
                </span>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {currentQuestion.question}
                  {currentQuestion.required && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </h3>
                <p className="text-sm text-gray-500 capitalize">
                  {currentQuestion.category} • {currentQuestion.type.replace('-', ' ')}
                </p>
              </div>
            </div>

            {/* Question Input */}
            <div className="ml-11">
              <QuestionInput
                question={currentQuestion}
                value={responses[currentQuestion.id] || ''}
                onChange={(answer) => handleResponseChange(currentQuestion.id, answer)}
              />
            </div>
          </div>

          {/* Original Prompt Context */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Original request:</h4>
            <p className="text-sm text-gray-600 italic">"{session.originalPrompt}"</p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between">
            <button
              onClick={handlePrevious}
              disabled={currentQuestionIndex === 0}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Previous
            </button>

            <div className="flex space-x-3">
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>

              {!currentQuestion.required && (
                <button
                  onClick={handleNext}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Skip
                </button>
              )}

              <button
                onClick={handleNext}
                disabled={!canProceed || isRefining}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isRefining ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refining...
                  </>
                ) : (
                  <span>{isLastQuestion ? 'Generate Plan' : 'Next'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuestionInputProps {
  question: ClarifyingQuestion;
  value: string | string[];
  onChange: (value: string | string[]) => void;
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  switch (question.type) {
    case 'single-choice':
      return (
        <div className="space-y-2">
          {question.options?.map((option, index) => (
            <label key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value={option}
                checked={value === option}
                onChange={(e) => onChange(e.target.value)}
                className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      );

    case 'multiple-choice':
      const selectedOptions = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-2">
          {question.options?.map((option, index) => (
            <label key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                value={option}
                checked={selectedOptions.includes(option)}
                onChange={(e) => {
                  const newSelection = e.target.checked
                    ? [...selectedOptions, option]
                    : selectedOptions.filter(item => item !== option);
                  onChange(newSelection);
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-gray-700">{option}</span>
            </label>
          ))}
        </div>
      );

    case 'yes-no':
      return (
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name={question.id}
              value="yes"
              checked={value === 'yes'}
              onChange={(e) => onChange(e.target.value)}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="text-gray-700">Yes</span>
          </label>
          <label className="flex items-center space-x-2 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name={question.id}
              value="no"
              checked={value === 'no'}
              onChange={(e) => onChange(e.target.value)}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <span className="text-gray-700">No</span>
          </label>
        </div>
      );

    case 'text':
      return (
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Please provide details..."
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          rows={4}
        />
      );

    default:
      return null;
  }
}
