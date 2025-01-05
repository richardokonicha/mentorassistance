// Function to create a button with a given label
function createButton(label) {
  const newButton = document.createElement("button");
  newButton.textContent = label;
  newButton.style.cssText = `
    cursor: pointer;
    color: #374151; /* Neutral gray text color */
    background-color: #ffffff; /* White background */
    border: 1px solidrgb(228, 243, 247); /* Light gray border */
    border-radius: 2px; /* Rounded corners for modern look */
    box-shadow: 0 1px 2px #00b5e2; /* Subtle shadow for depth */
    padding: 2px 2px; /* Compact padding */
    font-family: 'Open Sans', sans-serif; /* Modern font */
    font-weight: 400; /* Medium font weight for readability */
    font-size: 10px; /* Small font size */
    line-height: 1.3; /* Comfortable line spacing */
    display: inline-flex;
    text-align: left; 
    // align-items: center; /* Center content vertically */
    // justify-content: center; /* Center content horizontally */
    transition: all 0.2s ease-in-out; /* Smooth transition for hover effects */
`;



  newButton.addEventListener("mouseover", () => {
    newButton.style.backgroundColor = "#f3f4f6"; /* Light gray on hover */
    newButton.style.boxShadow =
      "0 2px 4px rgba(0, 0, 0, 0.1)"; /* Enhanced shadow on hover */
  });

  newButton.addEventListener("mouseout", () => {
    newButton.style.backgroundColor = "#ffffff"; /* Revert to white */
    newButton.style.boxShadow =
      "0 1px 2px rgba(0, 0, 0, 0.05)"; /* Revert shadow */
  });

  newButton.addEventListener("click", () => {
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
