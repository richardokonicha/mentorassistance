const color = '#3aa757';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ color });
  console.log('Default background color set to %cgreen', `color: ${color}`);
});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "processText") {
        // Replace with your API endpoint and key
        const API_URL = "https://api.openai.com/v1/completions";
        const API_KEY = "YOUR_API_KEY";

        // Prepare the payload for the API request
        const requestBody = {
            model: "text-davinci-003", // Adjust model as needed
            prompt: message.text,
            max_tokens: 100, // Limit response length
            temperature: 0.7, // Adjust creativity level
        };

        // Make the API call
        fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${API_KEY}`,
            },
            body: JSON.stringify(requestBody),
        })
            .then((response) => response.json())
            .then((data) => {
                if (data.choices && data.choices.length > 0) {
                    sendResponse({ answer: data.choices[0].text.trim() });
                } else {
                    sendResponse({ answer: "No response from the AI model." });
                }
            })
            .catch((error) => {
                console.error("Error communicating with API:", error);
                sendResponse({ answer: "Error generating response." });
            });

        // Indicate that the response will be sent asynchronously
        return true;
    }
});
