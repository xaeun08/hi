# J-Pop Karaoke Search Engine (TJ/KY)

## Overview
A web-based application designed to help users easily find TJ (Taijin) and KY (Kumyoung) karaoke numbers for J-Pop songs. The interface is inspired by modern music streaming services (Spotify/Apple Music), featuring a dark theme and clean typography.

## Features
-   **Search Functionality:** Search for songs by title or artist.
-   **Karaoke Database Integration:** Real-time fetching of karaoke numbers from the `api.manana.kr` public API.
-   **Capture Search:** Extract song titles from uploaded images (screenshots) using OCR (Tesseract.js) and automatically search for karaoke numbers.
-   **Brand Filtering:** Display results for both TJ and KY systems, with clear visual distinction (e.g., Red for TJ, Blue for KY).
-   **Copy to Clipboard:** One-click copying of karaoke numbers.
-   **Responsive Design:** Fully functional on both desktop and mobile devices.

## Technical Architecture

### Frontend
-   **HTML5:** Semantic structure for the search interface and result list.
-   **CSS3:** Custom styling with a focus on:
    -   **Dark Mode:** Deep grey/black background (`#121212`, `#181818`).
    -   **Card Layout:** Song results displayed as cards.
    -   **Responsive Grid:** Adapts to screen size.
-   **JavaScript (Vanilla ES6+):**
    -   `fetch()` API to communicate with `api.manana.kr`.
    -   `Tesseract.js` for client-side OCR processing.
    -   DOM manipulation to render search results dynamically.
    -   Event listeners for search input and "Enter" key.

### Data Source
-   **API:** `https://api.manana.kr/karaoke`
-   **Endpoints:**
    -   Search by Title: `/song/{keyword}/tj.json` and `/song/{keyword}/kumyoung.json`
    -   Search by Singer: `/singer/{keyword}/tj.json` and `/singer/{keyword}/kumyoung.json`

## Implementation Plan

### Step 1: Project Setup
-   Initialize `blueprint.md`.
-   Verify API connectivity (Manual check via browser/curl).

### Step 2: User Interface (HTML/CSS)
-   Create a clean, centered search bar.
-   Design the result card component (Song Title, Artist, TJ #, KY #).
-   Apply "Music App" aesthetics (rounded corners, subtle gradients, dark theme).

### Step 3: Core Logic (JavaScript)
-   Implement `searchSongs(query)` function.
-   Fetch data from both TJ and KY endpoints in parallel.
-   Merge and display results.
-   Handle "No results found" and API errors gracefully.

### Step 4: Refinement
-   Add "J-Pop" specific search hints (e.g., suggest searching in Japanese if English fails).
-   Polish animations (loading spinners, hover effects).

## Verification
-   **Search Test:** Search for "Lemon" (Kenshi Yonezu) and verify TJ/KY numbers appear.
-   **Responsive Test:** Check layout on mobile view.
-   **Error Handling:** Disconnect internet and verify error message.
