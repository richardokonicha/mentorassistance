const color = "#3aa757";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ color });
  console.log("Default background color set to %cgreen", `color: ${color}`);
});

// Model configuration - Nemotron 3 Ultra (free) via Kilo primary, Groq fallback
const MODEL_CONFIG = {
  primary: {
    name: "kilo-nemotron-3-ultra",
    endpoint: "https://api.kilo.ai/api/gateway/chat/completions",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free",
    apiKey: "REDACTED_KILO_KEY",
    enabled: true
  },
  fallback: {
    name: "groq-llama-3.3-70b",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    apiKey: "REDACTED_GROQ_KEY",
    enabled: true
  }
};

// Gemini embedding config (for future semantic similarity)
const EMBEDDING_CONFIG = {
  apiKey: "REDACTED_GEMINI_KEY",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent",
  enabled: true
};

// Voice Profile - based on your actual CodeMentor responses
const VOICE_PROFILE = {
  // Tone & Voice
  formality: "casual-direct", // casual, conversational, not corporate
  directness: "high", // gets to the point fast
  warmth: "medium-high", // personable, uses names, shows genuine interest
  humor: "dry-witty", // self-deprecating, cheeky, "wildcard"
  
  // Structural Patterns
  avgSentences: 3,
  maxParagraphs: 2,
  useLists: false, // never uses bullet points in responses
  questionFrequency: "high", // ends with call-to-action question
  
  // Language Markers
  contractions: true, // heavy: i'd, you're, let's, i've, don't, can't
  technicalSpecificity: "high", // names tools, versions, architectures
  opinionationStrength: "strong", // takes clear positions
  hedgingFrequency: "very-low", // no "it depends", "generally speaking"
  
  // Anti-patterns (things you NEVER do)
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
  
  // Signature patterns (things you ACTUALLY say)
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
  
  // Technical opinions (from your actual responses)
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
    hiring: "don't list mechanical engineering for AI gateway roles"
  }
};

// Build system prompt from voice profile
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
${Object.entries(vp.opinions).map(([k,v]) => `- ${k}: ${v}`).join('\n')}

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

// Load Kilo API key from storage on startup
let kiloApiKey = "";
chrome.storage.sync.get({ kiloApiKey: "" }, (data) => {
  kiloApiKey = data.kiloApiKey || "";
});

// Main message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getOptionsFromOpenAI") {
    const { txt } = message;

    // Get few-shot examples from storage
    getFewShotExamples(txt).then((fewShotMessages) => {
      // Try primary model (Kilo) first, fallback to Groq
      callModelWithFallback(txt, fewShotMessages)
        .then((result) => {
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
    });
    return true;
  }

  if (message.action === "saveResponse") {
    const { request, response } = message;
    
    // Extract tags from request
    const tags = extractTags(request);
    
    const newEntry = {
      request: request,
      response: response,
      ts: Date.now(),
      tags: tags
    };
    
    chrome.storage.sync.get({ responses: [] }, (data) => {
      const responses = data.responses;
      responses.unshift(newEntry);
      // Keep only last 50
      if (responses.length > 50) responses.pop();
      chrome.storage.sync.set({ responses }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "saveKiloApiKey") {
    const { apiKey } = message;
    kiloApiKey = apiKey;
    chrome.storage.sync.set({ kiloApiKey }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Multi-model API call with fallback
async function callModelWithFallback(txt, fewShotMessages) {
  const models = [
    { ...MODEL_CONFIG.primary, apiKey: kiloApiKey },
    MODEL_CONFIG.fallback
  ].filter(m => m.enabled && m.apiKey);

  let lastError;
  
  for (const model of models) {
    try {
      console.log(`Trying model: ${model.name}`);
      const result = await callModel(model, txt, fewShotMessages);
      console.log(`Success with ${model.name}`);
      return result;
    } catch (error) {
      console.warn(`Model ${model.name} failed:`, error.message);
      lastError = error;
      continue;
    }
  }
  
  throw lastError || new Error("All models failed");
}

// Single model API call
async function callModel(model, txt, fewShotMessages) {
  const body = JSON.stringify({
    model: model.model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      ...fewShotMessages,
      {
        role: "user",
        content: txt,
      },
    ],
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 300,
    stop: null,
    // Disable reasoning for Nemotron models to get direct responses
    ...(model.name === "kilo-nemotron-3-ultra" && { reasoning: { enabled: false } }),
  });

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${model.apiKey}`,
  };

  const response = await fetch(model.endpoint, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${model.name} API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  // Handle different response formats
  let content;
  if (data.choices && data.choices[0]) {
    // OpenAI-compatible format (Groq, Kilo)
    content = data.choices[0].message?.content || data.choices[0].text;
  } else if (data.content) {
    // Alternative format
    content = data.content;
  } else {
    throw new Error(`Unexpected response format from ${model.name}`);
  }

  if (!content) {
    throw new Error(`Empty response from ${model.name}`);
  }

  console.log(`Response from ${model.name}:`, content);
  return enforceVoiceRules(content);
}

// Post-process response to enforce voice rules
function enforceVoiceRules(content) {
  let cleaned = content;
  
  // Strip banned phrases (case-insensitive)
  for (const phrase of VOICE_PROFILE.bannedPhrases) {
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Clean up double spaces, leading/trailing spaces after removals
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Ensure ends with question or call-to-action
  if (cleaned && !cleaned.match(/[?]|call|hop|connect|chat|talk|reach out$/i)) {
    // Add a light hook if missing
    if (!cleaned.endsWith('?')) {
      cleaned += ' - want to hop on a quick call?';
    }
  }
  
  return cleaned;
}

// Extract tags from request text
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
  return keywords.filter(k => lower.includes(k.toLowerCase()));
}

// Get few-shot examples from stored responses
async function getFewShotExamples(currentRequest) {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ responses: [] }, (data) => {
      const responses = data.responses || [];
      if (responses.length === 0) {
        resolve([]);
        return;
      }

      // Score each response by similarity to current request
      const scored = responses.map((entry) => ({
        ...entry,
        score: jaccardSimilarity(currentRequest, entry.request)
      }));

      // Sort by score (descending), take top 3
      const topExamples = scored
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      // Format as few-shot messages: user/assistant pairs
      const messages = [];
      for (const ex of topExamples) {
        messages.push({ role: "user", content: ex.request });
        messages.push({ role: "assistant", content: ex.response });
      }

      resolve(messages);
    });
  });
}

// Jaccard similarity between two texts
function jaccardSimilarity(textA, textB) {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  const union = new Set([...tokensA, ...tokensB]);
  
  return intersection.size / union.size;
}

// Tokenize text into meaningful words
function tokenize(text) {
  const lower = text.toLowerCase();
  // Extract alphanumeric tokens, filter stop words
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
  
  const words = lower.match(/[a-z0-9]+/g) || [];
  return new Set(words.filter(w => w.length > 2 && !stopWords.has(w)));
}