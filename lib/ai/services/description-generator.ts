import { generateCompletion } from '../clients/openai';
import {
  DESCRIPTION_GENERATOR_SYSTEM_PROMPT,
  createDescriptionPrompt,
} from '../prompts/description-generator';
import { getCachedResponse, setCachedResponse, CACHE_TTL } from '../utils/cache';
import { reserveAIQuota, releaseAIQuotaReservation, recordAIRequest } from '../utils/rate-limiter';
import { aiAllowanceForAuthenticatedOrganization } from '@/lib/ai/chat/plan-access-server';
import { reserveProviderTokens, backupTokenBudget, finalizeGroqTokens } from '@/lib/ai/chat/provider-token-admission';
import { randomUUID } from 'node:crypto';
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
  let quotaRequestKey: string | null = null;
  let quotaHeld = false;
  let providerReservationId: string | undefined;
  let providerAttempted = false;
  let providerTokens: number | undefined;

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

    const cacheInput = {
      taskTitle: request.taskTitle,
      context: request.context,
      model: config.models.text,
    };
    const cacheScope = { userId: request.userId, organizationId: request.organizationId };

    const cachedResponse = await getCachedResponse<DescriptionGeneratorResponse['data']>(
      'description-generator',
      cacheInput,
      cacheScope,
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

    // Same billing-authorized plan allowance as AI Chat. A legacy/default
    // per-feature limit must not bypass or understate the customer's plan.
    const allowance = await aiAllowanceForAuthenticatedOrganization(request.organizationId);
    quotaRequestKey = randomUUID();
    const rateLimitCheck = await reserveAIQuota(
      request.userId, request.organizationId, 'description-generator', quotaRequestKey,
      {
        dailyRequestsPerUser: allowance.dailyRequestsPerUser,
        monthlyRequestsPerOrg: allowance.monthlyRequestsPerOrg,
      },
    );

    if (!rateLimitCheck.allowed || !rateLimitCheck.reservationId) {
      return {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED',
          message: rateLimitCheck.reason || 'AI quota could not be reserved. Try again later.' },
      };
    }
    quotaHeld = true;

    const prompt = createDescriptionPrompt(request.taskTitle, request.context);
    const inputTokens = estimateTokens(DESCRIPTION_GENERATOR_SYSTEM_PROMPT + prompt);
    const admission = await reserveProviderTokens({
      requestKey: randomUUID(),
      userId: request.userId,
      organizationId: request.organizationId,
      provider: 'openai',
      model: config.models.text,
      estimatedInputTokens: inputTokens,
      maxOutputTokens: 800,
      tokenLimit: backupTokenBudget(),
    });
    if (!admission.allowed || !admission.reservationId) {
      await releaseAIQuotaReservation(quotaRequestKey, request.userId, request.organizationId);
      quotaHeld = false;
      return {
        success: false,
        error: { code: 'PROVIDER_CAPACITY',
          message: 'AI is temporarily at capacity. Please try again shortly.' },
      };
    }
    providerReservationId = admission.reservationId;
    providerAttempted = true;
    const completionResult = await generateCompletion(
      prompt,
      {
        systemPrompt: DESCRIPTION_GENERATOR_SYSTEM_PROMPT,
        temperature: 0.7,
        maxTokens: 800,
      }
    );

    const outputTokens = estimateTokens(completionResult.content);
    // Exact usage when the upstream API reports it; otherwise keep the
    // conservative token reservation instead of releasing uncertain capacity.
    providerTokens = completionResult.usage?.totalTokens > 0
      ? completionResult.usage.totalTokens : undefined;
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
      cacheInput,
      cacheScope,
      responseData,
      CACHE_TTL.DESCRIPTION_GENERATOR
    );

    return {
      success: true,
      data: responseData,
    };
  } catch (error) {
    // If the provider call was never attempted, its user quota is refundable.
    // Once inference begins, keep the request charged even on malformed output.
    if (!providerAttempted && quotaHeld && quotaRequestKey) {
      await releaseAIQuotaReservation(quotaRequestKey, request.userId, request.organizationId);
    }
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
      error: { code: 'AI_UNAVAILABLE', message: 'AI description could not be generated. Please try again.' },
    };
  } finally {
    if (providerReservationId) {
      await finalizeGroqTokens({
        reservationId: providerReservationId,
        userId: request.userId,
        status: providerTokens === undefined ? 'failed' : 'completed',
        actualTokens: providerTokens,
      }).catch(() => undefined);
    }
  }
};
