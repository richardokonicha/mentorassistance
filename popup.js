/**
 * AI Auto Answer - Popup UI
 * API key management and connection testing
 */

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
  kiloApiKey: document.getElementById("kiloApiKey"),
  groqApiKey: document.getElementById("groqApiKey"),
  saveKiloKey: document.getElementById("saveKiloKey"),
  saveGroqKey: document.getElementById("saveGroqKey"),
  testConnection: document.getElementById("testConnection"),
  status: document.getElementById("status")
};

// ============================================================================
// STATUS HELPERS
// ============================================================================

function showStatus(message, isError = false) {
  const status = elements.status;
  status.textContent = message;
  status.className = isError ? "error" : "success";
  status.style.display = "block";
  
  clearTimeout(window.statusTimeout);
  window.statusTimeout = setTimeout(() => {
    status.style.display = "none";
    status.className = "";
  }, 4000);
}

// ============================================================================
// LOAD SAVED KEYS
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get({ 
    kiloApiKey: "", 
    groqApiKey: "" 
  }, (data) => {
    elements.kiloApiKey.value = data.kiloApiKey || "";
    elements.groqApiKey.value = data.groqApiKey || "";
  });
});

// ============================================================================
// SAVE HANDLERS
// ============================================================================

elements.saveKiloKey.addEventListener("click", () => {
  const apiKey = elements.kiloApiKey.value.trim();
  if (!apiKey) {
    showStatus("Please enter a Kilo API key", true);
    return;
  }
  
  chrome.runtime.sendMessage({ action: "saveKiloApiKey", apiKey }, (res) => {
    if (res?.success) {
      showStatus("Kilo API key saved!");
      chrome.storage.sync.set({ kiloApiKey: apiKey });
    } else {
      showStatus("Failed to save: " + (res?.error || "unknown"), true);
    }
  });
});

elements.saveGroqKey.addEventListener("click", () => {
  const apiKey = elements.groqApiKey.value.trim();
  if (!apiKey) {
    showStatus("Please enter a Groq API key", true);
    return;
  }
  
  chrome.storage.sync.set({ groqApiKey: apiKey }, () => {
    showStatus("Groq API key saved!");
  });
});

// ============================================================================
// TEST CONNECTION
// ============================================================================

elements.testConnection.addEventListener("click", async () => {
  showStatus("Testing...");
  
  const kiloKey = elements.kiloApiKey.value.trim();
  const groqKey = elements.groqApiKey.value.trim();
  let anySuccess = false;
  
  // Test Kilo if key exists
  if (kiloKey) {
    try {
      const res = await fetch("https://api.kilo.ai/api/gateway/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${kiloKey}`
        },
        body: JSON.stringify({
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 10,
          reasoning: { enabled: false }
        })
      });
      
      if (res.ok) {
        showStatus("Kilo: Connected ✓");
        anySuccess = true;
      } else {
        showStatus("Kilo: Failed (" + res.status + ")", true);
      }
    } catch (e) {
      showStatus("Kilo: Error - " + e.message, true);
    }
  }
  
  // Test Groq if key exists
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 10
        })
      });
      
      if (res.ok) {
        showStatus(anySuccess ? "Kilo & Groq: Connected ✓" : "Groq: Connected ✓");
        anySuccess = true;
      } else {
        showStatus(anySuccess ? "Groq: Failed (" + res.status + ")" : "Groq: Failed (" + res.status + ")", true);
      }
    } catch (e) {
      showStatus(anySuccess ? "Groq: Error - " + e.message : "Groq: Error - " + e.message, true);
    }
  }
  
  if (!kiloKey && !groqKey) {
    showStatus("No API keys configured", true);
  }
});
