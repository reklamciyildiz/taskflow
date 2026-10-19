import type { ChatToolDefinition } from '@/lib/ai/providers/contracts';

const BASE_WRITE_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: 'create_action',
    description: 'Use only when the user explicitly asks to create/add a new Action. Prepare (but never execute) creation in an accessible Axiom Process and Stage.',
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

const ACTION_MUTATION_TOOL_DEFINITIONS: ChatToolDefinition[] = [
  {
    name: 'update_action',
    description: 'Use only when the user asks to change an Action that already exists. Prepare (but never execute) a bounded field update. Never use for creating a new Action.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        actionId: { type: 'string', format: 'uuid' }, actionTitle: { type: 'string' },
        processId: { type: 'string', format: 'uuid' }, processName: { type: 'string' },
        title: { type: 'string' }, description: { type: 'string' },
        descriptionMode: { type: 'string', enum: ['replace', 'append'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
  },
  {
    name: 'schedule_action',
    description: 'Use only when the user asks to plan, schedule, move, or reschedule an existing Action in Planner. Use YYYY-MM-DD and local HH:mm. For an existing recurring Action, recurrenceScope must be explicit only when the user clearly chose the whole series or one occurrence.',
    inputSchema: {
      type: 'object', additionalProperties: false,
      properties: {
        actionId: { type: 'string', format: 'uuid' }, actionTitle: { type: 'string' },
        processId: { type: 'string', format: 'uuid' }, processName: { type: 'string' },
        scheduleDate: { type: 'string', description: 'Local calendar date in YYYY-MM-DD' },
        scheduleTime: { type: ['string', 'null'], description: 'Local time in HH:mm, or null for all-day' },
        recurrenceScope: { type: 'string', enum: ['series', 'occurrence'] },
        occurrenceDate: { type: 'string', description: 'Original YYYY-MM-DD occurrence date; required for one recurring occurrence' },
      }, required: ['scheduleDate'],
    },
  },
];

export const AI_WRITE_TOOL_DEFINITIONS = BASE_WRITE_TOOL_DEFINITIONS;

export function aiWriteToolDefinitions(includeActionMutations: boolean): ChatToolDefinition[] {
  return includeActionMutations
    ? [...BASE_WRITE_TOOL_DEFINITIONS, ...ACTION_MUTATION_TOOL_DEFINITIONS]
    : BASE_WRITE_TOOL_DEFINITIONS;
}
