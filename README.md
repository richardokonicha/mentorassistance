# AI Auto Answer

Chrome extension that generates personalized responses for CodeMentor and Upwork using AI with your voice profile. Works on CodeMentor mentorship requests (320 char limit) and Upwork proposal cover letters (~2200 chars).

## Platforms

| Platform | URL Pattern | Char Limit | Voice |
|----------|-------------|------------|-------|
| CodeMentor | `codementor.io/m/dashboard/open-requests/*` | 320 | Casual, direct, opinionated |
| Upwork | `upwork.com/nx/proposals/job/*/apply/` | ~2200 | Professional, persuasive |

## Features

- **AI proposal generation** — generates a first draft automatically when you open a request/proposal page
- **Loading indicator** — green pulse animation on the input field while generating
- **Smart positioning** — card appears near the input field, not off-screen
- **Refine chat** — iterative refinement with conversation history and version tracking
- **Suggestion pills** — quick refinement presets ("make it shorter", "emphasize Kubernetes", etc.)
- **Save responses** — store good responses as few-shot examples for future generation
- **Resume context** — draws from your professional background when relevant
- **Voice enforcement** — strips AI-ish phrases, enforces tone, respects character limits
- **SPA support** — detects navigation on Upwork's React SPA and re-initializes
- **Fallback model** — Groq Llama 3.3 70B as backup if Kilo Nemotron fails

## Build

```bash
npm install          # install dependencies
npm run build        # compile TypeScript + inject API keys
npm run typecheck    # check types without emitting
npm test             # run quality benchmark
```

The build compiles `.ts` sources to `dist/`, injects API keys from `.env.local`, and strips module noise. Load the extension folder (not `dist/`) as an unpacked extension in Chrome.

## Project Structure

```
├── content.ts          # Content script (DOM injection, UI, selectors)
├── background.ts       # Service worker (AI calls, voice rules, storage)
├── popup.ts            # Popup UI script
├── build.ts            # Build script (compile + key injection + cleanup)
├── manifest.json       # Chrome extension manifest (v3)
├── popup.html          # Popup HTML
├── tsconfig.json       # TypeScript configuration
├── package.json        # npm scripts and dependencies
├── src/types.ts        # Shared TypeScript types
├── docs/voice-profile.md # Voice profile documentation
├── resume.txt          # Resume context for generation
├── test_benchmark.js   # Quality benchmark tests
└── dist/               # Build output (gitignored)
```

## Architecture

**Two models with fallback:**
1. **Primary:** Kilo Nemotron 3 Ultra (free tier, supports reasoning)
2. **Fallback:** Groq Llama 3.3 70B (fast, reliable)

**Voice profiles per platform:**
- Each platform has its own `VOICE_PROFILES` entry with formality, directness, banned phrases, signature phrases, and technical opinions
- `buildSystemPrompt(platform)` generates platform-specific system prompts
- `enforceVoiceRules(content, platform)` post-processes output to strip banned phrases and enforce character limits

## Configuration

API keys are hardcoded in `background.ts` under `MODEL_CONFIG`. To change them, edit the file and rebuild.

Voice profiles are in `background.ts` under `VOICE_PROFILES`. Adjust tone, banned phrases, signature phrases, and technical opinions there.
