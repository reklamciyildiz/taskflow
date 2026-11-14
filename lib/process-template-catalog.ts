import type { ProjectColumnConfig } from '@/lib/types';
import { newStageId } from '@/lib/stage-lifecycle';

export type TemplateCategory = 'Personal' | 'Team' | 'Business';
export type ProcessTemplateId =
  | 'simple' | 'product-launch' | 'client-delivery' | 'content-calendar'
  | 'recruiting' | 'support-requests' | 'weekly-focus' | 'job-search';

type Stage = Readonly<Pick<ProjectColumnConfig, 'title' | 'color' | 'isTerminal'>>;

export interface ProcessTemplate {
  id: ProcessTemplateId;
  title: string;
  description: string;
  category: TemplateCategory;
  outcome: string;
  icon: 'rocket' | 'briefcase' | 'calendar' | 'users' | 'headphones' | 'target' | 'layers' | 'search';
  stages: readonly Stage[];
  recommended?: boolean;
}
const slate = 'bg-slate-100 dark:bg-slate-800';
const blue = 'bg-blue-50 dark:bg-blue-500/10';
const amber = 'bg-amber-50 dark:bg-amber-500/10';
const green = 'bg-emerald-50 dark:bg-emerald-500/10';
const rose = 'bg-rose-50 dark:bg-rose-500/10';
const stage = (title:string,color:string,isTerminal=false):Stage => ({title,color,isTerminal});

export const PROCESS_TEMPLATES:readonly ProcessTemplate[] = [
  { id:'simple',title:'Simple workflow',description:'A flexible starting point for any project.',category:'Personal',
    outcome:'From ideas to finished work',icon:'layers',recommended:true,
    stages:[stage('To Do',slate),stage('In Progress',blue),stage('Done',green,true)] },
  { id:'product-launch',title:'Product launch',description:'Coordinate scope, development, QA, and release.',category:'Team',
    outcome:'Launch with clearer handoffs',icon:'rocket',
    stages:[stage('Backlog',slate),stage('In Progress',blue),stage('Review & QA',amber),stage('Shipped',green,true)] },
  { id:'client-delivery',title:'Client delivery',description:'Track requests from kickoff through client approval.',category:'Business',
    outcome:'Keep commitments and reviews visible',icon:'briefcase',
    stages:[stage('Incoming',slate),stage('Planned',blue),stage('In Delivery',amber),stage('Client Review',rose),stage('Delivered',green,true)] },
  { id:'content-calendar',title:'Content production',description:'Organize briefs, writing, approvals and publishing.',category:'Team',
    outcome:'Keep your publishing rhythm',icon:'calendar',
    stages:[stage('Ideas',slate),stage('Drafting',blue),stage('Editing',amber),stage('Ready',rose),stage('Published',green,true)] },
  { id:'recruiting',title:'Hiring pipeline',description:'Keep candidate tasks and hiring decisions organized.',category:'Business',
    outcome:'Clearer hiring handoffs',icon:'users',
    stages:[stage('Applications',slate),stage('Screening',blue),stage('Interviews',amber),stage('Decision',rose),stage('Closed',green,true)] },
  { id:'support-requests',title:'Request tracker',description:'Triaging incoming work, solving issues and closing the loop.',category:'Team',
    outcome:'Nothing important gets lost',icon:'headphones',
    stages:[stage('Inbox',slate),stage('Triaged',blue),stage('In Progress',amber),stage('Waiting',rose),stage('Resolved',green,true)] },
  { id:'weekly-focus',title:'Weekly priorities',description:'A lightweight system for personal or small-team focus.',category:'Personal',
    outcome:'Finish the right work each week',icon:'target',
    stages:[stage('This Week',slate),stage('Doing',blue),stage('Blocked',amber),stage('Done',green,true)] },
  { id:'job-search',title:'Job search',description:'Follow opportunities through applications and interviews.',category:'Personal',
    outcome:'Track every next step',icon:'search',
    stages:[stage('Interested',slate),stage('Applied',blue),stage('Interview',amber),stage('Offer',rose),stage('Closed',green,true)] },
] as const;

/** Generate fresh unique stage identities for each Process instance.
 * Never share template stage IDs or assume stage titles are identity.
 */
export function instantiateProcessTemplate(id:ProcessTemplateId):ProjectColumnConfig[]{
  const chosen=PROCESS_TEMPLATES.find(template=>template.id===id);
  if(!chosen)throw new Error('Unknown Process template');
  return chosen.stages.map(entry=>({...entry,id:newStageId()}));
}

export function getProcessTemplate(id:string):ProcessTemplate|undefined {
  return PROCESS_TEMPLATES.find(template=>template.id===id);
}
