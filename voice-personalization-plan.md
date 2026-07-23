# AI Response Personalization - Voice Matching Strategy


## Problem Statement
The current Chrome extension generates responses using a generic system prompt and hardcoded Groq API key. Responses sound "AI-like" - overly polite, structured, hedging, and lacking the user's specific voice, technical opinionation, and conversational style.

## Current State
* **Manifest V3** extension targeting `codementor.io/m/dashboard/open-requests/*`
* **Background.js**: Service worker with hardcoded API key, calls Groq `llama-3.3-70b-versatile`
* **Content.js**: Injects AI-generated buttons into request forms
* **Popup**: UI for API key storage (currently unused by background)
* **System Prompt**: Generic mentor persona, 100-word limit, Mike Weinberg style reference

## Proposed Solution: Multi-Phase Voice Personalization

### Phase 1: Detailed Voice Profile & Style Guide (Week 1) - HIGH IMPACT
**Objective**: Replace generic system prompt with comprehensive voice profile derived from user's actual writing.

**Deliverables**:
1. **Voice Profile Document** (`docs/voice-profile.md`)
    * Voice characteristics (tone, vocabulary, sentence structure, contractions usage)
    * Anti-patterns to avoid ("I'd be happy to help", numbered lists, over-hedging)
    * 5-10 annotated real response examples with commentary
    * Technical opinionation markers (specific tools, approaches, tradeoffs mentioned)

2. **Updated System Prompt** in `background.js`
    * Embed full voice profile as system prompt
    * Add chain-of-thought instruction: "Think in your voice, then write"
    * Include 2-3 few-shot examples directly in prompt

**Implementation**:
* Edit `background.js` lines 9-10 (SYSTEM_PROMPT constant)
* Add `VOICE_PROFILE` constant with detailed style guide
* Keep API call structure identical

**Validation**: Manual testing on 5-10 real CodeMentor requests, compare before/after

### Phase 2: Few-Shot Learning from Actual Responses (Week 2) - HIGH IMPACT
**Objective**: Dynamically retrieve user's actual sent responses as few-shot examples per request.

**Deliverables**:
1. **Storage Schema** in `chrome.storage.sync`
```json
{
  "responses": [
    {"request": "...", "response": "...", "ts": 1234567890, "tags": ["aws", "terraform"]},
    ...
  ]
}
```
2. **Response Capture Mechanism**
    * Add "Save Response" button in content.js near injected AI buttons
    * On click: capture request text + user's typed/sent response → store
    * Keyboard shortcut (Cmd/Ctrl+Enter) to quick-save

3. **Similarity Retrieval** in `background.js`
    * Keyword-based Jaccard similarity (no external deps)
    * Extract technical keywords: stack names, cloud providers, problem types
    * Retrieve top 3 most similar past responses
    * Format as few-shot: `[{role: 'user', content: pastRequest}, {role: 'assistant', content: pastResponse}, ...]`

4. **Updated API Call**
    * Prepend few-shot examples to messages array before system prompt
    * Limit total tokens (track approx. 3000 token budget)

**Files Modified**:
* `background.js`: Add `getFewShotExamples()`, `extractKeywords()`, `jaccardSimilarity()`
* `content.js`: Add save button, capture logic, keyboard listener
* `manifest.json`: No changes needed

**Validation**: A/B test - generate with vs without few-shot, blind rating

### Phase 3: Response Refinement Pipeline (Week 3) - MEDIUM IMPACT
**Objective**: Post-process generated responses to enforce voice constraints.

**Deliverables**:
1. **Voice Rule Engine** (`utils/voice-rules.js`)
    * Ban list: phrases to strip/replace ("I'd be happy to", "Great question!", "Let me break this down")
    * Structure enforcement: max 2 paragraphs, no numbered lists unless requested
    * Contraction enforcement: expand formal → casual ("I would" → "I'd")
    * Ending hook validator: ensure ends with question or call-to-action

2. **Integration in Background**
    * Apply rules after Groq response, before sending to content script
    * Log violations for prompt tuning

**Files Created**: `utils/voice-rules.js`
**Files Modified**: `background.js` (import and apply rules)

### Phase 4: Continuous Improvement Loop (Week 4+) - ONGOING
**Objective**: Systematic prompt optimization based on accepted/rejected generations.

**Deliverables**:
1. **Feedback Capture**
    * Track: generated response, user edited? user sent? user discarded?
    * Store in `chrome.storage.sync` with outcome labels

2. **Periodic Prompt Tuning** (manual, monthly)
    * Review high-edit-rate generations → identify prompt gaps
    * Add new few-shot examples from best user-edited versions
    * Update banned phrases list

3. **Analytics Dashboard** (popup enhancement)
    * Show: generations this week, edit rate, top keywords
    * Quick "retrain" button to refresh few-shot index

## Technical Architecture

### Data Flow (Phase 2+)
```warp-runnable-command
User opens request page
      ↓
content.js extracts request text → sends to background
      ↓
background.js: extractKeywords(request) → getFewShotExamples()
      ↓
Build messages: [system, few-shot..., user: request]
      ↓
Groq API call
      ↓
Apply voice rules → return to content.js
      ↓
content.js renders as buttons
      ↓
User clicks button → fills textarea
      ↓
User edits/sends → "Save Response" captures final version

```
### Storage Budget
* `chrome.storage.sync`: 100KB limit
* Responses: ~500 chars each × 50 = 25KB
* Voice profile: ~5KB
* Keywords index: ~5KB
* **Total**: ~35KB (well within limit)

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Few-shot retrieval too slow | Cache keyword index in memory; async storage read |
| Token budget exceeded | Truncate few-shot to fit; prioritize recency + similarity |
| Voice rules over-correct | Make rules configurable; log all transformations |
| Storage quota exceeded | LRU eviction; compress old responses |
| API key rotation | Already using chrome.storage.sync (Phase 0 fix) |

## Success Metrics

1. **Edit Rate**: % of generated responses user edits before sending (target: <30%)
2. **Acceptance Rate**: % of generations used as-is or with minor tweaks (target: >50%)
3. **Call Conversion**: % of responses leading to booked calls (baseline comparison)
4. **Latency**: End-to-end generation time (target: <3s)

## Dependencies
* No new npm packages (keep extension lightweight)
* Groq API remains backend (llama-3.3-70b-versatile)
* Chrome Manifest V3 APIs only

## Rollback Plan
Each phase is independently reversible:
* Phase 1: Revert SYSTEM_PROMPT to previous version
* Phase 2: Disable few-shot by returning empty array
* Phase 3: Bypass voice-rules.js
* Phase 4: Disable feedback capture

## Next Steps
1. **Immediate**: User provides 5-10 actual sent responses for voice profile
2. **Day 1-2**: Implement Phase 1 (voice profile + updated prompt)
3. **Day 3-5**: Implement Phase 2 (storage + few-shot retrieval)
4. **Day 6-7**: Implement Phase 3 (voice rules)
5. **Week 2**: Deploy, collect metrics, iterate