// Function to create a button with a given label
function createButton(label, onClick) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.style.cssText = `
  cursor: pointer;
  color: #2f3e46;
  background-color: #ffffff;
  border: 1px solid #d3e1e8;
  border-radius: 8px;
  box-shadow: 0 1px 3px #027E6F;
  padding: 8px 8px;
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 10px;
  line-height: 1.5;
  display: inline-flex;
  text-align: left;
  transition: all 0.2s ease-in-out;
`;

  newButton.addEventListener("mouseover", () => {
    newButton.style.backgroundColor = "#f6f9fc";
    newButton.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
    newButton.style.transform = "scale(1.05)";
  });

  newButton.addEventListener("mouseout", () => {
    newButton.style.backgroundColor = "#ffffff";
    newButton.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)";
    newButton.style.transform = "scale(1)";
  });

  newButton.addEventListener("click", (event) => {
    event.preventDefault();
    if (onClick) onClick(event);
  });

  return newButton;
}

// Function to create buttons from the options
function createButtons(options, requestText) {
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        margin-bottom: 10px;
        gap: 8px;
    `;

  options.forEach((option) => {
    buttonContainer.appendChild(createButton(option, (e) => {
      const textField = document.querySelector("form textarea");
      if (textField) {
        const currentValue = textField.value;
        textField.value = currentValue ? `${currentValue} ${option}` : option;
        const event = new Event("input", { bubbles: true });
        textField.dispatchEvent(event);
        textField.focus();
      }
    }));
  });

  // Add Save Response button
  const saveButton = createButton("💾 Save Response", () => {
    captureAndSaveResponse(requestText);
  });
  saveButton.style.backgroundColor = "#e8f5e9";
  saveButton.style.borderColor = "#4caf50";
  saveButton.style.fontWeight = "600";
  buttonContainer.appendChild(saveButton);

  return buttonContainer;
}

// Function to send text to the background script for inference
function getOptionsFromBackground(txt) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "getOptionsFromOpenAI", txt },
      (response) => {
        if (response.success) {
          resolve([response.data]);
        } else {
          console.error("Error:", response.error);
          resolve([]);
        }
      }
    );
  });
}

// Function to create options based on text content
async function createOptions() {
  const details = document.querySelector("div.question-detail");
  const txt = details.innerText;

  // Store for later capture
  currentRequestText = txt;

  // Send text to background script for processing
  const options = await getOptionsFromBackground(txt);
  return options;
}

// Store the request text for later capture
let currentRequestText = "";

// Capture user's final response and save to storage
async function captureAndSaveResponse(requestText) {
  const textField = document.querySelector("form textarea");
  if (!textField) return;
  
  const userResponse = textField.value.trim();
  if (!userResponse) {
    alert("No response to save");
    return;
  }

  // Send to background for storage
  chrome.runtime.sendMessage({
    action: "saveResponse",
    request: requestText,
    response: userResponse
  }, (res) => {
    if (res?.success) {
      showToast("Response saved!");
    } else {
      showToast("Save failed: " + (res?.error || "unknown"));
    }
  });
}

// Simple toast notification
function showToast(message) {
  const toast = document.createElement("div");
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
    font-family: Inter, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Extract tags from request text
function extractTags(text) {
  const keywords = [
    'aws', 'gcp', 'azure', 'cloud',
    'terraform', 'pulumi', 'cloudformation',
    'kubernetes', 'k8s', 'docker', 'container',
    'ci/cd', 'github actions', 'gitlab', 'jenkins',
    'python', 'javascript', 'typescript', 'go', 'rust', 'java',
    'react', 'vue', 'nextjs', 'node',
    'postgres', 'mysql', 'mongodb', 'redis', 'database',
    'microservices', 'architecture', 'system design',
    'debugging', 'performance', 'scaling',
    'career', 'mentoring', 'interview'
  ];
  const lower = text.toLowerCase();
  return keywords.filter(k => lower.includes(k.toLowerCase()));
}

const interval = setInterval(() => {
  const targetButton = document.querySelector("form button");
  if (targetButton) {
    clearInterval(interval);
    createOptions().then((options) => {
      const buttonsContainer = createButtons(options, currentRequestText);
      targetButton.parentNode.insertBefore(buttonsContainer, targetButton);
    });
  }
}, 100);
