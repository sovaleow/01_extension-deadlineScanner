# EduAlert

EduAlert is a Chrome extension that scans course webpages and teaching plan PDFs for academic deadlines, assessments, holidays, and events, then helps users add them to Google Calendar.

It was built mainly for WBLE-style course pages and teaching plan PDFs, with support for common academic event formats such as quizzes, assignments, midterm tests, practical tests, public holidays, and online briefings.

## Features

- Scan the current webpage for academic events and deadlines
- Extract assessment rows from WBLE tables
- Detect structured announcements with `Date`, `Time`, `Venue`, and `Online Platform`
- Scan teaching plan PDFs from a dedicated PDF scanner page
- Extract course code and course title from PDF course information
- Prefix selected PDF assessment events with the course code and title
- Detect public holidays and other non-assessment events from teaching plans
- Add detected events directly to Google Calendar
- Ignore events that should not be added
- Filter noisy or invalid entries such as `To be confirmed later`

## Supported Event Examples

EduAlert can detect formats such as:

```text
Quiz
Week 6 - Wednesday (22 July 2025)
Time: To be confirmed later
```

```text
Assignment
Submission Deadline:
Before Week 11 - Sunday (30 August 2025), 11:59 PM
```

```text
Date: 2 July 2026, Thursday, Week 3
Time : 3.00 PM - 4.00 PM
Online Platform : Microsoft Teams
```

```text
Venue: Online, MS Teams code: o3j9jlx
```

## PDF Teaching Plan Support

The PDF scanner is designed to extract events from teaching plans, especially from sections like:

```text
Part A: Course Information
Part C: Lecture, Tutorial/Practical and Assessment Plan
```

It can extract:

- Assignment Release
- Assignment Submission
- Quiz
- Mid-Term Test
- Practical Test
- Public Holiday
- National Day
- Malaysia Day
- Prophet's Birthday
- UTAR Convocation

When available, EduAlert uses the course code, course title, and trimester year from Part A to improve event names and dates.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to:

```text
chrome://extensions
```

3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this project folder.
6. Pin the EduAlert extension if desired.

## Usage

### Scan A Webpage

1. Open a course page, such as a WBLE course page.
2. Click the EduAlert extension icon.
3. Click **Scan Page**.
4. Review the detected events.
5. Click **Add** to add one event to Google Calendar, or **Add All** to add all visible events.

### Scan A PDF Teaching Plan

1. Click the EduAlert extension icon.
2. Click **Scan PDF teaching plan**.
3. Upload a teaching plan PDF.
4. Review the extracted events in the PDF scanner page.
5. Click **Add** for events you want to add to Google Calendar.

## Project Structure

```text
manifest.json       Chrome extension manifest
popup.html          Main extension popup UI
popup.css           Popup styling
popup.js            Event display, parsing, filtering, and Google Calendar links
content.js          Webpage/WBLE extraction logic
pdf.html            PDF scanner page
pdf-page.css        PDF scanner page styling
pdf-page.js         PDF scanner UI logic
pdf.js              Teaching plan PDF extraction logic
pdf-lib.min.js      PDF.js browser library
pdf.worker.min.js   PDF.js worker
icons/              Extension icons
```

## Notes

- After changing extension files, reload the extension in `chrome://extensions`.
- Refresh the course webpage before scanning again so the updated content script is used.
- Google Calendar links are opened in a new tab.
- Event descriptions are intentionally left empty when creating Google Calendar events.

## Privacy

EduAlert runs locally in the browser. It scans the current webpage or the PDF file selected by the user and generates Google Calendar URLs from the extracted event details.

## Limitations

- Extraction quality depends on how consistently the webpage or PDF is formatted.
- Some scanned or image-only PDFs may not work because they do not contain selectable text.
- Events with missing or unconfirmed dates may be ignored.
- Users should review detected events before adding them to Google Calendar.
