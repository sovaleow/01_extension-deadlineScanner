console.log("CONTENT SCRIPT LOADED");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("MESSAGE RECEIVED");

    if (request.action === "getPageText") {
        sendResponse({
            text: document.body.innerText
        });
    }
});