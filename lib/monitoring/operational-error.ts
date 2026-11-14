/**
 * Minimal operational event. Never log customer content, stacks, URLs, cookies or tokens.
 */
export type OperationalErrorCode = 'CLIENT_RENDER_FAILURE';
export function logOperationalError(input:{
  code:OperationalErrorCode; eventId:string; scope:'shell'; digest?:string|null;
}):void {
  console.error('[actiproc-monitor]',JSON.stringify({
    event:'application_error',level:'error',code:input.code,eventId:input.eventId,
    scope:input.scope,digest:input.digest ?? null,observedAt:new Date().toISOString(),
  }));
}
