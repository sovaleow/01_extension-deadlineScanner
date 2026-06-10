//constants
const main = document.getElementById("scanButton");
const container = document.querySelector(".update-container");

const keywords = ["test", "quiz", "assignment","replacement" ,"project", "exam",  "presentation", "final", "midterm"];

//regex patterns for date and time
const datePatterns = [
    /\d{1,2}\s+[A-Za-z]+\s+\d{4}/,                    // 15 June 2026
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}/i, // July 10, 2026
    /\d{4}-\d{2}-\d{2}/,                             // 2026-06-15
    /\d{1,2}\/\d{1,2}\/\d{4}/                         // 05/07/2026
];

const timePatterns = [
    /\d{1,2}:\d{2}\s?(AM|PM)/i,           // 11:59 PM
    /\d{1,2}:\d{2}/,                      // 23:59
    /\d{1,2}\s?(AM|PM)/i,                 // 9 AM
    /noon|midnight/i                      // noon / midnight
];

const relativeDatePattern =
    /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;

const venuePatterns = [
    /venue\s*:\s*(.+)/i,
    /location\s*:\s*(.+)/i,
    /room\s*:\s*(.+)/i,
    /venue\s*-\s*(.+)/i
];

//functions
function extractFirstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
    }
    return "";
}

function cleanText(text) {
    return text
        .replace(/\s+/g, " ")      // collapse spaces
        .replace(/[\n\r\t]/g, " ") // remove line breaks
        .trim();
}

function isValidDate(str) {
    return /\d{4}/.test(str); // must contain year
}

function isValidTime(str) {
    return /\d{1,2}:\d{2}/.test(str); // must contain time
}

function getNextWeekday(dayName) {
    const weekdays = {
        sunday: 0,
        monday: 1,
        tuesday: 2,
        wednesday: 3,
        thursday: 4,
        friday: 5,
        saturday: 6
    };

    const today = new Date();
    const targetDay = weekdays[dayName.toLowerCase()];

    let daysUntil = targetDay - today.getDay();

    if (daysUntil <= 0) {
        daysUntil += 7;
    }

    const nextDate = new Date(today);
    nextDate.setDate(today.getDate() + daysUntil);

    return nextDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

function extractVenue(text) {
    for (const pattern of venuePatterns) {
        const match = text.match(pattern);
        if (match) return match[1].trim();
    }
    return "";
}

//store events in an array
const events = [];

let dateIndex = 0;
let timeIndex = 0;

function handleClick() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

        chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getPageText" },
            (response) => {

                if (chrome.runtime.lastError) {
                    container.textContent = "No content script on this page.";
                    return;
                }

                if (!response || !response.blocks) {
                    container.textContent = "No data received.";
                    return;
                }

                const events = [];

                response.blocks.forEach(block => {

                    const text = cleanText(block.text);

                    let date = extractFirstMatch(text, datePatterns);
                    let time = extractFirstMatch(text, timePatterns);
                    let venue = extractVenue(text);

                    if (!date) {
                        const relativeMatch = text.match(relativeDatePattern);

                        if (relativeMatch) {
                            date = getNextWeekday(relativeMatch[1]);
                        }
                    }
                    
                    if (block.title.includes("Quiz 3")) {
                        console.log("Date before validation:", date);
                    }

                    if (!isValidDate(date)) {
                        date = "";
                    }

                    if (!isValidTime(time)) {
                        time = "";
                    }

                    const event = {
                        title: block.title,
                        date: date,
                        time: time,
                        venue: venue
                    };

                    events.push(event);

                    
                });

                console.log("FINAL EVENTS:", events);

                // display
                container.innerHTML = "";
                events.forEach(e => {
                    const div = document.createElement("div");
                    div.textContent = `${e.title} | ${e.date} | ${e.time}`;
                    container.appendChild(div);
                });
            }
        );
    });
}
main.addEventListener('click', handleClick);