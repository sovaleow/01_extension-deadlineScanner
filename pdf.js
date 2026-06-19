// EduAlert PDF extraction helpers.
//
// This file expects Mozilla PDF.js to be available as `window.pdfjsLib` when
// reading real PDF files. The text parser is kept separate so it can also be
// tested with copied/extracted PDF text.

window.EduAlertPdf = (() => {
  const MONTHS = {
    1: "January",
    2: "February",
    3: "March",
    4: "April",
    5: "May",
    6: "June",
    7: "July",
    8: "August",
    9: "September",
    10: "October",
    11: "November",
    12: "December",
  };

  const ASSESSMENT_KEYWORDS = [
    "assignment",
    "quiz",
    "test",
    "mid-term",
    "mid term",
    "midterm",
    "exam",
    "practical test",
    "assessment",
    "submission",
    "release",
    "convocation",
    "holiday",
    "muharram",
    "malaysia day",
    "birthday",
    "national day",
  ];

  const COURSE_PREFIX_EVENT_KEYWORDS = [
    "assignment release",
    "assignment submission",
    "quiz",
    "mid-term test",
    "mid term test",
    "midterm test",
    "midterm exam",
    "practical test",
  ];

  function cleanText(text) {
    return (text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function formatShortDate(day, month, year) {
    const fullYear = Number(year) < 100 ? 2000 + Number(year) : Number(year);
    return `${Number(day)} ${MONTHS[Number(month)]} ${fullYear}`;
  }

  function getMonthNumber(monthName) {
    const normalized = String(monthName).slice(0, 3).toLowerCase();
    return Object.entries(MONTHS).find(([, name]) =>
      name.slice(0, 3).toLowerCase() === normalized
    )?.[0] || "";
  }

  function formatWordDate(day, monthName, year) {
    const month = getMonthNumber(monthName);
    if (!month || !year) return "";
    return formatShortDate(day, month, year);
  }

  function parseShortDate(value, fallbackYear = "") {
    const match = String(value).match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (!match) return "";

    return formatShortDate(match[1], match[2], match[3] || fallbackYear);
  }

  function parseWordDate(value, fallbackYear = "") {
    const matches = String(value).matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s*(?:,)?\s*(\d{2,4})?\b/g);

    for (const match of matches) {
      const date = formatWordDate(match[1], match[2], match[3] || fallbackYear);
      if (date) return date;
    }

    return "";
  }

  function findExplicitDate(text, fallbackYear) {
    const publicHolidayDateMatch = text.match(/public\s+holiday[\s\S]{0,80}?\b(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{2,4}))?\b/i);
    if (publicHolidayDateMatch) {
      return formatWordDate(
        publicHolidayDateMatch[1],
        publicHolidayDateMatch[2],
        publicHolidayDateMatch[3] || fallbackYear
      );
    }

    const rangeMatch = text.match(/\b(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
    if (rangeMatch) {
      return formatShortDate(rangeMatch[1], rangeMatch[3], rangeMatch[4] || fallbackYear);
    }

    return parseShortDate(text, fallbackYear) || parseWordDate(text, fallbackYear);
  }

  function getAssessmentType(text) {
    const lower = text.toLowerCase().replace(/\s+/g, " ");

    if (lower.includes("assignment") && lower.includes("submission")) {
      return "Assignment Submission";
    }
    if (lower.includes("assignment") && lower.includes("release")) {
      return "Assignment Release";
    }
    if (lower.includes("assignment")) return "Assignment";
    if (lower.includes("mid-term") || lower.includes("mid term") || lower.includes("midterm")) return "Mid-Term Test";
    if (lower.includes("practical test")) return "Practical Test";
    if (lower.includes("quiz")) return "Quiz";
    if (lower.includes("convocation")) return "UTAR Convocation";
    if (lower.includes("national day")) return "National Day";
    if (lower.includes("malaysia day")) return "Malaysia Day";
    if (lower.includes("birthday")) return "Prophet's Birthday";
    if (lower.includes("awal muharram")) return "Awal Muharram";

    return cleanText(text).slice(0, 80);
  }

  function hasAssessmentText(text) {
    const lower = text.toLowerCase();
    return ASSESSMENT_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  function extractCourseInfo(text) {
    const partAIndex = text.search(/Part\s+A\s*:\s*Course\s+Information/i);
    const partBIndex = text.search(/Part\s+B\s*:/i);
    const partCIndex = text.search(/Part\s+C\s*:/i);
    const endIndex = [partBIndex, partCIndex]
      .filter(index => index > partAIndex)
      .sort((a, b) => a - b)[0] || text.length;
    const partAText = partAIndex >= 0 ? text.slice(partAIndex, endIndex) : text;
    const lines = partAText.split(/\n+/).map(cleanText).filter(Boolean);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const sameLineMatch = line.match(/Course\s+Code\s*&\s*(?:Course\s+Title\s*:?\s*)?([A-Z]{4}\d{4}\s+.+)$/i);
      if (sameLineMatch) return cleanText(sameLineMatch[1]);

      if (/Course\s+Code\s*&/i.test(line)) {
        const nearby = lines.slice(index + 1, index + 4).join(" ");
        const nextLineMatch = nearby.match(/\b([A-Z]{4}\d{4}\s+[A-Z][A-Z0-9/&() ,.'-]+)/);
        if (nextLineMatch) return cleanText(nextLineMatch[1]);
      }
    }

    const fallbackMatch = partAText.match(/\b([A-Z]{4}\d{4}\s+[A-Z][A-Z0-9/&() ,.'-]{8,})/);
    return fallbackMatch ? cleanText(fallbackMatch[1]) : "";
  }

  function getPartAText(text) {
    const partAIndex = text.search(/Part\s+A\s*:\s*Course\s+Information/i);
    const partBIndex = text.search(/Part\s+B\s*:/i);
    const partCIndex = text.search(/Part\s+C\s*:/i);
    const endIndex = [partBIndex, partCIndex]
      .filter(index => index > partAIndex)
      .sort((a, b) => a - b)[0] || Math.min(text.length, Math.max(partAIndex, 0) + 4000);

    return partAIndex >= 0 ? text.slice(partAIndex, endIndex) : text.slice(0, Math.min(text.length, 4000));
  }

  function shouldPrefixCourse(title) {
    const lower = title.toLowerCase().replace(/\s+/g, " ");
    return COURSE_PREFIX_EVENT_KEYWORDS.some(keyword => lower.includes(keyword));
  }

  function withCoursePrefix(title, courseInfo) {
    if (!courseInfo || !shouldPrefixCourse(title)) return title;
    if (title.toLowerCase().startsWith(courseInfo.toLowerCase())) return title;
    return `${courseInfo} ${title}`;
  }

  function splitWeekRows(text) {
    const normalized = (text || "").replace(/\f/g, "\n");
    const lines = normalized.split("\n");
    const rows = [];
    let current = null;

    lines.forEach((line) => {
      const weekMatch = line.match(/^\s*(\d{1,2})\s{2,}/);
      if (weekMatch) {
        if (current) rows.push(current);
        current = {
          week: Number(weekMatch[1]),
          lines: [line],
        };
        return;
      }

      if (current) current.lines.push(line);
    });

    if (current) rows.push(current);

    return rows;
  }

  function getLastColumnText(lines) {
    return lines
      .map(line => line.length >= 58 ? line.slice(58) : "")
      .map(cleanText)
      .filter(Boolean)
      .join("\n");
  }

  function getWeekStartDate(lines, fallbackYear = "") {
    const year = fallbackYear || getWeekYear(lines);

    for (const line of lines) {
      const rangeMatches = line.matchAll(/\b(\d{1,2})\s*[-–—]\s*\d{1,2}\s+([A-Za-z]+)\b/g);
      const crossMonthRangeMatches = line.matchAll(/\b(\d{1,2})\s*[-–—]\s*\d{1,2}\s+[A-Za-z]+\/([A-Za-z]+)\b/g);
      let date = parseShortDate(line, year);

      for (const match of rangeMatches) {
        date = date || formatWordDate(match[1], match[2], year);
        if (date) break;
      }

      for (const match of crossMonthRangeMatches) {
        date = date || formatWordDate(match[1], match[2], year);
        if (date) break;
      }

      if (date) return date;
    }

    const joined = lines.join("\n");
    const multilineRangeMatches = joined.matchAll(/\b(\d{1,2})\s*[-–—]\s*\d{1,2}\b[\s\S]{0,80}?\b(January|February|March|April|May|June|July|August|September|Sept|October|November|December)\b/gi);

    for (const match of multilineRangeMatches) {
      const date = formatWordDate(match[1], match[2], year);
      if (date) return date;
    }

    return "";
  }

  function getWeekYear(lines) {
    const joined = lines.join("\n");
    const shortDateMatch = joined.match(/\b\d{1,2}\/\d{1,2}\/(\d{2,4})\b/);
    if (shortDateMatch) return shortDateMatch[1];

    const longDateMatch = joined.match(/\b\d{1,2}\s+[A-Za-z]+\s+(\d{4})\b/);
    if (longDateMatch) return longDateMatch[1];

    return "";
  }

  function getDocumentYear(text) {
    const courseInfoText = getPartAText(text);
    const normalized = cleanText(courseInfoText);
    const yearTrimesterMatch =
      normalized.match(/\b(20\d{2})\s+(?:January|Jan|May|June|Jun|October|Oct)\s+Trimester\b/i) ||
      normalized.match(/\b(?:January|Jan|May|June|Jun|October|Oct)\s+(20\d{2})\s+Trimester\b/i);
    if (yearTrimesterMatch) return yearTrimesterMatch[1];

    const labelIndex = normalized.search(/Year\s+and\s+Trimester|Year\s*&\s*Trimester|Trimester\s*:/i);
    if (labelIndex >= 0) {
      const nearby = normalized.slice(labelIndex, labelIndex + 220);
      const nearbyYear = nearby.match(/\b(20\d{2})\b/);
      if (nearbyYear) return nearbyYear[1];
    }

    const courseInfoBeforeReferences = normalized.split(/\bReferences?\s*:/i)[0];
    const courseInfoYear = courseInfoBeforeReferences.match(/\b(20\d{2})\b/);
    return courseInfoYear ? courseInfoYear[1] : "";
  }

  function normalizeTime(hour, minute = "", meridiem = "") {
    const suffix = meridiem ? ` ${meridiem.toUpperCase()}` : "";
    return `${Number(hour)}:${String(minute || "00").padStart(2, "0")}${suffix}`;
  }

  function extractTimeRange(text) {
    const normalized = text.replace(/\s+/g, " ");
    const rangeMatch = normalized.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*([AP]M)?\s*[-–—]\s*(\d{1,2})(?:[:.](\d{2}))?\s*([AP]M)\b/i);
    if (!rangeMatch) return { timeText: "", startTime: "", endTime: "" };

    const startMeridiem = rangeMatch[3] || rangeMatch[6];
    const startTime = normalizeTime(rangeMatch[1], rangeMatch[2], startMeridiem);
    const endTime = normalizeTime(rangeMatch[4], rangeMatch[5], rangeMatch[6]);

    return {
      timeText: `${startTime} - ${endTime}`,
      startTime,
      endTime,
    };
  }

  function createPdfEvent(title, sourceText, dateText, courseInfo) {
    const prefixedTitle = withCoursePrefix(title, courseInfo);
    const time = extractTimeRange(sourceText);

    return {
      title: prefixedTitle,
      text: cleanText(`${prefixedTitle} ${sourceText}`),
      dateText,
      timeText: time.timeText,
      startTime: time.startTime,
      endTime: time.endTime,
      venue: "",
      source: "pdf-teaching-plan",
      score: 3,
    };
  }

  function getEventCandidates(sourceText) {
    const lower = sourceText.toLowerCase().replace(/\s+/g, " ");
    const candidates = [];

    if (lower.includes("assignment") && lower.includes("release")) {
      candidates.push({ title: "Assignment Release", preferWeekStart: true });
    }
    if (lower.includes("assignment") && (lower.includes("submission") || lower.includes("submit"))) {
      candidates.push({ title: "Assignment Submission" });
    }
    if (lower.includes("quiz")) candidates.push({ title: "Quiz" });
    if (
      lower.includes("mid-term") ||
      lower.includes("mid term") ||
      lower.includes("midterm") ||
      (lower.includes("mid") && lower.includes("exam"))
    ) {
      candidates.push({ title: "Mid-Term Test" });
    }
    if (lower.includes("practical test")) candidates.push({ title: "Practical Test", preferWeekStart: true });
    if (lower.includes("national day")) candidates.push({ title: "National Day" });
    if (lower.includes("malaysia day")) candidates.push({ title: "Malaysia Day" });
    if (lower.includes("birthday")) candidates.push({ title: "Prophet's Birthday" });
    if (lower.includes("awal muharram")) candidates.push({ title: "Awal Muharram" });
    if (lower.includes("convocation")) candidates.push({ title: "UTAR Convocation" });
    if (
      lower.includes("public holiday") &&
      !lower.includes("national day") &&
      !lower.includes("malaysia day") &&
      !lower.includes("birthday") &&
      !lower.includes("awal muharram")
    ) {
      candidates.push({ title: "Public Holiday" });
    }

    return candidates;
  }

  function parseTeachingPlanText(text) {
    const events = [];
    const seen = new Set();
    const courseInfo = extractCourseInfo(text);
    const documentYear = getDocumentYear(text);
    const partCIndex = text.search(/Part\s+C\s*:\s*Lecture,\s*Tutorial\/Practical\s+and\s+Assessment\s+Plan/i);
    const planText = partCIndex >= 0 ? text.slice(partCIndex) : text;

    splitWeekRows(planText).forEach((row) => {
      const assessmentText = getLastColumnText(row.lines);
      const fullRowText = cleanText(row.lines.join("\n"));
      const fallbackYear = getWeekYear(row.lines) || documentYear;
      const weekStartDate = getWeekStartDate(row.lines, fallbackYear);
      const sourceTexts = [assessmentText, fullRowText]
        .map(cleanText)
        .filter((value, index, values) =>
          value && hasAssessmentText(value) && values.indexOf(value) === index
        );

      sourceTexts.forEach((sourceText) => {
        const candidates = getEventCandidates(sourceText);

        candidates.forEach((candidate) => {
          const explicitDate = findExplicitDate(sourceText, fallbackYear);
          const dateText = candidate.preferWeekStart ? weekStartDate : explicitDate || weekStartDate;
          const event = createPdfEvent(candidate.title || getAssessmentType(sourceText), sourceText, dateText, courseInfo);
          const key = `${event.title}-${event.dateText}`;

          if (!event.dateText || seen.has(key)) return;
          seen.add(key);
          events.push(event);
        });
      });
    });

    return events;
  }

  function groupTextItemsIntoLines(items) {
    const sorted = items
      .map(item => ({
        text: item.str,
        x: item.transform[4],
        y: Math.round(item.transform[5]),
      }))
      .filter(item => cleanText(item.text))
      .sort((a, b) => b.y - a.y || a.x - b.x);

    const lines = [];
    sorted.forEach((item) => {
      let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= 2);
      if (!line) {
        line = { y: item.y, items: [] };
        lines.push(line);
      }
      line.items.push(item);
    });

    return lines
      .map((line) => {
        let output = "";

        line.items.sort((a, b) => a.x - b.x).forEach((item) => {
          const column = Math.max(0, Math.round(item.x / 6));
          const gap = Math.max(1, column - output.length);
          output += " ".repeat(gap) + item.text;
        });

        return output;
      })
      .join("\n");
  }

  async function extractTextFromPdfFile(file, pageStart = 1, pageEnd = Infinity) {
    if (!window.pdfjsLib) {
      throw new Error("PDF.js library is missing. Add the real Mozilla PDF.js build before this helper.");
    }

    if (window.pdfjsLib.GlobalWorkerOptions && window.chrome?.runtime?.getURL) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.js");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const lastPage = Math.min(pageEnd, pdf.numPages);
    const pageTexts = [];

    for (let pageNumber = pageStart; pageNumber <= lastPage; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(groupTextItemsIntoLines(content.items));
    }

    return pageTexts.join("\n");
  }

  async function extractEventsFromPdfFile(file, pageStart = 1, pageEnd = Infinity) {
    const text = await extractTextFromPdfFile(file, pageStart, pageEnd);
    return parseTeachingPlanText(text);
  }

  return {
    extractEventsFromPdfFile,
    extractTextFromPdfFile,
    parseTeachingPlanText,
  };
})();
