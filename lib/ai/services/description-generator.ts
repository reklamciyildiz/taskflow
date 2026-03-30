import { generateCompletion } from '../clients/openai';
import {
  DESCRIPTION_GENERATOR_SYSTEM_PROMPT,
  createDescriptionPrompt,
} from '../prompts/description-generator';
import { getCachedResponse, setCachedResponse, CACHE_TTL, generateInputHash } from '../utils/cache';
import { checkRateLimit, recordAIRequest } from '../utils/rate-limiter';
import { calculateDescriptionGeneratorCost } from '../utils/cost-calculator';
import { estimateTokens } from '../utils/token-counter';
import { getAIConfig, AI_ERROR_MESSAGES } from '../config';
import type {
  DescriptionGeneratorRequest,
  DescriptionGeneratorResponse,
} from '../types/description-generator';
import type { AIError } from '../types';

export const generateTaskDescription = async (
  request: DescriptionGeneratorRequest
): Promise<DescriptionGeneratorResponse> => {
  const startTime = Date.now();
  const config = getAIConfig();

  try {
    if (!config.enabled) {
      return {
        success: false,
        error: {
          code: 'DISABLED',
          message: 'AI features are currently disabled',
        },
      };
    }

    const rateLimitCheck = await checkRateLimit(
      request.userId,
      request.organizationId,
      'description-generator'
    );

    if (!rateLimitCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: rateLimitCheck.reason || AI_ERROR_MESSAGES.RATE_LIMIT,
        },
      };
    }

    const cacheKey = generateInputHash({
      taskTitle: request.taskTitle,
      context: request.context,
    });

    const cachedResponse = await getCachedResponse<DescriptionGeneratorResponse['data']>(
      'description-generator',
      cacheKey
    );

    if (cachedResponse) {
      return {
        success: true,
        data: {
          ...cachedResponse,
          metadata: {
            ...cachedResponse.metadata,
            cached: true,
          },
        },
      };
    }

    const prompt = createDescriptionPrompt(request.taskTitle, request.context);
    const inputTokens = estimateTokens(DESCRIPTION_GENERATOR_SYSTEM_PROMPT + prompt);

    const completionResult = await generateCompletion(
      prompt,
      {
        systemPrompt: DESCRIPTION_GENERATOR_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 800,
      }
    );

    const outputTokens = estimateTokens(completionResult.content);
    const costUsd = calculateDescriptionGeneratorCost(inputTokens, outputTokens);
    const latencyMs = Date.now() - startTime;

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(completionResult.content);
    } catch {
      throw new Error('Failed to parse AI response');
    }

    const generatedDescription = `## Overview\n${parsedResponse.overview}\n\n` +
      `## Acceptance Criteria\n${parsedResponse.acceptanceCriteria.map((c: string) => `- ${c}`).join('\n')}\n\n` +
      `## Technical Requirements\n${parsedResponse.technicalRequirements.map((r: string) => `- ${r}`).join('\n')}\n\n` +
      `## Potential Blockers\n${parsedResponse.potentialBlockers.map((b: string) => `- ${b}`).join('\n')}`;

    const responseData = {
      generatedDescription,
      sections: parsedResponse,
      metadata: {
        tokensUsed: inputTokens + outputTokens,
        costUsd,
        latencyMs,
        cached: false,
      },
    };

    await recordAIRequest(
      request.userId,
      request.organizationId,
      'description-generator',
      config.models.text,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      true
    );

    await setCachedResponse(
      'description-generator',
      cacheKey,
      responseData,
      CACHE_TTL.DESCRIPTION_GENERATOR
    );

    return {
      success: true,
      data: responseData,
    };
  } catch (error) {
    const aiError = error as AIError;
    await recordAIRequest(
      request.userId,
      request.organizationId,
      'description-generator',
      config.models.text,
      0,
      0,
      0,
      Date.now() - startTime,
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
