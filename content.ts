import { Platform, ProposalCard } from './src/types';

declare global {
  interface HTMLElement {
    _proposalVersion?: number;
    _activeProposalIndex?: number;
  }
}
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
      '[class*="job-details"]',
      'div[data-test="job-details"]'
    ],
    textArea: [
      'textarea[aria-labelledby="cover_letter_label"]',
      'textarea.air3-textarea',
      'textarea.inner-textarea',
      'div[contenteditable="true"]',
      'div[role="textbox"]',
      '[data-test="cover-letter"]'
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
  return SELECTORS[currentPlatform]?.[category] ?? [];
}

function findFirst(selectors: string[], predicate?: (el: HTMLElement) => boolean): HTMLElement | null {
  for (const selector of selectors) {
    const elElement = document.querySelector(selector);
    if (!elElement) continue;
    const el = elElement as HTMLElement;
    if (predicate?.(el) ?? true) {
      return el;
    }
  }
  return null;
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

const cardHistories = new WeakMap<HTMLElement, Array<{ role: string; content: string }>>();
const refinementHistory = new WeakMap<HTMLElement, string[]>();

const SUGGESTION_PRESETS = [
  'sound more personal',
  'sound more excited',
  'be more concise'
];

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

function createProposalCard(proposalText: string, requestText: string, anchorEl: HTMLElement): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ai-auto-answer-card';
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'AI proposal');
  card._proposalVersion = 1;
  card._activeProposalIndex = 1;

  const header = document.createElement('div');
  header.className = 'ai-auto-answer-card-header';
  header.setAttribute('data-drag-handle', 'true');

  const title = document.createElement('span');
  title.className = 'ai-auto-answer-card-title';
  title.textContent = 'AI Proposal';

  const badge = document.createElement('span');
  badge.className = 'ai-auto-answer-card-badge';
  badge.textContent = currentPlatform === PLATFORM.UPWORK ? 'Upwork' : 'CodeMentor';

  const controls = document.createElement('div');
  controls.className = 'ai-auto-answer-card-controls';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'ai-auto-answer-control-btn';
  minimizeBtn.textContent = '–';
  minimizeBtn.setAttribute('aria-label', 'Minimize');
  minimizeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.toggle('minimized');
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'ai-auto-answer-control-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.remove();
  });

  controls.appendChild(minimizeBtn);
  controls.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(badge);
  header.appendChild(controls);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ai-auto-answer-card-body';
  body.textContent = proposalText;
  card.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'ai-auto-answer-card-actions';

  const useBtn = createButton(currentPlatform === PLATFORM.UPWORK ? '✨ Use this proposal' : 'Use this response', () => {
    const currentText = (body && body.textContent) ? body.textContent : (proposalText || '');
    fillTextArea(currentText);
    document.querySelectorAll('.ai-auto-answer-card-chat.open').forEach((panel) => panel.classList.remove('open'));
  });

  const saveBtn = createButton('💾 Save Response', () => {
    if (typeof requestText === 'string') {
      captureAndSaveResponse(requestText);
    }
  });
  saveBtn.classList.add('ai-auto-answer-save');

  const refineBtn = createButton('Refine', () => toggleRefineChat(card, requestText));

  actions.appendChild(useBtn);
  actions.appendChild(saveBtn);
  actions.appendChild(refineBtn);
  card.appendChild(actions);

  let chatPanel;
  try {
    chatPanel = createRefineChatPanel(requestText);
  } catch (err) {
    console.error('[AI Auto Answer] Failed to create refine chat panel:', err);
    chatPanel = document.createElement('div');
    chatPanel.className = 'ai-auto-answer-card-chat';
    chatPanel.textContent = 'Refine chat unavailable';
  }
  card.appendChild(chatPanel);

  cardHistories.set(card, [
    { role: 'user', content: requestText ? `Initial request: ${requestText.substring(0, 100)}${requestText.length > 100 ? '...' : ''}` : 'Generate proposal' },
    { role: 'assistant', content: proposalText }
  ]);
  renderChatMessages(card);

  const stored = sessionStorage.getItem('ai-auto-answer-card-position');
  if (stored) {
    try {
      const pos = JSON.parse(stored);
      card.style.left = `${pos.left}px`;
      card.style.top = `${pos.top}px`;
    } catch {
      positionCardNearAnchor(card, anchorEl);
    }
  } else {
    positionCardNearAnchor(card, anchorEl);
  }

  makeDraggable(card);
  return card;
}

function positionCardNearAnchor(card: HTMLElement, anchorEl: HTMLElement) {
  const rect = anchorEl?.getBoundingClientRect?.();
  if (rect) {
    let left = rect.left;
    let top = rect.bottom + 8;
    if (top + 360 > window.innerHeight) top = Math.max(8, rect.top - 360);
    if (left + 520 > window.innerWidth) left = Math.max(8, window.innerWidth - 520);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  } else {
    card.style.left = '16px';
    card.style.top = '16px';
  }
}

function makeDraggable(card: HTMLElement) {
  const handle = card.querySelector('[data-drag-handle="true"]');
  if (!handle) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;

  const onMouseDown = (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = card.offsetLeft;
    initialTop = card.offsetTop;
    card.style.transition = 'none';
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const maxX = window.innerWidth - width;
    const maxY = window.innerHeight - height;
    const left = Math.max(0, Math.min(maxX, initialLeft + dx));
    const top = Math.max(0, Math.min(maxY, initialTop + dy));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };

  const onMouseUp = () => {
    if (!isDragging) return;
    isDragging = false;
    card.style.transition = '';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    try {
      sessionStorage.setItem('ai-auto-answer-card-position', JSON.stringify({ left: card.offsetLeft, top: card.offsetTop }));
    } catch {}
  };

  handle.addEventListener('mousedown', onMouseDown);
}

function createRefineChatPanel(requestText) {
  const panel = document.createElement('div');
  panel.className = 'ai-auto-answer-card-chat';

  const messages = document.createElement('div');
  messages.className = 'ai-auto-answer-chat-messages';
  panel.appendChild(messages);

  const inputRow = document.createElement('div');
  inputRow.className = 'ai-auto-answer-chat-input-row';

  const input = document.createElement('textarea');
  input.className = 'ai-auto-answer-chat-input';
  input.placeholder = 'e.g. make it shorter, emphasize Kubernetes, add AWS mention...';
  input.rows = 2;

  const sendBtn = createButton('Send', async () => {
    const refinement = (input.value || '').trim();
    if (!refinement) return;

    input.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    const card = panel.closest('.ai-auto-answer-card') as HTMLElement | null;
    if (!card) {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      return;
    }

    const cardBody = card.querySelector('.ai-auto-answer-card-body');
    const currentProposal = (cardBody && cardBody.textContent) ? cardBody.textContent.trim() : '';
    const history = cardHistories.has(card) ? cardHistories.get(card) : [];
    const safeHistory = Array.isArray(history) ? history : [];

    const userMsg = { role: 'user', content: refinement };
    history.push(userMsg);
    cardHistories.set(card, history);

    if (card) {
      const recent = refinementHistory.get(card) ?? [];
      if (!recent.includes(refinement)) {
        recent.unshift(refinement);
        refinementHistory.set(card, recent.slice(0, 8));
      }
    }

    const loadingMsg = { role: 'assistant', content: 'Refining...' };
    history.push(loadingMsg);
    cardHistories.set(card, history);
    renderChatMessages(card);

input.value = '';
     const messagesContainer = panel.querySelector('.ai-auto-answer-chat-messages');
     if (messagesContainer) {
       messagesContainer.scrollTop = messagesContainer.scrollHeight;
     }

    try {
      const result = await getRefinedProposal(requestText, currentProposal, refinement, history.filter((m) => m !== loadingMsg));

      const loadingIndex = history.indexOf(loadingMsg);
      if (loadingIndex >= 0 && result) {
        history[loadingIndex] = { role: 'assistant', content: result };
      } else if (loadingIndex >= 0) {
        history[loadingIndex].content = 'Refinement failed';
      } else {
        history.push({ role: 'assistant', content: result || 'Refinement failed' });
      }
      cardHistories.set(card, history);
      renderChatMessages(card);

      if (result) {
        const proposalCard = card as ProposalCard;
        proposalCard._proposalVersion = (proposalCard._proposalVersion || 0) + 1;
        proposalCard._activeProposalIndex = history.length - 1;
        if (cardBody) cardBody.textContent = result || '';
        renderChatMessages(card);

        const suggestionsScroll = panel.querySelector('.ai-auto-answer-suggestions-scroll');
        if (suggestionsScroll && card) {
      const recent = refinementHistory.get(card) ?? [];
          const presets = SUGGESTION_PRESETS.filter((p) => !recent.includes(p));
          renderSuggestionPills(suggestionsScroll, [...recent, ...presets]);
        }
      }
    } catch (err) {
      const loadingIndex = history.indexOf(loadingMsg);
      if (loadingIndex >= 0) {
        history[loadingIndex].content = 'Refinement failed';
      }
      cardHistories.set(card, history);
      renderChatMessages(card);
      console.error('[AI Auto Answer] Refinement failed:', err);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  panel.appendChild(inputRow);

  const suggestionsRow = document.createElement('div');
  suggestionsRow.className = 'ai-auto-answer-suggestions-row';

  const suggestionsScroll = document.createElement('div');
  suggestionsScroll.className = 'ai-auto-answer-suggestions-scroll';

  renderSuggestionPills(suggestionsScroll, []);
  suggestionsRow.appendChild(suggestionsScroll);

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ai-auto-answer-suggestions-reset';
  resetBtn.textContent = 'Clear recent';
  resetBtn.title = 'Clear recent suggestions';
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const card = panel.closest('.ai-auto-answer-card') as HTMLElement | null;
    if (card) {
      refinementHistory.set(card, []);
      renderSuggestionPills(suggestionsScroll, SUGGESTION_PRESETS);
    }
  });
  suggestionsRow.appendChild(resetBtn);

  panel.appendChild(suggestionsRow);

  const card = panel.closest('.ai-auto-answer-card') as HTMLElement | null;
  if (card) {
    const history = refinementHistory.get(card) ?? [];
    const presets = SUGGESTION_PRESETS.filter((p) => !history.includes(p));
    renderSuggestionPills(suggestionsScroll, [...history, ...presets]);
  }

  return panel;
}

function renderSuggestionPills(container: Element, suggestions: string[]) {
  container.innerHTML = '';

  const unique = [...new Set(suggestions)].slice(0, 3);

  for (const text of unique) {
    const pill = document.createElement('button');
    pill.className = 'ai-auto-answer-suggestion-pill';
    pill.type = 'button';
    pill.textContent = text;
    pill.title = 'Click to fill input, double-click to edit';

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = container.closest('.ai-auto-answer-card-chat')?.querySelector('.ai-auto-answer-chat-input') as HTMLTextAreaElement | null;
      if (input) {
        input.value = text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    let editor = null;

    pill.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();

      editor = document.createElement('input');
      editor.type = 'text';
      editor.className = 'ai-auto-answer-suggestion-edit';
      editor.value = text;
      editor.style.cssText = `
        padding: 3px 8px;
        border: 1px solid #10b981;
        border-radius: 9999px;
        font-size: 11px;
        font-family: inherit;
        background: #ffffff;
        color: #0f172a;
        outline: none;
        min-width: 60px;
        max-width: 120px;
      `;

      pill.replaceWith(editor);
      editor.focus();
      if (editor) editor.select();

      const save = () => {
        const newText = editor.value.trim();
        if (newText) {
          const card = container.closest('.ai-auto-answer-card') as HTMLElement | null;
          if (card) {
            const recent = [...(refinementHistory.get(card) ?? [])].map((s) => (s === text ? newText : s));
            refinementHistory.set(card, recent);
          }
          const updated = [...new Set([...suggestions].map((s) => (s === text ? newText : s)))].slice(0, 3);
          renderSuggestionPills(container, updated);
        } else {
          renderSuggestionPills(container, suggestions);
        }
      };

      if (editor) editor.addEventListener('blur', save);
      if (editor) editor.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          editor.blur();
        }
      });
    });

    container.appendChild(pill);
  }

  if (!unique.length) {
    const placeholder = document.createElement('span');
    placeholder.className = 'ai-auto-answer-suggestions-empty';
    placeholder.textContent = 'Suggestions will appear here as you refine';
    container.appendChild(placeholder);
  }

  if (unique.length < 3) {
    const more = document.createElement('span');
    more.className = 'ai-auto-answer-suggestions-empty';
    more.textContent = `showing ${unique.length} of up to 3 suggestions`;
    container.appendChild(more);
  }
}

function toggleRefineChat(card, requestText) {
  if (!card) return;
  const panel = card.querySelector('.ai-auto-answer-card-chat');
  if (!panel) return;

  const isOpen = panel.classList.contains('open');

  if (isOpen) {
    panel.classList.remove('open');
    return;
  }

  renderChatMessages(card);
  panel.classList.add('open');
  const input = panel.querySelector('.ai-auto-answer-chat-input');
  if (input) input.focus();

  const suggestionsScroll = panel.querySelector('.ai-auto-answer-suggestions-scroll');
  if (suggestionsScroll) {
    const recent = refinementHistory.has(card) ? refinementHistory.get(card) ?? [] : [];
    const presets = SUGGESTION_PRESETS.filter((p) => !recent.includes(p));
    renderSuggestionPills(suggestionsScroll, [...recent, ...presets]);
  }
}

function renderChatMessages(card: HTMLElement) {
  if (!card) return;
  const panel = card.querySelector('.ai-auto-answer-card-chat');
  if (!panel) return;

  const messagesContainer = panel.querySelector('.ai-auto-answer-chat-messages');
  if (!messagesContainer) return;

  messagesContainer.innerHTML = '';
  const history = cardHistories.has(card) ? cardHistories.get(card) : [];
  const safeHistory = Array.isArray(history) ? history : [];
  let proposalIndex = 0;

  safeHistory.forEach((msg, idx) => {
    if (!msg || typeof msg.content !== 'string') return;
    const bubble = document.createElement('div');
    bubble.className = `ai-auto-answer-chat-bubble ${msg.role || 'assistant'}`;

    if (msg.role === 'assistant') {
      proposalIndex++;
      const versionBadge = document.createElement('span');
      versionBadge.className = 'ai-auto-answer-chat-version';
      versionBadge.textContent = `v${proposalIndex}`;

      const textSpan = document.createElement('span');
      textSpan.className = 'ai-auto-answer-chat-text';
      textSpan.textContent = msg.content;

      bubble.appendChild(versionBadge);
      bubble.appendChild(textSpan);

      if (idx === card._activeProposalIndex) {
        bubble.classList.add('active');
      }

      bubble.addEventListener('click', () => {
        card._activeProposalIndex = idx;
        const cardBody = card.querySelector('.ai-auto-answer-card-body');
        if (cardBody) cardBody.textContent = msg.content;
        renderChatMessages(card);
      });
    } else {
      bubble.textContent = msg.content;
    }

    messagesContainer.appendChild(bubble);
  });

  if (messagesContainer.scrollTop !== undefined) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function truncateLabel(text, maxLength = 60) {
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

function showToast(message) {
  removeExistingToast();

  const toast = document.createElement('div');
  toast.className = 'ai-auto-answer-toast';
  toast.textContent = message;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = `
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
  `;

  ensureToastStyles();
  document.body.appendChild(toast);
  setTimeout(removeExistingToast, 3000);
}

function removeExistingToast() {
  const existing = document.querySelector('.ai-auto-answer-toast');
  existing?.remove();
}

function ensureToastStyles() {
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
  `;
  document.head.appendChild(style);
}

function fillTextArea(text) {
  let field = findTextArea();

  if (!field && currentPlatform === PLATFORM.UPWORK) {
    field = document.querySelector('div[contenteditable="true"]') || document.querySelector('[role="textbox"]');
  }

  if (!field || !field.tagName) {
    console.warn('[AI Auto Answer] Could not find input field to fill');
    showToast('Could not find input field');
    return;
  }

  const safeText = typeof text === 'string' ? text : String(text || '');

  console.log('[AI Auto Answer] Filling field:', field.tagName, field.className, field.getAttribute('aria-label') || field.getAttribute('data-test') || '');

try {
     if (field.tagName === 'TEXTAREA' || field.tagName === 'INPUT') {
       const input = field as HTMLTextAreaElement | HTMLInputElement;
       input.value = safeText;
       input.dispatchEvent(new Event('input', { bubbles: true }));
       input.dispatchEvent(new Event('change', { bubbles: true }));
     } else if (field.isContentEditable) {
       field.focus();
       field.innerHTML = '';
       const textNode = document.createTextNode(safeText);
       field.appendChild(textNode);
       const inputEvent = new InputEvent('input', {
         bubbles: true,
         cancelable: true,
         inputType: 'insertText',
         data: safeText
       });
       field.dispatchEvent(inputEvent);
       field.dispatchEvent(new Event('change', { bubbles: true }));
     } else {
       field.textContent = safeText;
       field.dispatchEvent(new Event('input', { bubbles: true }));
       field.dispatchEvent(new Event('change', { bubbles: true }));
     }

     field.focus();
     field.scrollIntoView({ behavior: 'smooth', block: 'center' });
   } catch (error) {
     console.error('[AI Auto Answer] Failed to fill field:', error);
     showToast('Failed to fill field');
   }
}

// ============================================================================
// BACKGROUND COMMUNICATION
// ============================================================================

function getOptionsFromBackground(txt: string): Promise<string[]> {
  return new Promise<string[]>((resolve) => {
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
            resolve([response.data as string]);
          } else {
            console.error('[AI Auto Answer] Error:', response?.error);
            resolve([]);
          }
        }
      );
    });

    Promise.race([responsePromise, timeoutPromise])
      .then((result) => resolve(result as string[]))
      .catch(() => {
        console.error('[AI Auto Answer] Background response timeout');
        resolve([]);
      });
  });
}

function getRefinedProposal(originalRequest: string, currentProposal: string, refinementPrompt: string, history: unknown): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
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
      .then((result) => resolve(result as string | null))
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

  const txt = typeof details.textContent === 'string' ? details.textContent : '';
  currentRequestText = txt;
  if (!txt) {
    console.warn('[AI Auto Answer] Question detail element has no text content');
    return [];
  }
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

  const rawValue = (textField instanceof HTMLTextAreaElement || textField instanceof HTMLInputElement)
    ? textField.value
    : textField.textContent || '';
  const userResponse = String(rawValue).trim();
  if (!userResponse) {
    showToast('No response to save');
    return;
  }

  const safeRequest = typeof requestText === 'string' ? requestText : '';
  chrome.runtime.sendMessage(
    { action: 'saveResponse', request: safeRequest, response: userResponse, platform: currentPlatform },
    (res) => {
      if (chrome.runtime.lastError) {
        showToast('Save failed: ' + chrome.runtime.lastError.message);
        return;
      }
      const success = res && typeof res === 'object' ? res.success : false;
      const error = res && typeof res === 'object' ? res.error : 'unknown';
      showToast(success ? 'Response saved!' : 'Save failed: ' + error);
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
    @keyframes aiAutoAnswerPulse {
      0%, 100% { border-color: #10b981; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { border-color: #34d399; box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1); }
    }
    .ai-auto-answer-loading-pulse {
      animation: aiAutoAnswerPulse 2s ease-in-out infinite;
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
      position: fixed;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: cardIn 0.3s ease-out;
      width: 520px;
      max-width: calc(100vw - 24px);
      z-index: 2147483647;
    }
    .ai-auto-answer-card.minimized .ai-auto-answer-card-body,
    .ai-auto-answer-card.minimized .ai-auto-answer-card-actions,
    .ai-auto-answer-card.minimized .ai-auto-answer-card-chat {
      display: none;
    }
    .ai-auto-answer-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      cursor: move;
      user-select: none;
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
      margin-left: 8px;
    }
    .ai-auto-answer-card-controls {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
    }
    .ai-auto-answer-control-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      color: #475569;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
    }
    .ai-auto-answer-control-btn:hover {
      background: #f1f5f9;
      color: #0f172a;
    }
    .ai-auto-answer-card-body {
      padding: 14px;
      font-size: 13px;
      line-height: 1.7;
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
      gap: 12px;
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
      cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .ai-auto-answer-chat-bubble.assistant:hover {
      border-color: #10b981;
      background: #f6feff;
    }
    .ai-auto-answer-chat-bubble.assistant.active {
      border-color: #10b981;
      background: #f0fdf6;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.15);
    }
    .ai-auto-answer-chat-version {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
      padding: 1px 8px;
      border-radius: 9999px;
      background: #e2e8f0;
      color: #475569;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.4;
    }
    .ai-auto-answer-chat-bubble.assistant.active .ai-auto-answer-chat-version {
      background: #10b981;
      color: #ffffff;
    }
    .ai-auto-answer-chat-text {
      display: block;
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.6;
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
    .ai-auto-answer-suggestions-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }
    .ai-auto-answer-suggestions-scroll {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      scroll-snap-type: x proximity;
      padding-bottom: 4px;
      flex: 1;
      scrollbar-width: none;
    }
    .ai-auto-answer-suggestions-scroll::-webkit-scrollbar {
      display: none;
    }
    .ai-auto-answer-suggestion-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 10px;
      border-radius: 9999px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
      color: #475569;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.3;
      white-space: nowrap;
      scroll-snap-align: start;
      cursor: pointer;
      transition: transform 0.1s ease, border-color 0.15s ease;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .ai-auto-answer-suggestion-pill:hover {
      border-color: #10b981;
      color: #0f172a;
      transform: translateY(-1px);
    }
    .ai-auto-answer-suggestion-pill:active {
      transform: translateY(0);
    }
    .ai-auto-answer-suggestions-reset {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid transparent;
      background: transparent;
      color: #94a3b8;
      font-size: 10px;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.15s ease;
      white-space: nowrap;
    }
    .ai-auto-answer-suggestions-reset:hover {
      color: #0f172a;
    }
    .ai-auto-answer-suggestions-empty {
      color: #94a3b8;
      font-size: 11px;
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// DOM SELECTORS
// ============================================================================

function findQuestionDetail() {
  return findFirst(getSelectors('questionDetail'), (el) => {
    const text = typeof el.textContent === 'string' ? el.textContent.trim() : '';
    return text.length > 50;
  });
}

function findTextArea() {
  return findFirst(getSelectors('textArea'), (el) => {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
    return true;
  });
}

function findUpworkCoverLetter(): HTMLElement | null {
  console.log('[AI Auto Answer] Upwork: scanning for cover letter field...');

  const coverLetterArea = document.querySelector('.cover-letter-area');
  if (coverLetterArea) {
    const textarea = coverLetterArea.querySelector('textarea');
    if (textarea) {
      const style = window.getComputedStyle(textarea);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      const hasSize = textarea.offsetWidth > 0 || textarea.offsetHeight > 0;
      if (isVisible && hasSize) {
        console.log('[AI Auto Answer] Upwork: found cover letter textarea in .cover-letter-area');
        return textarea as HTMLElement;
      }
    }

    const contentEditable = coverLetterArea.querySelector('div[contenteditable="true"], [role="textbox"]');
    if (contentEditable) {
      const style = window.getComputedStyle(contentEditable);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      if (isVisible) {
        console.log('[AI Auto Answer] Upwork: found contenteditable in .cover-letter-area');
        return contentEditable as HTMLElement;
      }
    }
  }

  const label = document.querySelector('#cover_letter_label');
  if (label) {
    const input = label.closest('.form-group')?.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
    if (input) {
      const style = window.getComputedStyle(input);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      const htmlInput = input as HTMLElement;
      const hasSize = htmlInput.offsetWidth > 0 || htmlInput.offsetHeight > 0 || input.tagName === 'TEXTAREA';
      if (isVisible && hasSize) {
        console.log('[AI Auto Answer] Upwork: found cover letter input via #cover_letter_label');
        return input as HTMLElement;
      }
    }
  }

  const additionalDetails = document.querySelector('.fe-proposal-additional-details, .additional-details');
  if (additionalDetails) {
    const input = additionalDetails.querySelector('textarea, div[contenteditable="true"], [role="textbox"]');
    if (input) {
      const style = window.getComputedStyle(input);
      const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
      const htmlInput = input as HTMLElement;
      const hasSize = htmlInput.offsetWidth > 0 || htmlInput.offsetHeight > 0 || input.tagName === 'TEXTAREA';
      if (isVisible && hasSize) {
        console.log('[AI Auto Answer] Upwork: found cover letter input via .fe-proposal-additional-details');
        return input as HTMLElement;
      }
    }
  }

  console.log('[AI Auto Answer] Upwork: nested search failed, trying fallback selectors...');

  const fallbackSelectors = [
    'textarea[aria-labelledby="cover_letter_label"]',
    'textarea.air3-textarea',
    'textarea.inner-textarea',
    'div[contenteditable="true"]',
    '[role="textbox"]',
    'textarea'
  ];

  for (const selector of fallbackSelectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
        const htmlEl = el as HTMLElement;
        const hasSize = htmlEl.offsetWidth > 0 || htmlEl.offsetHeight > 0 || el.tagName === 'TEXTAREA';
        console.log('[AI Auto Answer] Upwork: fallback selector', selector, 'visible:', isVisible, 'size:', hasSize);
        if (isVisible && hasSize) {
          console.log('[AI Auto Answer] Upwork: selected cover letter input via fallback');
          return el as HTMLElement;
        }
      }
    } catch {}
  }

  console.warn('[AI Auto Answer] Upwork: no cover letter input found on page');
  return null;
}

function findSubmitButton() {
  return findFirst(getSelectors('submitButton'), (btn) => !btn.classList.contains('ai-auto-answer-btn'));
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let currentRequestText = '';
let isInitializing = false;
let lastInitedUrl = location.href;
let pollHandle = null;
let pollGeneration = 0;

function cleanupExtension() {
  document.querySelector('.ai-auto-answer-card')?.remove();
  ensureStyles();
  stopUpworkObserver();
  if (pollHandle) {
    clearTimeout(pollHandle);
    pollHandle = null;
  }
  stopCoverLetterAnimation();
  currentRequestText = '';
  isInitializing = false;
  sessionStorage.removeItem('ai-auto-answer-card-position');
}

function isMatchingCodeMentorPage() {
  return /^https:\/\/www\.codementor\.io\/m\/dashboard\/open-requests\//.test(location.href);
}

function isMatchingUpworkPage() {
  return /^https:\/\/www\.upwork\.com\/nx\/proposals\/job\/.+\/apply\//.test(location.href);
}

function init() {
  if (!currentPlatform) {
    console.log('[AI Auto Answer] Unsupported platform');
    return false;
  }

  if (currentPlatform === PLATFORM.CODEMENTOR && !isMatchingCodeMentorPage()) {
    cleanupExtension();
    return false;
  }

  if (currentPlatform === PLATFORM.UPWORK && !isMatchingUpworkPage()) {
    cleanupExtension();
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
  if (!isMatchingCodeMentorPage()) {
    cleanupExtension();
    return false;
  }

  const targetButton = findSubmitButton();
  if (!targetButton) {
    console.warn('[AI Auto Answer] Could not find submit button, retrying...');
    return false;
  }

  const textArea = findTextArea();
  const anchorEl = textArea || targetButton;
  if (textArea) startCoverLetterAnimation(textArea);

  isInitializing = true;

  return createOptions().then((options: string[]) => {
    if (options.length === 0) {
      console.log('[AI Auto Answer] No options generated');
      return false;
    }

    const card = createProposalCard(options[0], currentRequestText || '', anchorEl);
    document.body.appendChild(card);
    console.log('[AI Auto Answer] Card injected successfully');
    lastInitedUrl = location.href;
    return true;
  }).catch((err) => {
    console.error('[AI Auto Answer] Failed to create options:', err);
    return false;
  }).finally(() => {
    isInitializing = false;
    stopCoverLetterAnimation();
  });
}

let upworkObserver = null;

function startUpworkObserver() {
  if (upworkObserver) return;

  upworkObserver = new MutationObserver(() => {
    if (document.querySelector('.ai-auto-answer-card')) return;
    if (!isMatchingUpworkPage()) return;
    if (findUpworkCoverLetter()) {
      upworkObserver.disconnect();
      upworkObserver = null;
      startExtension();
    }
  });

  upworkObserver.observe(document.body, { childList: true, subtree: true });
}

function stopUpworkObserver() {
  if (upworkObserver) {
    upworkObserver.disconnect();
    upworkObserver = null;
  }
}

let coverLetterAnimation = null;

function startCoverLetterAnimation(textArea: HTMLElement) {
  if (!textArea) return;
  stopCoverLetterAnimation();
  textArea.classList.add('ai-auto-answer-loading-pulse');
  coverLetterAnimation = setInterval(() => {
    textArea.classList.add('ai-auto-answer-loading-pulse');
  }, 2000);
}

function stopCoverLetterAnimation() {
  if (coverLetterAnimation) {
    clearInterval(coverLetterAnimation);
    coverLetterAnimation = null;
  }
  document.querySelectorAll('.ai-auto-answer-loading-pulse').forEach((el) => {
    el.classList.remove('ai-auto-answer-loading-pulse');
  });
}

function initUpwork() {
  if (!isMatchingUpworkPage()) {
    cleanupExtension();
    return false;
  }

  const textArea = findUpworkCoverLetter();
  if (!textArea) {
    console.warn('[AI Auto Answer] Could not find cover letter textarea, retrying...');
    startUpworkObserver();
    return false;
  }

  stopUpworkObserver();
  startCoverLetterAnimation(textArea);

  isInitializing = true;

  return createOptions().then((options: string[]) => {
    if (options.length === 0) {
      console.log('[AI Auto Answer] No options generated');
      return false;
    }

    const card = createProposalCard(options[0], currentRequestText || '', textArea);
    document.body.appendChild(card);
    console.log('[AI Auto Answer] Upwork card injected successfully');
    lastInitedUrl = location.href;
    return true;
  }).catch((err) => {
    console.error('[AI Auto Answer] Failed to create options:', err);
    return false;
  }).finally(() => {
    isInitializing = false;
    stopCoverLetterAnimation();
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
      const ready = await init() as boolean;
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

  if (currentPlatform === PLATFORM.CODEMENTOR && !isMatchingCodeMentorPage()) {
    cleanupExtension();
    return;
  }

  if (currentPlatform === PLATFORM.UPWORK && !isMatchingUpworkPage()) {
    cleanupExtension();
    return;
  }

  stopUpworkObserver();

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

  sessionStorage.removeItem('ai-auto-answer-card-position');

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

  if (currentPlatform === PLATFORM.CODEMENTOR && !isMatchingCodeMentorPage()) {
    cleanupExtension();
    return;
  }

  if (currentPlatform === PLATFORM.UPWORK && !isMatchingUpworkPage()) {
    cleanupExtension();
    return;
  }

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
