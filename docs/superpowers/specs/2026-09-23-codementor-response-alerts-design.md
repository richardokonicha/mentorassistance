# CodeMentor Response Alerts Design

## Goal

Alert the mentor immediately when a new client message is rendered in an open, authenticated CodeMentor conversation. The first version sends one Chrome desktop notification per newly detected incoming message. It does not poll CodeMentor from a server and does not require storing CodeMentor credentials.

## Scope and Constraints

- Monitor CodeMentor pages already matched by the extension.
- Assume the user keeps a CodeMentor tab open while available.
- Alert on every newly rendered incoming client message.
- Do not alert for messages present during the initial page scan.
- Do not alert for the mentor's own outgoing messages.
- Send one notification per message; no repeated-alert state machine.
- Preserve existing proposal-generation behavior for CodeMentor and Upwork.
- Rely on Chrome/macOS notification settings for sound volume and delivery.

## Architecture

The existing CodeMentor content script owns page observation because it has access to the authenticated conversation DOM. The Manifest V3 service worker owns system notifications and tab navigation.

### Content Script

On a matching CodeMentor page, the content script locates the conversation container and starts a `MutationObserver`. It extracts stable message identity where available, otherwise derives a deterministic key from the conversation URL, direction, and normalized message text. The first scan establishes a baseline without notifying.

For each later mutation batch, the monitor identifies newly added incoming client messages, extracts a short preview, and sends a `clientResponseDetected` runtime message containing the conversation URL, message key, and preview. The observer is disconnected when the page no longer matches or when the content script is reinitialized.

### Service Worker

The service worker validates the detection message, deduplicates message keys using a bounded persisted history in `chrome.storage.local`, and creates a Chrome notification. The notification stores the source CodeMentor URL in its metadata. On notification click, the worker focuses an existing CodeMentor tab or opens the stored URL.

The manifest adds the `notifications` permission. No remote monitoring service is introduced.

## Data Flow

1. CodeMentor renders a new client message.
2. The content script observer receives the DOM mutation.
3. The monitor classifies the message as incoming and calculates its key.
4. The content script sends the detection message to the service worker.
5. The worker ignores an already-seen key; otherwise it persists the key and creates one notification.
6. The user clicks the notification and is returned to the relevant CodeMentor page.

## Failure Handling

- If selectors do not identify a conversation or message, monitoring remains active and logs a diagnostic warning without creating false notifications.
- If multiple messages arrive in one mutation batch, each new message may receive one notification, with deterministic deduplication.
- If the worker restarts, persisted recent keys prevent duplicate notifications.
- If notification creation fails, the content script receives an error result and displays an in-page fallback toast when possible.
- If navigation changes the conversation, the old observer is disconnected and the new page establishes a fresh baseline.
- If Chrome/macOS notifications are disabled, the extension cannot override that operating-system setting; this is documented as an operational prerequisite.

## Verification

- `npm run typecheck`
- `npm run build`
- Verify initial messages do not notify.
- Verify a newly added incoming message creates one desktop notification.
- Verify outgoing messages and unrelated DOM changes do not notify.
- Verify repeated mutation delivery does not duplicate notifications.
- Verify notification clicks focus or open the correct CodeMentor page.
- Verify navigation cleanup and re-baselining.
- Manually test with the CodeMentor tab backgrounded and Chrome/macOS notifications enabled.

## Out of Scope

- Monitoring while Chrome is fully closed.
- External servers, credential/session scraping, or CodeMentor API polling.
- Repeated notifications, quiet hours, or configurable alert policies.
- Automatic acceptance of jobs or automatic replies.
