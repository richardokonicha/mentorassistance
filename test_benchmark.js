#!/usr/bin/env node
/**
 * AI Auto Answer - Benchmark & Quality Evaluation
 *
 * This benchmark drives the production code path. It loads the built
 * dist/background.js and calls callModelWithFallback directly, so the prompt,
 * the request body, the fallback chain, and the output shaping are all the
 * ones that ship. An earlier version of this file kept its own copy of the
 * system prompt and its own copy of the shaping rules, which meant it scored
 * a prompt the extension no longer uses.
 *
 * The scoring below matches what the production prompt actually asks for.
 * The old score rewarded signature phrases and a call to action on every
 * reply, but the shipped prompt deliberately says "Never force a call to
 * action" and no longer injects signature phrases, so rewarding them
 * penalised correct output.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const fetchImpl = global.fetch;
const ROOT = __dirname + '/';

// ============================================================================
// PRODUCTION CODE
// ============================================================================

const noop = { addListener: () => {}, removeListener: () => {}, hasListener: () => false };
const sandbox = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  chrome: {
    runtime: { onMessage: noop, onConnect: noop, onInstalled: noop, onStartup: noop, sendMessage: () => {}, lastError: null, getURL: p => p, id: 'bench' },
    storage: { local: { get: () => {}, set: () => {}, remove: () => {} }, onChanged: noop, onRemoved: noop },
    tabs: { query: () => [], create: () => {}, onUpdated: noop, onRemoved: noop, sendMessage: () => {} },
    notifications: { create: () => {}, getPermissionLevel: () => {}, onClicked: noop, onButtonClicked: noop, onClosed: noop, onPermissionLevelChanged: noop }
  },
  fetch: (...args) => fetchImpl(...args),
  AbortController, URL, Promise, Math, Date, JSON
};
sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

const distPath = ROOT + 'dist/background.js';
if (!fs.existsSync(distPath)) {
  console.error('dist/background.js not found. Run `npm run build` first.');
  process.exit(1);
}
vm.runInContext(
  fs.readFileSync(distPath, 'utf8') +
  '\n;globalThis.__call=callModelWithFallback;globalThis.__cfg=MODEL_CONFIG;globalThis.__pp=PLATFORM;',
  sandbox
);

const callProduction = sandbox.__call;
const MODEL_CONFIG = sandbox.__cfg;
const PLATFORM = sandbox.__pp;

assert.ok(typeof callProduction === 'function', 'callModelWithFallback not found in dist bundle');

// ============================================================================
// TEST CASES - Real CodeMentor requests
// ============================================================================

const TEST_CASES = [
  {
    name: "LLM Gateway Router",
    request: `Application for AI LLM Gateway Router Project. Need someone with LiteLLM, Portkey experience. Mechanical engineering listed but strange for this role.`
  },
  {
    name: "n8n WhatsApp Quote System",
    request: `Need n8n automation for WhatsApp quote system. 600+ daily quotes, PHP POS API, GoHighLevel approval flow.`
  },
  {
    name: "Leaseweb Team Application",
    request: `Looking to join Leaseweb's elite team. Interviewed before, inspired by Richard's impact.`
  },
  {
    name: "Solution Engineer AI/Cloud",
    request: `Solution engineers needed for AI and public cloud infrastructure roles.`
  },
  {
    name: "Terraform AWS Migration",
    request: `Need help migrating legacy infra to Terraform on AWS. Current state is messy CloudFormation.`
  },
  {
    name: "Kubernetes Scaling Issues",
    request: `EKS cluster scaling problems during traffic spikes. HPA not working properly.`
  }
];

// ============================================================================
// SCORING
// ============================================================================

// Phrases that read as machine-written rather than human-written.
const AIISH = [
  'leverage', 'utilize', "in today's fast-paced", 'delve', "it's important to note",
  'furthermore', 'moreover', 'in conclusion', 'game-changer', 'seamless', 'robust solution',
  'tailor-made', 'cutting-edge', 'best practices', 'world-class', 'synergy', 'holistic',
  'thrilled', 'passionate about', 'i would be delighted', 'make sure to', 'feel free to',
  'i believe that', 'it is important'
];

// Telling the applicant what to write instead of writing it. The production
// prompt asks for the message itself, not coaching.
const META_ADVICE = /\b(apply|highlight|make sure|ensure that|consider|use the following|the applicant|your answer|you should (write|mention|highlight)|ask for|write a)\b/i;

// The production prompt says to name no employers, brands, or metrics.
const INVENTED_FACT = /\b\d+%|\b\d+ms\b|\b\d+ years\b|\bFugoku\b|\bMindsDB\b|\bSwell\b|\bHelicone\b|\bSkyPilot\b|\bStripe\b|\bGates Foundation\b/i;

function countSentences(str) {
  return str.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function evaluateResponse(testCase, response) {
  const lower = response.toLowerCase();
  const problems = [];

  const lengthScore = response.length <= 299 ? 100 : Math.max(0, 100 - (response.length - 299) * 2);
  if (response.length > 299) problems.push(`over limit (${response.length})`);

  const aiHits = AIISH.filter(p => lower.includes(p));
  if (aiHits.length) problems.push(`ai-ish: ${aiHits.join(', ')}`);

  if (META_ADVICE.test(response)) problems.push('gives advice instead of the message');
  if (INVENTED_FACT.test(response)) problems.push('invents a brand, metric, or timeline');
  if (/as an ai|as a language model/i.test(response)) problems.push('mentions being an AI');
  if (/^```|^\*\*|^#{1,6}\s|^[-*]\s/m.test(response)) problems.push('contains markdown');

  // A reply that stops mid-sentence is the failure mode the fallback chain
  // exists to avoid, so an unterminated reply is a hard failure.
  const terminated = /[.!?]\s*$/.test(response.trim());
  if (!terminated) problems.push('does not end on a complete sentence');

  const sentences = countSentences(response);
  if (sentences < 1) problems.push('no sentences');
  if (sentences > 5) problems.push(`too many sentences (${sentences})`);

  if (response.trim().length < 60) problems.push('too short to be useful');

  // Stacked tool names read as keyword stuffing.
  const techStacks = (response.match(/\b(Terraform|Kubernetes|EKS|HPA|n8n|LiteLLM|Portkey|AWS|CloudFormation|GoHighLevel|POS API|Redis|Docker|GraphQL|REST|Kafka)\b/g) || []).length;
  if (techStacks > 6) problems.push(`stacks ${techStacks} technology names`);

  const score = Math.max(0, 100 - problems.length * 15);

  return {
    charCount: response.length,
    sentenceCount: sentences,
    problems,
    scores: { overall: score }
  };
}

// ============================================================================
// RUN BENCHMARK
// ============================================================================

async function runBenchmark() {
  console.log("=".repeat(70));
  console.log("AI AUTO ANSWER - QUALITY BENCHMARK");
  console.log("=".repeat(70));
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Primary: ${MODEL_CONFIG.primary.model}`);
  console.log(`Fallbacks: ${[MODEL_CONFIG.fallback.model, MODEL_CONFIG.lastResort.model].join(', ')}`);
  console.log("=".repeat(70));

  const results = [];

  for (const testCase of TEST_CASES) {
    const started = Date.now();
    try {
      console.log(`  → ${testCase.name}...`);
      const response = await callProduction(testCase.request, [], PLATFORM.CODEMENTOR);
      const elapsed = Date.now() - started;
      const evalResult = evaluateResponse(testCase, response);

      const result = {
        testCase: testCase.name,
        request: testCase.request,
        response,
        elapsedMs: elapsed,
        ...evalResult
      };
      results.push(result);

      const status = evalResult.problems.length === 0 ? "✅" : evalResult.scores.overall >= 70 ? "⚠️" : "❌";
      console.log(`    ${status} ${evalResult.scores.overall}/100 | ${evalResult.charCount} chars | ${evalResult.sentenceCount} sent | ${elapsed}ms`);
      if (evalResult.problems.length) {
        console.log(`      problems: ${evalResult.problems.join('; ')}`);
      }
      console.log(`      "${response}"`);
    } catch (error) {
      console.log(`    ❌ Error: ${error.message}`);
      results.push({ testCase: testCase.name, request: testCase.request, error: error.message });
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // ======================================================================
  // SUMMARY
  // ======================================================================

  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));

  const scored = results.filter(r => r.scores);
  const errors = results.filter(r => r.error);
  const avg = scored.length ? scored.reduce((a, r) => a + r.scores.overall, 0) / scored.length : 0;
  const clean = scored.filter(r => r.problems.length === 0).length;
  const times = results.filter(r => r.elapsedMs).map(r => r.elapsedMs);

  console.log(`avg score: ${avg.toFixed(1)} | clean: ${clean}/${scored.length} | errors: ${errors.length}`);
  if (times.length) {
    const sorted = [...times].sort((a, b) => a - b);
    console.log(`latency: p50 ${sorted[Math.floor(sorted.length / 2)]}ms, max ${sorted[sorted.length - 1]}ms, over 30s: ${times.filter(t => t > 30000).length}`);
  }

  const charCounts = scored.map(r => r.charCount);
  if (charCounts.length) {
    const avgChars = charCounts.reduce((a, b) => a + b, 0) / charCounts.length;
    console.log(`char count: avg ${avgChars.toFixed(0)}, over 299: ${charCounts.filter(c => c > 299).length}/${charCounts.length}`);
  }

  fs.writeFileSync(ROOT + 'benchmark_results.json', JSON.stringify(results, null, 2));
  console.log("\n📄 Detailed results saved to benchmark_results.json");

  return results;
}

runBenchmark().catch(console.error);
