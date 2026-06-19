const pdfInput = document.getElementById("pdfInput");
const statusEl = document.getElementById("status");
const eventsEl = document.getElementById("events");

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function parseDate(dateText) {
  const date = new Date(dateText);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGoogleDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function formatGoogleDateTime(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function createGoogleCalendarUrl(event) {
  const date = parseDate(event.dateText);
  if (!date) return null;

  let start;
  let end;

  if (event.startTime) {
    const startDate = parseDate(`${event.dateText} ${event.startTime}`);
    const endDate = parseDate(`${event.dateText} ${event.endTime || event.startTime}`);
    if (!startDate || !endDate) return null;

    if (endDate <= startDate) {
      endDate.setHours(startDate.getHours() + 1, startDate.getMinutes(), 0, 0);
    }

    start = formatGoogleDateTime(startDate);
    end = formatGoogleDateTime(endDate);
  } else {
    start = formatGoogleDate(date);
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 1);
    end = formatGoogleDate(endDate);
  }

  const title = encodeURIComponent(event.title);
  const location = encodeURIComponent(event.venue || "");

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}`;
}

function renderEvents(events) {
  eventsEl.innerHTML = "";
  statusEl.textContent = `Detected ${events.length} event${events.length === 1 ? "" : "s"}.`;

  if (events.length === 0) {
    statusEl.textContent = "No events found in Part C.";
    return;
  }

  events.forEach((event) => {
    const card = document.createElement("article");
    card.className = "event-card";

    card.innerHTML = `
      <div class="event-title">${event.title}</div>
      <div class="event-info">Date: ${event.dateText || "Date not found"}</div>
      <div class="event-info">Time: ${event.timeText || "Time not found"}</div>
      <div class="event-info">Venue: ${event.venue || "Venue not found"}</div>
      <div class="button-group">
        <button class="reject-btn" type="button">Ignore</button>
        <button class="accept-btn" type="button">Add</button>
      </div>
    `;

    card.querySelector(".reject-btn").addEventListener("click", () => {
      card.remove();
      const remaining = eventsEl.querySelectorAll(".event-card").length;
      statusEl.textContent = `Detected ${remaining} event${remaining === 1 ? "" : "s"}.`;
    });

    card.querySelector(".accept-btn").addEventListener("click", () => {
      const url = createGoogleCalendarUrl(event);
      if (!url) {
        statusEl.textContent = `Could not create calendar link for ${event.title}.`;
        return;
      }
      chrome.tabs.create({ url });
    });

    eventsEl.appendChild(card);
  });
}

async function handlePdfUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  eventsEl.innerHTML = "";
  statusEl.textContent = "Scanning PDF for Part C...";

  try {
    const events = await window.EduAlertPdf.extractEventsFromPdfFile(file);
    renderEvents(events);
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    event.target.value = "";
  }
}

pdfInput.addEventListener("change", handlePdfUpload);
