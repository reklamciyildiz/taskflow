import type { AIChatStreamEvent } from './types';

export function encodeChatSSE(event:AIChatStreamEvent):string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function parseChatSSEBuffer(buffer:string):{ events:AIChatStreamEvent[];remainder:string } {
  const frames=buffer.split('\n\n'),remainder=frames.pop() ?? '',events:AIChatStreamEvent[]=[];
  for(const frame of frames) {
    const line=frame.split('\n').find((part)=>part.startsWith('data: '));
    if(!line) continue;
    try { events.push(JSON.parse(line.slice(6)) as AIChatStreamEvent); } catch { /* ignore malformed upstream frame */ }
  }
  return { events,remainder };
}
