/**
 * AI Auto Answer - Content Script
 * Injects AI response buttons into CodeMentor request pages
 */

// ============================================================================
// BUTTON CREATION
// ============================================================================

function createButton(label, onClick) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.className = "ai-auto-answer-btn";
  newButton.dataset.label = label;
  
  newButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (onClick) onClick(event);
  });

  return newButton;
}

function createButtons(options, requestText) {
  const buttonContainer = document.createElement("div");
  buttonContainer.className = "ai-auto-answer-container";
  buttonContainer.setAttribute("role", "group");
  buttonContainer.setAttribute("aria-label", "AI generated responses");

  options.forEach((option, index) => {
    const btn = createButton(option, (e) => {
      const textField = findTextArea();
      if (textField) {
        const currentValue = textField.value;
        textField.value = currentValue ? `${currentValue} ${option}` : option;
        textField.dispatchEvent(new Event("input", { bubbles: true }));
        textField.focus();
      }
    });
    btn.dataset.index = index;
    buttonContainer.appendChild(btn);
  });

  // Add Save Response button
  const saveButton = createButton("💾 Save Response", () => {
    captureAndSaveResponse(requestText);
  });
  saveButton.classList.add("ai-auto-answer-save");
  buttonContainer.appendChild(saveButton);

  return buttonContainer;
}

// ============================================================================
// BACKGROUND COMMUNICATION
// ============================================================================

function getOptionsFromBackground(txt) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getOptionsFromOpenAI", txt },
      (response) => {
        if (response?.success) {
          resolve([response.data]);
        } else {
          console.error("[AI Auto Answer] Error:", response?.error);
          resolve([]);
        }
      }
    );
  });
}

async function createOptions() {
  const details = findQuestionDetail();
  if (!details) {
    console.warn("[AI Auto Answer] Could not find question detail element");
    return [];
  }
  
  const txt = details.innerText;

  // Store for later capture
  window.currentRequestText = txt;

  const options = await getOptionsFromBackground(txt);
  return options;
}

// ============================================================================
// DOM SELECTORS (with fallbacks)
// ============================================================================

function findQuestionDetail() {
  // Try multiple selectors for resilience
  const selectors = [
    "div.question-detail",
    "[data-testid='question-detail']",
    ".question-content",
    ".request-description",
    "div[class*='question']",
    "div[class*='detail']"
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText.trim().length > 50) {
      return el;
    }
  }
  return null;
}

function findTextArea() {
  const selectors = [
    "form textarea",
    "textarea[name='response']",
    "textarea[placeholder*='response' i]",
    "textarea[placeholder*='message' i]",
    "div[contenteditable='true']"
  ];
  
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function findSubmitButton() {
  const selectors = [
    "form button[type='submit']",
    "button[type='submit']",
    "form button:not(.ai-auto-answer-btn)",
    "button[data-testid='submit-button']"
  ];
  
  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn && !btn.classList.contains("ai-auto-answer-btn")) {
      return btn;
    }
  }
  return null;
}

// ============================================================================
// RESPONSE CAPTURE
// ============================================================================

async function captureAndSaveResponse(requestText) {
  const textField = findTextArea();
  if (!textField) {
    showToast("Could not find response field");
    return;
  }
  
  const userResponse = (textField.value || textField.textContent || "").trim();
  if (!userResponse) {
    showToast("No response to save");
    return;
  }

  chrome.runtime.sendMessage(
    { action: "saveResponse", request: requestText, response: userResponse },
    (res) => {
      if (res?.success) {
        showToast("Response saved!");
      } else {
        showToast("Save failed: " + (res?.error || "unknown"));
      }
    }
  );
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector(".ai-auto-answer-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "ai-auto-answer-toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #333;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    z-index: 10000;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    animation: slideIn 0.3s ease-out;
  `;
  
  // Add animation style if not exists
  if (!document.getElementById("ai-auto-answer-styles")) {
    const style = document.createElement("style");
    style.id = "ai-auto-answer-styles";
    style.textContent = `
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .ai-auto-answer-container {
        display: flex;
        flex-wrap: wrap;
        margin-bottom: 10px;
        gap: 8px;
      }
      .ai-auto-answer-btn {
        cursor: pointer;
        color: #2f3e46;
        background-color: #ffffff;
        border: 1px solid #d3e1e8;
        border-radius: 8px;
        box-shadow: 0 1px 3px #027E6F;
        padding: 8px 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-weight: 400;
        font-size: 12px;
        line-height: 1.4;
        display: inline-flex;
        align-items: center;
        transition: all 0.2s ease-in-out;
        max-width: 280px;
        white-space: normal;
        word-wrap: break-word;
      }
      .ai-auto-answer-btn:hover {
        background-color: #f6f9fc;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        transform: scale(1.02);
      }
      .ai-auto-answer-btn.ai-auto-answer-save {
        background-color: #e8f5e9;
        border-color: #4caf50;
        font-weight: 600;
      }
      .ai-auto-answer-btn.ai-auto-answer-save:hover {
        background-color: #c8e6c9;
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function init() {
  const targetButton = findSubmitButton();
  if (!targetButton) {
    console.warn("[AI Auto Answer] Could not find submit button, retrying...");
    return false;
  }

  createOptions().then((options) => {
    if (options.length === 0) {
      console.log("[AI Auto Answer] No options generated");
      return;
    }
    
    const buttonsContainer = createButtons(options, window.currentRequestText || "");
    targetButton.parentNode.insertBefore(buttonsContainer, targetButton);
    console.log("[AI Auto Answer] Buttons injected successfully");
  }).catch((err) => {
    console.error("[AI Auto Answer] Failed to create options:", err);
  });
  
  return true;
}

// Poll for the submit button with timeout
let attempts = 0;
const maxAttempts = 50; // 5 seconds max

const interval = setInterval(() => {
  attempts++;
  
  if (init()) {
    clearInterval(interval);
  } else if (attempts >= maxAttempts) {
    clearInterval(interval);
    console.error("[AI Auto Answer] Initialization timeout - could not find submit button");
  }
}, 100);

// Cleanup on unload
window.addEventListener("beforeunload", () => {
  clearInterval(interval);
});
