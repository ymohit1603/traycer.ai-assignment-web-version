"use client";

import { useState, useEffect } from 'react';

export interface WebhookActivity {
  eventId: string;
  repository: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  duration: number;
}

interface WebhookStatusProps {
  repositoryFullName?: string;
  webhookId?: number;
  className?: string;
}

export default function WebhookStatus({ repositoryFullName, webhookId, className }: WebhookStatusProps) {
  const [webhookActivity, setWebhookActivity] = useState<WebhookActivity[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    if (webhookId) {
      // Poll for webhook activity
      const interval = setInterval(checkWebhookActivity, 5000); // Check every 5 seconds
      checkWebhookActivity(); // Initial check
      
      return () => clearInterval(interval);
    }
  }, [webhookId, checkWebhookActivity]);

  const checkWebhookActivity = async () => {
    try {
      const response = await fetch('/api/github/webhook?action=queue');
      const data = await response.json();
      
      if (data.success) {
        // Filter activity for this repository if specified
        let activity = data.queue;
        if (repositoryFullName) {
          activity = activity.filter((item: WebhookActivity) => 
            item.repository === repositoryFullName
          );
        }
        
        setWebhookActivity(activity.slice(0, 10)); // Keep last 10 events
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error checking webhook activity:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'queued':
        return '⏳';
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'queued':
        return 'text-yellow-400';
      case 'processing':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString();
  };

  if (!webhookId) {
    return (
      <div className={`bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-3 ${className}`}>
        <div className="flex items-center space-x-2 text-yellow-400">
          <span>⚠️</span>
          <span className="text-sm font-medium">Webhook Not Configured</span>
        </div>
        <p className="text-xs text-yellow-300 mt-1">
          Manual sync required for updates. Webhook setup failed during import.
        </p>
      </div>
    );
  }

  const activeEvents = webhookActivity.filter(event => 
    event.status === 'processing' || event.status === 'queued'
  ).length;

  const recentSuccessful = webhookActivity.filter(event => 
    event.status === 'completed'
  ).length;

  const recentFailed = webhookActivity.filter(event => 
    event.status === 'failed'
  ).length;

  return (
    <div className={`bg-gray-800 border border-gray-700 rounded-lg ${className}`}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-gray-700 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-green-400">🔗</span>
              <span className="text-sm font-medium text-gray-200">
                Webhook Active
              </span>
              {activeEvents > 0 && (
                <span className="px-2 py-1 bg-blue-600 bg-opacity-30 text-blue-300 text-xs rounded">
                  {activeEvents} processing
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="text-xs text-gray-400">
              ID: {webhookId}
            </div>
            <div className="text-xs text-gray-500">
              {formatTimestamp(lastUpdate)}
            </div>
            <svg 
              className={`w-4 h-4 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        
        <div className="mt-2 text-xs text-gray-400">
          Auto-sync enabled • Last update: {formatTimestamp(lastUpdate)}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {/* Stats */}
          <div className="p-4 border-b border-gray-700">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-green-400">{recentSuccessful}</div>
                <div className="text-xs text-gray-400">Successful</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-blue-400">{activeEvents}</div>
                <div className="text-xs text-gray-400">Processing</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-red-400">{recentFailed}</div>
                <div className="text-xs text-gray-400">Failed</div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="p-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Recent Activity</h4>
            
            {webhookActivity.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-gray-500 text-sm">No recent webhook activity</div>
                <div className="text-gray-600 text-xs mt-1">
                  Push changes to your repository to trigger auto-sync
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {webhookActivity.map((event, index) => (
                  <div key={event.eventId || index} className="bg-gray-700 rounded p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={getStatusColor(event.status)}>
                          {getStatusIcon(event.status)}
                        </span>
                        <span className="text-sm text-gray-300">
                          {event.repository || 'Repository'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${getStatusColor(event.status)}`}>
                          {event.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDuration(event.duration)}
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-400 mb-2">
                      {event.message}
                    </div>
                    
                    {event.status === 'processing' && (
                      <div className="w-full bg-gray-600 rounded-full h-1">
                        <div 
                          className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${event.progress}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Webhook Info */}
          <div className="p-4 border-t border-gray-700 bg-gray-750">
            <div className="text-xs text-gray-400 space-y-1">
              <div>• Webhook automatically processes push events</div>
              <div>• Only changed files are re-indexed for efficiency</div>
              <div>• Semantic search stays up-to-date with your code</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
