# AI Auto Answer - CodeMentor Chrome Extension

A Chrome extension that generates personalized mentor responses for CodeMentor using AI. The responses sound like your actual voice — casual, direct, opinionated, with specific technical opinions and signature phrases.

## Features

- **Voice Personalization**: Built from 4 real CodeMentor responses - captures your exact tone, technical opinions, and signature phrases
- **Multi-Model Architecture**: Primary: Nemotron 3 Ultra (free) via Kilo Gateway with reasoning disabled; Fallback: Llama 3.3 70B via Groq
- **Few-Shot Learning**: Dynamically retrieves your most similar past responses using Jaccard similarity
- **Response Capture**: "💾 Save Response" button captures request + your actual response for future few-shot examples
- **Post-Processing**: Strips 22 banned AI phrases, enforces call-to-action endings

## Voice Profile

Based on your actual CodeMentor responses:

- **Tone**: Casual-direct, high directness, medium-high warmth, dry-witty humor
- **Structure**: ~3 sentences, max 2 paragraphs, no bullet lists
- **Language**: Heavy contractions, high technical specificity, strong opinions, very low hedging
- **Signature phrases**: "I'm a wildcard", "hop on a call", "cheers", "partner and teammate", "ready to start"
- **Technical opinions**: 10 domains (cloud, IaC, k8s, CI, databases, architecture, LLM routers, n8n, APIs, hiring)
- **Banned phrases**: 22 AI-isms stripped automatically ("I'd be happy to help", "great question", "it depends", etc.)

## Model Configuration

| Model | Provider | Model ID | Reasoning | Status |
|-------|----------|----------|-----------|--------|
| Nemotron 3 Ultra (free) | Kilo Gateway | `nvidia/nemotron-3-ultra-550b-a55b:free` | Disabled (`reasoning: {enabled: false}`) | Primary |
| Llama 3.3 70B Versatile | Groq | `llama-3.3-70b-versatile` | N/A | Fallback |

Both API keys are hardcoded in `background.js`.

## Installation

1. Open Chrome → `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select this folder
4. Navigate to `https://www.codementor.io/m/dashboard/open-requests/*`
5. Click extension icon to verify API keys (both pre-configured)
6. On a request page, AI response buttons appear above the submit button
7. Click a button to insert response, edit if needed, then click "💾 Save Response" to build your few-shot library

## Files

- `manifest.json` - Manifest V3, targets CodeMentor open requests
- `background.js` - Service worker with multi-model API, voice profile, few-shot retrieval, post-processing
- `content.js` - Injects response buttons and save button into request pages
- `popup.html` / `popup.js` - API key management UI (keys already hardcoded)
- `button.css` - Button styling

## Usage Flow

1. Open a CodeMentor request
2. Extension injects 3 AI-generated response buttons + "💾 Save Response"
3. Click a button → inserts response into textarea
4. Edit/personalize as needed
5. Click "💾 Save Response" → stores (request, your_response) pair in `chrome.storage.sync`
6. Future requests use saved responses as few-shot examples (top 3 by Jaccard similarity)

## Storage

- `kiloApiKey`, `groqApiKey` - API keys (synced)
- `responses[]` - Array of {request, response, ts, tags} (max 50, synced)

## Future Enhancements

- Semantic similarity via Gemini embeddings (key configured)
- Voice profile editor in popup
- Export/import few-shot library
- Response quality ratings

---

*Built for CodeMentor mentors who want AI responses that actually sound like them.*
