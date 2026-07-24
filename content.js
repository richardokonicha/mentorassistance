/**
 * AI Auto Answer - Content Script
 * Injects AI response buttons into CodeMentor and Upwork request pages
 */

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

const PLATFORM = {
  CODEMENTOR: 'codementor',
  UPWORK: 'upwork'
};

function detectPlatform() {
  const hostname = location.hostname;
  if (hostname.includes('codementor.io')) return PLATFORM.CODEMENTOR;
  if (hostname.includes('upwork.com')) return PLATFORM.UPWORK;
  return null;
}

const currentPlatform = detectPlatform();

// ============================================================================
// PLATFORM CONFIGURATION
// ============================================================================

const SELECTORS = {
  [PLATFORM.CODEMENTOR]: {
    questionDetail: [
      'div.question-detail',
      '[data-testid="question-detail"]',
      '.question-content',
      '.request-description',
      'div[class*="question"]',
      'div[class*="detail"]'
    ],
    textArea: [
      'form textarea',
      'textarea[name="response"]',
      'textarea[placeholder*="response" i]',
      'textarea[placeholder*="message" i]',
      'div[contenteditable="true"]'
    ],
    submitButton: [
      'form button[type="submit"]',
      'button[type="submit"]',
      'form button:not(.ai-auto-answer-btn)',
      'button[data-testid="submit-button"]'
    ]
  },
  [PLATFORM.UPWORK]: {
    questionDetail: [
      'div.fe-job-details',
      'section.air3-card-section',
      'div.air3-card',
      '[class*="job-details"]'
    ],
    textArea: [
      'textarea[aria-labelledby="cover_letter_label"]',
      'textarea.air3-textarea',
      'textarea.inner-textarea',
      'textarea'
    ],
    submitButton: [
      'button.air3-btn-primary',
      'button[class*="air3-btn-primary"]'
    ]
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getSelectors(category) {
  if (!currentPlatform) return [];
  return SELECTORS[currentPlatform]?.[category] || [];
}

function findFirst(selectors, predicate) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (predicate?.(el) ?? true) return el;
  }
  return null;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

const cardHistories = new WeakMap();

function createButton(label, onClick) {
  const button = document.createElement('button');
  button.textContent = label;
  button.className = 'ai-auto-answer-btn';
  button.dataset.label = label;
  button.type = 'button';

  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });

  return button;
}

function createProposalCard(proposalText, requestText) {
  const card = document.createElement('div');
  card.className = 'ai-auto-answer-card';

  const header = document.createElement('div');
  header.className = 'ai-auto-answer-card-header';

  const title = document.createElement('span');
  title.className = 'ai-auto-answer-card-title';
  title.textContent = 'AI Proposal';

  const badge = document.createElement('span');
  badge.className = 'ai-auto-answer-card-badge';
  badge.textContent = currentPlatform === PLATFORM.UPWORK ? 'Upwork' : 'CodeMentor';

  header.appendChild(title);
  header.appendChild(badge);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ai-auto-answer-card-body';
  body.textContent = proposalText;
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'ai-auto-answer-card-actions';

  const useBtn = createButton(currentPlatform === PLATFORM.UPWORK ? '✨ Use this proposal' : 'Use this response', () => {
    fillTextArea(proposalText);
    document.querySelectorAll('.ai-auto-answer-card-chat.open').forEach((panel) => panel.classList.remove('open'));
  });

  const saveBtn = createButton('💾 Save Response', () => captureAndSaveResponse(requestText));
  saveBtn.classList.add('ai-auto-answer-save');

  const refineBtn = createButton('Refine', () => toggleRefineChat(card, requestText, proposalText));

  actions.appendChild(useBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(refineBtn);
  card.appendChild(actions);

  const chatPanel = createRefineChatPanel(requestText, proposalText);
  card.appendChild(chatPanel);

  cardHistories.set(card, [{ role: 'assistant', content: proposalText }]);

  return card;
}

function createRefineChatPanel(requestText, proposalText) {
  const panel = document.createElement('div');
  panel.className = 'ai-auto-answer-card-chat';

  const messages = document.createElement('div');
  messages.className = 'ai-auto-answer-chat-messages';

  const userBubble = document.createElement('div');
  userBubble.className = 'ai-auto-answer-chat-bubble user';
  userBubble.textContent = 'How should I refine this proposal?';
  messages.appendChild(userBubble);

  const assistantBubble = document.createElement('div');
  assistantBubble.className = 'ai-auto-answer-chat-bubble assistant';
  assistantBubble.textContent = proposalText;
  messages.appendChild(assistantBubble);

  panel.appendChild(messages);

  const inputRow = document.createElement('div');
  inputRow.className = 'ai-auto-answer-chat-input-row';

  const input = document.createElement('textarea');
  input.className = 'ai-auto-answer-chat-input';
  input.placeholder = 'e.g. make it shorter, emphasize Kubernetes, add AWS mention...';
  input.rows = 2;

  const sendBtn = createButton('Send', async () => {
    const refinement = input.value.trim();
    if (!refinement) return;

    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    const history = cardHistories.get(panel.closest('.ai-auto-answer-card')) || [];
    const currentProposal = history[history.length - 1]?.content || proposalText;

    const userMsg = document.createElement('div');
    userMsg.className = 'ai-auto-answer-chat-bubble user';
    userMsg.textContent = refinement;
    messages.appendChild(userMsg);

    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'ai-auto-answer-chat-bubble assistant';
    loadingMsg.textContent = 'Refining...';
    messages.appendChild(loadingMsg);

    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    try {
      const result = await getRefinedProposal(requestText, currentProposal, refinement, history);
      loadingMsg.remove();

      if (result) {
        const assistantMsg = document.createElement('div');
        assistantMsg.className = 'ai-auto-answer-chat-bubble assistant';
        assistantMsg.textContent = result;
        messages.appendChild(assistantMsg);

        const card = panel.closest('.ai-auto-answer-card');
        const cardBody = card.querySelector('.ai-auto-answer-card-body');
        if (cardBody) cardBody.textContent = result;

        const historyArr = cardHistories.get(card) || [];
        historyArr.push({ role: 'user', content: refinement });
        historyArr.push({ role: 'assistant', content: result });
        cardHistories.set(card, historyArr);
      }
    } catch (err) {
      loadingMsg.remove();
      console.error('[AI Auto Answer] Refinement failed:', err);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      messages.scrollTop = messages.scrollHeight;
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  panel.appendChild(inputRow);

  return panel;
}

function toggleRefineChat(card, requestText, proposalText) {
  const panel = card.querySelector('.ai-auto-answer-card-chat');
  const isOpen = panel.classList.contains('open');

  if (isOpen) {
    panel.classList.remove('open');
    return;
  }

  if (!cardHistories.has(card)) {
    cardHistories.set(card, [{ role: 'assistant', content: proposalText }]);
  }

  renderChatMessages(card);
  panel.classList.add('open');
  const input = panel.querySelector('.ai-auto-answer-chat-input');
  if (input) input.focus();
}

function renderChatMessages(card) {
  const panel = card.querySelector('.ai-auto-answer-card-chat');
  const messagesContainer = panel.querySelector('.ai-auto-answer-chat-messages');
  if (!messagesContainer) return;

  messagesContainer.innerHTML = '';
  const history = cardHistories.get(card) || [];
  history.forEach((msg) => {
    const bubble = document.createElement('div');
    bubble.className = `ai-auto-answer-chat-bubble ${msg.role}`;
    bubble.textContent = msg.content;
    messagesContainer.appendChild(bubble);
  });
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function truncateLabel(text, maxLength = 60) {
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

function fillTextArea(text) {
  const field = findTextArea();
  if (!field) return;

  if (field.tagName === 'TEXTAREA') {
    field.value = text;
  } else {
    field.textContent = text;
  }

  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
  field.focus();
  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ============================================================================
// BACKGROUND COMMUNICATION
// ============================================================================

function getOptionsFromBackground(txt) {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Background response timeout'));
        }
      }, 30000);
    });

    const responsePromise = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getOptionsFromOpenAI', txt, platform: currentPlatform },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[AI Auto Answer] Message error:', chrome.runtime.lastError.message);
            resolve([]);
            return;
          }
          if (response?.success) {
            resolve([response.data]);
          } else {
            console.error('[AI Auto Answer] Error:', response?.error);
            resolve([]);
          }
        }
      );
    });

    Promise.race([responsePromise, timeoutPromise])
      .then((result) => resolve(result))
      .catch(() => {
        console.error('[AI Auto Answer] Background response timeout');
        resolve([]);
      });
  });
}

function getRefinedProposal(originalRequest, currentProposal, refinementPrompt, history) {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Background response timeout'));
        }
      }, 30000);
    });

    const responsePromise = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'refineProposal',
          originalRequest,
          currentProposal,
          refinementPrompt,
          conversationHistory: history,
          platform: currentPlatform
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[AI Auto Answer] Message error:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            console.error('[AI Auto Answer] Refinement error:', response?.error);
            resolve(null);
          }
        }
      );
    });

    Promise.race([responsePromise, timeoutPromise])
      .then((result) => resolve(result))
      .catch(() => {
        console.error('[AI Auto Answer] Refinement timeout');
        resolve(null);
      });
  });
}

async function createOptions() {
  const details = findQuestionDetail();
  if (!details) {
    console.warn('[AI Auto Answer] Could not find question detail element');
    return [];
  }

  const txt = details.textContent;
  currentRequestText = txt;
  return getOptionsFromBackground(txt);
}

// ============================================================================
// RESPONSE CAPTURE
// ============================================================================

async function captureAndSaveResponse(requestText) {
  const textField = findTextArea();
  if (!textField) {
    showToast('Could not find response field');
    return;
  }

  const userResponse = (textField.value || textField.textContent || '').trim();
  if (!userResponse) {
    showToast('No response to save');
    return;
  }

  chrome.runtime.sendMessage(
    { action: 'saveResponse', request: requestText, response: userResponse, platform: currentPlatform },
    (res) => {
      if (chrome.runtime.lastError) {
        showToast('Save failed: ' + chrome.runtime.lastError.message);
        return;
      }
      showToast(res?.success ? 'Response saved!' : 'Save failed: ' + (res?.error || 'unknown'));
    }
  );
}

// ============================================================================
// STYLES
// ============================================================================

function ensureStyles() {
  if (document.getElementById('ai-auto-answer-styles')) return;

  const style = document.createElement('style');
  style.id = 'ai-auto-answer-styles';
  style.textContent = `
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes cardIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ai-auto-answer-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
      color: #0f172a;
      background-color: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      cursor: pointer;
      transition: all 0.15s ease-in-out;
      max-width: 320px;
      white-space: normal;
      word-wrap: break-word;
    }
    .ai-auto-answer-btn:hover {
      background-color: #f8fafc;
      border-color: #cbd5e1;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      transform: translateY(-1px);
    }
    .ai-auto-answer-btn:active {
      transform: translateY(0);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .ai-auto-answer-btn.ai-auto-answer-save {
      background-color: #ecfdf5;
      border-color: #a7f3d0;
      color: #065f46;
      font-weight: 600;
    }
    .ai-auto-answer-btn.ai-auto-answer-save:hover {
      background-color: #d1fae5;
      border-color: #6ee7b7;
    }
    .ai-auto-answer-toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0f172a;
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.2s ease-out;
    }
    .ai-auto-answer-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      margin-bottom: 16px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: cardIn 0.3s ease-out;
      max-width: 800px;
    }
    .ai-auto-answer-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }
    .ai-auto-answer-card-title {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
    }
    .ai-auto-answer-card-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 10px;
      border-radius: 9999px;
      background: #dbeafe;
      color: #1e40af;
    }
    .ai-auto-answer-card-body {
      padding: 14px;
      font-size: 13px;
      line-height: 1.6;
      color: #334155;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 260px;
      overflow-y: auto;
    }
    .ai-auto-answer-card-actions {
      display: flex;
      gap: 8px;
      padding: 10px 14px;
      border-top: 1px solid #e2e8f0;
      background: #fafafa;
    }
    .ai-auto-answer-card-actions .ai-auto-answer-btn {
      flex: 1;
      justify-content: center;
      font-size: 12px;
      padding: 8px 12px;
    }
    .ai-auto-answer-card-chat {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.25s ease-out, padding 0.25s ease-out;
      border-top: 1px solid transparent;
      background: #f8fafc;
    }
    .ai-auto-answer-card-chat.open {
      max-height: 420px;
      overflow-y: auto;
      border-top-color: #e2e8f0;
      padding: 14px;
    }
    .ai-auto-answer-chat-messages {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 12px;
    }
    .ai-auto-answer-chat-bubble {
      max-width: 85%;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 12px;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .ai-auto-answer-chat-bubble.user {
      align-self: flex-end;
      background: #0f172a;
      color: #ffffff;
      border-bottom-right-radius: 2px;
    }
    .ai-auto-answer-chat-bubble.assistant {
      align-self: flex-start;
      background: #ffffff;
      color: #334155;
      border: 1px solid #e2e8f0;
      border-bottom-left-radius: 2px;
    }
    .ai-auto-answer-chat-input-row {
      display: flex;
      gap: 8px;
    }
    .ai-auto-answer-chat-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 12px;
      font-family: inherit;
      line-height: 1.5;
      resize: none;
      min-height: 36px;
      max-height: 80px;
      box-sizing: border-box;
      background: #ffffff;
    }
    .ai-auto-answer-chat-input:focus {
      outline: none;
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
    }
    .ai-auto-answer-card-chat .ai-auto-answer-btn {
      border-radius: 8px;
      font-weight: 600;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// DOM SELECTORS
// ============================================================================

function findQuestionDetail() {
  return findFirst(getSelectors('questionDetail'), (el) => el.textContent.trim().length > 50);
}

function findTextArea() {
  return findFirst(getSelectors('textArea'));
}

function findSubmitButton() {
  return findFirst(getSelectors('submitButton'), (btn) => !btn.classList.contains('ai-auto-answer-btn'));
}

// ============================================================================
// BACKGROUND COMMUNICATION
// ============================================================================

function getOptionsFromBackground(txt) {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Background response timeout'));
        }
      }, 30000);
    });

    const responsePromise = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getOptionsFromOpenAI', txt, platform: currentPlatform },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[AI Auto Answer] Message error:', chrome.runtime.lastError.message);
            resolve([]);
            return;
          }
          if (response?.success) {
            resolve([response.data]);
          } else {
            console.error('[AI Auto Answer] Error:', response?.error);
            resolve([]);
          }
        }
      );
    });

    Promise.race([responsePromise, timeoutPromise])
      .then((result) => resolve(result))
      .catch(() => {
        console.error('[AI Auto Answer] Background response timeout');
        resolve([]);
      });
  });
}

function getRefinedProposal(originalRequest, currentProposal, refinementPrompt, history) {
  return new Promise((resolve) => {
    let settled = false;

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('Background response timeout'));
        }
      }, 30000);
    });

    const responsePromise = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: 'refineProposal',
          originalRequest,
          currentProposal,
          refinementPrompt,
          conversationHistory: history,
          platform: currentPlatform
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('[AI Auto Answer] Message error:', chrome.runtime.lastError.message);
            resolve(null);
            return;
          }
          if (response?.success) {
            resolve(response.data);
          } else {
            console.error('[AI Auto Answer] Refinement error:', response?.error);
            resolve(null);
          }
        }
      );
    });

    Promise.race([responsePromise, timeoutPromise])
      .then((result) => resolve(result))
      .catch(() => {
        console.error('[AI Auto Answer] Refinement timeout');
        resolve(null);
      });
  });
}

async function createOptions() {
  const details = findQuestionDetail();
  if (!details) {
    console.warn('[AI Auto Answer] Could not find question detail element');
    return [];
  }

  const txt = details.textContent;
  currentRequestText = txt;
  return getOptionsFromBackground(txt);
}

// ============================================================================
// RESPONSE CAPTURE
// ============================================================================

async function captureAndSaveResponse(requestText) {
  const textField = findTextArea();
  if (!textField) {
    showToast('Could not find response field');
    return;
  }

  const userResponse = (textField.value || textField.textContent || '').trim();
  if (!userResponse) {
    showToast('No response to save');
    return;
  }

  chrome.runtime.sendMessage(
    { action: 'saveResponse', request: requestText, response: userResponse, platform: currentPlatform },
    (res) => {
      if (chrome.runtime.lastError) {
        showToast('Save failed: ' + chrome.runtime.lastError.message);
        return;
      }
      showToast(res?.success ? 'Response saved!' : 'Save failed: ' + (res?.error || 'unknown'));
    }
  );
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let currentRequestText = '';
let isInitializing = false;
let lastInitedUrl = location.href;
let pollHandle = null;
let pollGeneration = 0;

function init() {
  if (!currentPlatform) {
    console.log('[AI Auto Answer] Unsupported platform');
    return false;
  }

  if (isInitializing) return false;

  const container = document.querySelector('.ai-auto-answer-card');
  if (container && lastInitedUrl === location.href) {
    return true;
  }

  if (currentPlatform === PLATFORM.UPWORK) {
    return initUpwork();
  }

  return initCodeMentor();
}

function initCodeMentor() {
  const targetButton = findSubmitButton();
  if (!targetButton) {
    console.warn('[AI Auto Answer] Could not find submit button, retrying...');
    return false;
  }

  const parent = targetButton.parentNode;
  parent.querySelector('.ai-auto-answer-container')?.remove();

  isInitializing = true;

  return createOptions().then((options) => {
    if (options.length === 0) {
      console.log('[AI Auto Answer] No options generated');
      return false;
    }

    const card = createProposalCard(options[0], currentRequestText || '');
    parent.insertBefore(card, targetButton);
    console.log('[AI Auto Answer] Card injected successfully');
    lastInitedUrl = location.href;
    return true;
  }).catch((err) => {
    console.error('[AI Auto Answer] Failed to create options:', err);
    return false;
  }).finally(() => {
    isInitializing = false;
  });
}

function initUpwork() {
  const textArea = findTextArea();
  if (!textArea) {
    console.warn('[AI Auto Answer] Could not find cover letter textarea, retrying...');
    return false;
  }

  const parent = textArea.parentElement;
  if (!parent) {
    console.warn('[AI Auto Answer] Textarea has no parent, retrying...');
    return false;
  }

  parent.querySelector('.ai-auto-answer-container')?.remove();

  isInitializing = true;

  return createOptions().then((options) => {
    if (options.length === 0) {
      console.log('[AI Auto Answer] No options generated');
      return false;
    }

    const card = createProposalCard(options[0], currentRequestText || '');
    parent.insertBefore(card, textArea);
    console.log('[AI Auto Answer] Upwork card injected successfully');
    lastInitedUrl = location.href;
    return true;
  }).catch((err) => {
    console.error('[AI Auto Answer] Failed to create options:', err);
    return false;
  }).finally(() => {
    isInitializing = false;
  });
}

async function startPolling(maxAttempts = 100) {
  const generation = ++pollGeneration;
  let attempts = 0;
  let delay = 80;

  while (true) {
    if (generation !== pollGeneration) return;
    attempts++;

    try {
      const ready = await init();
      if (ready) {
        console.log('[AI Auto Answer] Initialization complete');
        return;
      }
      if (attempts >= maxAttempts) {
        console.error('[AI Auto Answer] Initialization timeout');
        return;
      }
    } catch (error) {
      console.error('[AI Auto Answer] Init error:', error);
      if (attempts >= maxAttempts) return;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(delay + attempts * 12, 1200)));
  }
}

function startExtension() {
  if (isInitializing) {
    console.log('[AI Auto Answer] Already initializing, skipping restart');
    return;
  }

  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }
  ++pollGeneration;
  document.querySelector('.ai-auto-answer-card')?.remove();
  ensureStyles();
  currentRequestText = '';
  lastInitedUrl = location.href;
  isInitializing = false;

  const maxAttempts = currentPlatform === PLATFORM.UPWORK ? 140 : 100;
  startPolling(maxAttempts);
}

// Delay Upwork start to allow lazy-loaded form to appear
if (currentPlatform === PLATFORM.UPWORK) {
  setTimeout(() => startExtension(), 500);
} else {
  startExtension();
}

// ============================================================================
// SPA NAVIGATION DETECTION
// ============================================================================

const REINIT_DEBOUNCE_MS = 300;
let lastReinitializeTime = 0;

function reinitialize() {
  const now = Date.now();
  if (now - lastReinitializeTime < REINIT_DEBOUNCE_MS) return;
  if (location.href === lastInitedUrl) return;
  lastReinitializeTime = now;

  console.log('[AI Auto Answer] Page navigation detected, re-initializing...');
  startExtension();
}

const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  originalPushState.apply(this, args);
  if (location.href !== lastInitedUrl) {
    reinitialize();
  }
};

history.replaceState = function (...args) {
  originalReplaceState.apply(this, args);
  if (location.href !== lastInitedUrl) {
    reinitialize();
  }
};

window.addEventListener('popstate', () => {
  if (location.href !== lastInitedUrl) {
    reinitialize();
  }
});

window.addEventListener('hashchange', () => {
  if (location.href !== lastInitedUrl) {
    reinitialize();
  }
});
