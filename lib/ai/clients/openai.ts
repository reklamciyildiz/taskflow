/**
 * OpenAI Client
 * Wrapper for OpenAI API with error handling and rate limiting
 */

import OpenAI from 'openai';
import { getAIConfig, AI_ERROR_MESSAGES } from '../config';
import type { AIError } from '../types';

/**
 * Initialize OpenAI client
 */
let openaiClient: OpenAI | null = null;

export const getOpenAIClient = (): OpenAI => {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error(AI_ERROR_MESSAGES.NO_API_KEY);
    }

    openaiClient = new OpenAI({
      apiKey,
      maxRetries: 3,
      timeout: 60000, // 60 seconds
    });
  }

  return openaiClient;
};

/**
 * Transcribe audio using Whisper API
 */
export const transcribeAudio = async (
  audioFile: File | Blob,
  language?: string
): Promise<{
  text: string;
  duration: number;
  language: string;
}> => {
  try {
    const client = getOpenAIClient();
    const config = getAIConfig();

    // Convert Blob to File if needed - ensure proper filename extension
    // Extract base MIME type (ignore codec parameters like ;codecs=opus)
    const baseType = audioFile.type.split(';')[0].trim();
    
    const fileExtension = baseType.includes('webm') ? 'webm' : 
                         baseType.includes('mp4') ? 'mp4' : 
                         baseType.includes('mpeg') ? 'mp3' : 
                         baseType.includes('wav') ? 'wav' : 'webm';
    
    const file =
      audioFile instanceof File
        ? audioFile
        : new File([audioFile], `audio.${fileExtension}`, { type: baseType });

    const startTime = Date.now();

    const transcription = await client.audio.transcriptions.create({
      file,
      model: config.models.speech,
      language: language || 'tr',
      response_format: 'verbose_json',
    });

    const duration = Date.now() - startTime;

    return {
      text: transcription.text,
      duration,
      language: transcription.language || language || 'tr',
    };
  } catch (error) {
    throw mapOpenAIError(error);
  }
};

/**
 * Generate completion using GPT
 */
export const generateCompletion = async (
  prompt: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }
): Promise<{
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
}> => {
  try {
    const client = getOpenAIClient();
    const config = getAIConfig();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (options?.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    const completion = await client.chat.completions.create({
      model: options?.model || config.models.text,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      response_format: { type: 'json_object' },
    });

    const choice = completion.choices[0];
    if (!choice?.message?.content) {
      throw new Error('No response from OpenAI');
    }

    return {
      content: choice.message.content,
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      },
      model: completion.model,
    };
  } catch (error) {
    throw mapOpenAIError(error);
  }
};

/**
 * Map OpenAI errors to our error format
 */
const mapOpenAIError = (error: unknown): AIError => {
  if (error instanceof OpenAI.APIError) {
    // Rate limit error
    if (error.status === 429) {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        message: AI_ERROR_MESSAGES.RATE_LIMIT,
        details: error.message,
        retryable: true,
      };
    }

    // Invalid request
    if (error.status === 400) {
      return {
        code: 'INVALID_REQUEST',
        message: error.message,
        details: error,
        retryable: false,
      };
    }

    // API error
    return {
      code: 'API_ERROR',
      message: error.message,
      details: error,
      retryable: (error.status ?? 0) >= 500,
    };
  }

  // Network error
  if (error instanceof Error && error.message.includes('network')) {
    return {
      code: 'NETWORK_ERROR',
      message: AI_ERROR_MESSAGES.NETWORK_ERROR,
      details: error.message,
      retryable: true,
    };
  }

  // Unknown error
  return {
    code: 'UNKNOWN_ERROR',
    message: AI_ERROR_MESSAGES.UNKNOWN_ERROR,
    details: error,
    retryable: false,
  };
};

/**
 * Check if OpenAI is available
 */
export const isOpenAIAvailable = async (): Promise<boolean> => {
  try {
    const client = getOpenAIClient();
    await client.models.list();
    return true;
  } catch {
    return false;
  }
};
