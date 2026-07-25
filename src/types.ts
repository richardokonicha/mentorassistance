export type Platform = 'codementor' | 'upwork';

export interface VoiceProfile {
  formality: string;
  directness: string;
  warmth: string;
  humor: string;
  avgSentences: number;
  maxParagraphs: number;
  useLists: boolean;
  contractions: boolean | string;
  technicalSpecificity: string;
  opinionationStrength: string;
  hedgingFrequency: string;
  maxLength: number;
  bannedPhrases: string[];
  signaturePhrases: string[];
  opinions: Record<string, string>;
}

export interface ModelConfig {
  name: string;
  endpoint: string;
  model: string;
  apiKey: string;
  enabled: boolean;
  supportsReasoning: boolean;
  timeoutMs: number;
}

export interface EmbeddingConfig {
  apiKey: string;
  endpoint: string;
  enabled: boolean;
}

export interface StorageEntry {
  request: string;
  response: string;
  ts: number;
  tags: string[];
  platform: Platform;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  action: 'getOptionsFromOpenAI';
  txt: string;
  platform?: Platform;
}

export interface RefineRequest {
  action: 'refineProposal';
  originalRequest: string;
  currentProposal: string;
  refinementPrompt: string;
  conversationHistory: ChatMessage[];
  platform?: Platform;
}

export interface SaveResponseMessage {
  action: 'saveResponse';
  request: string;
  response: string;
  platform?: Platform;
}

export interface OptionsResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface RefineResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export type CardHistory = ChatMessage[];

export interface ProposalCard extends HTMLElement {
  _proposalVersion: number;
  _activeProposalIndex: number;
}

export const RESUME_CONTEXT = `Your relevant experience:
- Lead Systems Architect at Fugoku Cloud: sovereign AI cloud on bare-metal OpenStack, GPU/TPU fabric, LLM gateway with LiteLLM/Helicone, SkyPilot orchestration, reduced inference latency from 300ms+ to <50ms, cut tenant costs 65%.
- Senior Infrastructure Engineer at Inference Cloud: enterprise AI platform, multi-tenant isolation, high-concurrency request pipelines, stakeholder liaison.
- Senior Engineer at Swell: high-scale enterprise SaaS, Kubernetes, Stripe payment architecture, checkout pipeline resilience, Redis, Vue.js/TypeScript.
- Independent Consultant: enterprise advisory on sovereign cloud, GPU/TPU orchestration, AI adoption/agentic systems, Turbo Quant quantization, client sales calls.
- AI Integrations Expert at MindsDB: LLM integrations via SQL, model serving frameworks, MCP support for agents, automated fine-tuning pipelines.
- Technical Lead at eHealth4Everyone: led 6-engineer team, government health data systems across 12 Nigerian states, Gates Foundation platform.
- Mentored 100+ developers/engineering managers on Codementor on distributed systems and cloud architecture.` as const;

declare global {
  interface Window {
    statusTimeout?: ReturnType<typeof setTimeout>;
  }
}
