console.log("CONTENT SCRIPT LOADED");

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")   // &nbsp; → space
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanLines(text) {
  return (text || "")
    .replace(/\u00a0/g, " ")
    .split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean);
}

function getCellText(cell) {
  if (!cell) return "";

  const parts = Array.from(cell.querySelectorAll("p, div, li"))
    .map(el => cleanText(el.innerText || el.textContent || ""))
    .filter(Boolean);

  if (parts.length > 0) return cleanText(parts.join(" "));
  return cleanText(cell.innerText || cell.textContent || "");
}

function getDirectRows(table) {
  const sections = [
    table.tHead,
    ...Array.from(table.tBodies || []),
    table.tFoot,
  ].filter(Boolean);

  if (sections.length > 0) {
    return sections.flatMap(section =>
      Array.from(section.children).filter(child => child.tagName === "TR")
    );
  }

  return Array.from(table.children).filter(child => child.tagName === "TR");
}

function getDirectCells(row) {
  return Array.from(row.children).filter(child =>
    child.tagName === "TD" || child.tagName === "TH"
  );
}

function getAssessmentTableColumns(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const headers = getDirectCells(rows[rowIndex]).map(cell =>
      getCellText(cell).toLowerCase()
    );
    if (headers.length < 2 || headers.length > 8) continue;

    let colAssessment = -1;
    let colDateTime = -1;
    let colVenue = -1;

    headers.forEach((header, index) => {
      if (header.includes("assessment") || header.includes("component") || header.includes("evaluation")) {
        colAssessment = index;
      }
      if (header.includes("date") || header.includes("time") || header.includes("week")) {
        colDateTime = index;
      }
      if (header.includes("venue") || header.includes("location") || header.includes("room") || header.includes("platform")) {
        colVenue = index;
      }
    });

    if (colAssessment !== -1 && colDateTime !== -1 && colAssessment !== colDateTime) {
      return {
        headerIndex: rowIndex,
        colAssessment,
        colDateTime,
        colVenue: colVenue === -1 ? 3 : colVenue,
      };
    }
  }

  return null;
}

function containsDate(text) {
  return (
    /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(text) ||
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s*\d{4}/i.test(text) ||
    /\d{4}-\d{2}-\d{2}/.test(text) ||
    /\d{1,2}\/\d{1,2}\/\d{4}/.test(text)
  );
}

// Score a block of text for how likely it contains an academic event.
// Returns 0–N; caller decides the threshold to keep.
function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  const keywords = [
    "assignment", "quiz", "exam", "test", "midterm",
    "final", "presentation", "deadline", "submission",
    "due", "venue", "room", "platform", "date", "time"
  ];
  keywords.forEach(k => { if (lower.includes(k)) score++; });
  return score;
}

function getAcademicEventKey(title, text = "") {
  const value = `${title} ${text}`.toLowerCase();

  if (value.includes("midterm") || value.includes("mid-term")) return "midterm";
  if (value.includes("final examination") || value.includes("final exam")) return "final-exam";
  if (value.includes("assignment")) return "assignment";
  if (value.includes("quiz")) return "quiz";
  if (value.includes("test")) return "test";
  if (value.includes("exam")) return "exam";

  return "";
}

function isWbleNoise(text) {
  const lower = text.toLowerCase();

  return (
    lower.includes("team code:") ||
    lower.includes("please join the ms teams") ||
    lower.startsWith("show only week") ||
    lower.startsWith("skip ") ||
    lower.startsWith("hide ") ||
    lower === "latest news" ||
    lower === "upcoming events" ||
    lower === "recent activity" ||
    lower.includes("there are no upcoming events") ||
    lower.includes("no news has been posted") ||
    lower.includes("nothing new since your last login") ||
    lower.includes("activity since")
  );
}

function removeDuplicateAcademicEvents(blocks) {
  const extractedKeys = new Set();

  return blocks.filter((block) => {
    const eventKey = block.eventKey || getAcademicEventKey(block.title, block.text);
    if (!eventKey) return true;

    if (extractedKeys.has(eventKey)) return false;
    extractedKeys.add(eventKey);

    return true;
  });
}

function getSourcePriority(block) {
  if (block.source === "assignment-page") return 3;
  if (block.source === "table") return 2;
  if (block.source === "structured-announcement") return 2;
  return 1;
}

function addMissingAssessmentFromTableText(table, events, title, eventKey) {
  if (events.some(event => event.eventKey === eventKey)) return;

  const tableText = cleanText(table.innerText || table.textContent || "");
  const titlePattern = title.replace(/\s+/g, "\\s+");
  const pattern = new RegExp(
    `\\b${titlePattern}\\b[\\s\\S]{0,180}?` +
    `(Week\\s+\\d+\\s*[-–—]\\s*[A-Za-z]+\\s*\\(\\d{1,2}\\s+[A-Za-z]+\\s+\\d{4}\\)` +
    `[\\s\\S]{0,80}?(?:Time:\\s*[^.]+(?:\\.|$))?)`,
    "i"
  );
  const match = tableText.match(pattern);
  if (!match) return;

  const rawText = cleanText(match[1]);

  events.push({
    title,
    text: cleanText(`${title} ${rawText}`),
    dateText: rawText,
    venue: "",
    source: "table",
    score: 3,
    eventKey,
    columns: {
      assessment: title,
      dateTime: rawText,
      venue: "",
    },
  });
}

// ─── Extractor 1: Assessment tables ─────────────────────────────────────────
// Targets <table> elements that have "assessment" and "date" in their headers.
// These live inside .activity.label list items on WBLE course pages.

function extractFromTables() {
  const events = [];

  const tables = document.querySelectorAll("table");

  tables.forEach((table) => {
    const rows = getDirectRows(table);
    const columns = getAssessmentTableColumns(rows);
    if (!columns) return;

    const { headerIndex, colAssessment, colDateTime, colVenue } = columns;

    rows.slice(headerIndex + 1).forEach((row) => {
      const cells = getDirectCells(row);
      if (cells.length < 2) return;

      const titleCell    = cells[colAssessment] || cells[1];
      const dateCell     = cells[colDateTime]   || cells[2];
      const venueCell    = cells[colVenue]       || cells[3];

      const title    = getCellText(titleCell);
      const rawText  = getCellText(dateCell);
      const venue    = getCellText(venueCell);
      const rowText  = cleanText([title, rawText, venue].filter(Boolean).join(" "));

      // Skip empty or TBC-only rows, but keep rows that still contain a real date.
      if (!title || title.match(/^(no\.|#|\d+\.?)$/i)) return;
      if (!rawText) return;
      if (!containsDate(rawText) && rawText.toLowerCase().includes("to be confirmed")) return;

      events.push({
        title,
        text: rowText,
        dateText: rawText,
        venue: venue.toLowerCase().includes("to be confirmed") ? "" : venue,
        source: "table",
        score: 3,  // Tables are high-confidence sources
        eventKey: getAcademicEventKey(title, rowText),
        columns: {
          assessment: title,
          dateTime: rawText,
          venue: venue,
        },
      });
    });

    addMissingAssessmentFromTableText(table, events, "Quiz", "quiz");
  });

  return events;
}

// ─── Extractor 2: Text blocks (announcements, labels, paragraphs) ────────────
// Scans .activity.label items and general content paragraphs.
// Only keeps blocks that score above the threshold.

function extractFromTextBlocks() {
  const events = [];
  const seen = new Set();

  // WBLE content lives inside these containers
  const containers = document.querySelectorAll(
    ".activity.label, .mod-indent-outer, #region-main .no-overflow, .course-content"
  );

  const targets = containers.length > 0
    ? containers
    : [document.querySelector("#region-main") || document.body];

  targets.forEach((container) => {
    // Break each container into meaningful chunks: paragraphs, list items, divs
    const elements = container.querySelectorAll("p, li, div, td");

    elements.forEach((el) => {
      // Skip elements that contain child block elements — we want leaf nodes
      const hasBlockChild = el.querySelector("table, ul, ol, div, p");
      if (hasBlockChild) return;
      if (el.closest("table")) return;

      const text = cleanText(el.innerText || "");
      if (!text || text.length < 20) return;
      if (seen.has(text)) return;
      seen.add(text);

      const score = scoreText(text);
      if (score < 1) return;
      if (isWbleNoise(text)) return;

      // Try to find a title from the nearest heading or strong element
      const heading = el.closest("li, div, section")
        ?.querySelector("h1, h2, h3, h4, strong, b");
      const title = cleanText(heading?.innerText || text.split(/[.:\n]/)[0] || "");

      events.push({
        title: title.slice(0, 120), // cap length
        text,
        venue: "",
        source: "textblock",
        score,
        eventKey: getAcademicEventKey(title, text),
      });
    });
  });

  return events;
}

// ─── Extractor 3: Structured announcements ──────────────────────────────────
// Targets blocks like:
// Event Title
// Date: 2 July 2026, Thursday, Week 3, 6:00PM - 8:00PM
// Venue: Online, MS Teams code: ...
// Online Platform: Microsoft Teams

function extractFromStructuredAnnouncements() {
  const events = [];
  const seen = new Set();
  const containers = document.querySelectorAll(
    ".activity.label, .mod-indent-outer, #region-main .no-overflow, .course-content"
  );

  const targets = containers.length > 0
    ? containers
    : [document.querySelector("#region-main") || document.body];

  targets.forEach((container) => {
    const lines = cleanLines(container.innerText || container.textContent || "");

    lines.forEach((line, index) => {
      if (!/^date\s*:/i.test(line)) return;

      const title = [...lines.slice(0, index)].reverse().find(candidate =>
        !/^(announcement|reminder|date|venue|online platform|platform)\s*:?$/i.test(candidate) &&
        !/^week\s+\d+\b/i.test(candidate) &&
        !candidate.includes(".") &&
        candidate.length >= 5
      );
      if (!title) return;

      const venueLine = lines.slice(index + 1).find(candidate =>
        /^(venue|online\s+platform|platform)\s*:/i.test(candidate)
      ) || "";
      const timeLine = lines.slice(index + 1).find(candidate =>
        /^time\s*:/i.test(candidate)
      ) || "";
      const dateText = line.replace(/^date\s*:\s*/i, "");
      const venue = venueLine.replace(/^(venue|online\s+platform|platform)\s*:\s*/i, "");
      const text = cleanText([title, line, timeLine, venueLine].filter(Boolean).join(" "));
      const key = `${title}-${dateText}-${venue}`;

      if (seen.has(key) || !containsDate(dateText)) return;
      seen.add(key);

      events.push({
        title,
        text,
        dateText,
        venue,
        source: "structured-announcement",
        score: 3,
        eventKey: getAcademicEventKey(title, text),
      });
    });
  });

  return events;
}

// ─── Extractor 4: WBLE Assignment pages ─────────────────────────────────────
// Targets the structured layout on /mod/assign/view.php pages.

function extractFromAssignmentPage() {
  const events = [];

  // WBLE assignment pages have a .generaltable with label/value rows
  const rows = document.querySelectorAll(".generaltable tr, .submissiondetails tr");

  if (rows.length === 0) return events;

  // The assignment title is in the page <h2> or breadcrumb
  const pageTitle =
    document.querySelector("#region-main h2, .page-header-headings h1")?.innerText || "Assignment";

  const data = {};
  rows.forEach((row) => {
    const cells = row.querySelectorAll("td");
    if (cells.length < 2) return;
    const label = cleanText(cells[0].innerText).toLowerCase();
    const value = cleanText(cells[1].innerText);
    if (label.includes("due date"))    data.dueDate = value;
    if (label.includes("cut-off"))     data.cutoff  = value;
    if (label.includes("opens"))       data.opens   = value;
  });

  if (data.dueDate || data.cutoff) {
    events.push({
      title:  cleanText(pageTitle),
      text:   data.dueDate || data.cutoff,
      dateText: data.dueDate || data.cutoff,
      venue:  "",
      source: "assignment-page",
      score:  4, // Very high confidence — structured WBLE data
      eventKey: getAcademicEventKey(pageTitle, data.dueDate || data.cutoff),
    });
  }

  return events;
}

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "getPageText") return;

  const tableBlocks    = extractFromTables();
  const textBlocks     = extractFromTextBlocks();
  const announcementBlocks = extractFromStructuredAnnouncements();
  const assignBlocks   = extractFromAssignmentPage();

  // Merge all blocks, sort highest confidence first
  const allBlocks = removeDuplicateAcademicEvents(
    [...tableBlocks, ...assignBlocks, ...announcementBlocks, ...textBlocks]
      .sort((a, b) => {
        const sourceDiff = getSourcePriority(b) - getSourcePriority(a);
        if (sourceDiff !== 0) return sourceDiff;
        return b.score - a.score;
      })
  );

  console.log(
    `EduAlert: found ${tableBlocks.length} table events, ` +
    `${announcementBlocks.length} structured announcements, ` +
    `${textBlocks.length} text blocks, ` +
    `${assignBlocks.length} assignment page events`
  );

  sendResponse({ blocks: allBlocks });
  return true;
});
