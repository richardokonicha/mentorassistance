#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const background = fs.readFileSync('background.ts', 'utf8');
const build = fs.readFileSync('build.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const manifest = fs.readFileSync('manifest.json', 'utf8');

// Provider and request-shape assertions apply to code, not to the comments
// that explain the code. Extracting the specific blocks keeps a prose mention
// of a retired model or a rejected parameter from failing the contract.
function extractBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `could not find "${startMarker}" in source`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end !== -1, `could not find "${endMarker}" after "${startMarker}"`);
  return source.slice(start, end + endMarker.length);
}

const modelConfigBlock = extractBlock(background, 'const MODEL_CONFIG = {', '\n};');
const requestBodyBlock = extractBlock(background, 'const body = JSON.stringify({', '\n  });');

assert.match(background, /KILO_API_KEY/);
assert.match(background, /api\.kilo\.ai\/api\/gateway\/chat\/completions/);
assert.match(modelConfigBlock, /poolside\/laguna-s-2\.1:free/);
assert.match(modelConfigBlock, /nvidia\/nemotron-3-ultra-550b-a55b:free/);
assert.match(modelConfigBlock, /kilo-auto\/free/);
// The retired model 404s upstream, so it must not be configured again.
assert.doesNotMatch(modelConfigBlock, /nvidia\/nemotron-3-super-120b-a12b:free/);
assert.doesNotMatch(background, /api\.mindshub\.ai/);
assert.doesNotMatch(background, /openrouter\.ai/);
assert.doesNotMatch(background, /api\.groq\.com/);
assert.match(background, /No buzzwords/i);
assert.match(background, /Do not name employers, clients, or products/i);
assert.match(background, /Do not quote metrics/i);
assert.match(background, /Respond to what was actually asked/i);
assert.match(background, /Do not stack technology names/i);
assert.match(background, /What you can speak credibly to/i);
assert.doesNotMatch(background, /NEVER USE AI-ISH PHRASES/);
assert.doesNotMatch(background, /removeBannedPhrases\(/);
assert.doesNotMatch(background, /for \(const regex of getBannedRegexes/);
assert.doesNotMatch(background, /Example 1:/);
assert.match(background, /messages: \[\n      \{ role: 'system'/);
assert.doesNotMatch(background, /getFewShotExamples\(txt, activePlatform\)/);
assert.match(background, /Generation path does not read saved examples/i);
// The CodeMentor prompt must not hand the model employer names, product
// brands, or hard metrics to parrot back into a 299-character reply.
const codeMentorPrompt = background.slice(
  background.indexOf('function buildCodeMentorPrompt'),
  background.indexOf('function buildUpworkPrompt')
);
for (const buzzword of [
  'Fugoku', 'Swell', 'MindsDB', 'eHealth4Everyone', 'Inference Cloud',
  'LiteLLM', 'Helicone', 'SkyPilot', 'Turbo Quant', 'OpenStack',
  'Stripe', 'Redis', 'Gates Foundation', '65%', '300ms'
]) {
  assert.ok(
    !codeMentorPrompt.includes(buzzword),
    `CodeMentor prompt must not reference "${buzzword}"`
  );
}

// The Upwork prompt is long-form and keeps credential detail, so RESUME_CONTEXT
// must still exist for it.
assert.match(background, /const RESUME_CONTEXT/);
assert.match(background, /RESUME_CONTEXT}\n/);
assert.match(background, /maxRetries = 3/);
assert.match(background, /if \(data\.error && !data\.choices\?\.\[0\]\)/);
// The token budget must cover reasoning output, otherwise the provider ends
// the response with finish_reason "length" and returns no content at all.
assert.match(background, /const maxTokens = activePlatform === PLATFORM\.UPWORK \? 4096 : 2048/);
// Reasoning models bill reasoning tokens against max_tokens.
assert.match(background, /reasoning tokens against max_tokens/);
// The request must not send params that providers reject or ignore.
assert.doesNotMatch(requestBodyBlock, /stop:/);
assert.doesNotMatch(requestBodyBlock, /reasoning:/);
assert.match(background, /Math\.min\(model\.timeoutMs, budgetMs\)/);
// The whole fallback chain has to fit the 30s content-script window.
assert.match(background, /const REQUEST_DEADLINE_MS = 28000/);
assert.doesNotMatch(background, /Mentored 100\+/i);
assert.match(build, /KILO_API_KEY/);
assert.match(envExample, /KILO_API_KEY=/);
assert.match(manifest, /api\.kilo\.ai/);
assert.doesNotMatch(manifest, /api\.mindshub\.ai/);
assert.doesNotMatch(manifest, /openrouter\.ai/);
assert.doesNotMatch(manifest, /api\.groq\.com/);

console.log('Prompt/provider contract passed');
