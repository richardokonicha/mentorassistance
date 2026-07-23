// Load saved keys on popup open
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get({ kiloApiKey: "", groqApiKey: "" }, (data) => {
    document.getElementById("kiloApiKey").value = data.kiloApiKey || "";
    document.getElementById("groqApiKey").value = data.groqApiKey || "";
  });
});

function showStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.className = isError ? "error" : "success";
  setTimeout(() => {
    status.className = "";
  }, 3000);
}

// Save Kilo API key
document.getElementById("saveKiloKey").addEventListener("click", () => {
  const apiKey = document.getElementById("kiloApiKey").value.trim();
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

// Save Groq API key
document.getElementById("saveGroqKey").addEventListener("click", () => {
  const apiKey = document.getElementById("groqApiKey").value.trim();
  if (!apiKey) {
    showStatus("Please enter a Groq API key", true);
    return;
  }
  chrome.storage.sync.set({ groqApiKey: apiKey }, () => {
    showStatus("Groq API key saved!");
  });
});

// Test connection
document.getElementById("testConnection").addEventListener("click", async () => {
  showStatus("Testing...");
  
  // Test Kilo if key exists
  const kiloKey = document.getElementById("kiloApiKey").value.trim();
  const groqKey = document.getElementById("groqApiKey").value.trim();
  
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
          max_tokens: 10
        })
      });
      if (res.ok) {
        showStatus("Kilo: Connected ✓");
        return;
      } else {
        showStatus("Kilo: Failed (" + res.status + ")", true);
      }
    } catch (e) {
      showStatus("Kilo: Error - " + e.message, true);
    }
  }
  
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
        showStatus("Groq: Connected ✓");
      } else {
        showStatus("Groq: Failed (" + res.status + ")", true);
      }
    } catch (e) {
      showStatus("Groq: Error - " + e.message, true);
    }
  }
  
  if (!kiloKey && !groqKey) {
    showStatus("No API keys configured", true);
  }
});
