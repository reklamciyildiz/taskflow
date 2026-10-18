export type AIWriteToolName = 'create_action' | 'create_note' | 'update_checklist';

export type AIWriteProposalStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'failed';

export type AIWriteProposal = {
  id: string;
  toolName: AIWriteToolName;
  status: AIWriteProposalStatus;
  title: string;
  summary: string;
  targetLabel: string;
  fields: Array<{ label: string; value: string }>;
  expiresAt: string;
  result?: {
    resourceType: 'action' | 'note' | 'checklist';
    resourceId: string;
    actionId?: string;
    checklistItemId?: string;
    label: string;
  } | null;
  error?: string | null;
};

export type AIWriteProposalEvent = { type: 'proposal'; proposal: AIWriteProposal };
