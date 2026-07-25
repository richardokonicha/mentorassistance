import { Platform, ModelConfig, EmbeddingConfig, ChatMessage } from './src/types';
/**
 * AI Auto Answer - Background Service Worker
 * Manifest V3 Chrome Extension
 */

// ============================================================================
// MESSAGE TYPES
// ============================================================================

type GetOptionsFromOpenAIMessage = {
  action: 'getOptionsFromOpenAI';
  txt: string;
  platform?: Platform;
};

type RefineProposalMessage = {
  action: 'refineProposal';
  originalRequest: string;
  currentProposal: string;
  refinementPrompt: string;
  conversationHistory?: unknown;
  platform?: Platform;
};

type SaveResponseMessage = {
  action: 'saveResponse';
  request: string;
  response: string;
  platform?: Platform;
};

type GetSavedResponsesMessage = {
  action: 'getSavedResponses';
};

type ClearResponsesMessage = {
  action: 'clearResponses';
};

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
      'i am writing to express',
      'budget',
      'rate',
      'hourly',
      'fixed price',
      'cost',
      'price',
      'fee',
      'payment terms',
      'start within',
      'available for a call',
      'timeline',
      'duration',
      'deadline',
      'delivery date'
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

const RESUME_CONTEXT = `Your relevant experience:
- Lead Systems Architect at Fugoku Cloud: sovereign AI cloud on bare-metal OpenStack, GPU/TPU fabric, LLM gateway with LiteLLM/Helicone, SkyPilot orchestration, reduced inference latency from 300ms+ to <50ms, cut tenant costs 65%.
- Senior Infrastructure Engineer at Inference Cloud: enterprise AI platform, multi-tenant isolation, high-concurrency request pipelines, stakeholder liaison.
- Senior Engineer at Swell: high-scale enterprise SaaS, Kubernetes, Stripe payment architecture, checkout pipeline resilience, Redis, Vue.js/TypeScript.
- Independent Consultant: enterprise advisory on sovereign cloud, GPU/TPU orchestration, AI adoption/agentic systems, Turbo Quant quantization, client sales calls.
- AI Integrations Expert at MindsDB: LLM integrations via SQL, model serving frameworks, MCP support for agents, automated fine-tuning pipelines.
- Technical Lead at eHealth4Everyone: led 6-engineer team, government health data systems across 12 Nigerian states, Gates Foundation platform.
- Mentored 100+ developers/engineering managers on Codementor on distributed systems and cloud architecture.`;

function buildCodeMentorPrompt(vp) {
  return `You are a senior cloud/platform engineer who mentors on CodeMentor.

VOICE & TONE:
- ${vp.formality}, ${vp.directness} directness, ${vp.warmth} warmth
- ${vp.humor} humor
- Use contractions: ${vp.contractions ? 'yes' : 'no'}
- Technical specificity: ${vp.technicalSpecificity}
- Opinionated: ${vp.opinionationStrength}
- Minimal hedging: ${vp.hedgingFrequency}
- max ${vp.maxParagraphs} paragraphs
- End with a specific hook for a call

RESUME CONTEXT - DRAW FROM THIS WHEN RELEVANT:
- Lead Systems Architect at Fugoku Cloud: sovereign AI cloud on bare-metal OpenStack, GPU/TPU fabric, LLM gateway with LiteLLM/Helicone, SkyPilot orchestration, reduced inference latency from 300ms+ to <50ms, cut tenant costs 65%.
- Senior Infrastructure Engineer at Inference Cloud: enterprise AI platform, multi-tenant isolation, high-concurrency request pipelines, stakeholder liaison.
- Senior Engineer at Swell: high-scale enterprise SaaS, Kubernetes, Stripe payment architecture, checkout pipeline resilience, Redis, Vue.js/TypeScript.
- Independent Consultant: enterprise advisory on sovereign cloud, GPU/TPU orchestration, AI adoption/agentic systems, Turbo Quant quantization, client sales calls.
- AI Integrations Expert at MindsDB: LLM integrations via SQL, model serving frameworks, MCP support for agents, automated fine-tuning pipelines.
- Technical Lead at eHealth4Everyone: led 6-engineer team, government health data systems across 12 Nigerian states, Gates Foundation platform.
- Mentored 100+ developers/engineering managers on Codementor on distributed systems and cloud architecture.

When a question relates to AI infrastructure, cloud architecture, Kubernetes, LLM/gateway work, multi-tenant systems, or high-scale SaaS, reference specific outcomes from this background. Do NOT mention unrelated experience like mechanical engineering, GDG community work, or hackathons unless directly relevant.

NEVER USE AI-ISH PHRASES:
${vp.bannedPhrases.map(p => `- "${p}"`).join('\n')}

YOUR SIGNATURE QUALITIES (use naturally, don't force):
${vp.signaturePhrases.map(p => `- ${p}`).join('\n')}

YOUR TECHNICAL POSITIONS:
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
- End with a clear next step

RESUME CONTEXT - DRAW FROM THIS WHEN RELEVANT:
${RESUME_CONTEXT}

When a question relates to AI infrastructure, cloud architecture, Kubernetes, LLM/gateway work, multi-tenant systems, or high-scale SaaS, reference specific outcomes from this background. Do NOT mention unrelated experience like mechanical engineering, GDG community work, or hackathons unless directly relevant.

COPYEDITOR RULES - FOLLOW THESE EXACTLY:
- ONE IDEA PER PARAGRAPH. Start a new paragraph whenever the focus shifts.
- PARAGRAPH LENGTH: 2 to 4 sentences only. Never write dense walls of text.
- VERTICAL SPACING: Insert exactly one full blank line between paragraphs.
- SENTENCE STRUCTURE: Use short, varied sentences. Avoid long, winding sentences with too many commas.
- NO MARKDOWN CRUTCHES: No bullets, numbered lists, or excessive bolding. Use clean paragraphs and white space only.

NEVER USE AI-ISH PHRASES:
${vp.bannedPhrases.map(p => `- "${p}"`).join('\n')}

NEVER MENTION:
- Project duration or timeline
- Hourly rate, fixed price, or cost
- Deliverable estimates or completion dates
- "I can start within X hours/days"
- Budget or payment terms

YOUR SIGNATURE QUALITIES:
${vp.signaturePhrases.map(p => `- ${p}`).join('\n')}

YOUR TECHNICAL POSITIONS:
${Object.entries(vp.opinions).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

PROPOSAL STRUCTURE:
1. Open with a connection to the specific project
2. Show you read their requirements (reference 2-3 specific details)
3. State why you are a fit (relevant tools, recent similar work, specific outcomes)
4. Propose one concrete next step: usually a short call or intro conversation
5. Keep it under ~2200 characters total

--- FEW-SHOT EXAMPLES ---
Example 1:
User: "Validate AI API integration architecture for Bizware AI sales coaching platform. Need API Development, AI Model Integration, AI-Generated Code. Expert level, part-time engagement, short timeline."
You: "Hi, this project aligns well with my recent work building AI API integrations across cloud-native stacks.

I've shipped similar architecture-validation sprints using LiteLLM/Portkey routing, OpenAI/Anthropic API orchestration, and Pydantic contract testing. That matches your API Development, AI Model Integration, and AI-Generated Code requirements closely.

I also bring strong opinions on clean architecture. Start with a thin integration layer. Validate contracts before full MVP build-out. Instrument observability from day one. My last engagement reduced integration latency by 40% by catching schema mismatches early.

Happy to hop on a 20-minute call this week to map your core workflow and an initial integration test.";

Example 2:
User: "Looking for Full Stack Development with API Development and AI Model Integration. Expert level. Part-time engagement."
You: "I see you need both full-stack delivery and AI integration depth. That is exactly what I do daily.

Recent relevant experience: I built an AI gateway router handling LiteLLM, Portkey, and self-hosted models with OpenAPI contract tests. I also built a Next.js admin surface for prompt orchestration.

My stance on architecture is simple. Validate the integration contract before building the full stack. Keep routing logic out of the app layer. Use environment-specific config from day one.

I also have a background in mechanical engineering. It helps when diagnosing system-level bottlenecks across hardware/software boundaries.

For a fit like this, my first move is a short discovery. Schema audit, two proof-of-concept endpoints, shared runbook. When works for a quick call?"`;
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
      chrome.storage.local.set({ [key]: value }, () => resolve(undefined as void));
    });
  }
};

// ============================================================================
// MESSAGE HANDLER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getOptionsFromOpenAI':
      handleGenerateRequest(message as GetOptionsFromOpenAIMessage, sendResponse);
      return true;
    case 'refineProposal':
      handleRefineRequest(message as RefineProposalMessage, sendResponse);
      return true;
    case 'saveResponse':
      handleSaveResponse(message as SaveResponseMessage, sendResponse);
      return true;
    case 'getSavedResponses':
      handleGetSavedResponses(message as GetSavedResponsesMessage, sendResponse);
      return true;
    case 'clearResponses':
      handleClearResponses(message as ClearResponsesMessage, sendResponse);
      return true;
    default:
      console.warn('[AI Auto Answer] Unhandled message action:', message.action);
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      return true;
  }
});

function handleGenerateRequest(message: GetOptionsFromOpenAIMessage, sendResponse) {
  const { txt, platform } = message;
  const activePlatform = (platform || PLATFORM.CODEMENTOR) as Platform;

  if (typeof txt !== 'string' || txt.trim().length === 0) {
    sendResponse({ success: false, error: 'Invalid request text' });
    return false;
  }

  getFewShotExamples(txt, activePlatform)
    .then((fewShotMessages) => callModelWithFallback(txt, fewShotMessages as ChatMessage[], activePlatform))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error: unknown) => {
      console.error('[AI Auto Answer] Model call failed:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    });
  return true;
}

function handleRefineRequest(message: RefineProposalMessage, sendResponse) {
  const { originalRequest, currentProposal, refinementPrompt, conversationHistory, platform } = message;
  const activePlatform = (platform || PLATFORM.CODEMENTOR) as Platform;

  if (!originalRequest || !currentProposal || !refinementPrompt) {
    sendResponse({ success: false, error: 'Invalid refinement request' });
    return false;
  }

  const history = Array.isArray(conversationHistory) ? conversationHistory : [];
  const userMessages: ChatMessage[] = [
    { role: 'user', content: originalRequest },
    { role: 'assistant', content: currentProposal },
    ...history,
    { role: 'user', content: `Refine the proposal above: ${refinementPrompt}` }
  ] as ChatMessage[];

  getFewShotExamples(originalRequest, activePlatform)
    .then((fewShotMessages) => callModelWithFallback(originalRequest, fewShotMessages, activePlatform, userMessages))
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((error) => {
      console.error('[AI Auto Answer] Replan failed:', error);
      sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
}

function handleSaveResponse(message: SaveResponseMessage, sendResponse) {
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
      platform: (platform || PLATFORM.CODEMENTOR) as Platform
    };

  chrome.storage.local.get({ [STORAGE_KEYS.RESPONSES]: [] }, (data) => {
    if (chrome.runtime.lastError) {
      console.error('[AI Auto Answer] Storage read failed:', chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    const responses = data[STORAGE_KEYS.RESPONSES] ?? [];
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

function handleGetSavedResponses(_message: GetSavedResponsesMessage, sendResponse) {
  chrome.storage.local.get({ [STORAGE_KEYS.RESPONSES]: [] }, (data) => {
    if (chrome.runtime.lastError) {
      console.error('[AI Auto Answer] Storage read failed:', chrome.runtime.lastError.message);
      sendResponse({ success: false, error: chrome.runtime.lastError.message });
      return;
    }
    sendResponse({ success: true, data: data[STORAGE_KEYS.RESPONSES] ?? [] });
  });
}

function handleClearResponses(_message: ClearResponsesMessage, sendResponse) {
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

async function callModelWithFallback(txt: string, fewShotMessages: ChatMessage[] | null, platform: Platform, userMessages: ChatMessage[] | null = null): Promise<string> {
  const models = getActiveModels();
  if (models.length === 0) {
    throw new Error('No models configured with valid API keys');
  }

  let lastError: unknown;
  for (const model of models) {
    try {
      log(`Trying model: ${model.name}`);
      const result = await callModelWithRetry(model, txt, fewShotMessages, platform, userMessages as ChatMessage[] | undefined);
      log(`Success with ${model.name}`);
      return result;
    } catch (error) {
      console.error(`[AI Auto Answer] Model ${model.name} failed:`, error instanceof Error ? error.message : String(error));
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All models failed');
}

async function callModelWithRetry(model: ModelConfig, txt: string, fewShotMessages: ChatMessage[] | null, platform: Platform, userMessages: ChatMessage[] | null = null, attempt = 1): Promise<string> {
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
  const activePlatform = (platform || PLATFORM.CODEMENTOR) as Platform;
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
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${model.name} request timeout (${model.timeoutMs}ms)`);
    }
    throw error;
  }
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const statusMatch = message.match(/\b(429|500|502|503|504)\b/);
  return statusMatch !== null || message.includes('timeout');
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

  if (platform === PLATFORM.UPWORK) {
    cleaned = stripCostAndDuration(cleaned);
    cleaned = formatUpworkProposal(cleaned as string);
    cleaned = appendUpworkCta(cleaned);
    cleaned = truncateToLimit(cleaned, profile.maxLength);
  } else {
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = appendCodeMentorCta(cleaned);
    cleaned = truncateCodeMentor(cleaned, profile.maxLength);
  }

  return cleaned;
}

function formatUpworkProposal(text) {
  if (!text) return text;

  let formatted = text;

  formatted = formatted.replace(/[ \t]+\n/g, '\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');

  formatted = formatted.split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n');

  const paragraphs = formatted.split('\n\n');

  const refined = paragraphs.flatMap((para) => {
    const sentences = para.match(/[^.!?]+[.!?]+/g) || [para];
    if (sentences.length === 0) return [para.trim()];
    if (sentences.length <= 4) return [para.trim()];

    const groups: string[] = [];
    for (let i = 0; i < sentences.length; i += 4) {
      groups.push(sentences.slice(i, i + 4).join(' ').trim());
    }
    return groups;
  });

  const merged: string[] = [];
  for (const para of refined) {
    const last = merged[merged.length - 1];
    const sentenceCount = (para.match(/[.!?]+/g) || []).length || 1;
    if (last && sentenceCount < 2) {
      merged[merged.length - 1] = last + ' ' + para;
    } else {
      merged.push(para);
    }
  }

  formatted = merged.join('\n\n');
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  formatted = formatted.trim();

  return formatted;
}

const COST_DURATION_PATTERNS = [
  /\$\d[\d,]*\s*(\/hr|\/hour|\/day|\/week|\/month)?/gi,
  /\b\d+\s*(hours|days|weeks|months)\b/gi,
  /\b(start within|available for|budget|rate|price|cost|fee|payment)\b/gi,
  /\b(less than|under|over)\s+\d+\s*(hours|days|weeks|months|hrs)\b/gi
];

function stripCostAndDuration(text) {
  const safeText = typeof text === 'string' ? text : String(text || '');
  if (!safeText) return safeText;
  let cleaned = safeText;
  for (const pattern of COST_DURATION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  cleaned = cleaned.replace(/[ \t]+\n/g, '\n');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).join('\n');
  return cleaned.trim();
}

function appendUpworkCta(text) {
  const safeText = typeof text === 'string' ? text : '';
  if (safeText && !safeText.match(/[?]|let's connect|happy to discuss|call|schedule|next step$/i) && !safeText.endsWith('?')) {
    return safeText + ' Happy to discuss further or hop on a quick call.';
  }
  return safeText;
}

function appendCodeMentorCta(text) {
  const safeText = typeof text === 'string' ? text : '';
  if (safeText && !safeText.match(/[?]|call|hop|connect|chat|talk|reach out$/i) && !safeText.endsWith('?')) {
    return safeText + ' - want to hop on a quick call?';
  }
  return safeText;
}

function truncateToLimit(text, limit) {
  const safeText = typeof text === 'string' ? text : '';
  if (safeText.length <= limit) return safeText;
  const truncated = safeText.substring(0, limit);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  return lastSentenceEnd > limit * 0.5 ? truncated.substring(0, lastSentenceEnd + 1) : truncated.replace(/\s+\S*$/, '');
}

function truncateCodeMentor(text, limit) {
  const safeText = typeof text === 'string' ? text : '';
  if (safeText.length <= limit) return safeText;
  const ctaMatch = safeText.match(/(call|hop|connect|chat|talk|reach out|\?)[^.!?]*$/i);
  const cta = ctaMatch ? ctaMatch[0] : '';
  const maxBody = Math.max(0, limit - cta.length);
  let body = safeText.substring(0, maxBody);
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

async function getFewShotExamples(currentRequest: string, platform = PLATFORM.CODEMENTOR): Promise<ChatMessage[]> {
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
      { role: 'user' as const, content: ex.request },
      { role: 'assistant' as const, content: ex.response }
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
