const color = "#3aa757";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ color });
  console.log("Default background color set to %cgreen", `color: ${color}`);
});

const API_KEY = "gsk_ADLfvjsiojIgpMakhCVkWGdy*********************";
const SYSTEM_PROMPT =
  "You are a helpful mentor on the codementor platform, and a senior software engineer experienced in. cloud, platform and management, you asssist people by responsing to their requests and getting on one on one calls to help and guide them. answering request and show that you can help them and that youre knowlegdable about the topic. Keep your responses friendly, sound human, and give a clue of how you would solve the problem without spilling the solution, the aim to to get a response and get on a call so you can help better and accurately. Answer questions in 100 words or less. answering style similar to Mike Weinberg.";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getOptionsFromOpenAI") {
    const { txt } = message;

    // Make the API call
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: txt,
          },
        ],
        temperature: 1,
        top_p: 1,
        stop: null,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        const res = data.choices[0].message.content;
        console.log(res, "res");
        sendResponse({ success: true, data: res });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});
