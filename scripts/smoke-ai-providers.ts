import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { config } from 'dotenv';
import { CloudflareEmbeddingProvider, GroqChatProvider } from '../lib/ai/providers';

config({ path: '.env.local', quiet: true });

async function main() {
  if (!process.argv.includes('--live')) {
    throw new Error('Refusing live provider calls without the explicit --live flag');
  }
  const target = process.argv.find((value) => value.startsWith('--provider='))?.split('=')[1] ?? 'all';
  if (!['all', 'groq', 'cloudflare'].includes(target)) {
    throw new Error('Use --provider=groq, --provider=cloudflare, or --provider=all');
  }
  if (target === 'all' || target === 'groq') {
    const provider = new GroqChatProvider();
    const request = { messages: [{ role: 'user' as const, content: 'Reply with exactly: AXIOM_PROVIDER_OK' }],
      maxOutputTokens: 32,reasoning: { effort: 'none' as const,format: 'hidden' as const } };
    if (process.argv.includes('--stream')) {
      const started=Date.now();let text='';let usage={};let model=provider.modelId;let latencyMs=0;let firstTokenMs:number|undefined;
      for await(const event of provider.stream(request,{ requestId:randomUUID(),timeoutMs:20_000 })) {
        if(event.type==='text_delta') { if(firstTokenMs===undefined) firstTokenMs=Date.now()-started;text+=event.text; }
        if(event.type==='usage') usage=event.usage;
        if(event.type==='done') { model=event.model;latencyMs=event.latencyMs; }
      }
      assert.equal(text.trim(),'AXIOM_PROVIDER_OK','Groq returned an unexpected synthetic stream');
      assert.ok(firstTokenMs!==undefined,'Groq stream did not produce a text delta');
      console.log(JSON.stringify({ provider:provider.providerId,model,usage,latencyMs,firstTokenMs,stream:true }));
    } else {
      const response = await provider.complete(request,{ requestId:randomUUID(),timeoutMs:20_000 });
      assert.equal(response.text.trim(), 'AXIOM_PROVIDER_OK', 'Groq returned an unexpected synthetic response');
      console.log(JSON.stringify({ provider: provider.providerId, model: response.model, usage: response.usage, latencyMs: response.latencyMs,stream:false }));
    }
  }
  if (target === 'all' || target === 'cloudflare') {
    const provider = new CloudflareEmbeddingProvider();
    const response = await provider.embed(
      { texts: ['Axiom provider connectivity test.'] },
      { requestId: randomUUID(), timeoutMs: 20_000 },
    );
    assert.equal(response.dimensions, 1_024, 'Cloudflare embedding dimension mismatch');
    assert.equal(response.vectors.length, 1, 'Cloudflare embedding count mismatch');
    assert.equal(response.vectors[0].length, 1_024, 'Cloudflare vector length mismatch');
    console.log(JSON.stringify({ provider: provider.providerId, model: response.model, dimensions: response.dimensions, count: response.vectors.length, latencyMs: response.latencyMs }));
  }
}

main().catch((error) => {
  const normalized = error instanceof Error ? error.message : 'Provider smoke test failed';
  console.error(normalized);
  process.exitCode = 1;
});
