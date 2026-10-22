# OpenRouter Gemma Provider Migration Design

## Goal

Move the extension's LLM provider from MindsHub (`gpt-luna-5-6`) to OpenRouter's free tier model `google/gemma-4-26b-a4b-it:free`, and confirm the extension can generate responses through it.

## Scope

Config-only change across five files. Prompt construction, voice rules, retry logic, the model fallback loop, and the CodeMentor/Upwork behavior are all unchanged.

Out of scope for this pass: removing stale `MINDSHUB_API_KEY` entries from `.env.local` / `.env.example`, and refreshing the README provider section. Those are cleanup once the new provider is confirmed working in a real browser session.

## Architecture

The background service worker already speaks the OpenAI chat-completions shape, and OpenRouter serves that same shape at `https://openrouter.ai/api/v1/chat/completions`. The migration is therefore a change of endpoint URL, model identifier, API key, and manifest permissions. No new transport, no new parsing, no new error handling.

`MODEL_CONFIG.primary` becomes:

| Field | New value |
| --- | --- |
| `name` | `openrouter-gemma-4-26b-a4b-it-free` |
| `endpoint` | `https://openrouter.ai/api/v1/chat/completions` |
| `model` | `google/gemma-4-26b-a4b-it:free` |
| `apiKey` | `__OPENROUTER_API_KEY__` |
| `enabled` | `true` |
| `supportsReasoning` | `false` |
| `timeoutMs` | `20000` |

The service worker keeps the single-model fallback array and the single-retry policy it has today.

## Reasoning flag

`callModel` spreads `reasoning: { enabled: false }` into the request body only when `supportsReasoning` is true. That field is a Kilo Gateway convention, not an OpenRouter parameter. Setting `supportsReasoning: false` removes the field from the payload entirely.

The flag is only ever used to disable reasoning, so dropping it loses no behavior. Gemma 4 A4B IT does support reasoning on OpenRouter, but it is off by default on this endpoint and the extension does not ask for it.

## Build-time key injection

`build.ts` gains one replacement alongside the existing ones:

```
.replace(/__OPENROUTER_API_KEY__/g, env.OPENROUTER_API_KEY || '')
```

The key lives only in `.env.local`, which is gitignored. The literal `__OPENROUTER_API_KEY__` placeholder in source is the only reference that reaches version control. The real key is written to `.env.local` and never committed, never echoed into a source file, and never included in any spec or document.

## Manifest permissions

Two references change from `https://api.mindshub.ai/` to `https://openrouter.ai/`:

- `host_permissions` array
- `content_security_policy.extension_pages.connect-src`

Without both, the MV3 service worker's `fetch` is blocked by the browser regardless of how correct the code is. The Gemini embedding host is left in place; embeddings are a separate provider and are not part of this change.

## Error handling

No changes. The existing behavior is already correct for this provider:

- Non-OK responses throw with status and response body, which surfaces OpenRouter's JSON error payload verbatim.
- `isRetryableError` governs whether the single retry fires.
- The 12-second effective timeout from `Math.min(model.timeoutMs, 12000)` is unchanged.

The one provider-specific condition worth documenting: `google/gemma-4-26b-a4b-it:free` draws on a shared upstream free pool at Google AI Studio. When that pool is exhausted, OpenRouter returns HTTP 429 with `"limit_source": "upstream_provider_shared_pool"`. This is an upstream condition, not a key or configuration fault, and it is intermittent. The key's own quota is a separate counter: 50 free-model requests per day, tracked independently.

## Testing

`test_prompt_contract.js` currently asserts six provider-specific facts. They are repointed from MindsHub to OpenRouter:

- `background.ts` references `OPENROUTER_API_KEY`
- `background.ts` references the `openrouter.ai/v1/chat/completions` endpoint
- `background.ts` references `gemma-4-26b-a4b-it:free`
- `background.ts` does not reference `api.mindshub.ai`
- `build.ts` references `OPENROUTER_API_KEY`
- `manifest.json` references `openrouter.ai` and does not reference `api.mindshub.ai`

A new assertion pins `supportsReasoning: false`, so a future provider change cannot silently re-introduce the Kilo-specific `reasoning` field into an OpenRouter payload.

`test_benchmark.js` has its own `MODELS` array reading `MINDSHUB_API_KEY` from the environment. It is repointed to the same endpoint, model, and `OPENROUTER_API_KEY` environment variable so the benchmark exercises the provider the extension actually ships.

All prompt-grounding assertions, length caps, and banned-phrase assertions are left untouched.

## Verification

1. `npm run typecheck` — TypeScript compiles clean.
2. `npm test` — prompt contract, CodeMentor alert, and benchmark suites pass.
3. `npm run build` — `tsc` emits to `dist/`, then `build.ts` injects the key.
4. Confirm `dist/background.js` contains the real key and no unsubstituted `__OPENROUTER_API_KEY__` placeholder.
5. Confirm `dist/background.js` contains no `reasoning` field in the request body.
6. Live API call to `google/gemma-4-26b-a4b-it:free` with the project's real system prompt and token caps, retried with backoff, to confirm the endpoint returns a usable completion.

Step 6 is subject to the shared-pool 429 described above. Verification retries with backoff rather than treating a transient 429 as a configuration failure.

## Security note

The API key was shared in plaintext in the session that requested this work and should be treated as exposed. It is stored in gitignored `.env.local` only. Rotation is recommended.
