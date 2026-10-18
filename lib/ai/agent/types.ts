import type { SourceCitation } from '@/lib/ai/retrieval/types';

export type AIReadToolName =
  | 'list_processes'
  | 'get_process_overview'
  | 'list_actions'
  | 'get_action_details'
  | 'get_planner_overview'
  | 'search_knowledge';

export type AIReadToolActor = {
  userId:string;
  organizationId:string;
  role?:string|null;
};

export type AIReadReference = {
  type:'process'|'action'|'checklist';
  id:string;
  title:string;
  processId?:string|null;
  actionId?:string|null;
  checklistItemId?:string|null;
};

export type AIReadToolExecution = {
  name:AIReadToolName;
  data:unknown;
  references:AIReadReference[];
  citations:SourceCitation[];
  statusLabel:string;
};

export type AIReadToolCall = {
  id:string;
  name:AIReadToolName;
  arguments:unknown;
};
