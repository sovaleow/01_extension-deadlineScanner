const main = document.getElementById("scanButton");
const container = document.querySelector(".update-container");

const keywords = ["test", "quiz", "assignment","replacement" ,"project", "exam",  "presentation", "final", "midterm"];

//regex patterns for date and time (can be improved to handle more formats)
const dateRegex =
    /\d{1,2}\s+[A-Za-z]+\s+\d{4}/g;

const timeRegex =
    /\d{1,2}:\d{2}\s?(AM|PM)/gi;



//store events in an array
const events = [];

let dateIndex = 0;
let timeIndex = 0;

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

            const pageText = response.text.toLowerCase();
            const dates = response.text.match(dateRegex) || [];
            const times = response.text.match(timeRegex) || [];
            
            let titleIndex = 0;

            for(const keyword of keywords) {
                if (pageText.includes(keyword)) {
                    //extracts ~50 characters before and after the keyword(use refex for smarter extraction)
                    const keywordIndex = pageText.indexOf(keyword);
                    const startIndex = Math.max(0, keywordIndex - 50);
                    const endIndex = Math.min(pageText.length, keywordIndex + keyword.length + 50);
                    const context = response.text.substring(startIndex, endIndex).trim();

                    //event objects
                    const event = {
                        title : response.titles[titleIndex],
                        date : "",
                        time : "",
                        venue : ""
                    };
                    titleIndex++;
                    // Process the event
                    console.log('Keyword found:', keyword);
                    
                    if (dates[dateIndex]) {
                        
                        event.date = dates[dateIndex]; // Just taking the first date found for simplicity
                        dateIndex++;
                    }
                    
                    if (times[timeIndex]) {
                       
                        event.time = times[timeIndex]; // Just taking the first time found for simplicity
                        timeIndex++;
                    }
                    
                    events.push(event);
                    console.log("ALL TITLES:", response.titles);
                    console.log("ALL DATES:", dates);
                    console.log("ALL TIMES:", times);
                    
                    console.log('Event added:', event);
                    console.log(response.titles);
                }
                
            }

            const update = document.createElement("div");
            update.textContent = response.text;
            container.appendChild(update);
            //ensure page text show up in extension console
            console.log(response.text);
        });
    });
}

main.addEventListener('click', handleClick);