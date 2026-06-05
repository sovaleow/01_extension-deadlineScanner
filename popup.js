const main = document.getElementById("scanButton");
const container = document.querySelector(".update-container");

function handleClick() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageText' }, (response) => {
            if (chrome.runtime.lastError) {
                container.textContent = 'No content script on this page.';
                return;
            }
            if (!response || !response.text) {
                container.textContent = 'No response from page.';
                return;
            }
            const update = document.createElement("div");
            update.textContent = response.text;
            container.appendChild(update);
        });
    });
}

main.addEventListener('click', handleClick);