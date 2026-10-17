export type AIIndexJobSourceType = 'task' | 'note' | 'process' | 'attachment';
export type AISourceType = 'action' | 'checklist' | 'note' | 'process' | 'attachment';

export type AIIndexJob = {
  id: number;
  source_type: AIIndexJobSourceType;
  source_key: string;
  operation: 'upsert' | 'delete';
  organization_id: string;
  team_id: string | null;
  project_id: string | null;
  generation: number;
  attempts: number;
  lease_token: string;
};

export type AIIndexDocumentDraft = {
  sourceType: AISourceType;
  sourceKey: string;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  taskId: string | null;
  noteId: string | null;
  attachmentId: string | null;
  title: string;
  content: string;
  contentHash: string;
  sourceUpdatedAt: string;
  chunkTexts: string[];
};

export type ExistingAIIndexDocument = {
  source_type: AISourceType;
  source_key: string;
  content_hash: string;
  active_index_version: string | null;
  active_embedding_model: string | null;
};

export type PlannedAIIndexDocument = AIIndexDocumentDraft & {
  indexVersion: string;
  embeddingModel: string;
  reuseExisting: boolean;
};
