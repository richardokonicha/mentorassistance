# CodeMentor Response Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reliable Chrome desktop notification whenever a newly rendered incoming client message appears in an open CodeMentor conversation.

**Architecture:** The existing CodeMentor content script observes the authenticated conversation DOM and sends a validated `clientResponseDetected` message to the Manifest V3 service worker. The service worker persists a bounded set of message keys, creates one notification per unseen key, and focuses or opens the CodeMentor URL when the notification is clicked.

**Tech Stack:** TypeScript, Chrome Manifest V3 APIs, `MutationObserver`, `chrome.runtime`, `chrome.notifications`, `chrome.storage.local`, and the repository's Node-based contract tests.

## Global Constraints

- Monitor only an open authenticated CodeMentor tab; do not add server polling or credential/session scraping.
- Alert on every newly rendered incoming client message.
- Do not alert for messages present during the initial page scan.
- Do not alert for the mentor's own outgoing messages.
- Send one notification per message; do not add repeated-alert behavior, quiet hours, or automatic replies.
- Preserve existing CodeMentor and Upwork proposal-generation behavior.
- Rely on Chrome/macOS notification settings for sound volume and delivery.
- Do not modify unrelated existing working-tree changes.

## File Map

- Modify: `manifest.json` to request the `notifications` permission.
- Modify: `content.ts` to implement CodeMentor message observation, initial baselining, message classification, deduplication keys, and observer cleanup.
- Modify: `background.ts` to validate detections, persist bounded recent keys, create notifications, and handle notification clicks.
- Modify: `src/types.ts` to define shared alert message and response types if needed by the existing TypeScript compilation.
- Create: `test_codementor_alerts.js` for deterministic contract checks of the alert protocol and source behavior without requiring a live Chrome page.

## Task 1: Add the notification permission and shared protocol

**Files:**
- Modify: `manifest.json:6-10`
- Modify: `background.ts:7-40`
- Modify: `src/types.ts:45-84`
- Create: `test_codementor_alerts.js`

**Interfaces:**
- Content script sends `{ action: 'clientResponseDetected', conversationUrl: string, messageKey: string, preview: string }`.
- Service worker responds with `{ success: boolean, notified?: boolean, error?: string }`.
- `messageKey` is the stable deduplication identifier; `preview` is limited before notification creation.

- [ ] **Step 1: Write failing contract checks.**

Add Node assertions that read `manifest.json`, `background.ts`, and `content.ts` and require the `notifications` permission, the `clientResponseDetected` action, notification creation, notification click handling, and persisted deduplication storage. Also assert that the alert action is not present in the Upwork-only observer path.

```js
const fs = require('fs');
const assert = require('assert');

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const background = fs.readFileSync('background.ts', 'utf8');
const content = fs.readFileSync('content.ts', 'utf8');

assert(manifest.permissions.includes('notifications'));
assert.match(background, /clientResponseDetected/);
assert.match(background, /chrome\.notifications\.create/);
assert.match(background, /chrome\.notifications\.onClicked/);
assert.match(background, /chrome\.storage\.local/);
assert.match(content, /MutationObserver/);
assert.match(content, /clientResponseDetected/);
console.log('CodeMentor alert contract passed');
```

- [ ] **Step 2: Run the new contract test and verify it fails.**

Run: `node test_codementor_alerts.js`

Expected: FAIL because the manifest permission and alert protocol do not exist yet.

- [ ] **Step 3: Add the manifest permission and protocol types.**

Add `notifications` to the existing permission array. In `src/types.ts`, define the alert request and response shapes if they are used in annotations. In `background.ts`, add the corresponding message union member and storage constants without changing existing AI message handling.

- [ ] **Step 4: Run the contract test and typecheck.**

Run: `node test_codementor_alerts.js`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS with no new TypeScript errors.

- [ ] **Step 5: Commit the protocol change.**

```bash
git add manifest.json src/types.ts background.ts test_codementor_alerts.js
git commit -m "feat: add CodeMentor alert protocol"
```

## Task 2: Implement CodeMentor DOM monitoring

**Files:**
- Modify: `content.ts:1587-1710` and the CodeMentor selector configuration near `36-59`
- Modify: `test_codementor_alerts.js`

**Interfaces:**
- `startCodeMentorResponseMonitor(): void` starts or reuses the observer.
- `stopCodeMentorResponseMonitor(): void` disconnects the observer and clears monitor state.
- `handleCodeMentorMutations(): void` scans mutations after the initial baseline.
- The monitor sends the alert protocol through `chrome.runtime.sendMessage` and displays a toast if the worker reports failure.

- [ ] **Step 1: Extend contract tests for baseline and cleanup behavior.**

Require `startCodeMentorResponseMonitor`, `stopCodeMentorResponseMonitor`, an explicit initial-baseline guard, and a `MutationObserver` configured for `childList` and `subtree`. Require the cleanup path to call `stopCodeMentorResponseMonitor`.

- [ ] **Step 2: Run the contract test to verify the new checks fail.**

Run: `node test_codementor_alerts.js`

Expected: FAIL because the monitor functions and cleanup integration do not exist.

- [ ] **Step 3: Add narrow CodeMentor message selectors and extraction helpers.**

Follow the existing selector-array pattern. Add candidate selectors for message nodes and direction markers, preferring explicit `data-testid`, `data-message-id`, `data-author`, `data-sender`, and class/data attributes that distinguish the client from the mentor. Implement helpers that:

```ts
function normalizeAlertText(value: string): string;
function getCodeMentorMessageKey(message: HTMLElement, conversationUrl: string): string | null;
function isIncomingCodeMentorMessage(message: HTMLElement): boolean;
function getCodeMentorMessagePreview(message: HTMLElement): string;
```

The helpers must return `null` or `false` when direction cannot be determined rather than guessing and creating a false alert. Limit preview text to a short readable string before sending it to the worker.

- [ ] **Step 4: Implement initial baseline and mutation scanning.**

Maintain module state for one CodeMentor `MutationObserver`, the current conversation URL, and a `Set<string>` of keys seen in the current page. On start, scan the current conversation and add all recognized message keys without sending alerts. On later mutation callbacks, inspect added message nodes, ignore already-seen keys and outgoing/unknown-direction messages, then send the detection message for each new incoming message.

Use `document.body` as a safe fallback observation target while the conversation container is lazy-loaded. Do not throw if the target or message nodes are absent; log one diagnostic warning and leave the observer available for later DOM mutations.

- [ ] **Step 5: Integrate lifecycle cleanup and SPA navigation.**

Start the response monitor from `initCodeMentor` before or alongside proposal generation. Stop it from `cleanupExtension` and before reinitializing a changed CodeMentor URL. Reset the per-page baseline after navigation so existing messages on the destination conversation do not alert.

- [ ] **Step 6: Run typecheck, contract tests, and build.**

Run: `node test_codementor_alerts.js`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS and regenerated `dist/` output.

- [ ] **Step 7: Commit the content monitor.**

```bash
git add content.ts test_codementor_alerts.js
git commit -m "feat: monitor CodeMentor client responses"
```

## Task 3: Implement service-worker notifications and deduplication

**Files:**
- Modify: `background.ts:68-82` and the runtime message handler near `380-402`
- Modify: `test_codementor_alerts.js`

**Interfaces:**
- `handleClientResponseDetected(message, sender, sendResponse): void` validates and processes detections.
- `rememberAlertKey(messageKey: string): Promise<boolean>` returns `false` for a previously seen key and `true` after persisting a new key.
- `openCodeMentorUrl(url: string): Promise<void>` focuses an existing matching tab or creates a new tab.

- [ ] **Step 1: Add failing source-contract checks for worker behavior.**

Require validation for `conversationUrl`, `messageKey`, and `preview`; a bounded recent-key storage constant; notification title/message fields; `notificationId -> URL` metadata; and tab focus/create behavior in the click listener.

- [ ] **Step 2: Run the contract test and verify it fails.**

Run: `node test_codementor_alerts.js`

Expected: FAIL because the worker handler and notification click flow do not exist.

- [ ] **Step 3: Implement bounded persistent deduplication.**

Store an array of `{ key: string, url: string, seenAt: number }` under a dedicated key such as `codementorAlertHistory`. Before notification creation, remove entries older than a fixed retention window and cap the list to a small maximum. Return `false` without notification when the incoming key already exists. Use the existing callback-wrapped storage style and check `chrome.runtime.lastError` on reads and writes.

- [ ] **Step 4: Create the notification.**

Validate that the URL is an HTTPS `www.codementor.io` URL and that text fields are non-empty strings. Truncate preview text to a notification-safe length. Use `chrome.notifications.create` with a basic notification, a CodeMentor title, the preview message, and an available extension icon. Store the URL by notification ID in a bounded in-memory map and the persisted history.

- [ ] **Step 5: Handle notification clicks and errors.**

On click, look up and validate the stored URL, query CodeMentor tabs, update/focus a matching tab when present, otherwise create a new tab, then clear the notification. On notification creation failure, send `{ success: false, error }` to the content script so it can show its fallback toast. Do not affect existing AI message responses.

- [ ] **Step 6: Run all verification commands.**

Run: `node test_codementor_alerts.js && npm test && npm run typecheck && npm run build`

Expected: all tests pass, typecheck passes, and the extension build completes.

- [ ] **Step 7: Commit the worker notification flow.**

```bash
git add background.ts test_codementor_alerts.js
git commit -m "feat: notify on CodeMentor client responses"
```

## Task 4: Manual browser verification and documentation

**Files:**
- Modify: `README.md` in the features/configuration sections
- Modify: `test_codementor_alerts.js` only if a verified contract gap is discovered

- [ ] **Step 1: Build the unpacked extension.**

Run: `npm run build`

Load or reload the repository folder as an unpacked extension in Chrome using the generated `dist/` service worker and content script files.

- [ ] **Step 2: Verify baseline behavior.**

Open an existing CodeMentor request page with existing messages. Confirm no notification appears during initial load. Confirm the response monitor logs no repeated initialization warnings.

- [ ] **Step 3: Verify a new incoming message.**

Keep the CodeMentor tab open and move focus to another tab. Have a client send a new response or use a controlled DOM change in DevTools matching the detected incoming-message structure. Confirm exactly one desktop notification appears with a readable preview.

- [ ] **Step 4: Verify filtering and deduplication.**

Send or render an outgoing mentor message and confirm no notification. Trigger unrelated DOM mutations and confirm no notification. Re-render the same incoming message and confirm no duplicate notification.

- [ ] **Step 5: Verify click navigation and SPA cleanup.**

Click the notification and confirm Chrome focuses the correct CodeMentor tab/conversation. Navigate to another CodeMentor request and confirm its existing messages establish a new silent baseline. Navigate to a non-matching page and confirm the monitor disconnects.

- [ ] **Step 6: Document operational requirements.**

Add a README feature note stating that CodeMentor must remain open in an authenticated tab and that Chrome/macOS notifications must be enabled for sound and delivery. Explicitly state that this version does not monitor while Chrome is closed.

- [ ] **Step 7: Run final verification.**

Run: `npm test && npm run typecheck && npm run build`

Expected: all automated checks pass and the generated extension is ready for manual loading.

## Self-Review Checklist

- Spec coverage: monitoring, initial baseline, incoming-only filtering, one notification, deduplication, click-to-focus, cleanup, fallback errors, and verification are covered by Tasks 1-4.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps are present.
- Type consistency: the message action and payload fields are defined in Task 1 and used consistently by Tasks 2 and 3.
- Scope: no server, polling, credential handling, repeated alerts, or automatic replies are introduced.
