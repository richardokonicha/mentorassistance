// // Listen for double-clicks to capture selected text
// document.addEventListener("dblclick", () => {
//     const selectedText = window.getSelection().toString().trim();
//     if (selectedText) {
//         // Send the selected text to the background script
//         chrome.runtime.sendMessage({ type: "processText", text: selectedText }, (response) => {
//             // Find the first input box on the page and fill it with the response
//             const inputBox = document.querySelector("input[type='text'], textarea");
//             if (inputBox) {
//                 inputBox.value = response.answer;
//             } else {
//                 console.error("No input box found on the page.");
//             }
//         });
//     }
// });

// // Locate the submit button
// console.log("Hello from content.js");
// const submitButton = document.querySelector('form button');

// // Create the new button
// const fillerButton = document.createElement("button");
// fillerButton.textContent = "Auto Fill";
// fillerButton.style.marginLeft = "10px";
// fillerButton.style.padding = "8px 12px";
// fillerButton.style.backgroundColor = "#4CAF50";
// fillerButton.style.color = "white";
// fillerButton.style.border = "none";
// fillerButton.style.borderRadius = "4px";
// fillerButton.style.cursor = "pointer";

// // Insert the button next to the submit button
// submitButton.parentNode.insertBefore(fillerButton, submitButton.nextSibling);

// // Define the predefined text
// const predefinedText =
//     "Hello! I have experience with similar projects and can help troubleshoot the deployment process. Could you provide more details about the libraries you're using?";

// // Add click event to fill the text field
// fillerButton.addEventListener("click", () => {
//     const textField = document.querySelector('form textarea');
//     if (textField) {
//     textField.value = predefinedText;
//     } else {
//     alert("Text field not found!");
//     }
// });
