/**
 * AI Response Types
 * Type definitions for AI API responses
 */

/**
 * Base AI Response
 */
export interface BaseAIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    requestId: string;
    timestamp: string;
    processingTimeMs: number;
    cached: boolean;
  };
}

/**
 * Task Extraction Result
 */
export interface ExtractedTask {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string;
  assignees?: string[];
  tags?: string[];
  estimatedHours?: number;
}

/**
 * Risk Analysis Result
 */
export interface RiskAnalysis {
  riskScore: number; // 0-10
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  criticalIssues: RiskItem[];
  mediumRisks: RiskItem[];
  goodPractices: string[];
  recommendation: string;
}

export interface RiskItem {
  issue: string;
  suggestion: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Standup Report Result
 */
export interface StandupReport {
  date: string;
  user: {
    id: string;
    name: string;
  };
  yesterday: {
    completed: TaskSummary[];
    count: number;
  };
  today: {
    inProgress: TaskSummary[];
    planned: TaskSummary[];
    count: number;
  };
  blockers: {
    items: BlockerItem[];
    count: number;
  };
  stats: {
    completionRate: number;
    onTrack: boolean;
    productivity: 'low' | 'medium' | 'high';
  };
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  progress?: number;
}

export interface BlockerItem {
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestion?: string;
}

/**
 * Token Usage
 */
export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cost: number;
}

/**
 * AI Model Response (raw from OpenAI)
 */
export interface AIModelResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
