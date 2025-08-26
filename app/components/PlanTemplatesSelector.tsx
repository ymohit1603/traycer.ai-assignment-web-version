"use client";

import React, { useState, useMemo } from "react";
import { PlanTemplate, PlanTemplatesService } from "../lib/planTemplates";

interface PlanTemplatesSelectorProps {
  onTemplateSelect: (template: PlanTemplate) => void;
  onClose: () => void;
  isOpen: boolean;
  projectLanguages?: string[];
  projectType?: string;
}

export default function PlanTemplatesSelector({ 
  onTemplateSelect, 
  onClose, 
  isOpen,
  projectLanguages = [],
  projectType
}: PlanTemplatesSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedComplexity, setSelectedComplexity] = useState<string>("all");

  const allTemplates = PlanTemplatesService.getAllTemplates();
  const categories = ["all", ...new Set(allTemplates.map(t => t.category))];
  const complexityLevels = ["all", "low", "medium", "high"];

  const filteredTemplates = useMemo(() => {
    let filtered = allTemplates;

    // Filter by search query
    if (searchQuery.trim()) {
      filtered = PlanTemplatesService.searchTemplates(searchQuery);
    }

    // Filter by category
    if (selectedCategory !== "all") {
      filtered = filtered.filter(template => template.category === selectedCategory);
    }

    // Filter by complexity
    if (selectedComplexity !== "all") {
      filtered = filtered.filter(template => template.complexity === selectedComplexity);
    }

    // Sort by relevance to project languages
    if (projectLanguages.length > 0) {
      filtered.sort((a, b) => {
        const aRelevance = a.applicableFrameworks.some(framework =>
          projectLanguages.some(lang => 
            framework.toLowerCase().includes(lang.toLowerCase()) ||
            lang.toLowerCase().includes(framework.toLowerCase())
          )
        ) ? 1 : 0;
        
        const bRelevance = b.applicableFrameworks.some(framework =>
          projectLanguages.some(lang => 
            framework.toLowerCase().includes(lang.toLowerCase()) ||
            lang.toLowerCase().includes(framework.toLowerCase())
          )
        ) ? 1 : 0;

        return bRelevance - aRelevance;
      });
    }

    return filtered;
  }, [searchQuery, selectedCategory, selectedComplexity, projectLanguages, allTemplates]);

  const recommendedTemplates = useMemo(() => {
    return PlanTemplatesService.getRecommendedTemplates(projectLanguages, projectType);
  }, [projectLanguages, projectType]);

  const handleTemplateSelect = (template: PlanTemplate) => {
    onTemplateSelect(template);
    onClose();
  };

  const getCategoryIcon = (category: string): string => {
    const icons: { [key: string]: string } = {
      authentication: '🔐',
      api: '🔌',
      database: '🗄️',
      deployment: '🚀',
      ui: '🎨',
      performance: '⚡',
      testing: '🧪',
      security: '🛡️',
    };
    return icons[category] || '📋';
  };

  const getComplexityColor = (complexity: string): string => {
    const colors: { [key: string]: string } = {
      low: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      high: 'text-red-600 bg-red-100',
    };
    return colors[complexity] || 'text-gray-600 bg-gray-100';
  };

  const formatTime = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours === 1) return '1h';
    return `${hours}h`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">Plan Templates</h2>
              <p className="text-gray-600 mt-1">Choose from pre-built templates for common development tasks</p>
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

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {categories.map(category => (
                <option key={category} value={category}>
                  {category === 'all' ? 'All Categories' : category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>

            <select
              value={selectedComplexity}
              onChange={(e) => setSelectedComplexity(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {complexityLevels.map(level => (
                <option key={level} value={level}>
                  {level === 'all' ? 'All Levels' : level.charAt(0).toUpperCase() + level.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Recommended Templates */}
          {recommendedTemplates.length > 0 && !searchQuery && selectedCategory === "all" && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <span className="mr-2">⭐</span>
                Recommended for your project
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleTemplateSelect}
                    isRecommended={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Templates */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {searchQuery ? `Search Results (${filteredTemplates.length})` : 'All Templates'}
            </h3>
            
            {filteredTemplates.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-4xl mb-4">🔍</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                <p className="text-gray-600">Try adjusting your search criteria or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onSelect={handleTemplateSelect}
                    isRecommended={recommendedTemplates.some(rt => rt.id === template.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: PlanTemplate;
  onSelect: (template: PlanTemplate) => void;
  isRecommended?: boolean;
}

function TemplateCard({ template, onSelect, isRecommended }: TemplateCardProps) {
  const getCategoryIcon = (category: string): string => {
    const icons: { [key: string]: string } = {
      authentication: '🔐',
      api: '🔌',
      database: '🗄️',
      deployment: '🚀',
      ui: '🎨',
      performance: '⚡',
      testing: '🧪',
      security: '🛡️',
    };
    return icons[category] || '📋';
  };

  const getComplexityColor = (complexity: string): string => {
    const colors: { [key: string]: string } = {
      low: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      high: 'text-red-600 bg-red-100',
    };
    return colors[complexity] || 'text-gray-600 bg-gray-100';
  };

  const formatTime = (hours: number): string => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours === 1) return '1h';
    return `${hours}h`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer relative"
         onClick={() => onSelect(template)}>
      {isRecommended && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-xs px-2 py-1 rounded-full font-medium">
          ⭐ Recommended
        </div>
      )}
      
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <span className="text-2xl">{getCategoryIcon(template.category)}</span>
          <div>
            <h4 className="font-semibold text-gray-900">{template.name}</h4>
            <p className="text-xs text-gray-500 capitalize">{template.category}</p>
          </div>
        </div>
        
        <div className="flex flex-col items-end space-y-1">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getComplexityColor(template.complexity)}`}>
            {template.complexity.toUpperCase()}
          </span>
          <span className="text-xs text-gray-500">{formatTime(template.estimatedTimeHours)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{template.description}</p>

      <div className="flex flex-wrap gap-1 mb-3">
        {template.applicableFrameworks.slice(0, 3).map((framework, index) => (
          <span key={index} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
            {framework}
          </span>
        ))}
        {template.applicableFrameworks.length > 3 && (
          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
            +{template.applicableFrameworks.length - 3}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {template.tags.slice(0, 3).map((tag, index) => (
          <span key={index} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
            {tag}
          </span>
        ))}
        {template.tags.length > 3 && (
          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
            +{template.tags.length - 3}
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{template.sections.length} sections</span>
          <span>{template.sections.reduce((acc, section) => acc + section.items.length, 0)} tasks</span>
        </div>
      </div>
    </div>
  );
}
