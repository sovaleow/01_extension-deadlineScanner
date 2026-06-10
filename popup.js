//constants
const main = document.getElementById("scanButton");
const container = document.querySelector(".update-container");

//regex patterns
const datePatterns = [
  /\d{1,2}\s+[A-Za-z]+\s+\d{4}/, // 15 June 2026
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}/i, // July 10, 2026
  /\d{4}-\d{2}-\d{2}/, // 2026-06-15
  /\d{1,2}\/\d{1,2}\/\d{4}/, // 05/07/2026
];

const timePatterns = [
  /\d{1,2}:\d{2}\s?(AM|PM)/i, // 11:59 PM
  /\d{1,2}:\d{2}/, // 23:59
  /\d{1,2}\s?(AM|PM)/i, // 9 AM
  /noon|midnight/i, // noon / midnight
];

const relativeDatePattern =
  /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i;

const venuePatterns = [
  /venue\s*:\s*(.+)/i,
  /location\s*:\s*(.+)/i,
  /room\s*:\s*(.+)/i,
  /venue\s*-\s*(.+)/i,
];

const state = {
  active: [],
  ignored: [],
};

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
    .replace(/\s+/g, " ") // collapse spaces
    .replace(/[\n\r\t]/g, " ") // remove line breaks
    .trim();
}

function isValidDate(str) {
  return (
    /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(str) ||
    /\d{4}-\d{2}-\d{2}/.test(str) ||
    /\d{1,2}\/\d{1,2}\/\d{4}/.test(str)
  );
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
    saturday: 6,
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
    year: "numeric",
  });
}

function extractVenue(text) {
  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function getEventType(title) {
    const lower = title.toLowerCase();

    if (lower.includes("assignment")) return "assignment";
    if (lower.includes("quiz")) return "quiz";
    if (lower.includes("exam")) return "exam";
    if (lower.includes("test")) return "test";

    return "other";
}

function toGoogleDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;

  const date = new Date(`${dateStr} ${timeStr}`);
  if (isNaN(date.getTime())) return null;

  const pad = (n) => String(n).padStart(2, "0");

  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    "00"
  );
}

function createGoogleCalendarUrl(event) {

    const start = toGoogleDateTime(event.date, event.time);

    if (!start) {
        alert("Missing or invalid date/time");
        return null;
    }

    const startDate = new Date(`${event.date} ${event.time}`);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

    const pad = (n) => String(n).padStart(2, "0");

    const format = (d) =>
        d.getFullYear() +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        "T" +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        "00";

    const end = format(endDate);

    const title = encodeURIComponent(event.title);
    const location = encodeURIComponent(event.venue || "");
    const details = encodeURIComponent("Added via EduAlert Chrome Extension");

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}&details=${details}`;
}

function openCalendar(e) {
  const url = createGoogleCalendarUrl(e);
  if (!url) return;

  chrome.tabs.create({ url });
}

function renderUI() {
  container.innerHTML = "";

  // HEADER
  const header = document.createElement("div");
  header.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <strong>Detected Events (${state.active.length})</strong>
        <button id="addAllBtn">Add All</button>
    </div>

    <button id="toggleIgnoredBtn">
        Show Ignored (${state.ignored.length})
    </button>
  `;
  container.appendChild(header);

  // ACTIVE EVENTS
  state.active.forEach((e, index) => {
    const card = document.createElement("div");
    card.className = "event-card";

    const type = getEventType(e.title);

    card.innerHTML = `
      <div class="event-title">
        <span class="badge ${type}">${type.toUpperCase()}</span>
        ${e.title}
      </div>

      <div class="event-info">📅 ${e.date || "Date not found"}</div>
      <div class="event-info">🕒 ${e.time || "Time not found"}</div>
      <div class="event-info">📍 ${e.venue || "Venue not found"}</div>

      <div class="button-group">
        <button class="reject-btn">Ignore</button>
        <button class="accept-btn">Add</button>
      </div>
    `;

    card.querySelector(".accept-btn").addEventListener("click", () => {
      openCalendar(e);
    });

    card.querySelector(".reject-btn").addEventListener("click", () => {
      state.ignored.push(e);
      state.active.splice(index, 1);
      renderUI();
    });

    container.appendChild(card);
  });

  // IGNORED SECTION
  const ignoredWrapper = document.createElement("div");
  ignoredWrapper.innerHTML = `
    <div id="ignoredContainer" style="display:none; margin-top:10px;">
        <h4>Ignored Events</h4>
    </div>
  `;
  container.appendChild(ignoredWrapper);

  const ignoredContainer = ignoredWrapper.querySelector("#ignoredContainer");

  state.ignored.forEach((e, index) => {
    const card = document.createElement("div");
    card.className = "event-card";

    card.innerHTML = `
      <div class="event-title">${e.title}</div>
      <div class="event-info">📅 ${e.date || "Date not found"}</div>

      <button class="accept-btn">Re-add</button>
    `;

    card.querySelector("button").addEventListener("click", () => {
      state.active.push(e);
      state.ignored.splice(index, 1);
      renderUI();
    });

    ignoredContainer.appendChild(card);
  });

  // BUTTONS
  document.getElementById("addAllBtn")?.addEventListener("click", () => {
    state.active.forEach(openCalendar);
  });

  document.getElementById("toggleIgnoredBtn")?.addEventListener("click", () => {
    const el = document.getElementById("ignoredContainer");
    el.style.display = el.style.display === "none" ? "block" : "none";
  });
}

///main function
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

        state.active = [];
        state.ignored = [];

        response.blocks.forEach((block) => {
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

          if (!isValidDate(date)) date = "";
          if (!isValidTime(time)) time = "";

          state.active.push({
            title: block.title,
            date,
            time,
            venue,
          });
        });

        renderUI();
      }
    );
  });
}

//event listeners
main.addEventListener("click", handleClick);

