import type { ChatToolDefinition } from '@/lib/ai/providers/contracts';

export const AI_WRITE_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: 'create_action',
    description: 'Prepare (but never execute) creation of one Action in an accessible Axiom Process and Stage.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        processId: { type: 'string', format: 'uuid' }, processName: { type: 'string' },
        stageId: { type: 'string' }, stageName: { type: 'string' },
        title: { type: 'string' }, description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        checklistItems: { type: 'array', maxItems: 20, items: { type: 'string' } },
      }, required: ['title'],
    },
  },
  {
    name: 'create_note',
    description: 'Prepare (but never execute) creation of one Note under an accessible Action.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        actionId: { type: 'string', format: 'uuid' }, actionTitle: { type: 'string' },
        processId: { type: 'string', format: 'uuid' }, processName: { type: 'string' },
        title: { type: 'string' }, content: { type: 'string' },
        noteType: { type: 'string', enum: ['note', 'learning', 'idea', 'decision'] },
      }, required: ['content'],
    },
  },
  {
    name: 'update_checklist',
    description: 'Prepare (but never execute) changing completion of one existing stable Checklist item.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        actionId: { type: 'string', format: 'uuid' }, actionTitle: { type: 'string' },
        processId: { type: 'string', format: 'uuid' }, processName: { type: 'string' },
        checklistItemId: { type: 'string' }, checklistText: { type: 'string' },
        completed: { type: 'boolean' },
      }, required: ['completed'],
    },
  },
];
