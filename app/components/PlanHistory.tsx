"use client";

import React, { useState, useEffect } from "react";
import { PlanHistoryService, SavedPlan, PlanComparison } from "../lib/planHistory";
import { GeneratedPlan } from "../lib/openAIService";

interface PlanHistoryProps {
  onPlanSelect: (plan: SavedPlan) => void;
  onPlanCompare: (comparison: PlanComparison) => void;
  isOpen: boolean;
  onClose: () => void;
  currentCodebaseId?: string;
}

export default function PlanHistory({ 
  onPlanSelect, 
  onPlanCompare, 
  isOpen, 
  onClose,
  currentCodebaseId 
}: PlanHistoryProps) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'favorites' | 'recent' | 'current-codebase'>('all');
  const [selectedPlans, setSelectedPlans] = useState<string[]>([]);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [statistics, setStatistics] = useState<{
    totalPlans: number;
    favoritePlans: number;
    plansByComplexity: { low: number; medium: number; high: number };
    completedPlans: number;
    inProgressPlans: number;
    averageTimeSpent: number;
    storageUsed: { used: number; total: number; percentage: number };
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPlans();
      setStatistics(PlanHistoryService.getPlanStatistics());
    }
  }, [isOpen, selectedFilter]);

  const loadPlans = () => {
    let loadedPlans: SavedPlan[] = [];

    switch (selectedFilter) {
      case 'favorites':
        loadedPlans = PlanHistoryService.getFavoritePlans();
        break;
      case 'recent':
        loadedPlans = PlanHistoryService.getRecentPlans(20);
        break;
      case 'current-codebase':
        loadedPlans = currentCodebaseId ? PlanHistoryService.getPlansByCodebase(currentCodebaseId) : [];
        break;
      default:
        loadedPlans = PlanHistoryService.getAllPlans();
    }

    if (searchQuery.trim()) {
      loadedPlans = PlanHistoryService.searchPlans(searchQuery);
    }

    setPlans(loadedPlans);
  };

  const handleToggleFavorite = async (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      await PlanHistoryService.updatePlan(planId, { isFavorite: !plan.isFavorite });
      loadPlans();
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (window.confirm('Are you sure you want to delete this plan?')) {
      await PlanHistoryService.deletePlan(planId);
      loadPlans();
    }
  };

  const handleCompareSelect = (planId: string) => {
    if (selectedPlans.includes(planId)) {
      setSelectedPlans(prev => prev.filter(id => id !== planId));
    } else if (selectedPlans.length < 2) {
      setSelectedPlans(prev => [...prev, planId]);
    }
  };

  const handleComparePlans = async () => {
    if (selectedPlans.length === 2) {
      const comparison = await PlanHistoryService.comparePlans(selectedPlans[0], selectedPlans[1]);
      if (comparison) {
        onPlanCompare(comparison);
        setIsCompareMode(false);
        setSelectedPlans([]);
      }
    }
  };

  const handleExportPlans = () => {
    const exportData = PlanHistoryService.exportPlans(
      selectedPlans.length > 0 ? selectedPlans : undefined
    );
    
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traycer-plans-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setShowExportModal(false);
    setSelectedPlans([]);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getComplexityColor = (complexity: string): string => {
    const colors: { [key: string]: string } = {
      low: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      high: 'text-red-600 bg-red-100',
    };
    return colors[complexity] || 'text-gray-600 bg-gray-100';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-800">
        {/* Header */}
        <div className="p-6 border-b border-gray-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-semibold text-gray-100">Plan History</h2>
              <p className="text-gray-400 mt-1">Manage your saved implementation plans</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {selectedPlans.length > 0 && (
                <>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className="px-4 py-2 text-sm font-medium text-gray-200 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center space-x-2 border border-gray-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Export ({selectedPlans.length})</span>
                  </button>
                  
                  {selectedPlans.length === 2 && (
                    <button
                      onClick={handleComparePlans}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center space-x-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span>Compare</span>
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => {
                  setIsCompareMode(!isCompareMode);
                  setSelectedPlans([]);
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isCompareMode
                    ? 'text-white bg-blue-600'
                    : 'text-gray-200 hover:text-white hover:bg-gray-800 border border-gray-700'
                }`}
              >
                {isCompareMode ? 'Exit Compare' : 'Compare Plans'}
              </button>
              
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

          {/* Statistics */}
          {statistics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="text-2xl font-bold text-blue-400">{statistics.totalPlans}</div>
                <div className="text-xs text-blue-400">Total Plans</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="text-2xl font-bold text-green-400">{statistics.completedPlans}</div>
                <div className="text-xs text-green-400">Completed</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="text-2xl font-bold text-yellow-400">{statistics.inProgressPlans}</div>
                <div className="text-xs text-yellow-400">In Progress</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="text-2xl font-bold text-purple-400">{statistics.favoritePlans}</div>
                <div className="text-xs text-purple-400">Favorites</div>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search plans by name, description, or tags..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-700 bg-gray-900 text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600 placeholder-gray-500"
                />
                <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value as any)}
              className="px-3 py-2 border border-gray-700 bg-gray-900 text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            >
              <option value="all">All Plans</option>
              <option value="recent">Recent</option>
              <option value="favorites">Favorites</option>
              {currentCodebaseId && (
                <option value="current-codebase">Current Codebase</option>
              )}
            </select>
          </div>
        </div>

        {/* Plans List */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
          {plans.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-500 text-4xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-gray-100 mb-2">No plans found</h3>
              <p className="text-gray-400">
                {searchQuery ? 'Try adjusting your search criteria' : 'Start by creating your first implementation plan'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onSelect={onPlanSelect}
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDeletePlan}
                  isCompareMode={isCompareMode}
                  isSelected={selectedPlans.includes(plan.id)}
                  onCompareSelect={handleCompareSelect}
                  canSelect={selectedPlans.length < 2 || selectedPlans.includes(plan.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Export Modal */}
        {showExportModal && (
          <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center z-10">
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-100 mb-4">Export Plans</h3>
              <p className="text-gray-400 mb-6">
                Export {selectedPlans.length > 0 ? `${selectedPlans.length} selected plans` : 'all plans'} as JSON file.
              </p>
              
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowExportModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors border border-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExportPlans}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Export
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PlanCardProps {
  plan: SavedPlan;
  onSelect: (plan: SavedPlan) => void;
  onToggleFavorite: (planId: string) => void;
  onDelete: (planId: string) => void;
  isCompareMode: boolean;
  isSelected: boolean;
  onCompareSelect: (planId: string) => void;
  canSelect: boolean;
}

function PlanCard({ 
  plan, 
  onSelect, 
  onToggleFavorite, 
  onDelete,
  isCompareMode,
  isSelected,
  onCompareSelect,
  canSelect
}: PlanCardProps) {
  const getComplexityColor = (complexity: string): string => {
    const colors: { [key: string]: string } = {
      low: 'text-green-600 bg-green-100',
      medium: 'text-yellow-600 bg-yellow-100',
      high: 'text-red-600 bg-red-100',
    };
    return colors[complexity] || 'text-gray-600 bg-gray-100';
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleCardClick = () => {
    if (isCompareMode) {
      if (canSelect) {
        onCompareSelect(plan.id);
      }
    } else {
      onSelect(plan);
    }
  };

  return (
    <div 
      className={`bg-gray-900 border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer relative ${
        isCompareMode && isSelected ? 'border-blue-500 bg-blue-900/20' : 'border-gray-800'
      } ${
        isCompareMode && !canSelect ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      onClick={handleCardClick}
    >
      {/* Compare Mode Selection */}
      {isCompareMode && (
        <div className="absolute top-2 right-2">
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
            isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-600'
          }`}>
            {isSelected && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Plan Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-100 truncate">{plan.name}</h3>
          <p className="text-sm text-gray-400 mt-1 line-clamp-2">{plan.description}</p>
        </div>
        
        {!isCompareMode && (
          <div className="flex items-center space-x-1 ml-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(plan.id);
              }}
              className={`p-1 rounded hover:bg-gray-800 ${
                plan.isFavorite ? 'text-yellow-400' : 'text-gray-400'
              }`}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(plan.id);
              }}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-red-400"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between mb-3">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getComplexityColor(plan.metadata.complexity)}`}>
          {plan.metadata.complexity.toUpperCase()}
        </span>
        <span className="text-xs text-gray-400">{plan.metadata.estimatedTimeHours}h</span>
      </div>

      {/* Tags */}
      {plan.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {plan.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">
              {tag}
            </span>
          ))}
          {plan.tags.length > 3 && (
            <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">
              +{plan.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-400 space-y-1">
        <div>Created: {formatDate(plan.createdAt)}</div>
        {plan.updatedAt !== plan.createdAt && (
          <div>Updated: {formatDate(plan.updatedAt)}</div>
        )}
        <div className="flex items-center justify-between">
          <span>{plan.sections.length} sections</span>
          <span>v{plan.version}</span>
        </div>
      </div>
    </div>
  );
}
