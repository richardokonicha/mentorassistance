# Prompt and Provider Migration Design

## Goal

Improve proposal authenticity and latency by using Experiential Labs GPT-5.6 Luna directly and grounding generated content in the request and verified profile context.

## Architecture

The background service worker will use the OpenAI-compatible Experiential Labs endpoint as its primary model. The provider will be configured through `EXPERIENTIAL_API_KEY`, injected only into the generated extension bundle at build time. Existing Kilo and Groq routing will be removed rather than used as implicit fallbacks.

Prompt construction will keep platform-specific tone and limits, but remove forced signature phrases, forced opinions, fabricated names, and static examples containing claims that may not apply to the current request. The model will be instructed to use only request facts and the supplied resume context, and to omit unsupported details.

## Quality safeguards

- CodeMentor output is capped at 320 characters and Upwork output at 2200 characters.
- Generated text must not invent names, tools, employers, timelines, metrics, or conversations.
- Saved examples remain optional style references and are labeled as such, not factual context.
- Post-processing runs banned-phrase cleanup after CTA insertion and preserves platform formatting.
- Tests verify provider configuration, prompt grounding requirements, payload construction, and output limits.

## Error handling

Requests fail clearly when the Experiential Labs key is absent or the API returns an error. Retry behavior remains limited to transient failures, with no silent provider switch.

## Testing

Run the focused prompt contract tests, TypeScript typecheck, build, and the existing benchmark when an API key is available.
