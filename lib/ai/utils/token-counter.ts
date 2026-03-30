/**
 * Token Counter Utility
 * Estimates token count for OpenAI API calls
 */

/**
 * Estimate token count for text
 * Rule of thumb: 1 token ≈ 4 characters or 0.75 words
 */
export const estimateTokens = (text: string): number => {
  // More accurate estimation
  const words = text.split(/\s+/).length;
  const chars = text.length;
  
  // Use average of word-based and char-based estimation
  const wordBasedEstimate = Math.ceil(words / 0.75);
  const charBasedEstimate = Math.ceil(chars / 4);
  
  return Math.ceil((wordBasedEstimate + charBasedEstimate) / 2);
};

/**
 * Estimate tokens for messages array
 */
export const estimateMessagesTokens = (
  messages: Array<{ role: string; content: string }>
): number => {
  let total = 0;
  
  // Add tokens for each message
  for (const message of messages) {
    total += estimateTokens(message.content);
    // Add overhead for message formatting (role, etc.)
    total += 4;
  }
  
  // Add overhead for API call
  total += 3;
  
  return total;
};

/**
 * Estimate audio duration from file size
 * Assumes typical audio compression rates
 */
export const estimateAudioDuration = (fileSizeBytes: number): number => {
  // Typical bitrate for voice recording: 32-64 kbps
  // Using 48 kbps as average
  const bitrateKbps = 48;
  const bytesPerSecond = (bitrateKbps * 1024) / 8;
  
  return Math.ceil(fileSizeBytes / bytesPerSecond);
};

/**
 * Check if text exceeds token limit
 */
export const exceedsTokenLimit = (text: string, limit: number): boolean => {
  return estimateTokens(text) > limit;
};

/**
 * Truncate text to fit token limit
 */
export const truncateToTokenLimit = (text: string, limit: number): string => {
  const estimatedTokens = estimateTokens(text);
  
  if (estimatedTokens <= limit) {
    return text;
  }
  
  // Calculate approximate character limit
  const ratio = limit / estimatedTokens;
  const charLimit = Math.floor(text.length * ratio * 0.95); // 5% safety margin
  
  return text.slice(0, charLimit) + '...';
};
