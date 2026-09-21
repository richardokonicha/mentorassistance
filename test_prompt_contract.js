#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const background = fs.readFileSync('background.ts', 'utf8');
const build = fs.readFileSync('build.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const manifest = fs.readFileSync('manifest.json', 'utf8');

assert.match(background, /EXPERIENTIAL_API_KEY/);
assert.match(background, /api\.experientiallabs\.ai\/v1\/chat\/completions/);
assert.match(background, /gpt-5\.6-luna/);
assert.doesNotMatch(background, /api\.kilo\.ai/);
assert.doesNotMatch(background, /api\.groq\.com/);
assert.match(background, /Do not invent|Do not fabricate/i);
assert.match(background, /natural|readable|smooth/i);
assert.match(background, /Only mention technical details that are directly relevant/i);
assert.match(background, /Do not list keywords|keyword stuffing/i);
assert.match(background, /Use these phrases only when they genuinely fit/i);
assert.doesNotMatch(background, /NEVER USE AI-ISH PHRASES/);
assert.doesNotMatch(background, /removeBannedPhrases\(/);
assert.doesNotMatch(background, /for \(const regex of getBannedRegexes/);
assert.doesNotMatch(background, /Example 1:/);
assert.match(background, /messages: \[\n      \{ role: 'system'/);
assert.doesNotMatch(background, /getFewShotExamples\(txt, activePlatform\)/);
assert.match(background, /Generation path does not read saved examples/i);
assert.match(background, /maxRetries = 1/);
assert.match(background, /const maxTokens = activePlatform === PLATFORM.UPWORK \? 420 : 96/);
assert.match(background, /Math\.min\(model\.timeoutMs, 12000\)/);
assert.match(background, /resume is incomplete/i);
assert.match(background, /managed or self-managed Kubernetes/i);
assert.match(build, /EXPERIENTIAL_API_KEY/);
assert.match(envExample, /EXPERIENTIAL_API_KEY=/);
assert.match(manifest, /api\.experientiallabs\.ai/);
assert.doesNotMatch(manifest, /api\.kilo\.ai/);
assert.doesNotMatch(manifest, /api\.groq\.com/);

console.log('Prompt/provider contract passed');
