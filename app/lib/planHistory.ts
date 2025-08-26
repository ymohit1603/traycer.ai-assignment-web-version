import { GeneratedPlan } from './openAIService';

export interface SavedPlan extends GeneratedPlan {
  name: string;
  description?: string;
  tags: string[];
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
  version: number;
  parentPlanId?: string; // For tracking plan iterations
  codebaseId?: string; // Associated codebase
  originalPrompt: string;
}

export interface PlanComparison {
  id: string;
  planA: SavedPlan;
  planB: SavedPlan;
  differences: PlanDifference[];
  createdAt: number;
}

export interface PlanDifference {
  type: 'added' | 'removed' | 'modified';
  section: string;
  itemTitle: string;
  description: string;
  oldValue?: string;
  newValue?: string;
}

export interface PlanProgressItem {
  planId: string;
  itemId: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  completedAt?: number;
  notes?: string;
  timeSpent?: number; // in minutes
}

export interface PlanProgress {
  planId: string;
  items: PlanProgressItem[];
  overallProgress: number; // percentage
  createdAt: number;
  updatedAt: number;
}

export class PlanHistoryService {
  private static readonly PLANS_KEY = 'traycer_saved_plans';
  private static readonly COMPARISONS_KEY = 'traycer_plan_comparisons';
  private static readonly PROGRESS_KEY = 'traycer_plan_progress';
  private static readonly MAX_PLANS = 50; // Limit to prevent storage overflow

  // Plan Management
  static async savePlan(
    plan: GeneratedPlan,
    name: string,
    description?: string,
    tags: string[] = [],
    codebaseId?: string,
    originalPrompt: string = ''
  ): Promise<SavedPlan> {
    const savedPlan: SavedPlan = {
      ...plan,
      name,
      description,
      tags,
      isFavorite: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
      codebaseId,
      originalPrompt,
    };

    const existingPlans = this.getAllPlans();
    
    // Check if we're at the limit and remove oldest non-favorite
    if (existingPlans.length >= this.MAX_PLANS) {
      const nonFavorites = existingPlans
        .filter(p => !p.isFavorite)
        .sort((a, b) => a.createdAt - b.createdAt);
      
      if (nonFavorites.length > 0) {
        await this.deletePlan(nonFavorites[0].id);
      }
    }

    const updatedPlans = [savedPlan, ...existingPlans.filter(p => p.id !== plan.id)];
    localStorage.setItem(this.PLANS_KEY, JSON.stringify(updatedPlans));

    return savedPlan;
  }

  static async updatePlan(planId: string, updates: Partial<SavedPlan>): Promise<SavedPlan | null> {
    const plans = this.getAllPlans();
    const planIndex = plans.findIndex(p => p.id === planId);
    
    if (planIndex === -1) return null;

    const updatedPlan: SavedPlan = {
      ...plans[planIndex],
      ...updates,
      updatedAt: Date.now(),
    };

    plans[planIndex] = updatedPlan;
    localStorage.setItem(this.PLANS_KEY, JSON.stringify(plans));

    return updatedPlan;
  }

  static async deletePlan(planId: string): Promise<boolean> {
    const plans = this.getAllPlans();
    const filteredPlans = plans.filter(p => p.id !== planId);
    
    if (filteredPlans.length === plans.length) return false;

    localStorage.setItem(this.PLANS_KEY, JSON.stringify(filteredPlans));
    
    // Also delete associated progress
    this.deletePlanProgress(planId);
    
    return true;
  }

  static getAllPlans(): SavedPlan[] {
    try {
      const plansJson = localStorage.getItem(this.PLANS_KEY);
      return plansJson ? JSON.parse(plansJson) : [];
    } catch {
      return [];
    }
  }

  static getPlanById(planId: string): SavedPlan | null {
    const plans = this.getAllPlans();
    return plans.find(p => p.id === planId) || null;
  }

  static getPlansByCodebase(codebaseId: string): SavedPlan[] {
    const plans = this.getAllPlans();
    return plans.filter(p => p.codebaseId === codebaseId);
  }

  static searchPlans(query: string): SavedPlan[] {
    const plans = this.getAllPlans();
    const searchTerm = query.toLowerCase();
    
    return plans.filter(plan =>
      plan.name.toLowerCase().includes(searchTerm) ||
      plan.description?.toLowerCase().includes(searchTerm) ||
      plan.tags.some(tag => tag.toLowerCase().includes(searchTerm)) ||
      plan.originalPrompt.toLowerCase().includes(searchTerm)
    );
  }

  static getFavoritePlans(): SavedPlan[] {
    return this.getAllPlans().filter(p => p.isFavorite);
  }

  static getRecentPlans(limit: number = 10): SavedPlan[] {
    return this.getAllPlans()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  // Plan Comparison
  static async comparePlans(planAId: string, planBId: string): Promise<PlanComparison | null> {
    const planA = this.getPlanById(planAId);
    const planB = this.getPlanById(planBId);
    
    if (!planA || !planB) return null;

    const differences = this.calculatePlanDifferences(planA, planB);
    
    const comparison: PlanComparison = {
      id: `comparison_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      planA,
      planB,
      differences,
      createdAt: Date.now(),
    };

    // Save comparison for history
    const existingComparisons = this.getAllComparisons();
    const updatedComparisons = [comparison, ...existingComparisons.slice(0, 19)]; // Keep last 20
    localStorage.setItem(this.COMPARISONS_KEY, JSON.stringify(updatedComparisons));

    return comparison;
  }

  private static calculatePlanDifferences(planA: SavedPlan, planB: SavedPlan): PlanDifference[] {
    const differences: PlanDifference[] = [];

    // Compare basic metadata
    if (planA.title !== planB.title) {
      differences.push({
        type: 'modified',
        section: 'Title',
        itemTitle: 'Plan Title',
        description: 'Plan title changed',
        oldValue: planA.title,
        newValue: planB.title,
      });
    }

    if (planA.overview !== planB.overview) {
      differences.push({
        type: 'modified',
        section: 'Overview',
        itemTitle: 'Plan Overview',
        description: 'Plan overview changed',
        oldValue: planA.overview,
        newValue: planB.overview,
      });
    }

    // Compare sections
    const sectionsA = new Map(planA.sections.map(s => [s.title, s]));
    const sectionsB = new Map(planB.sections.map(s => [s.title, s]));

    // Find removed sections
    for (const [title, section] of sectionsA) {
      if (!sectionsB.has(title)) {
        differences.push({
          type: 'removed',
          section: title,
          itemTitle: 'Entire Section',
          description: `Section "${title}" was removed`,
        });
      }
    }

    // Find added sections
    for (const [title, section] of sectionsB) {
      if (!sectionsA.has(title)) {
        differences.push({
          type: 'added',
          section: title,
          itemTitle: 'Entire Section',
          description: `Section "${title}" was added`,
        });
      }
    }

    // Compare common sections
    for (const [title, sectionA] of sectionsA) {
      const sectionB = sectionsB.get(title);
      if (!sectionB) continue;

      // Compare items within sections
      const itemsA = new Map(sectionA.items.map(item => [item.title, item]));
      const itemsB = new Map(sectionB.items.map(item => [item.title, item]));

      // Find removed items
      for (const [itemTitle, item] of itemsA) {
        if (!itemsB.has(itemTitle)) {
          differences.push({
            type: 'removed',
            section: title,
            itemTitle,
            description: `Item "${itemTitle}" was removed from ${title}`,
          });
        }
      }

      // Find added items
      for (const [itemTitle, item] of itemsB) {
        if (!itemsA.has(itemTitle)) {
          differences.push({
            type: 'added',
            section: title,
            itemTitle,
            description: `Item "${itemTitle}" was added to ${title}`,
          });
        }
      }

      // Compare modified items
      for (const [itemTitle, itemA] of itemsA) {
        const itemB = itemsB.get(itemTitle);
        if (!itemB) continue;

        if (itemA.description !== itemB.description) {
          differences.push({
            type: 'modified',
            section: title,
            itemTitle,
            description: 'Item description changed',
            oldValue: itemA.description,
            newValue: itemB.description,
          });
        }

        if (itemA.details !== itemB.details) {
          differences.push({
            type: 'modified',
            section: title,
            itemTitle,
            description: 'Item details changed',
            oldValue: itemA.details,
            newValue: itemB.details,
          });
        }
      }
    }

    return differences;
  }

  static getAllComparisons(): PlanComparison[] {
    try {
      const comparisonsJson = localStorage.getItem(this.COMPARISONS_KEY);
      return comparisonsJson ? JSON.parse(comparisonsJson) : [];
    } catch {
      return [];
    }
  }

  // Progress Tracking
  static async createPlanProgress(planId: string): Promise<PlanProgress> {
    const plan = this.getPlanById(planId);
    if (!plan) throw new Error('Plan not found');

    const items: PlanProgressItem[] = plan.sections
      .flatMap(section => section.items)
      .map(item => ({
        planId,
        itemId: item.id,
        status: 'pending',
      }));

    const progress: PlanProgress = {
      planId,
      items,
      overallProgress: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const allProgress = this.getAllPlanProgress();
    const updatedProgress = [progress, ...allProgress.filter(p => p.planId !== planId)];
    localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(updatedProgress));

    return progress;
  }

  static async updatePlanItemProgress(
    planId: string,
    itemId: string,
    status: PlanProgressItem['status'],
    notes?: string,
    timeSpent?: number
  ): Promise<PlanProgress | null> {
    const allProgress = this.getAllPlanProgress();
    const progressIndex = allProgress.findIndex(p => p.planId === planId);
    
    if (progressIndex === -1) return null;

    const progress = allProgress[progressIndex];
    const itemIndex = progress.items.findIndex(item => item.itemId === itemId);
    
    if (itemIndex === -1) return null;

    // Update item
    progress.items[itemIndex] = {
      ...progress.items[itemIndex],
      status,
      notes,
      timeSpent,
      completedAt: status === 'completed' ? Date.now() : undefined,
    };

    // Recalculate overall progress
    const completedItems = progress.items.filter(item => item.status === 'completed').length;
    progress.overallProgress = Math.round((completedItems / progress.items.length) * 100);
    progress.updatedAt = Date.now();

    allProgress[progressIndex] = progress;
    localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(allProgress));

    return progress;
  }

  static getPlanProgress(planId: string): PlanProgress | null {
    const allProgress = this.getAllPlanProgress();
    return allProgress.find(p => p.planId === planId) || null;
  }

  static getAllPlanProgress(): PlanProgress[] {
    try {
      const progressJson = localStorage.getItem(this.PROGRESS_KEY);
      return progressJson ? JSON.parse(progressJson) : [];
    } catch {
      return [];
    }
  }

  static async deletePlanProgress(planId: string): Promise<boolean> {
    const allProgress = this.getAllPlanProgress();
    const filteredProgress = allProgress.filter(p => p.planId !== planId);
    
    if (filteredProgress.length === allProgress.length) return false;

    localStorage.setItem(this.PROGRESS_KEY, JSON.stringify(filteredProgress));
    return true;
  }

  // Statistics and Analytics
  static getPlanStatistics() {
    const plans = this.getAllPlans();
    const allProgress = this.getAllPlanProgress();

    const totalPlans = plans.length;
    const favoritePlans = plans.filter(p => p.isFavorite).length;
    const plansByComplexity = {
      low: plans.filter(p => p.metadata.complexity === 'low').length,
      medium: plans.filter(p => p.metadata.complexity === 'medium').length,
      high: plans.filter(p => p.metadata.complexity === 'high').length,
    };

    const completedPlans = allProgress.filter(p => p.overallProgress === 100).length;
    const inProgressPlans = allProgress.filter(p => p.overallProgress > 0 && p.overallProgress < 100).length;

    const averageTimeSpent = allProgress.reduce((acc, progress) => {
      const totalTime = progress.items.reduce((itemAcc, item) => itemAcc + (item.timeSpent || 0), 0);
      return acc + totalTime;
    }, 0) / Math.max(allProgress.length, 1);

    return {
      totalPlans,
      favoritePlans,
      plansByComplexity,
      completedPlans,
      inProgressPlans,
      averageTimeSpent: Math.round(averageTimeSpent),
      storageUsed: this.getStorageUsage(),
    };
  }

  private static getStorageUsage(): { used: number; total: number; percentage: number } {
    try {
      const plansSize = new Blob([localStorage.getItem(this.PLANS_KEY) || '']).size;
      const progressSize = new Blob([localStorage.getItem(this.PROGRESS_KEY) || '']).size;
      const comparisonsSize = new Blob([localStorage.getItem(this.COMPARISONS_KEY) || '']).size;
      
      const used = plansSize + progressSize + comparisonsSize;
      const total = 5 * 1024 * 1024; // 5MB rough estimate for localStorage
      const percentage = Math.round((used / total) * 100);
      
      return { used, total, percentage };
    } catch {
      return { used: 0, total: 5 * 1024 * 1024, percentage: 0 };
    }
  }

  // Export/Import functionality
  static exportPlans(planIds?: string[]): string {
    const plans = this.getAllPlans();
    const plansToExport = planIds ? plans.filter(p => planIds.includes(p.id)) : plans;
    
    const exportData = {
      plans: plansToExport,
      exportedAt: Date.now(),
      version: '1.0.0',
    };

    return JSON.stringify(exportData, null, 2);
  }

  static async importPlans(jsonData: string): Promise<{ imported: number; skipped: number }> {
    try {
      const importData = JSON.parse(jsonData);
      const existingPlans = this.getAllPlans();
      const existingIds = new Set(existingPlans.map(p => p.id));
      
      let imported = 0;
      let skipped = 0;

      for (const plan of importData.plans || []) {
        if (existingIds.has(plan.id)) {
          skipped++;
          continue;
        }

        existingPlans.push(plan);
        imported++;
      }

      localStorage.setItem(this.PLANS_KEY, JSON.stringify(existingPlans));
      
      return { imported, skipped };
    } catch (error) {
      throw new Error('Invalid import data format');
    }
  }
}
