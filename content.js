console.log("CONTENT SCRIPT LOADED");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("MESSAGE RECEIVED");

    if (request.action === "getPageText") {
        sendResponse({
            text: document.body.innerHTML
        });
        // const titles = [...document.querySelectorAll("h3")]
        //     .map(h3 => h3.innerText);

        // console.log("Titles found:", titles);

        // sendResponse({
        //     text: document.body.innerText,
        //     titles: titles
        // });
    }
});