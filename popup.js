document.getElementById("saveButton").addEventListener("click", () => {
    const apiKey = document.getElementById("apiKey").value.trim();
    chrome.storage.sync.set({ apiKey }, () => {
        document.getElementById("status").innerText = "API key saved!";
        setTimeout(() => {
            document.getElementById("status").innerText = "";
        }, 2000);
    });
});
