/**
 * AI Auto Answer - Background Service Worker
 * Manifest V3 Chrome Extension
 */

// ============================================================================
// MODEL CONFIGURATION - Keys injected at build time from .env.local
// ============================================================================

const MODEL_CONFIG = {
  primary: {
    name: "kilo-nemotron-3-ultra",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    apiKey: "__KILO_API_KEY__",
    enabled: true,
    supportsReasoning: true,
    timeoutMs: 30000
  },
  fallback: {
    name: "groq-llama-3.3-70b",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    apiKey: "__GROQ_API_KEY__",
    enabled: true,
    supportsReasoning: false,
    timeoutMs: 30000
  }
};

const EMBEDDING_CONFIG = {
  apiKey: "__GEMINI_API_KEY__",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent",
  enabled: true
};

// ============================================================================
// CONSTANTS
// ============================================================================

const PLATFORM = {
  CODEMENTOR: 'codementor',
  UPWORK: 'upwork'
};

const STORAGE_KEYS = {
  RESPONSES: 'responses'
};

const MAX_RESPONSES = 50;
const DEBUG = false;

// ============================================================================
// LOGGING
// ============================================================================

const log = (...args) => DEBUG && console.log('[AI Auto Answer]', ...args);
const logError = (...args) => console.error('[AI Auto Answer]', ...args);

// ============================================================================
// PLATFORM VOICE PROFILES
// ============================================================================

const VOICE_PROFILES = {
  [PLATFORM.CODEMENTOR]: {
    formality: 'casual-direct',
    directness: 'high',
    warmth: 'medium-high',
    humor: 'dry-witty',
    avgSentences: 2,
    maxParagraphs: 1,
    useLists: false,
    contractions: true,
    technicalSpecificity: 'high',
    opinionationStrength: 'strong',
    hedgingFrequency: 'very-low',
    maxLength: 320,
    bannedPhrases: [
      "i'd be happy to help",
      'great question',
      'let\'s break this down',
      'here\'s what i\'d do',
      'as an experienced',
      'with my expertise',
      'i would recommend',
      'it depends',
      'generally speaking',
      'typically',
      'in most cases',
      'feel free to reach out',
      'happy to discuss further',
      'looking forward to',
      'i have over',
      'years of experience',
      'passionate about',
      'dedicated professional'
    ],
    signaturePhrases: [
      "i'm a wildcard",
      "i'm fast",
      "let's work together",
      'hop on a call',
      'cheers',
      "i've been there",
      'i can bring value',
      'partner and teammate',
      'ready to start',
      'available immediately'
    ],
    opinions: {
      cloud: 'aws for most, gcp if data-heavy, avoid azure unless forced',
      iac: 'terraform > pulumi > cloudformation. modules non-negotiable',
      k8s: 'don\'t run your own control plane. eks/gke/aks or nothing',
      ci: 'github actions for simplicity, gitlab if you need the platform',
      databases: 'postgres for almost everything. redis for cache. specialist dbs only when proven needed',
      architecture: 'start monolith. extract services when pain is real, not imagined',
      llm_routers: 'litellm, portkey, agentic foundation - know the tradeoffs',
      n8n: 'early adopter. whatsapp/telegram integrations. mcp via agents now',
      apis: 'rest + swagger/openapi. jwt auth. docker + k8s deployment',
      hiring: 'don\'t list mechanical engineering for AI gateway roles'
    }
  },
  [PLATFORM.UPWORK]: {
    formality: 'professional-friendly',
    directness: 'medium-high',
    warmth: 'medium',
    humor: 'minimal',
    avgSentences: 4,
    maxParagraphs: 3,
    useLists: true,
    contractions: 'selective',
    technicalSpecificity: 'high',
    opinionationStrength: 'strong',
    hedgingFrequency: 'low',
    maxLength: 2200,
    bannedPhrases: [
      "i'd be happy to help",
      'great question',
      'let\'s break this down',
      'here\'s what i\'d do',
      'as an experienced',
      'with my expertise',
      'i would recommend',
      'it depends',
      'generally speaking',
      'typically',
      'in most cases',
      'feel free to reach out',
      'happy to discuss further',
      'looking forward to',
      'i have over',
      'years of experience',
      'passionate about',
      'dedicated professional',
      'to whom it may concern',
      'dear sir/madam',
      'i am writing to express'
    ],
    signaturePhrases: [
      'relevant experience',
      'specific tools',
      'recent project',
      'clear next step',
      'let\'s connect',
      'available for a call',
      'happy to discuss'
    ],
    opinions: {
      cloud: 'aws for most, gcp if data-heavy, avoid azure unless forced',
      iac: 'terraform > pulumi > cloudformation. modules non-negotiable',
      k8s: 'don\'t run your own control plane. eks/gke/aks or nothing',
      ci: 'github actions for simplicity, gitlab if you need the platform',
      databases: 'postgres for almost everything. redis for cache. specialist dbs only when proven needed',
      architecture: 'start monolith. extract services when pain is real, not imagined',
      llm_routers: 'litellm, portkey, agentic foundation - know the tradeoffs',
      n8n: 'early adopter. whatsapp/telegram integrations. mcp via agents now',
      apis: 'rest + swagger/openapi. jwt auth. docker + k8s deployment'
    }
  }
};

// ============================================================================
// SYSTEM PROMPT BUILDERS
// ============================================================================

const PROMPT_BUILDERS = {
  [PLATFORM.CODEMENTOR]: buildCodeMentorPrompt,
  [PLATFORM.UPWORK]: buildUpworkPrompt
};

function buildSystemPrompt(platform = PLATFORM.CODEMENTOR) {
  const profile = VOICE_PROFILES[platform];
  const builder = PROMPT_BUILDERS[platform];
  if (!profile || !builder) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return builder(profile);
}

function buildCodeMentorPrompt(vp) {
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
6. HARD LIMIT: Maximum 320 characters total. Count every character. Trim aggressively.

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

function buildUpworkPrompt(vp) {
  return `You are writing a proposal cover letter on Upwork for a freelance tech role.

VOICE & TONE:
- ${vp.formality}, ${vp.directness} directness, ${vp.warmth} warmth
- ${vp.humor} humor
- Contractions: ${vp.contractions}
- Technical specificity: ${vp.technicalSpecificity}
- Opinionated: ${vp.opinionationStrength}
- Minimal hedging: ${vp.hedgingFrequency}
- ~${vp.avgSentences} sentences per paragraph, max ${vp.maxParagraphs} paragraphs
- Lists: ${vp.useLists ? 'use for key points' : 'avoid'}
- End with a clear next step

NEVER USE AI-ISH PHRASES:
${vp.bannedPhrases.map(p => `- "${p}"`).join('\n')}

YOUR SIGNATURE QUALITIES:
${vp.signaturePhrases.map(p => `- ${p}`).join('\n')}

YOUR TECHNICAL POSITIONS:
${Object.entries(vp.opinions).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

PROPOSAL STRUCTURE:
1. Open with a connection to the specific project
2. Show you read their requirements (reference 2-3 specific details)
3. State why you are a fit (relevant tools, recent similar work, specific outcomes)
4. Propose one concrete next step (call, short task, etc.)
5. Keep it under ~2200 characters total

--- FEW-SHOT EXAMPLES ---
Example 1:
User: "Validate AI API integration architecture for Bizware AI sales coaching platform. Need API Development, AI Model Integration, AI-Generated Code. Expert level, $30-$70/hr, less than 30 hrs/week, less than a month."
You: "Hi, this project aligns well with my recent work building AI API integrations across cloud-native stacks. I've shipped similar architecture-validation sprints using LiteLLM/Portkey routing, OpenAI/Anthropic API orchestration, and Pydantic contract testing — exactly the skills you listed under API Development and AI Model Integration. I also bring strong opinions on clean architecture: start with a thin integration layer, validate contracts before full MVP build-out, and instrument observability from day one. My last engagement reduced integration latency by 40% by catching schema mismatches early. I'm comfortable with the $30-$70/hr range and can start within 48 hours. Happy to hop on a 20-minute call this week to map your core workflow and an initial integration test.";

Example 2:
User: "Looking for Full Stack Development with API Development and AI Model Integration. Expert level. Hourly $30-$70. Less than 30 hrs/week."
You: "I see you need both full-stack delivery and AI integration depth — that is exactly the combination I work in daily. Recent relevant experience: built an AI gateway router handling LiteLLM, Portkey, and self-hosted models with OpenAPI contract tests, plus a Next.js admin surface for prompt orchestration. My stance on architecture: validate the integration contract before building the full stack, keep routing logic out of the app layer, and use environment-specific config from day one. I also have a background in mechanical engineering which helps when diagnosing system-level bottlenecks across hardware/software boundaries. For this role I would propose a 1-week paid discovery: schema audit, 2 proof-of-concept endpoints, and a shared runbook. Available immediately — when works for a quick call?";
`;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

const storage = {
  get(key, defaultValue) {
    return new Promise((resolve) => {
      chrome.storage.local.get({ [key]: defaultValue }, resolve);
    });
  },
  set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
};

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    getOptionsFromOpenAI: handleGenerateRequest,
    refineProposal: handleRefineRequest,
    saveResponse: handleSaveResponse,
    getSavedResponses: handleGetSavedResponses,
    clearResponses: handleClearResponses
  };

  const handler = handlers[message.action];
  if (handler) {
    handler(message, sendResponse);
    return true;
  }

  console.warn('[AI Auto Answer] Unhandled message action:', message.action);
  sendResponse({ success: false, error: `Unknown action: ${message.action}` });
});

function handleGenerateRequest(message, sendResponse) {
  const { txt, platform } = message;
  const activePlatform = platform || PLATFORM.CODEMENTOR;

  if (typeof txt !== 'string' || txt.trim().length === 0) {
    sendResponse({ success: false, error: 'Invalid request text' });
    return false;
  }

  getFewShotExamples(txt, activePlatform)
    .then((fewShotMessages) => callModelWithFallback(txt, fewShotMessages, activePlatform))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => {
      console.error('[AI Auto Answer] Model call failed:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
}

function handleRefineRequest(message, sendResponse) {
  const { originalRequest, currentProposal, refinementPrompt, conversationHistory, platform } = message;
  const activePlatform = platform || PLATFORM.CODEMENTOR;

  if (!originalRequest || !currentProposal || !refinementPrompt) {
    sendResponse({ success: false, error: 'Invalid refinement request' });
    return false;
  }

  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const userMessages = [
    { role: 'user', content: originalRequest },
    { role: 'assistant', content: currentProposal },
    ...history,
    { role: 'user', content: `Refine the proposal above: ${refinementPrompt}` }
  ];

  getFewShotExamples(originalRequest, activePlatform)
    .then((fewShotMessages) => callModelWithFallback(originalRequest, fewShotMessages, activePlatform, userMessages))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => {
      console.error('[AI Auto Answer] Refinement failed:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
}

function handleSaveResponse(message, sendResponse) {
  const { request, response, platform } = message;

  if (typeof request !== 'string' || typeof response !== 'string') {
    sendResponse({ success: false, error: 'Invalid request or response' });
    return false;
  }

  const newEntry = {
    request,
    response,
    ts: Date.now(),
    tags: extractTags(request),
    platform: platform || PLATFORM.CODEMENTOR
  };

  chrome.storage.local.get({ [STORAGE_KEYS.RESPONSES]: [] }, (data) => {
    if (chrome.runtime.lastError) {
      console.error('[AI Auto Answer] Storage read failed:', chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    const responses = data[STORAGE_KEYS.RESPONSES] || [];
    responses.unshift(newEntry);
    if (responses.length > MAX_RESPONSES) responses.pop();
    chrome.storage.local.set({ [STORAGE_KEYS.RESPONSES]: responses }, () => {
      if (chrome.runtime.lastError) {
        console.error('[AI Auto Answer] Storage write failed:', chrome.runtime.lastError.message);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ success: true });
    });
  });
}

function handleGetSavedResponses(_message, sendResponse) {
  chrome.storage.local.get({ [STORAGE_KEYS.RESPONSES]: [] }, (data) => {
    if (chrome.runtime.lastError) {
      console.error('[AI Auto Answer] Storage read failed:', chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ success: true, data: data[STORAGE_KEYS.RESPONSES] || [] });
  });
}

function handleClearResponses(_message, sendResponse) {
  chrome.storage.local.set({ [STORAGE_KEYS.RESPONSES]: [] }, () => {
    if (chrome.runtime.lastError) {
      console.error('[AI Auto Answer] Storage write failed:', chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ success: true });
  });
}

// ============================================================================
// MODEL CALLS
// ============================================================================

function getActiveModels() {
  return [MODEL_CONFIG.primary, MODEL_CONFIG.fallback].filter((m) => m.enabled && m.apiKey && m.apiKey.length > 20);
}

async function callModelWithFallback(txt, fewShotMessages, platform, userMessages = null) {
  const models = getActiveModels();
  if (models.length === 0) {
    throw new Error('No models configured with valid API keys');
  }

  let lastError;
  for (const model of models) {
    try {
      log(`Trying model: ${model.name}`);
      const result = await callModelWithRetry(model, txt, fewShotMessages, platform, userMessages);
      log(`Success with ${model.name}`);
      return result;
    } catch (error) {
      console.error(`[AI Auto Answer] Model ${model.name} failed:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('All models failed');
}

async function callModelWithRetry(model, txt, fewShotMessages, platform, userMessages = null, attempt = 1) {
  const maxRetries = 3;
  const baseDelay = 1000;

  try {
    return await callModel(model, txt, fewShotMessages, platform, userMessages);
  } catch (error) {
    const retryable = isRetryableError(error);
    if (!retryable || attempt >= maxRetries) {
      throw error;
    }
    const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
    log(`Retry ${attempt}/${maxRetries} in ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return callModelWithRetry(model, txt, fewShotMessages, platform, userMessages, attempt + 1);
  }
}

async function callModel(model, txt, fewShotMessages, platform, userMessages = null) {
  const activePlatform = platform || PLATFORM.CODEMENTOR;
  const maxTokens = activePlatform === PLATFORM.UPWORK ? 600 : 80;

  const body = JSON.stringify({
    model: model.model,
    messages: [
      { role: 'system', content: buildSystemPrompt(activePlatform) },
      ...fewShotMessages,
      ...(userMessages || [{ role: 'user', content: txt }])
    ],
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: maxTokens,
    stop: null,
    ...(model.supportsReasoning && { reasoning: { enabled: false } })
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), model.timeoutMs);

  try {
    const response = await fetch(model.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${model.apiKey}`
      },
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`${model.name} API error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.content;

    if (!content) {
      throw new Error(`Empty response from ${model.name}`);
    }

    log(`Response from ${model.name}:`, content);
    return enforceVoiceRules(content, platform);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${model.name} request timeout (${model.timeoutMs}ms)`);
    }
    throw error;
  }
}

function isRetryableError(error) {
  const statusMatch = error.message.match(/\b(429|500|502|503|504)\b/);
  return statusMatch || error.message.includes('timeout');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// VOICE RULES
// ============================================================================

function getBannedRegexes(platform) {
  const profile = VOICE_PROFILES[platform] || VOICE_PROFILES[PLATFORM.CODEMENTOR];
  return profile.bannedPhrases.map((phrase) =>
    new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  );
}

function enforceVoiceRules(content, platform = PLATFORM.CODEMENTOR) {
  const profile = VOICE_PROFILES[platform] || VOICE_PROFILES[PLATFORM.CODEMENTOR];
  let cleaned = content;

  for (const regex of getBannedRegexes(platform)) {
    cleaned = cleaned.replace(regex, '');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (platform === PLATFORM.UPWORK) {
    cleaned = appendUpworkCta(cleaned, profile);
    cleaned = truncateToLimit(cleaned, profile.maxLength);
  } else {
    cleaned = appendCodeMentorCta(cleaned, profile);
    cleaned = truncateCodeMentor(cleaned, profile.maxLength);
  }

  return cleaned;
}

function appendUpworkCta(text) {
  if (text && !text.match(/[?]|let's connect|happy to discuss|call|schedule|next step$/i) && !text.endsWith('?')) {
    return text + ' Happy to discuss further or hop on a quick call.';
  }
  return text;
}

function appendCodeMentorCta(text) {
  if (text && !text.match(/[?]|call|hop|connect|chat|talk|reach out$/i) && !text.endsWith('?')) {
    return text + ' - want to hop on a quick call?';
  }
  return text;
}

function truncateToLimit(text, limit) {
  if (text.length <= limit) return text;
  const truncated = text.substring(0, limit);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  return lastSentenceEnd > limit * 0.5 ? truncated.substring(0, lastSentenceEnd + 1) : truncated.replace(/\s+\S*$/, '');
}

function truncateCodeMentor(text, limit) {
  if (text.length <= limit) return text;
  const ctaMatch = text.match(/(call|hop|connect|chat|talk|reach out|\?)[^.!?]*$/i);
  const cta = ctaMatch ? ctaMatch[0] : '';
  const maxBody = limit - cta.length;
  let body = text.substring(0, maxBody);
  const lastSentenceEnd = Math.max(
    body.lastIndexOf('.'),
    body.lastIndexOf('!'),
    body.lastIndexOf('?')
  );
  body = lastSentenceEnd > maxBody * 0.5 ? body.substring(0, lastSentenceEnd + 1) : body.replace(/\s+\S*$/, '');
  return body + cta;
}

// ============================================================================
// TAG EXTRACTION
// ============================================================================

function extractTags(text) {
  const keywords = [
    'aws', 'gcp', 'azure', 'cloud',
    'terraform', 'pulumi', 'cloudformation',
    'kubernetes', 'k8s', 'docker', 'container',
    'ci/cd', 'github actions', 'gitlab', 'jenkins',
    'python', 'javascript', 'typescript', 'go', 'rust', 'java',
    'react', 'vue', 'nextjs', 'node',
    'postgres', 'mysql', 'mongodb', 'redis', 'database',
    'microservices', 'architecture', 'system design',
    'debugging', 'performance', 'scaling',
    'career', 'mentoring', 'interview'
  ];
  const lower = text.toLowerCase();
  return keywords.filter((k) => {
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('\\b' + escaped + '\\b', 'i').test(lower);
  });
}

// ============================================================================
// FEW-SHOT RETRIEVAL
// ============================================================================

async function getFewShotExamples(currentRequest, platform = PLATFORM.CODEMENTOR) {
  const raw = await storage.get(STORAGE_KEYS.RESPONSES, []);
  const responses = Array.isArray(raw) ? raw : [];
  const platformExamples = responses.filter((e) => !e.platform || e.platform === platform);

  if (platformExamples.length === 0) {
    return [];
  }

  const scored = platformExamples.map((entry) => ({
    ...entry,
    score: jaccardSimilarity(currentRequest, entry.request)
  }));

  return scored
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .flatMap((ex) => [
      { role: 'user', content: ex.request },
      { role: 'assistant', content: ex.response }
    ]);
}

function jaccardSimilarity(textA, textB) {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  return intersection.size / union.size;
}

function tokenize(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
    'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'can', 'this', 'that',
    'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us',
    'them', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when',
    'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some',
    'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'now', 'then', 'here', 'there', 'when'
  ]);

  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return new Set(words.filter((w) => w.length > 2 && !stopWords.has(w)));
}
