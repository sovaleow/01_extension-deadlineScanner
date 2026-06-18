console.log("CONTENT SCRIPT LOADED");

// ─── Helpers ────────────────────────────────────────────────────────────────

function cleanText(text) {
  return text
    .replace(/\u00a0/g, " ")   // &nbsp; → space
    .replace(/[\n\r\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Score a block of text for how likely it contains an academic event.
// Returns 0–N; caller decides the threshold to keep.
function scoreText(text) {
  const lower = text.toLowerCase();
  let score = 0;
  const keywords = [
    "assignment", "quiz", "exam", "test", "midterm",
    "final", "presentation", "deadline", "submission",
    "due", "venue", "room", "date", "time"
  ];
  keywords.forEach(k => { if (lower.includes(k)) score++; });
  return score;
}

// ─── Extractor 1: Assessment tables ─────────────────────────────────────────
// Targets <table> elements that have "assessment" and "date" in their headers.
// These live inside .activity.label list items on WBLE course pages.

function extractFromTables() {
  const events = [];

  const tables = document.querySelectorAll("table");

  tables.forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll("th, tr:first-child td"));
    const headers = headerCells.map(cell => cleanText(cell.innerText).toLowerCase());

    const hasAssessment = headers.some(h =>
      h.includes("assessment") || h.includes("component") || h.includes("evaluation")
    );
    const hasDate = headers.some(h =>
      h.includes("date") || h.includes("time") || h.includes("week")
    );

    if (!hasAssessment || !hasDate) return;

    // Map column positions from headers
    let colAssessment = -1, colDateTime = -1, colVenue = -1;
    headers.forEach((h, i) => {
      if (h.includes("assessment") || h.includes("component") || h.includes("evaluation")) colAssessment = i;
      if (h.includes("date") || h.includes("time")) colDateTime = i;
      if (h.includes("venue") || h.includes("location") || h.includes("room")) colVenue = i;
    });

    // Fall back: if headers unclear, guess by column order
    // No. | Assessment | Date & Time | Venue  →  0 | 1 | 2 | 3
    if (colAssessment === -1) colAssessment = 1;
    if (colDateTime === -1) colDateTime = 2;
    if (colVenue === -1) colVenue = 3;

    const rows = Array.from(table.querySelectorAll("tr")).slice(1); // skip header row

    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 2) return;

      const titleCell    = cells[colAssessment] || cells[1];
      const dateCell     = cells[colDateTime]   || cells[2];
      const venueCell    = cells[colVenue]       || cells[3];

      const title    = cleanText(titleCell?.innerText  || "");
      const rawText  = cleanText(dateCell?.innerText   || "");
      const venue    = cleanText(venueCell?.innerText  || "");

      // Skip empty or TBC-only rows
      if (!title || title.match(/^(no\.|#|\d+\.?)$/i)) return;
      if (!rawText || rawText.toLowerCase().includes("to be confirmed")) return;

      events.push({
        title,
        text: rawText,
        venue: venue.toLowerCase().includes("to be confirmed") ? "" : venue,
        source: "table",
        score: 3,  // Tables are high-confidence sources
      });
    });
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

      const text = cleanText(el.innerText || "");
      if (!text || text.length < 20) return;
      if (seen.has(text)) return;
      seen.add(text);

      const score = scoreText(text);
      if (score < 1) return;

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
      });
    });
  });

  return events;
}

// ─── Extractor 3: WBLE Assignment pages ─────────────────────────────────────
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
      venue:  "",
      source: "assignment-page",
      score:  4, // Very high confidence — structured WBLE data
    });
  }

  return events;
}

// ─── Message handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "getPageText") return;

  const tableBlocks    = extractFromTables();
  const textBlocks     = extractFromTextBlocks();
  const assignBlocks   = extractFromAssignmentPage();

  // Merge all blocks, sort highest confidence first
  const allBlocks = [...tableBlocks, ...assignBlocks, ...textBlocks]
    .sort((a, b) => b.score - a.score);

  console.log(
    `EduAlert: found ${tableBlocks.length} table events, ` +
    `${textBlocks.length} text blocks, ` +
    `${assignBlocks.length} assignment page events`
  );

  sendResponse({ blocks: allBlocks });
  return true;
});