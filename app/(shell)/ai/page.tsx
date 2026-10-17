import { AxiomAIChat } from '@/components/ai/AxiomAIChat';
import { isAIChatEnabled } from '@/lib/ai/chat/config';

export const dynamic='force-dynamic';
export default function AIPage() { return <AxiomAIChat enabled={isAIChatEnabled()}/>; }
