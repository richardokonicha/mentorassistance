#!/usr/bin/env node
/**
 * AI Auto Answer - Benchmark & Quality Evaluation
 * Tests model outputs against voice profile and constraints
 */

const fetch = global.fetch;

// ============================================================================
// TEST CASES - Real CodeMentor requests
// ============================================================================

const TEST_CASES = [
  {
    name: "LLM Gateway Router",
    request: `Application for AI LLM Gateway Router Project. Need someone with LiteLLM, Portkey experience. Mechanical engineering listed but strange for this role.`,
    expectedVoice: ["hey", "lme", "portkey", "agentic", "call", "cheers"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  },
  {
    name: "n8n WhatsApp Quote System",
    request: `Need n8n automation for WhatsApp quote system. 600+ daily quotes, PHP POS API, GoHighLevel approval flow.`,
    expectedVoice: ["n8n", "whatsapp", "gpt-4o", "redis", "call", "cheers"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  },
  {
    name: "Leaseweb Team Application",
    request: `Looking to join Leaseweb's elite team. Interviewed before, inspired by Richard's impact.`,
    expectedVoice: ["richard", "interviewed", "team", "call", "cheers"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  },
  {
    name: "Solution Engineer AI/Cloud",
    request: `Solution engineers needed for AI and public cloud infrastructure roles.`,
    expectedVoice: ["solutions engineer", "ai", "cloud", "call", "connect"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  },
  {
    name: "Terraform AWS Migration",
    request: `Need help migrating legacy infra to Terraform on AWS. Current state is messy CloudFormation.`,
    expectedVoice: ["terraform", "aws", "cloudformation", "modules", "call"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  },
  {
    name: "Kubernetes Scaling Issues",
    request: `EKS cluster scaling problems during traffic spikes. HPA not working properly.`,
    expectedVoice: ["eks", "hpa", "scaling", "control plane", "call"],
    bannedPhrases: ["happy to help", "great question", "let me break", "i would recommend"]
  }
];

// ============================================================================
// VOICE PROFILE (from background.js)
// ============================================================================

const VOICE_PROFILE = {
  bannedPhrases: [
    "i'd be happy to help",
    "great question",
    "let me break this down",
    "here's what i'd do",
    "as an experienced",
    "with my expertise",
    "i would recommend",
    "it depends",
    "generally speaking",
    "typically",
    "in most cases",
    "feel free to reach out",
    "happy to discuss further",
    "looking forward to",
    "i have over",
    "years of experience",
    "passionate about",
    "dedicated professional"
  ],
  signaturePhrases: [
    "i'm a wildcard",
    "i'm fast",
    "let's work together",
    "hop on a call",
    "cheers",
    "i've been there",
    "i can bring value",
    "partner and teammate",
    "ready to start",
    "available immediately"
  ],
  opinions: {
    cloud: "aws for most, gcp if data-heavy, avoid azure unless forced",
    iac: "terraform > pulumi > cloudformation. modules non-negotiable",
    k8s: "don't run your own control plane. eks/gke/aks or nothing",
    ci: "github actions for simplicity, gitlab if you need the platform",
    databases: "postgres for almost everything. redis for cache. specialist dbs only when proven needed",
    architecture: "start monolith. extract services when pain is real, not imagined",
    llm_routers: "litellm, portkey, agentic foundation - know the tradeoffs",
    n8n: "early adopter. whatsapp/telegram integrations. mcp via agents now",
    apis: "rest + swagger/openapi. jwt auth. docker + k8s deployment",
    hiring: "don't list mechanical engineering for ai gateway roles"
  }
};

// ============================================================================
// EVALUATION FUNCTIONS
// ============================================================================

function countChars(str) {
  return str.length;
}

function countWords(str) {
  return str.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function countSentences(str) {
  return str.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function hasCallToAction(str) {
  return /[?]|call|hop|connect|chat|talk|reach out$/i.test(str.trim());
}

function checkBannedPhrases(str) {
  const lower = str.toLowerCase();
  return VOICE_PROFILE.bannedPhrases.filter(phrase => lower.includes(phrase.toLowerCase()));
}

function checkSignaturePhrases(str) {
  const lower = str.toLowerCase();
  return VOICE_PROFILE.signaturePhrases.filter(phrase => lower.includes(phrase.toLowerCase()));
}

function checkOpinions(str) {
  const lower = str.toLowerCase();
  const found = [];
  for (const [topic, opinion] of Object.entries(VOICE_PROFILE.opinions)) {
    if (lower.includes(topic.toLowerCase()) || opinion.toLowerCase().split(' ').some(w => w.length > 3 && lower.includes(w))) {
      found.push(topic);
    }
  }
  return found;
}

function evaluateResponse(testCase, response) {
  const charCount = countChars(response);
  const wordCount = countWords(response);
  const sentenceCount = countSentences(response);
  const hasCTA = hasCallToAction(response);
  const bannedFound = checkBannedPhrases(response);
  const signaturesFound = checkSignaturePhrases(response);
  const opinionsFound = checkOpinions(response);
  
  // Expected voice keywords present
  const expectedFound = testCase.expectedVoice.filter(v => 
    response.toLowerCase().includes(v.toLowerCase())
  );
  
  // Score components (0-100 each)
  const lengthScore = charCount <= 300 ? 100 : Math.max(0, 100 - (charCount - 300) * 2);
  const ctaScore = hasCTA ? 100 : 0;
  const bannedScore = bannedFound.length === 0 ? 100 : Math.max(0, 100 - bannedFound.length * 25);
  const signatureScore = Math.min(100, signaturesFound.length * 20);
  const opinionScore = Math.min(100, opinionsFound.length * 15);
  const expectedScore = expectedFound.length > 0 ? Math.min(100, (expectedFound.length / testCase.expectedVoice.length) * 100) : 50;
  
  const overallScore = Math.round(
    lengthScore * 0.25 +
    ctaScore * 0.20 +
    bannedScore * 0.20 +
    signatureScore * 0.15 +
    opinionScore * 0.10 +
    expectedScore * 0.10
  );
  
  return {
    charCount,
    wordCount,
    sentenceCount,
    hasCTA,
    bannedFound,
    signaturesFound,
    opinionsFound,
    expectedFound,
    scores: {
      length: lengthScore,
      cta: ctaScore,
      banned: bannedScore,
      signature: signatureScore,
      opinion: opinionScore,
      expected: expectedScore,
      overall: overallScore
    }
  };
}

// ============================================================================
// API CALL
// ============================================================================

async function callModel(modelConfig, txt, fewShotMessages = []) {
  const body = JSON.stringify({
    model: modelConfig.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...fewShotMessages,
      { role: "user", content: txt }
    ],
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 75,
    stop: null,
    ...(modelConfig.supportsReasoning && { reasoning: { enabled: false } })
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${modelConfig.apiKey}`
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), modelConfig.timeoutMs);

  try {
    const response = await fetch(modelConfig.endpoint, {
      method: "POST",
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${modelConfig.name} API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content;
    if (data.choices && data.choices[0]) {
      content = data.choices[0].message?.content || data.choices[0].text;
    } else if (data.content) {
      content = data.content;
    } else {
      throw new Error(`Unexpected response format from ${modelConfig.name}`);
    }

    if (!content) {
      throw new Error(`Empty response from ${modelConfig.name}`);
    }

    return content.trim();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${modelConfig.name} request timeout (${modelConfig.timeoutMs}ms)`);
    }
    throw error;
  }
}

function enforceVoiceRules(content) {
  let cleaned = content;
  
  for (const phrase of VOICE_PROFILE.bannedPhrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  if (cleaned && !cleaned.match(/[?]|call|hop|connect|chat|talk|reach out$/i)) {
    if (!cleaned.endsWith('?')) {
      cleaned += ' - want to hop on a quick call?';
    }
  }
  
  // HARD LIMIT: Truncate to 300 chars, preserving CTA and complete sentences
  if (cleaned.length > 300) {
    const ctaMatch = cleaned.match(/(call|hop|connect|chat|talk|reach out|\?)[^.!?]*$/i);
    const cta = ctaMatch ? ctaMatch[0] : '';
    const maxBody = 300 - cta.length;
    let body = cleaned.substring(0, maxBody);
    
    // Find last complete sentence (ending with . ! or ?)
    const lastSentenceEnd = Math.max(
      body.lastIndexOf('.'),
      body.lastIndexOf('!'),
      body.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > maxBody * 0.5) {
      // Found a reasonable sentence boundary, cut there
      body = body.substring(0, lastSentenceEnd + 1);
    } else {
      // No good sentence boundary, cut at last word
      body = body.replace(/\s+\S*$/, '');
    }
    
    cleaned = body + cta;
  }
  
  return cleaned;
}

function buildSystemPrompt() {
  const vp = VOICE_PROFILE;
  return `You are a senior cloud/platform engineer who mentors on CodeMentor.

VOICE & TONE:
- ${vp.formality}, ${vp.directness} directness, ${vp.warmth} warmth
- ${vp.humor} humor
- Use contractions: ${vp.contractions ? 'yes' : 'no'}
- Technical specificity: ${vp.technicalSpecificity}
- Opinionated: ${vp.opinionationStrength}
- Minimal hedging: ${vp.hedgingFrequency}
- ~${vp.avgSentences} sentences, max ${vp.maxParagraphs} paragraphs
- Lists: ${vp.useLists ? 'when helpful' : 'avoid'}
- End with a specific hook for a call

NEVER SAY:
${vp.bannedPhrases.map(p => `- "${p}"`).join('\n')}

YOUR SIGNATURE MOVES:
${vp.signaturePhrases.map(p => `- "${p}"`).join('\n')}

YOUR TECHNICAL OPINIONS:
${Object.entries(vp.opinions).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

RESPONSE PROCESS:
1. Identify the core problem and constraints
2. Note what you'd actually do first
3. Draft in your internal voice
4. Strip meta-commentary, keep only what you'd type
5. End with a specific hook for a call

--- FEW-SHOT EXAMPLES ---
Example 1:
User: "Application for AI LLM Gateway Router Project. Need someone with LiteLLM, Portkey experience. Mechanical engineering listed but strange for this role."
You: "hey James, your project makes total sense - LLM gateway router is the right positioning. I've worked with LiteLLM, Portkey, and the agentic foundation router. The mechanical engineering requirement is weird for this role, but coincidentally I have a BS in MechE and grad in CompE. I can jump in fast and be a real partner/teammate. Let's hop on a call - I'm ready to start. cheers"

Example 2:
User: "Need n8n automation for WhatsApp quote system. 600+ daily quotes, PHP POS API, GoHighLevel approval."
You: "hey, I've been using n8n since pre-COVID discord days - built Telegram signal forwarding, now doing complex AI workflows with MCP via agents. For 600 quotes/day: n8n WhatsApp Business API for intake, GPT-4o for parsing, GoHighLevel webhook for approval, PHP POS bearer token for inventory/pricing, GPT-4o-mini for quote generation, WhatsApp/IG templates for delivery. Redis caching for inventory lookups, parallel execution for peak days. Available immediately - when can we hop on a call?"

Example 3:
User: "Looking to join Leaseweb's elite team. Interviewed before, inspired by Richard's impact."
You: "Richard, I've interviewed at Leaseweb before and still want in. Your experience is inspiring, plus we share the name - that's a sign. I bring industry knowledge, speed, charisma, and strong customer relations. Would love to be on your team and your mentee if you're open to it. cheers and happy new month"

Example 4:
User: "Solution engineers needed for AI/public cloud infrastructure."
You: "Hi Alexander, you're in luck - I'm a solutions engineer in AI and public cloud infra. Was fullstack before AI. Have all the cutting-edge tools for this. Let's connect."`;
}

const SYSTEM_PROMPT = buildSystemPrompt();

// ============================================================================
// MODEL CONFIGS
// ============================================================================

const MODELS = [
  {
    name: "kilo-nemotron-3-ultra",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    apiKey: "__KILO_API_KEY__",
    enabled: true,
    supportsReasoning: true,
    timeoutMs: 30000
  },
  {
    name: "groq-llama-3.3-70b",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    apiKey: "__GROQ_API_KEY__",
    enabled: true,
    supportsReasoning: false,
    timeoutMs: 30000
  }
];

// ============================================================================
// RUN BENCHMARK
// ============================================================================

async function runBenchmark() {
  console.log("=".repeat(70));
  console.log("AI AUTO ANSWER - QUALITY BENCHMARK");
  console.log("=".repeat(70));
  console.log(`Test cases: ${TEST_CASES.length}`);
  console.log(`Models: ${MODELS.filter(m => m.enabled).map(m => m.name).join(", ")}`);
  console.log(`Max chars: 300`);
  console.log("=".repeat(70));
  
  const results = [];
  
  for (const model of MODELS.filter(m => m.enabled)) {
    console.log(`\n📊 Testing ${model.name}...\n`);
    
    for (const testCase of TEST_CASES) {
      try {
        console.log(`  → ${testCase.name}...`);
        
        // Call model
        const rawResponse = await callModel(model, testCase.request, []);
        const processedResponse = enforceVoiceRules(rawResponse);
        
        // Evaluate
        const evalResult = evaluateResponse(testCase, processedResponse);
        
        const result = {
          model: model.name,
          testCase: testCase.name,
          rawResponse,
          processedResponse,
          ...evalResult
        };
        
        results.push(result);
        
        // Print summary
        const status = evalResult.scores.overall >= 70 ? "✅" : evalResult.scores.overall >= 50 ? "⚠️" : "❌";
        console.log(`    ${status} Score: ${evalResult.scores.overall}/100 | ${evalResult.charCount} chars | ${evalResult.sentenceCount} sent | CTA: ${evalResult.hasCTA ? "✓" : "✗"} | Banned: ${evalResult.bannedFound.length} | Sig: ${evalResult.signaturesFound.length}`);
        
        if (evalResult.bannedFound.length > 0) {
          console.log(`      ⚠ Banned: ${evalResult.bannedFound.join(", ")}`);
        }
        if (evalResult.signaturesFound.length > 0) {
          console.log(`      ✓ Signatures: ${evalResult.signaturesFound.join(", ")}`);
        }
        
      } catch (error) {
        console.log(`    ❌ Error: ${error.message}`);
        results.push({
          model: model.name,
          testCase: testCase.name,
          error: error.message
        });
      }
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  
  const byModel = {};
  for (const r of results) {
    if (!byModel[r.model]) byModel[r.model] = [];
    if (r.scores) byModel[r.model].push(r.scores.overall);
  }
  
  for (const [model, scores] of Object.entries(byModel)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const pass = scores.filter(s => s >= 70).length;
    console.log(`${model}: avg ${avg.toFixed(1)}, pass (>=70): ${pass}/${scores.length}`);
  }
  
  // Character count distribution
  const charCounts = results.filter(r => r.charCount).map(r => r.charCount);
  if (charCounts.length > 0) {
    const avgChars = charCounts.reduce((a, b) => a + b, 0) / charCounts.length;
    const overLimit = charCounts.filter(c => c > 300).length;
    console.log(`\nChar count: avg ${avgChars.toFixed(0)}, over 300: ${overLimit}/${charCounts.length}`);
  }
  
  // Save detailed results
  const fs = require('fs');
  fs.writeFileSync('benchmark_results.json', JSON.stringify(results, null, 2));
  console.log("\n📄 Detailed results saved to benchmark_results.json");
  
  return results;
}

// Run
runBenchmark().catch(console.error);