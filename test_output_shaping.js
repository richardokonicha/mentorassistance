#!/usr/bin/env node
/**
 * Regression test for CodeMentor output shaping.
 *
 * truncateCodeMentor previously matched the CTA with
 * /(call|hop|...|\?)[^.!?]*$/ which returns just "?" whenever the reply ends in
 * a question. That produced truncated output ending mid-word, e.g.
 * "...investigate a leak in the Go service if usage Want?". These cases pin
 * the fixed behaviour: no dangling punctuation, no mid-word cuts, always
 * within the character limit.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const ROOT = '/Users/ro/Fugoku/CAREER/mentorassistance/';
const noop = { addListener: () => {}, removeListener: () => {}, hasListener: () => false };
const sb = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  chrome: {
    runtime: { onMessage: noop, onConnect: noop, onInstalled: noop, onStartup: noop, sendMessage: () => {}, lastError: null, getURL: p => p, id: 't' },
    storage: { local: { get: () => {}, set: () => {}, remove: () => {} }, onChanged: noop, onRemoved: noop },
    tabs: { query: () => [], create: () => {}, onUpdated: noop, onRemoved: noop, sendMessage: () => {} },
    notifications: { create: () => {}, getPermissionLevel: () => {}, onClicked: noop, onButtonClicked: noop, onClosed: noop, onPermissionLevelChanged: noop }
  },
  fetch: () => {}, AbortController
};
sb.globalThis = sb; sb.self = sb;
vm.createContext(sb);
vm.runInContext(
  fs.readFileSync(ROOT + 'dist/background.js', 'utf8') +
  '\n;globalThis.__t=truncateCodeMentor;globalThis.__a=appendCodeMentorCta;globalThis.__vp=VOICE_PROFILES;globalThis.__pp=PLATFORM;',
  sb
);

const LIMIT = 299;
const t = sb.__t, cta = sb.__a;

// The exact failure from the bug report.
const regression = 'First, check the pod memory limits vs actual usage with kubectl top pods or describe to see if it is genuinely exceeding its request/limit. Then adjust the resources in the deployment manifest bump the limit if the app truly needs more memory or investigate a leak in the Go service if usage';
const out = t(cta(regression), LIMIT);
assert.ok(
  !/\bWant\?$/.test(out),
  'CTA must not collapse to a bare question mark, got: ' + JSON.stringify(out.slice(-40))
);
assert.ok(!/\busage\?$/.test(out), 'must not end mid-word: ' + JSON.stringify(out.slice(-40)));
assert.ok(!/\s\w+$/.test(out) || /[.!?]$/.test(out), 'must not end on a dangling word: ' + JSON.stringify(out.slice(-40)));
console.log('regression case:', JSON.stringify(out));
console.log('  length', out.length, '| within limit:', out.length <= LIMIT);

// appendCodeMentorCta must terminate an unclosed sentence before appending,
// otherwise it produces run-ons that break sentence detection downstream.
const unclosed = sb.__a('here is a reply that just stops');
assert.ok(/stops\. Want to talk through it\?$/.test(unclosed),
  'CTA must be its own sentence, got: ' + JSON.stringify(unclosed));
const alreadyQ = sb.__a('is this already a question?');
assert.strictEqual(alreadyQ, 'is this already a question?', 'must not double up on ?');
const hasCall = sb.__a('sure, let us hop on a call tomorrow');
assert.strictEqual(hasCall, 'sure, let us hop on a call tomorrow', 'must not add a second CTA');
console.log('CTA guards passed');

// A battery of shapes: every combination of long body, CTA present/absent,
// question ending, exclamation ending, already-short text.
const cases = [
  ['short reply', 'Terraform force-unlock it and re-run the apply. Want to talk through it?'],
  ['no cta, long', 'x'.repeat(400)],
  ['cta call', 'y'.repeat(380) + ' Let\'s hop on a call.'],
  ['ends question', 'z'.repeat(380) + ' Should I look closer?'],
  ['ends exclamation', 'w'.repeat(380) + ' Fix it now!'],
  ['only cta', 'Want to talk through it?'],
  ['two sentences + cta', 'a'.repeat(150) + '. ' + 'b'.repeat(150) + '. Want to talk through it?'],
  ['trailing comma', 'q'.repeat(299) + ', and then some more text here to force truncation'],
  ['exactly at limit', 'e'.repeat(LIMIT)],
  ['one over limit', 'e'.repeat(LIMIT + 1)]
];

let failures = 0;
for (const [name, input] of cases) {
  const res = t(cta(input), LIMIT);
  const problems = [];
  if (res.length > LIMIT) problems.push(`too long (${res.length})`);
  if (/\s\?$/.test(res)) problems.push('space before bare ?');
  if (/[,;:\s]$/.test(res)) problems.push('trailing punctuation/space');
  if (/\b\w{1,3}\?$/.test(res) && !/it\?$|call\?$|talk\?$|chat\?$|help\?$|look\?$|closer\?$|closely\?$/.test(res)) {
    problems.push('suspiciously short dangling word before ?');
  }
  if (problems.length) {
    failures++;
    console.log(`  FAIL ${name}: ${problems.join('; ')}`);
    console.log(`       ${JSON.stringify(res.slice(-70))}`);
  } else {
    console.log(`  ok   ${name} (${res.length}ch)`);
  }
}

assert.strictEqual(failures, 0, `${failures} shaping case(s) failed`);
console.log('\nCodeMentor output shaping passed');
