console.log("CONTENT SCRIPT LOADED");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "getPageText") {

        const blocks = [];

        // Change this selector to match the structure of the target website
        const announcements = document.querySelectorAll(".announcement");

        announcements.forEach(el => {
            const title = el.querySelector("h3")?.innerText || el.innerText.split("\n")[0];
            const text = el.innerText;

            blocks.push({
                title: title,
                text: text
            });
        });
    
        sendResponse({
            blocks:blocks
        });     
    }
   
    return true; // Keep the message channel open for sendResponse
});