export const FEEDBACK_CATEGORIES = ['feature','improvement','integration'] as const;
export const FEEDBACK_AREAS = ['general','process','notes','planner','ai','mobile','billing','collaboration'] as const;
export const FEEDBACK_STATUSES = ['submitted','reviewing','planned','building','shipped','declined'] as const;
export const FEEDBACK_MODERATION = ['pending','approved','rejected'] as const;

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export type FeedbackArea = typeof FEEDBACK_AREAS[number];
export type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
export type FeedbackModeration = typeof FEEDBACK_MODERATION[number];

export const categoryLabels: Record<FeedbackCategory,string> = {
  feature:'Yeni özellik', improvement:'İyileştirme', integration:'Entegrasyon',
};
export const areaLabels: Record<FeedbackArea,string> = {
  general:'Genel',process:'Projects / Board',notes:'Notes & Knowledge',planner:'Planner',
  ai:'Actiproc AI',mobile:'Mobil',billing:'Üyelikler',collaboration:'Ekip çalışması',
};
export const statusLabels: Record<FeedbackStatus,string> = {
  submitted:'Önerildi',reviewing:'İnceleniyor',planned:'Planlandı',
  building:'Geliştiriliyor',shipped:'Yayınlandı',declined:'Şimdilik planlanmıyor',
};

export function isOneOf<T extends string>(value: unknown, items: readonly T[]): value is T {
  return typeof value==='string' && items.includes(value as T);
}
export function cleanFeedbackText(input: unknown, min: number, max: number): string | null {
  if(typeof input!=='string') return null;
  const text=input.replace(/\r\n?/g,'\n').trim();
  if(text.length<min || text.length>max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
  return text;
}
export function isFeedbackId(input: unknown): input is string {
  return typeof input==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input);
}
export type FeedbackPost = {
  id:string; title:string; description:string; category:FeedbackCategory;area:FeedbackArea;
  status:FeedbackStatus;moderation:FeedbackModeration;merged_into_id:string|null;
  vote_count:number;comment_count:number;created_at:string;updated_at:string;
  my_vote:boolean;is_mine:boolean;
};
export type FeedbackComment = {
  id:string;post_id:string;body:string;moderation:FeedbackModeration;created_at:string;is_mine:boolean;
};
