/**
 * Voice-to-Task Service
 * Handles audio transcription and task extraction
 */

import { transcribeAudio, generateCompletion } from '../clients/openai';
import {
  TASK_EXTRACTION_SYSTEM_PROMPT,
  createTaskExtractionPrompt,
} from '../prompts/task-extraction';
import { getCachedResponse, setCachedResponse, CACHE_TTL } from '../utils/cache';
import { checkRateLimit, recordAIRequest } from '../utils/rate-limiter';
import { calculateVoiceToTaskCost } from '../utils/cost-calculator';
import { estimateTokens } from '../utils/token-counter';
import { getAIConfig, AI_ERROR_MESSAGES } from '../config';
import type {
  VoiceToTaskRequest,
  VoiceToTaskResponse,
  AIError,
} from '../types';

/**
 * Process voice-to-task request
 */
export const processVoiceToTask = async (
  request: VoiceToTaskRequest
): Promise<VoiceToTaskResponse> => {
  const startTime = Date.now();
  const config = getAIConfig();

  try {
    // Check if AI is enabled
    if (!config.enabled) {
      throw {
        code: 'DISABLED',
        message: AI_ERROR_MESSAGES.DISABLED,
        retryable: false,
      } as AIError;
    }

    // Validate audio file
    const audioFile = request.audioFile;
    const audioSize = audioFile.size;

    // Check file size
    if (audioSize > config.limits.maxAudioSize) {
      throw {
        code: 'AUDIO_TOO_LARGE',
        message: AI_ERROR_MESSAGES.AUDIO_TOO_LARGE,
        details: { size: audioSize, limit: config.limits.maxAudioSize },
        retryable: false,
      } as AIError;
    }

    // Check rate limit
    const rateLimitCheck = await checkRateLimit(
      request.userId,
      request.organizationId,
      'voice-to-task'
    );

    if (!rateLimitCheck.allowed) {
      throw {
        code: 'RATE_LIMIT_EXCEEDED',
        message: rateLimitCheck.reason || AI_ERROR_MESSAGES.RATE_LIMIT,
        details: {
          remaining: rateLimitCheck.remaining,
          resetAt: rateLimitCheck.resetAt,
        },
        retryable: true,
      } as AIError;
    }

    // Check cache
    const cacheKey = `${request.userId}-${audioSize}-${audioFile.type}`;
    const cachedResult = await getCachedResponse<VoiceToTaskResponse['data']>(
      'voice-to-task',
      cacheKey
    );

    if (cachedResult) {
      return {
        success: true,
        data: {
          ...cachedResult,
          metadata: {
            ...cachedResult.metadata,
            processingTimeMs: Date.now() - startTime,
          },
        },
      };
    }

    // Step 1: Transcribe audio
    const transcriptionResult = await transcribeAudio(audioFile, request.language);

    if (!transcriptionResult.text || transcriptionResult.text.trim().length === 0) {
      throw {
        code: 'TRANSCRIPTION_FAILED',
        message: AI_ERROR_MESSAGES.TRANSCRIPTION_FAILED,
        retryable: false,
      } as AIError;
    }

    // Step 2: Extract task information
    const extractionPrompt = createTaskExtractionPrompt(transcriptionResult.text);
    const extractionResult = await generateCompletion(extractionPrompt, {
      model: config.models.text,
      temperature: 0.3, // Lower temperature for more consistent extraction
      maxTokens: 1000,
      systemPrompt: TASK_EXTRACTION_SYSTEM_PROMPT,
    });

    // Parse extracted task
    let extractedTask;
    try {
      extractedTask = JSON.parse(extractionResult.content);
    } catch (parseError) {
      throw {
        code: 'EXTRACTION_FAILED',
        message: AI_ERROR_MESSAGES.EXTRACTION_FAILED,
        details: { content: extractionResult.content, parseError },
        retryable: false,
      } as AIError;
    }

    // Validate extracted task
    if (!extractedTask.title || !extractedTask.description) {
      throw {
        code: 'EXTRACTION_FAILED',
        message: 'Failed to extract required task fields',
        details: extractedTask,
        retryable: false,
      } as AIError;
    }

    // Calculate costs
    const audioDurationSeconds = Math.ceil(audioSize / 16000); // Rough estimate
    const inputTokens = estimateTokens(
      TASK_EXTRACTION_SYSTEM_PROMPT + extractionPrompt
    );
    const outputTokens = extractionResult.usage.completionTokens;
    const totalCost = calculateVoiceToTaskCost(
      audioDurationSeconds,
      inputTokens,
      outputTokens,
      config.models.text
    );

    // Prepare response
    const processingTimeMs = Date.now() - startTime;
    const responseData: VoiceToTaskResponse['data'] = {
      transcription: transcriptionResult.text,
      extractedTask: {
        title: extractedTask.title,
        description: extractedTask.description,
        priority: extractedTask.priority || 'medium',
        dueDate: extractedTask.dueDate || undefined,
        assignees: extractedTask.assignees || [],
        tags: extractedTask.tags || [],
      },
      metadata: {
        audioLengthSeconds: audioDurationSeconds,
        processingTimeMs,
        tokensUsed: {
          whisper: Math.ceil(audioDurationSeconds * 10), // Rough estimate
          gpt4: {
            input: inputTokens,
            output: outputTokens,
          },
        },
        costUsd: totalCost,
      },
    };

    // Record request
    await recordAIRequest(
      request.userId,
      request.organizationId,
      'voice-to-task',
      config.models.text,
      inputTokens,
      outputTokens,
      totalCost,
      processingTimeMs,
      true,
      undefined,
      {
        audioSize,
        audioDuration: audioDurationSeconds,
        transcriptionLength: transcriptionResult.text.length,
      }
    );

    // Cache result
    await setCachedResponse(
      'voice-to-task',
      cacheKey,
      responseData,
      CACHE_TTL.VOICE_TO_TASK
    );

    return {
      success: true,
      data: responseData,
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;

    // Record failed request
    const aiError = error as AIError;
    await recordAIRequest(
      request.userId,
      request.organizationId,
      'voice-to-task',
      config.models.text,
      0,
      0,
      0,
      processingTimeMs,
      false,
      aiError.message
    );

    return {
      success: false,
      error: {
        code: aiError.code || 'UNKNOWN_ERROR',
        message: aiError.message || AI_ERROR_MESSAGES.UNKNOWN_ERROR,
        details: aiError.details,
      },
    };
  }
};

/**
 * Validate audio file format
 */
export const validateAudioFile = (file: File | Blob): {
  valid: boolean;
  error?: string;
} => {
  const config = getAIConfig();

  // Check file size
  if (file.size > config.limits.maxAudioSize) {
    return {
      valid: false,
      error: `File size exceeds ${Math.round(config.limits.maxAudioSize / 1024 / 1024)}MB limit`,
    };
  }

  // Check file type (if File object)
  if (file instanceof File || file.type) {
    // Extract base MIME type (ignore codec parameters)
    const baseType = file.type.split(';')[0].trim();
    
    const validTypes = [
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
      'audio/m4a',
    ];

    if (!validTypes.includes(baseType)) {
      return {
        valid: false,
        error: `Unsupported audio format: ${file.type}. Supported: MP3, MP4, WAV, WEBM, OGG, FLAC`,
      };
    }
  }

  return { valid: true };
};
