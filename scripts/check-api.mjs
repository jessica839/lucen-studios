#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = name => path.join(root, 'api', `${name}.js`);
const require = createRequire(import.meta.url);
const allowedOrigin = 'https://www.gamperklimmek.com';
let passed = 0;

function freshHandler(name) {
  delete require.cache[api(name)];
  return require(api(name));
}

function mockResponse() {
  return {
    headers: {}, statusCode: undefined, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; }
  };
}

async function callHandler(handler, body, { origin = allowedOrigin, ip = '198.51.100.1' } = {}) {
  const res = mockResponse();
  await handler({ method: 'POST', headers: { origin, 'x-forwarded-for': ip }, body, socket: {} }, res);
  return res;
}

async function call(name, body, options) { return callHandler(freshHandler(name), body, options); }

function response(status, data = {}) { return { status, json: async () => data }; }
function count(name) { passed++; process.stdout.write(`✓ ${name}\n`); }

process.env.GHL_API_KEY = 'test-key';
process.env.GHL_API_BASE = 'https://ghl.test';

{
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'POST' && url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    if (options.method === 'GET') return response(200, { contact: { tags: ['existing'] } });
    return response(200, {});
  };
  const res = await call('submit-quiz', { firstName: 'Ada', email: 'ada@example.com', painPoint: 'comms', website: '' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(requests.length, 3);
  count('quiz returns only success');
}

{
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return response(200, {}); };
  const res = await call('submit-quiz', { firstName: 'Ada', email: 'ada@example.com', painPoint: 'comms', website: '' }, { origin: 'https://evil.vercel.app' });
  assert.equal(res.statusCode, 403); assert.equal(fetched, false);
  count('rejects non-project preview origins');
}

{
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return response(200, {}); };
  const res = await call('submit-calc-lead', { firstName: 'Ada', email: 'ada@example.com', website: 'https://spam.example' });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { success: true }); assert.equal(fetched, false);
  count('honeypot short-circuits without CRM request');
}

{
  const endpointBodies = {
    'submit-quiz': { firstName: 'Ada', email: 'ada@example.com', painPoint: 'comms', website: 'bot' },
    'submit-calc-lead': { firstName: 'Ada', email: 'ada@example.com', website: 'bot' },
    'submit-case-study': { firstName: 'Ada', email: 'ada@example.com', company: '', cases: ['cs1'], website: 'bot' }
  };
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return response(200, {}); };
  for (const [endpoint, body] of Object.entries(endpointBodies)) {
    const success = await call(endpoint, body, { ip: `198.51.100.${20 + Object.keys(endpointBodies).indexOf(endpoint)}` });
    assert.equal(success.statusCode, 200);
    const blocked = await call(endpoint, { ...body, website: '' }, { origin: 'https://evil.vercel.app', ip: `198.51.100.${30 + Object.keys(endpointBodies).indexOf(endpoint)}` });
    assert.equal(blocked.statusCode, 403);
  }
  assert.equal(fetched, false);
  count('all endpoints honor strict origin and honeypot handling');
}

{
  const invalid = [
    ['submit-quiz', { firstName: 1, email: 'ada@example.com', painPoint: 'comms', website: '' }],
    ['submit-calc-lead', { firstName: 'A'.repeat(101), email: 'ada@example.com', website: '' }],
    ['submit-case-study', { firstName: 'Ada', email: 'ada@example.com', company: {}, cases: ['cs1'], website: '' }]
  ];
  let fetched = false;
  globalThis.fetch = async () => { fetched = true; return response(200, {}); };
  for (const [endpoint, body] of invalid) assert.equal((await call(endpoint, body)).statusCode, 400);
  assert.equal(fetched, false);
  count('rejects non-string and overlong fields before CRM requests');
}

{
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST' && url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    if (options.method === 'GET') return response(200, { contact: { tags: [] } });
    return response(200, {});
  };
  const handler = freshHandler('submit-quiz');
  const body = { firstName: 'Ada', email: 'ada@example.com', painPoint: 'comms', website: '' };
  for (let index = 0; index < 60; index++) assert.equal((await callHandler(handler, body, { ip: '198.51.100.60' })).statusCode, 200);
  assert.equal((await callHandler(handler, body, { ip: '198.51.100.60' })).statusCode, 429);
  count('enforces the quiz tablet rate limit');
}

{
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    return response(200, {});
  };
  const body = { firstName: 'Ada', email: 'ada@example.com', company: '', cases: ['cs1', 'cs1', 'cs2'], website: '' };
  const res = await call('submit-case-study', body);
  assert.equal(res.statusCode, 200);
  assert.equal(requests.filter(request => request.url.includes('/workflow/')).length, 2);
  const aliases = await call('submit-case-study', { ...body, cases: ['tradeshow', 'scraper', 'chatbot'] }, { ip: '198.51.100.3' });
  assert.equal(aliases.statusCode, 200);
  assert.equal(requests.filter(request => request.url.includes('/workflow/')).length, 5);
  const capped = await call('submit-case-study', { ...body, cases: ['cs1', 'cs2', 'cs3', 'cs1'] }, { ip: '198.51.100.2' });
  assert.equal(capped.statusCode, 400);
  count('deduplicates case workflows, supports resource aliases, and caps selection');
}

{
  globalThis.fetch = async (_url, options) => options.method === 'POST' ? response(500, {}) : response(200, { contact: { tags: [] } });
  const calc = await call('submit-calc-lead', { firstName: 'Ada', email: 'ada@example.com', website: '' });
  assert.equal(calc.statusCode, 502);
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    return response(500, {});
  };
  const cases = await call('submit-case-study', { firstName: 'Ada', email: 'ada@example.com', company: '', cases: ['cs1'], website: '' });
  assert.equal(cases.statusCode, 502);
  count('surfaces CRM contact and workflow failures as 502');
}

{
  globalThis.fetch = async (url) => {
    if (url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    if (url.endsWith('/notes')) return response(500, {});
    throw new Error(`unexpected URL ${url}`);
  };
  const calc = await call('submit-calc-lead', { firstName: 'Ada', email: 'ada@example.com', annualCost: 10, website: '' });
  assert.equal(calc.statusCode, 200);
  count('keeps calculator notes best-effort after contact success');
}

{
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/contacts/')) return response(400, { meta: { contactId: 'contact-1' } });
    if (options.method === 'GET') return response(200, { contact: { tags: ['existing'] } });
    return response(200, {});
  };
  const calc = await call('submit-calc-lead', { firstName: 'Ada', email: 'ada@example.com', website: '' });
  assert.equal(calc.statusCode, 200);
  const tagUpdate = requests.find(request => request.options.method === 'PUT');
  assert.deepEqual(JSON.parse(tagUpdate.options.body).tags, ['existing', 'calculator-lead']);
  count('preserves existing calculator contact tags on duplicate upsert');
}

{
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST' && url.endsWith('/contacts/')) return response(201, { contact: { id: 'contact-1' } });
    if (options.method === 'GET') return response(200, { contact: { tags: [] } });
    return response(503, {});
  };
  const quiz = await call('submit-quiz', { firstName: 'Ada', email: 'ada@example.com', painPoint: 'comms', website: '' });
  assert.equal(quiz.statusCode, 502);
  count('returns 502 when quiz tag update fails');
}

{
  const callers = [
    ['index.html', '/api/submit-case-study'],
    ['resources.html', '/api/submit-case-study'],
    ['calculator.html', '/api/submit-calc-lead'],
    ['event-quiz.html', '/api/submit-quiz']
  ];
  for (const [file, endpoint] of callers) {
    const source = await readFile(path.join(root, file), 'utf8');
    const start = source.lastIndexOf(endpoint);
    assert.ok(start >= 0, `${file} must call ${endpoint}`);
    const end = source.indexOf('})', start);
    assert.match(source.slice(Math.max(0, start - 1200), end + 3), /website\s*:/, `${file} payload for ${endpoint} must include website`);
  }
  count('all lead callers include the website honeypot field');
}

console.log(`API checks passed: ${passed}`);
