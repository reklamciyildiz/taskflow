/**
 * Cache Utility
 * Handles AI response caching with Redis-like interface
 */

import crypto from 'crypto';
import { db } from '@/lib/supabase-admin';

/**
 * Generate cache key from input
 */
export const generateCacheKey = (
  feature: string,
  input: string | object
): string => {
  const inputString = typeof input === 'string' ? input : JSON.stringify(input);
  const hash = crypto.createHash('sha256').update(inputString).digest('hex');
  return `ai:${feature}:${hash}`;
};

/**
 * Generate input hash
 */
export const generateInputHash = (input: string | object): string => {
  const inputString = typeof input === 'string' ? input : JSON.stringify(input);
  return crypto.createHash('sha256').update(inputString).digest('hex');
};

/**
 * Get cached response
 */
export const getCachedResponse = async <T = unknown>(
  feature: string,
  input: string | object
): Promise<T | null> => {
  try {
    const cacheKey = generateCacheKey(feature, input);

    const { data, error } = await db
      .from('ai_cache')
      .select('response, expires_at')
      .eq('cache_key', cacheKey)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      // Delete expired cache
      await db.from('ai_cache').delete().eq('cache_key', cacheKey);
      return null;
    }

    // Increment hit count
    await incrementCacheHit(cacheKey);

    return data.response as T;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

/**
 * Set cached response
 */
export const setCachedResponse = async (
  feature: string,
  input: string | object,
  response: unknown,
  ttlSeconds: number = 3600 // 1 hour default
): Promise<void> => {
  try {
    const cacheKey = generateCacheKey(feature, input);
    const inputHash = generateInputHash(input);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await db.from('ai_cache').upsert(
      {
        cache_key: cacheKey,
        input_hash: inputHash,
        feature,
        response,
        expires_at: expiresAt.toISOString(),
        hit_count: 0,
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
      },
      {
        onConflict: 'cache_key',
      }
    );
  } catch (error) {
    console.error('Cache set error:', error);
  }
};

/**
 * Increment cache hit count
 */
const incrementCacheHit = async (cacheKey: string): Promise<void> => {
  try {
    await db.rpc('increment_cache_hit', { p_cache_key: cacheKey });
  } catch (error) {
    console.error('Cache hit increment error:', error);
  }
};

/**
 * Invalidate cache for a feature
 */
export const invalidateCache = async (
  feature: string,
  input?: string | object
): Promise<void> => {
  try {
    if (input) {
      // Invalidate specific cache entry
      const cacheKey = generateCacheKey(feature, input);
      await db.from('ai_cache').delete().eq('cache_key', cacheKey);
    } else {
      // Invalidate all cache entries for feature
      await db.from('ai_cache').delete().eq('feature', feature);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
};

/**
 * Clean expired cache entries
 */
export const cleanExpiredCache = async (): Promise<number> => {
  try {
    const { data, error } = await db.rpc('clean_expired_ai_cache');

    if (error) {
      console.error('Cache cleanup error:', error);
      return 0;
    }

    return data || 0;
  } catch (error) {
    console.error('Cache cleanup error:', error);
    return 0;
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (
  feature?: string
): Promise<{
  totalEntries: number;
  totalHits: number;
  avgHitCount: number;
  hitRate: number;
}> => {
  try {
    let query = db.from('ai_cache').select('hit_count', { count: 'exact' });

    if (feature) {
      query = query.eq('feature', feature);
    }

    const { data, count, error } = await query;

    if (error || !data) {
      return {
        totalEntries: 0,
        totalHits: 0,
        avgHitCount: 0,
        hitRate: 0,
      };
    }

    const totalHits = data.reduce((sum: number, entry: any) => sum + (entry.hit_count || 0), 0);
    const avgHitCount = count ? totalHits / count : 0;

    // Calculate hit rate (cache hits / total requests)
    // This is a simplified calculation
    const hitRate = count && totalHits > 0 ? (totalHits / (totalHits + count)) * 100 : 0;

    return {
      totalEntries: count || 0,
      totalHits,
      avgHitCount,
      hitRate,
    };
  } catch (error) {
    console.error('Cache stats error:', error);
    return {
      totalEntries: 0,
      totalHits: 0,
      avgHitCount: 0,
      hitRate: 0,
    };
  }
};

/**
 * Cache TTL configurations (in seconds)
 */
export const CACHE_TTL = {
  VOICE_TO_TASK: 3600,
  DESCRIPTION_GENERATOR: 7200,
  DAILY_STANDUP: 1800,
  BLOCKER_DETECTOR: 3600,
  SUGGEST_SUBTASKS: 3600,
  SMART_ASSIGN: 300,
  PRIORITIZATION: 600,
  CATEGORIZATION: 3600,
} as const;
