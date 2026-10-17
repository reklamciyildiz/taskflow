import { createHash } from 'crypto';

export function createVoiceCacheIdentity(input: {
  bytes: Uint8Array;
  mimeType: string;
  language?: string;
  organizationId: string;
  userId: string;
  speechModel: string;
  textModel: string;
}) {
  return {
    version: 2,
    audioSha256: createHash('sha256').update(input.bytes).digest('hex'),
    mimeType: input.mimeType.split(';')[0].trim().toLowerCase(),
    language: input.language || 'tr',
    organizationId: input.organizationId,
    userId: input.userId,
    speechModel: input.speechModel,
    textModel: input.textModel,
  };
}
