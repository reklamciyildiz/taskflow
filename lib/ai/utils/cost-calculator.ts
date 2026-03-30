/**
 * Cost Calculator Utility
 * Calculates costs for AI API usage
 */

import { calculateTextCost, calculateAudioCost, OPENAI_PRICING } from '../config';

/**
 * Calculate total cost for voice-to-task operation
 */
export const calculateVoiceToTaskCost = (
  audioDurationSeconds: number,
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4o'
): number => {
  const whisperCost = calculateAudioCost(audioDurationSeconds);
  const gptCost = calculateTextCost(model, inputTokens, outputTokens);
  
  return whisperCost + gptCost;
};

/**
 * Calculate cost for text generation
 */
export const calculateGenerationCost = (
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4o'
): number => {
  return calculateTextCost(model, inputTokens, outputTokens);
};

/**
 * Calculate cost for description generator
 */
export const calculateDescriptionGeneratorCost = (
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4o'
): number => {
  return calculateTextCost(model, inputTokens, outputTokens);
};

/**
 * Format cost as USD string
 */
export const formatCost = (cost: number): string => {
  return `$${cost.toFixed(4)}`;
};

/**
 * Calculate cost savings from cache hit
 */
export const calculateCacheSavings = (
  inputTokens: number,
  outputTokens: number,
  model: string = 'gpt-4o'
): number => {
  return calculateTextCost(model, inputTokens, outputTokens);
};

/**
 * Get pricing info for a model
 */
export const getModelPricing = (model: string) => {
  return OPENAI_PRICING[model as keyof typeof OPENAI_PRICING] || null;
};

/**
 * Estimate monthly cost based on usage
 */
export const estimateMonthlyCost = (
  dailyRequests: number,
  avgInputTokens: number,
  avgOutputTokens: number,
  model: string = 'gpt-4o'
): number => {
  const costPerRequest = calculateTextCost(model, avgInputTokens, avgOutputTokens);
  const monthlyRequests = dailyRequests * 30;
  
  return costPerRequest * monthlyRequests;
};

/**
 * Calculate ROI (Return on Investment)
 */
export const calculateROI = (
  monthlyCost: number,
  timeSavedHoursPerMonth: number,
  hourlyRate: number = 50
): {
  roi: number;
  timeSavedValue: number;
  netValue: number;
} => {
  const timeSavedValue = timeSavedHoursPerMonth * hourlyRate;
  const netValue = timeSavedValue - monthlyCost;
  const roi = monthlyCost > 0 ? (netValue / monthlyCost) * 100 : 0;
  
  return {
    roi,
    timeSavedValue,
    netValue,
  };
};
