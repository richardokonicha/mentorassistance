// Function to create a button with a given label
function createButton(label) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.style.cssText = `
  cursor: pointer;
  color: #2f3e46; /* Darker text color for better readability */
  background-color: #ffffff; /* White background */
  border: 1px solid #d3e1e8; /* Soft light gray border */
  border-radius: 8px; /* Rounded corners for a smoother, softer look */
  box-shadow: 0 1px 3px #027E6F; /* Subtle shadow for depth */
  padding: 8px 8px; /* Slightly larger padding for better touch targets */
  font-family: 'Inter', sans-serif; /* Clean and modern font */
  font-weight: 400; /* Medium weight for readability */
  font-size: 10px; /* Slightly larger font size */
  line-height: 1.5; /* Comfortable line spacing */
  display: inline-flex;
  text-align: left; 
  transition: all 0.2s ease-in-out; /* Smooth transition for hover effects */
`;

newButton.addEventListener("mouseover", () => {
  newButton.style.backgroundColor = "#f6f9fc"; /* Light gray with a hint of blue on hover */
  newButton.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)"; /* Slightly enhanced shadow */
  newButton.style.transform = "scale(1.05)"; /* Slight zoom effect on hover */
});

newButton.addEventListener("mouseout", () => {
  newButton.style.backgroundColor = "#ffffff"; /* Revert to white */
  newButton.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.1)"; /* Revert shadow */
  newButton.style.transform = "scale(1)"; /* Revert zoom effect */
});

  newButton.addEventListener("click", (event) => {
    event.preventDefault();
    const textField = document.querySelector("form textarea");
    if (textField) {
      // Append the label instead of replacing the text
      const currentValue = textField.value;
      textField.value = currentValue ? `${currentValue} ${label}` : label;

      // Set focus on the text field so the user can continue typing
      // Trigger the 'input' event to update word count
      const event = new Event("input", { bubbles: true });
      textField.dispatchEvent(event);
    }
  });

  return newButton;
}

// Function to create buttons from the options
function createButtons(options) {
  const buttonContainer = document.createElement("div");
  buttonContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        margin-bottom: 10px;
    `;

  options.forEach((option) => {
    buttonContainer.appendChild(createButton(option));
  });

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

  // Send text to background script for processing
  const options = await getOptionsFromBackground(txt);
  return options;
}

const interval = setInterval(() => {
  const targetButton = document.querySelector("form button");
  if (targetButton) {
    clearInterval(interval);
    createOptions().then((options) => {
      const buttonsContainer = createButtons(options);
      targetButton.parentNode.insertBefore(buttonsContainer, targetButton);
    });
  }
}, 100);
