import assert from 'node:assert/strict';
import {
  AIProviderConfigurationError,
  CloudflareEmbeddingProvider,
  GroqChatProvider,
} from '../lib/ai/providers';

const context = { requestId: 'test-request', timeoutMs: 1_000 };
const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const vector = (seed = 0) => Array.from({ length: 1_024 }, (_, index) => seed + index / 1_024);

async function expectReject(run: () => Promise<unknown>, code: string, normalize: (error: unknown) => { code: string }) {
  let caught: unknown;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection with ${code}`);
  assert.equal(normalize(caught).code, code);
}

async function main() {
  let checks = 0;
  let groqBody: any;
  const groq = new GroqChatProvider({
    apiKey: 'test-key',
    fetch: (async (_url, init) => {
      groqBody = JSON.parse(String(init?.body));
      return jsonResponse({
        model: 'qwen/test',
        choices: [{ message: { content: 'Merhaba' } }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      });
    }) as typeof fetch,
  });
  const completion = await groq.complete({
    messages: [{ role: 'system', content: 'Be concise' }, { role: 'user', content: 'Hello' }],
    maxOutputTokens: 100,
  }, context);
  assert.equal(completion.text, 'Merhaba');
  assert.deepEqual(completion.usage, { inputTokens: 4, outputTokens: 2, totalTokens: 6 });
  assert.equal(groqBody.max_completion_tokens, 100);
  assert.equal(groqBody.stream, false);
  checks++;

  const toolGroq = new GroqChatProvider({
    apiKey: 'test-key',
    fetch: (async () => jsonResponse({
      model: 'qwen/test',
      choices: [{ message: {
        content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_actions', arguments: '{"limit":5}' } }],
      } }],
      usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
    })) as typeof fetch,
  });
  const toolResult = await toolGroq.complete({
    messages: [{ role: 'user', content: 'List actions' }],
    tools: [{ name: 'list_actions', description: 'Lists actions', inputSchema: { type: 'object' } }],
  }, context);
  assert.deepEqual(toolResult.toolCalls, [{ id: 'call-1', name: 'list_actions', arguments: { limit: 5 } }]);
  checks++;

  const encoder = new TextEncoder();
  const sse = [
    'data: {"model":"qwen/test","choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"model":"qwen/test","choices":[{"delta":{"content":"lo","tool_calls":[{"index":0,"id":"call-2","function":{"name":"get_","arguments":"{\\"id\\":"}}]}}]}\n\n',
    'data: {"model":"qwen/test","choices":[{"delta":{"tool_calls":[{"index":0,"function":{"name":"action","arguments":"7}"}}]}}],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n',
    'data: [DONE]\n\n',
  ];
  const streamGroq = new GroqChatProvider({
    apiKey: 'test-key',
    fetch: (async () => new Response(new ReadableStream({
      start(controller) {
        for (const event of sse) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    }), { status: 200 })) as typeof fetch,
  });
  const events = [];
  for await (const event of streamGroq.stream({ messages: [{ role: 'user', content: 'Hi' }] }, context)) {
    events.push(event);
  }
  assert.deepEqual(events.filter((event) => event.type === 'text_delta').map((event: any) => event.text), ['Hel', 'lo']);
  assert.deepEqual(events.find((event) => event.type === 'tool_call'), {
    type: 'tool_call', toolCall: { id: 'call-2', name: 'get_action', arguments: { id: 7 } },
  });
  assert.equal(events.at(-1)?.type, 'done');
  checks++;

  const abortGroq = new GroqChatProvider({
    apiKey: 'test-key',
    fetch: ((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })) as typeof fetch,
  });
  await expectReject(
    () => abortGroq.complete({ messages: [{ role: 'user', content: 'Hi' }] }, { ...context, timeoutMs: 10 }),
    'timeout',
    (error) => abortGroq.normalizeError(error),
  );
  const externalAbort = new AbortController();
  const externallyCancelled = abortGroq.complete(
    { messages: [{ role: 'user', content: 'Hi' }] },
    { ...context, signal: externalAbort.signal },
  );
  externalAbort.abort();
  await expectReject(
    () => externallyCancelled,
    'timeout',
    (error) => abortGroq.normalizeError(error),
  );
  checks++;

  for (const [status, expected] of [[429, 'rate_limited'], [500, 'unavailable']] as const) {
    const failing = new GroqChatProvider({
      apiKey: 'test-key',
      fetch: (async () => jsonResponse({}, status, status === 429 ? { 'Retry-After': '2' } : undefined)) as typeof fetch,
    });
    await expectReject(
      () => failing.complete({ messages: [{ role: 'user', content: 'Hi' }] }, context),
      expected,
      (error) => failing.normalizeError(error),
    );
  }
  checks++;

  const limited = new GroqChatProvider({
    apiKey:'test-key',fetch:(async()=>jsonResponse({},429,{
      'Retry-After':'7','x-request-id':'upstream-safe-id','x-ratelimit-limit-tokens':'8000',
      'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'7s',
      'x-ratelimit-limit-requests':'1000','x-ratelimit-remaining-requests':'999',
    })) as typeof fetch,
  });
  let limitedError:unknown;
  try { await limited.complete({ messages:[{ role:'user',content:'Hi' }] },context); } catch(error) { limitedError=error; }
  const normalizedLimit=limited.normalizeError(limitedError);
  assert.equal(normalizedLimit.retryAfterMs,7_000);
  assert.equal(normalizedLimit.upstreamRequestId,'upstream-safe-id');
  assert.equal(normalizedLimit.rateLimit?.limitTokens,8_000);
  assert.equal(normalizedLimit.rateLimit?.remainingTokens,0);
  assert.equal(normalizedLimit.rateLimit?.remainingRequests,999);
  assert.equal(normalizedLimit.rateLimit?.resetTokens,'7s');
  checks++;

  assert.throws(() => new GroqChatProvider({ apiKey: '' }), AIProviderConfigurationError);
  assert.throws(() => new CloudflareEmbeddingProvider({ accountId: '', apiToken: '' }), AIProviderConfigurationError);
  checks++;

  let cloudflareCalls = 0;
  const cloudflare = new CloudflareEmbeddingProvider({
    accountId: 'account',
    apiToken: 'token',
    fetch: (async () => {
      cloudflareCalls += 1;
      return jsonResponse({ success: true, result: { data: [vector(0), vector(1)], shape: [2, 1_024] } });
    }) as typeof fetch,
  });
  const embeddings = await cloudflare.embed({ texts: ['bir', 'iki'] }, context);
  assert.equal(embeddings.vectors.length, 2);
  assert.equal(embeddings.dimensions, 1_024);
  assert.equal(cloudflareCalls, 1);
  checks++;

  for (const responseBody of [
    { success: true, result: { data: [[0, 1]], shape: [1, 2] } },
    { success: true, result: { nope: [] } },
  ]) {
    const malformed = new CloudflareEmbeddingProvider({
      accountId: 'account', apiToken: 'token',
      fetch: (async () => jsonResponse(responseBody)) as typeof fetch,
    });
    await expectReject(
      () => malformed.embed({ texts: ['test'] }, context),
      'unavailable',
      (error) => malformed.normalizeError(error),
    );
  }
  checks++;

  let retryCalls = 0;
  const retrying = new CloudflareEmbeddingProvider({
    accountId: 'account', apiToken: 'token', maxRetryDelayMs: 0,
    fetch: (async () => {
      retryCalls += 1;
      if (retryCalls < 3) return jsonResponse({}, retryCalls === 1 ? 429 : 500, { 'Retry-After': '0' });
      return jsonResponse({ success: true, result: { data: [vector()], shape: [1, 1_024] } });
    }) as typeof fetch,
  });
  await retrying.embed({ texts: ['retry'] }, context);
  assert.equal(retryCalls, 3);
  checks++;

  let networkRetryCalls = 0;
  const networkRetry = new CloudflareEmbeddingProvider({
    accountId: 'account', apiToken: 'token', maxRetryDelayMs: 0,
    fetch: (async () => {
      networkRetryCalls += 1;
      if (networkRetryCalls === 1) throw new TypeError('synthetic network failure');
      return jsonResponse({ success: true, result: { data: [vector()], shape: [1, 1_024] } });
    }) as typeof fetch,
  });
  await networkRetry.embed({ texts: ['network retry'] }, context);
  assert.equal(networkRetryCalls, 2);
  checks++;

  console.log(JSON.stringify({ providerContractChecks: checks, liveApiCalls: false }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Provider contract test failed');
  process.exitCode = 1;
});
