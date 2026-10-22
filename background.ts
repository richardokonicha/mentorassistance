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

type ClientResponseDetectedMessage = {
  action: 'clientResponseDetected';
  conversationUrl: string;
  messageKey: string;
  preview: string;
};

// Ordered fallback chain. The first model that returns usable content wins.
//
// poolside/laguna-s-2.1:free is the primary: it is the only free model that
// reliably returns complete sentences on the short CodeMentor replies, and it
// does not burn the token budget on reasoning output.
//
// nvidia/nemotron-3-ultra-550b-a55b:free is the second choice. It is fast
// (p50 ~4.7s) but frequently truncates mid-sentence, so it is a fallback
// rather than the primary.
//
// kilo-auto/free is the last resort. The router picks a free model itself, so
// its output quality drifts over time, and it is the slowest of the three.
//
// The previous primary, nvidia/nemotron-3-super-120b-a12b:free, now 404s
// upstream ("Function not found for account"), which is why generation failed
// outright before this chain existed.
const MODEL_CONFIG = {
  primary: {
    name: "kilo-poolside-laguna-s-2.1",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "poolside/laguna-s-2.1:free",
    apiKey: "__KILO_API_KEY__",
    enabled: true,
    timeoutMs: 10000
  },
  fallback: {
    name: "kilo-nemotron-3-ultra",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    apiKey: "__KILO_API_KEY__",
    enabled: true,
    timeoutMs: 10000
  },
  lastResort: {
    name: "kilo-auto-free",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "kilo-auto/free",
    apiKey: "__KILO_API_KEY__",
    enabled: true,
    timeoutMs: 8000
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
  RESPONSES: 'responses',
  CODEMENTOR_ALERT_HISTORY: 'codementorAlertHistory'
};

const MAX_RESPONSES = 50;
const MAX_ALERT_HISTORY = 100;
const ALERT_HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DEBUG = false;

const notificationUrls = new Map<string, string>();

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
    maxLength: 299,
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
      cloud: 'choose the cloud based on the workload and constraints',
      iac: 'choose the infrastructure tool that fits the team and system',
      k8s: 'use managed or self-managed Kubernetes based on operational needs',
      ci: 'choose CI tooling based on the existing workflow and team',
      databases: 'choose the database based on data shape, scale, and operational needs',
      architecture: 'start with the simplest architecture that can support the real requirements',
      llm_routers: 'choose routing and observability tools based on the workload and tradeoffs',
      n8n: 'use automation tools where they simplify the actual workflow',
      apis: 'prefer clear, observable interfaces that fit the system',
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

function buildGroundingRules(platform: Platform) {
  const profile = VOICE_PROFILES[platform];
  return `
GROUNDING RULES:
- Respond to what was actually asked, first and directly.
- Write like a person answering a message, not like a profile or a capability statement.
- No buzzwords. Do not name employers, clients, or products. Do not quote metrics or percentages.
- Do not stack technology names together. Mention a tool only when the reply would be wrong or much weaker without it.
- One main idea, at most one concrete technical detail, written as a normal sentence.
- No lists, no labels, no headings, no bold. Prose only.
- If something is missing, leave it out rather than guessing.
- Return only the message the user can send, with no analysis or preamble.
- Stay within ${profile.maxLength} characters.`;
}

const RESUME_CONTEXT = `Your relevant experience:
- Lead Systems Architect at Fugoku Cloud: sovereign AI cloud on bare-metal OpenStack, GPU/TPU fabric, LLM gateway with LiteLLM/Helicone, SkyPilot orchestration, reduced inference latency from 300ms+ to <50ms, cut tenant costs 65%.
- Senior Infrastructure Engineer at Inference Cloud: enterprise AI platform, multi-tenant isolation, high-concurrency request pipelines, stakeholder liaison.
- Senior Engineer at Swell: high-scale enterprise SaaS, Kubernetes, Stripe payment architecture, checkout pipeline resilience, Redis, Vue.js/TypeScript.
- Independent Consultant: enterprise advisory on sovereign cloud, GPU/TPU orchestration, AI adoption/agentic systems, Turbo Quant quantization, client sales calls.
- AI Integrations Expert at MindsDB: LLM integrations via SQL, model serving frameworks, MCP support for agents, automated fine-tuning pipelines.
- Technical Lead at eHealth4Everyone: led 6-engineer team, government health data systems across 12 Nigerian states, Gates Foundation platform.
- Focus on the requested outcome and explain the concrete approach that will complete the work properly.`;

// Capability-level grounding for short replies. Named employers, product brands,
// and hard metrics are deliberately absent: naming them reads as keyword
// stuffing on a 299-character reply. This keeps the model honest about what
// it can speak to without handing it a list of buzzwords to parrot back.
const CAPABILITY_CONTEXT = `What you can speak credibly to:
- Cloud and platform architecture: sovereign and private cloud, GPU compute, LLM serving and routing, orchestration
- Infrastructure as code and Kubernetes, at production scale
- Backend engineering in Go and Python
- High-concurrency request pipelines, caching, and checkout reliability
- Enterprise and public sector systems, and leading small engineering teams
- LLM integrations, model serving, and agent tooling
- Advising clients on cloud strategy and AI adoption

Treat this as background knowledge, not a script. The client cannot see it. Refer to it only when it naturally sharpens your answer, and describe what you did rather than who you did it for.`;

function buildCodeMentorPrompt(vp) {
  return `You are a senior cloud/platform engineer who answers messages from clients on CodeMentor.

${buildGroundingRules(PLATFORM.CODEMENTOR as Platform)}

VOICE:
- ${vp.formality}, ${vp.directness} directness, ${vp.warmth} warmth, ${vp.humor} humor
- Contractions: ${vp.contractions ? 'yes' : 'no'}
- Opinionated but not arrogant. Hardly ever hedge.
- One paragraph, 2 to 3 sentences, ${vp.maxLength} characters maximum.
- Say what you would actually do first, so the client knows the work is straightforward.
- Close with a short invitation to talk only if it fits naturally. Never force a call to action.

${CAPABILITY_CONTEXT}

Answer the request on its own terms. Lead with the answer, not with yourself. Keep any mention of your experience to one plain sentence, and only when it genuinely helps.

HOW TO WRITE:
1. Read the request and work out what they actually need.
2. Reply to that, in one or two sentences, like you'd reply to a colleague.
3. Add at most one concrete detail that shows you know what you're doing.
4. Reassure them briefly that this is doable, without overselling.
5. Drop anything that sounds like a pitch, a tagline, or a bullet point.
6. Read it back. If any sentence would sound odd coming from a real person, cut it.
7. HARD LIMIT: ${vp.maxLength} characters total. Count every character.
`;
}

function buildUpworkPrompt(vp) {
  return `You are writing a proposal cover letter on Upwork for a freelance tech role.
${buildGroundingRules(PLATFORM.UPWORK as Platform)}

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

Use the resume as a source of examples, not a checklist. Mention only experience that naturally supports the request. The resume is incomplete, so do not treat an unlisted technology as a lack of ability. Never claim a specific tool or result unless it is in the request or resume.

COPYEDITOR RULES - FOLLOW THESE EXACTLY:
- ONE IDEA PER PARAGRAPH. Start a new paragraph whenever the focus shifts.
- PARAGRAPH LENGTH: 2 to 4 sentences only. Never write dense walls of text.
- VERTICAL SPACING: Insert exactly one full blank line between paragraphs.
- SENTENCE STRUCTURE: Use short, varied sentences. Avoid long, winding sentences with too many commas.
- NO MARKDOWN CRUTCHES: No bullets, numbered lists, or excessive bolding. Use clean paragraphs and white space only.

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
1. Open with a natural connection to the specific project
2. Show you read their requirements using only the most relevant detail
3. State why you are a fit without stacking keywords or unsupported claims
4. Propose one concrete next step only if the request invites a conversation
5. Keep it under ~2200 characters total
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
    case 'clientResponseDetected':
      handleClientResponseDetected(message as ClientResponseDetectedMessage, sender, sendResponse);
      return true;
    default:
      console.warn('[AI Auto Answer] Unhandled message action:', message.action);
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      return true;
  }
});

function isValidCodeMentorUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.codementor.io';
  } catch {
    return false;
  }
}

function trimAlertPreview(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

function getAlertHistory(): Promise<Array<{ key: string; url: string; seenAt: number }>> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEYS.CODEMENTOR_ALERT_HISTORY]: [] }, (data) => {
      if (chrome.runtime.lastError) {
        logError('Alert history read failed:', chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      const history = data[STORAGE_KEYS.CODEMENTOR_ALERT_HISTORY];
      resolve(Array.isArray(history) ? history : []);
    });
  });
}

async function rememberAlertKey(messageKey: string, conversationUrl: string): Promise<boolean> {
  const now = Date.now();
  const history = (await getAlertHistory())
    .filter((entry) => entry && typeof entry.key === 'string' && now - entry.seenAt < ALERT_HISTORY_RETENTION_MS);
  if (history.some((entry) => entry.key === messageKey)) return false;

  history.unshift({ key: messageKey, url: conversationUrl, seenAt: now });
  const bounded = history.slice(0, MAX_ALERT_HISTORY);
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEYS.CODEMENTOR_ALERT_HISTORY]: bounded }, () => {
      if (chrome.runtime.lastError) logError('Alert history write failed:', chrome.runtime.lastError.message);
      resolve();
    });
  });
  return true;
}

function handleClientResponseDetected(message: ClientResponseDetectedMessage, sender, sendResponse) {
  const { conversationUrl, messageKey, preview } = message;
  if (!isValidCodeMentorUrl(conversationUrl) || typeof messageKey !== 'string' || !messageKey.trim() || typeof preview !== 'string' || !preview.trim()) {
    sendResponse({ success: false, error: 'Invalid CodeMentor response alert' });
    return;
  }

  rememberAlertKey(messageKey, conversationUrl)
    .then((isNew) => {
      if (!isNew) {
        sendResponse({ success: true, notified: false });
        return;
      }

      const notificationOptions = {
        type: 'basic' as const,
        iconUrl: 'icons/icon-128.png',
        title: 'New CodeMentor client response',
        message: trimAlertPreview(preview),
        priority: 2
      };

      chrome.notifications.create(notificationOptions, (notificationId) => {
        if (chrome.runtime.lastError || !notificationId) {
          sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Notification creation failed' });
          return;
        }
        notificationUrls.set(notificationId, conversationUrl);
        sendResponse({ success: true, notified: true });
      });
    })
    .catch((error) => sendResponse({ success: false, error: error instanceof Error ? error.message : String(error) }));
}

function openCodeMentorUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ url: 'https://www.codementor.io/*' }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const matchingTab = tabs.find((tab) => tab.url?.startsWith(url.split('#')[0]));
      if (matchingTab?.id !== undefined) {
        chrome.tabs.update(matchingTab.id, { active: true }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
        return;
      }
      chrome.tabs.create({ url }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  });
}

chrome.notifications.onClicked.addListener((notificationId) => {
  const url = notificationUrls.get(notificationId);
  if (!url) return;
  openCodeMentorUrl(url).catch((error) => logError('Could not open CodeMentor response:', error));
  notificationUrls.delete(notificationId);
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClosed.addListener((notificationId) => notificationUrls.delete(notificationId));

function handleGenerateRequest(message: GetOptionsFromOpenAIMessage, sendResponse) {
  const { txt, platform } = message;
  // Generation path does not read saved examples.
  const activePlatform = (platform || PLATFORM.CODEMENTOR) as Platform;

  if (typeof txt !== 'string' || txt.trim().length === 0) {
    sendResponse({ success: false, error: 'Invalid request text' });
    return false;
  }

  callModelWithFallback(txt, [], activePlatform)
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

  callModelWithFallback(originalRequest, [], activePlatform, userMessages)
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
  return [MODEL_CONFIG.primary, MODEL_CONFIG.fallback, MODEL_CONFIG.lastResort]
    .filter((m) => m && m.enabled && m.apiKey && m.apiKey.length > 20);
}

// The content script gives up after 30s, so the whole fallback chain has to
// finish inside that window. Every model in the chain shares one deadline:
// once it is spent, no further model is attempted.
const REQUEST_DEADLINE_MS = 28000;

async function callModelWithFallback(txt: string, fewShotMessages: ChatMessage[] | null, platform: Platform, userMessages: ChatMessage[] | null = null): Promise<string> {
  const models = getActiveModels();
  if (models.length === 0) {
    throw new Error('No models configured with valid API keys');
  }

  const deadline = Date.now() + REQUEST_DEADLINE_MS;
  let lastError: unknown;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.error('[AI Auto Answer] Deadline exhausted before trying', model.name);
      break;
    }
    try {
      log(`Trying model: ${model.name} (${remaining}ms left)`);
      const result = await callModelWithRetry(model, txt, fewShotMessages, platform, userMessages as ChatMessage[] | undefined, 1, remaining);
      log(`Success with ${model.name}`);
      return result;
    } catch (error) {
      console.error(`[AI Auto Answer] Model ${model.name} failed:`, error instanceof Error ? error.message : String(error));
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All models failed');
}

async function callModelWithRetry(model: ModelConfig, txt: string, fewShotMessages: ChatMessage[] | null, platform: Platform, userMessages: ChatMessage[] | null = null, attempt = 1, budgetMs = REQUEST_DEADLINE_MS): Promise<string> {
  // Kilo's upstream providers return 503 "Service temporarily overloaded" on a
  // meaningful fraction of requests, so retry a few times with backoff.
  // attempt starts at 1, so maxRetries is the total number of tries.
  const maxRetries = 3;
  const baseDelay = 1000;

  try {
    return await callModel(model, txt, fewShotMessages, platform, userMessages, budgetMs);
  } catch (error) {
    const retryable = isRetryableError(error);
    if (!retryable || attempt >= maxRetries) {
      throw error;
    }
    const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
    // Only retry when there is still enough budget left to be worth it.
    if (delay + 2000 >= budgetMs) {
      throw error;
    }
    log(`Retry ${attempt}/${maxRetries} in ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return callModelWithRetry(model, txt, fewShotMessages, platform, userMessages, attempt + 1, budgetMs - delay);
  }
}

async function callModel(model, txt, fewShotMessages, platform, userMessages = null, budgetMs = REQUEST_DEADLINE_MS) {
  const activePlatform = (platform || PLATFORM.CODEMENTOR) as Platform;
  // The token budget has to cover reasoning output as well as the reply.
  // Reasoning models bill the reasoning tokens against max_tokens, so a tight
  // budget ends with finish_reason "length" and an empty content field.
  const maxTokens = activePlatform === PLATFORM.UPWORK ? 4096 : 2048;

  // `stop: null` is rejected by some providers and `reasoning: { enabled: false }`
  // is ignored by others, so neither is sent. A provider that does not honour
  // reasoning suppression simply spends the larger budget on reasoning.
  const body = JSON.stringify({
    model: model.model,
    messages: [
      { role: 'system', content: buildSystemPrompt(activePlatform) },
      ...(userMessages || [{ role: 'user', content: txt }])
    ],
    temperature: 0.45,
    top_p: 0.85,
    max_tokens: maxTokens
  });

  // The per-attempt timeout is the smaller of the model's own limit and what
  // is left of the shared request budget.
  const attemptTimeout = Math.max(1000, Math.min(model.timeoutMs, budgetMs));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), attemptTimeout);

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

    // Kilo Gateway returns HTTP 200 with an error body when the upstream
    // provider is overloaded or rate-limited. Surface the real status code so
    // isRetryableError can act on it instead of reporting a bogus empty response.
    if (data.error && !data.choices?.[0]) {
      const errCode = data.error.code || 'unknown';
      const errMessage = data.error.message || 'unknown gateway error';
      throw new Error(`${model.name} API error ${errCode}: ${errMessage}`);
    }

    const content = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data.content;

    if (!content) {
      throw new Error(`${model.name} empty response (HTTP ${response.status})`);
    }

    log(`Response from ${model.name}:`, content);
    return enforceVoiceRules(content, platform);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${model.name} request timeout (${attemptTimeout}ms)`);
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

function enforceVoiceRules(content, platform = PLATFORM.CODEMENTOR) {
  const profile = VOICE_PROFILES[platform] || VOICE_PROFILES[PLATFORM.CODEMENTOR];
  let cleaned = content;

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
  if (safeText && !safeText.match(/[?]|let's connect|call|schedule|next step$/i) && !safeText.endsWith('?')) {
    return safeText + ' Open to a quick conversation?';
  }
  return safeText;
}

function appendCodeMentorCta(text) {
  const safeText = typeof text === 'string' ? text : '';
  if (!safeText) return safeText;
  if (/\b(call|hop|connect|chat|talk|reach out)\b/i.test(safeText)) return safeText;
  if (safeText.endsWith('?')) return safeText;
  // Terminate the existing sentence first. Appending straight onto an unclosed
  // reply produced run-ons like "...if usage Want to talk through it?", which
  // then broke sentence detection downstream.
  const terminated = /[.!?]$/.test(safeText.trim())
    ? safeText.trim()
    : safeText.trim() + '.';
  return terminated + ' Want to talk through it?';
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

  // Preserve a genuine closing sentence (the CTA) rather than the trailing
  // question mark alone. Matching on the punctuation character first made the
  // regex return just "?", which left replies ending in a mid-word fragment
  // like "...if usage Want?".
  // Anchor to the last genuine sentence boundary. A naive split on [.!?]
  // treats decimal points and abbreviations as sentence ends, so require the
  // boundary to be followed by whitespace or end-of-string.
  const sentences = safeText.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
  const lastSentence = (sentences[sentences.length - 1] || '').trim();
  // Only a genuinely short trailing sentence can be a CTA. Without the length
  // bound, an input with no sentence break makes the "last sentence" the whole
  // text, which would be preserved intact and defeat truncation entirely. The
  // bound has to allow a short closing line appended to a full reply, so it
  // scales with the limit rather than being a small constant.
  const ctaMax = Math.min(140, Math.floor(limit * 0.4));
  const hasCta = lastSentence.length <= ctaMax && /\b(call|hop|connect|chat|talk|reach out)\b/i.test(lastSentence);
  const cta = hasCta ? lastSentence : '';
  // Reserve the joining space too, otherwise the result lands at limit + 1.
  const maxBody = Math.max(0, limit - cta.length - (cta ? 1 : 0));

  let body = safeText.substring(0, maxBody);
  const lastSentenceEnd = Math.max(
    body.lastIndexOf('.'),
    body.lastIndexOf('!'),
    body.lastIndexOf('?')
  );
  body = lastSentenceEnd >= 0 && lastSentenceEnd > maxBody * 0.5
    ? body.substring(0, lastSentenceEnd + 1)
    : body.replace(/\s+\S*$/, '');
  // Never leave a dangling word or trailing punctuation behind.
  body = body.replace(/[\s,;:]+$/, '');

  return (body + (cta ? ' ' + cta : '')).trim();
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
    .slice(0, 2)
    .flatMap((ex) => [
      { role: 'user' as const, content: `Style reference only. Do not copy facts: ${ex.request}` },
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
