"use client";

import React, { useState, useEffect, useCallback } from "react";
import { PlanHistoryService, PlanProgress, PlanProgressItem, SavedPlan } from "../lib/planHistory";

interface PlanProgressProps {
  plan: SavedPlan;
  onClose: () => void;
  isOpen: boolean;
}

export default function PlanProgressTracker({ plan, onClose, isOpen }: PlanProgressProps) {
  const [progress, setProgress] = useState<PlanProgress | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [noteModalItem, setNoteModalItem] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [timeSpent, setTimeSpent] = useState<number>(0);

  const loadProgress = useCallback(async () => {
    let existingProgress = PlanHistoryService.getPlanProgress(plan.id);
    
    if (!existingProgress) {
      existingProgress = await PlanHistoryService.createPlanProgress(plan.id);
    }
    
    setProgress(existingProgress);
    
    // Auto-select first section
    if (plan.sections.length > 0) {
      setSelectedSection(plan.sections[0].id);
    }
  }, [plan.id, plan.sections]);

  useEffect(() => {
    if (isOpen) {
      loadProgress();
    }
  }, [isOpen, plan.id, loadProgress]);

  const updateItemStatus = async (
    itemId: string,
    status: PlanProgressItem['status']
  ) => {
    const updatedProgress = await PlanHistoryService.updatePlanItemProgress(
      plan.id,
      itemId,
      status
    );
    
    if (updatedProgress) {
      setProgress(updatedProgress);
    }
  };

  const openNoteModal = (itemId: string) => {
    const item = progress?.items.find(i => i.itemId === itemId);
    setNoteModalItem(itemId);
    setNoteText(item?.notes || "");
    setTimeSpent(item?.timeSpent || 0);
  };

  const saveNoteAndTime = async () => {
    if (noteModalItem) {
      const currentItem = progress?.items.find(i => i.itemId === noteModalItem);
      const updatedProgress = await PlanHistoryService.updatePlanItemProgress(
        plan.id,
        noteModalItem,
        currentItem?.status || 'pending',
        noteText,
        timeSpent
      );
      
      if (updatedProgress) {
        setProgress(updatedProgress);
      }
      
      setNoteModalItem(null);
      setNoteText("");
      setTimeSpent(0);
    }
  };

  const getItemProgress = (itemId: string): PlanProgressItem | undefined => {
    return progress?.items.find(item => item.itemId === itemId);
  };

  const getSectionProgress = (sectionId: string): { completed: number; total: number; percentage: number } => {
    const section = plan.sections.find(s => s.id === sectionId);
    if (!section || !progress) return { completed: 0, total: 0, percentage: 0 };

    const sectionItems = section.items;
    const completedItems = sectionItems.filter(item => {
      const progressItem = getItemProgress(item.id);
      return progressItem?.status === 'completed';
    });

    const total = sectionItems.length;
    const completed = completedItems.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  };

  const getStatusColor = (status: PlanProgressItem['status']): string => {
    const colors: { [key: string]: string } = {
      pending: 'text-gray-600 bg-gray-100',
      'in-progress': 'text-blue-600 bg-blue-100',
      completed: 'text-green-600 bg-green-100',
      skipped: 'text-yellow-600 bg-yellow-100',
    };
    return colors[status] || 'text-gray-600 bg-gray-100';
  };

  const getStatusIcon = (status: PlanProgressItem['status']): string => {
    const icons: { [key: string]: string } = {
      pending: '⏳',
      'in-progress': '🔄',
      completed: '✅',
      skipped: '⏭️',
    };
    return icons[status] || '⏳';
  };

  const formatTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  };

  const calculateTotalTimeSpent = (): number => {
    return progress?.items.reduce((acc, item) => acc + (item.timeSpent || 0), 0) || 0;
  };

  const calculateEstimatedTimeRemaining = (): number => {
    const pendingItems = progress?.items.filter(item => 
      item.status === 'pending' || item.status === 'in-progress'
    ) || [];

    return pendingItems.length * 30; // Assume 30 minutes per pending item
  };

  if (!isOpen || !progress) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-blue-50">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900">{plan.name}</h2>
              <p className="text-gray-600 mt-1">Track your implementation progress</p>
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

          {/* Overall Progress */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Overall Progress</span>
              <span>{progress.overallProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-green-500 to-blue-500 h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress.overallProgress}%` }}
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {progress.items.filter(i => i.status === 'completed').length}
              </div>
              <div className="text-xs text-gray-600">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {progress.items.filter(i => i.status === 'in-progress').length}
              </div>
              <div className="text-xs text-gray-600">In Progress</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">
                {progress.items.filter(i => i.status === 'pending').length}
              </div>
              <div className="text-xs text-gray-600">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {formatTime(calculateTotalTimeSpent())}
              </div>
              <div className="text-xs text-gray-600">Time Spent</div>
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sections Sidebar */}
          <div className="w-80 border-r border-gray-200 bg-gray-50">
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Sections</h3>
              <div className="space-y-2">
                {plan.sections.map(section => {
                  const sectionProgress = getSectionProgress(section.id);
                  return (
                    <button
                      key={section.id}
                      onClick={() => setSelectedSection(section.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedSection === section.id
                          ? 'bg-blue-100 border-blue-300'
                          : 'bg-white hover:bg-gray-100'
                      } border`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-900 text-sm">{section.title}</h4>
                        <span className="text-xs text-gray-500">
                          {sectionProgress.percentage}%
                        </span>
                      </div>
                      
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${sectionProgress.percentage}%` }}
                        />
                      </div>
                      
                      <div className="text-xs text-gray-600">
                        {sectionProgress.completed} of {sectionProgress.total} items
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section Details */}
          <div className="flex-1 overflow-y-auto">
            {selectedSection && (() => {
              const section = plan.sections.find(s => s.id === selectedSection);
              if (!section) return null;

              return (
                <div className="p-6">
                  <div className="mb-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{section.title}</h3>
                    <p className="text-gray-600">{section.content}</p>
                  </div>

                  <div className="space-y-4">
                    {section.items.map(item => {
                      const itemProgress = getItemProgress(item.id);
                      const status = itemProgress?.status || 'pending';

                      return (
                        <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="text-lg">{getStatusIcon(status)}</span>
                                <h4 className="font-medium text-gray-900">{item.title}</h4>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(status)}`}>
                                  {status.replace('-', ' ')}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                              {item.filePath && (
                                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded inline-block mb-2">
                                  📁 {item.filePath}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex space-x-2 ml-4">
                              {status !== 'completed' && (
                                <select
                                  value={status}
                                  onChange={(e) => updateItemStatus(item.id, e.target.value as PlanProgressItem['status'])}
                                  className="text-sm border border-gray-300 rounded px-2 py-1"
                                >
                                  <option value="pending">Pending</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="completed">Completed</option>
                                  <option value="skipped">Skipped</option>
                                </select>
                              )}
                              
                              <button
                                onClick={() => openNoteModal(item.id)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                                title="Add notes and time"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 mb-3">
                            {item.details}
                          </div>

                          {itemProgress?.notes && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                              <h5 className="font-medium text-blue-900 mb-1">Notes:</h5>
                              <p className="text-sm text-blue-800">{itemProgress.notes}</p>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <div className="flex space-x-4">
                              {itemProgress?.timeSpent && (
                                <span>⏱️ {formatTime(itemProgress.timeSpent)}</span>
                              )}
                              {itemProgress?.completedAt && (
                                <span>✅ {new Date(itemProgress.completedAt).toLocaleDateString()}</span>
                              )}
                            </div>
                            {item.estimatedTime && (
                              <span>📅 Est. {item.estimatedTime}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Note Modal */}
        {noteModalItem && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Notes & Time</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add your implementation notes..."
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={4}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Spent (minutes)
                  </label>
                  <input
                    type="number"
                    value={timeSpent}
                    onChange={(e) => setTimeSpent(parseInt(e.target.value) || 0)}
                    min="0"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setNoteModalItem(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNoteAndTime}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
