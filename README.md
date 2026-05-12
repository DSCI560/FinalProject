# WedBoard — AI-Powered Wedding Planning Platform

WedBoard is a full-stack web application that gives couples and their vendors a single, shared workspace to coordinate every detail of a wedding. An AI assistant backed by OpenAI GPT reads uploaded planning documents and answers questions in real time, while four dedicated planning tools (vendor chat, vendor discovery, seating chart, and card studio) live side-by-side in a polished, luxury-designed interface.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Feature Walkthrough](#2-feature-walkthrough)
3. [Architecture](#3-architecture)
4. [Folder Structure](#4-folder-structure)
5. [Tech Stack](#5-tech-stack)
6. [Launching the App](#6-launching-the-app)
7. [Backend Setup](#7-backend-setup)
8. [Configuration Reference](#8-configuration-reference)
9. [User Accounts & Auth](#9-user-accounts--auth)
10. [Vendor Discovery Data](#10-vendor-discovery-data)
11. [Progressive Web App & Android](#11-progressive-web-app--android)
12. [Known Limitations](#12-known-limitations)

---

## 1. Project Overview

WedBoard has two distinct sides:

| Side | Who uses it | Entry point |
|------|-------------|-------------|
| **Landing page** | First-time visitors, marketing | `landing.html` |
| **Application** | Authenticated couples & vendors | `index.html` |

The landing page is a standalone marketing site with a login/register modal. The main app is a Single-Page Application (SPA) — all views live inside `index.html` and are toggled with JavaScript rather than page loads.

Authentication state is stored in `localStorage`. When a user logs in or registers on either page they are redirected to `index.html` with a live session.

---

## 2. Feature Walkthrough

### 2.1 Couple Dashboard

After logging in as a couple, you land on a four-tab workspace.

#### Tab 1 — AI Vendor Chat

The primary communication hub.

- **Vendor sidebar** — lists every vendor added to your wedding. Click any vendor to open their dedicated chat channel. Your conversation history is saved locally and reloaded each visit.
- **@ai trigger** — type `@ai` followed by a question (e.g. `@ai what time does the ceremony start?`) to invoke the AI assistant. It searches your uploaded Knowledge Base documents using vector similarity, then streams a GPT-generated answer with inline citations back into the chat.
- **@ai generate doc** — typing `@ai generate doc <description>` triggers the document generator. The backend searches both your chat history and knowledge base, then produces a formatted `.docx` file you can download.
- **Retrieval badge** — the pill in the top-right corner of the chat header shows whether retrieval found relevant documents (`Retrieval active`) or fell back to a general answer (`Retrieval idle`).
- **Knowledge Base panel** — accessible from the settings gear. Upload `.txt`, `.md`, `.json`, or image files. Each text file is chunked, embedded via `text-embedding-ada-002`, and stored in ChromaDB for semantic retrieval.

#### Tab 2 — Discover Vendors

Browse and add 210 real-world, highly-rated vendors from six US cities.

- **Location filter** — select a city (New York, Los Angeles, Chicago, Miami, Nashville, San Francisco) from the dropdown in the header. Your choice is saved to `localStorage` and applied across sessions.
- **Category filter pills** — filter by Photographer, Florist, Caterer, DJ / Music, Planner, Venue, or Bakery.
- **Vendor cards** — each card shows the vendor name, category, city, a short marketing blurb, price tier (`$` to `$$$$`), star rating, and review count. Clicking **+ Add** adds the vendor to your sidebar so you can start chatting with them immediately.

#### Tab 3 — Seating Chart

A visual drag-free seating planner.

- **Table Settings** — stepper controls to set the number of tables (1–20) and seats per table (2–16). Reducing either value automatically un-assigns guests whose seat no longer exists.
- **Add Guests panel** — type a guest name and click Add; they appear in the Unassigned list.
- **Click-to-edit tables** — click any table card to open a modal. Each seat row shows a number, a text input, and a clear button. Type a name directly into a seat to assign that guest; clearing the input un-assigns them. Press Enter to jump to the next seat or close the modal on the last seat.
- **Seating stats** — the header always shows total guests and how many have been seated.
- **Clear All** — resets all seat assignments without removing guests from the unassigned list.

#### Tab 4 — Card Studio

Design and print four types of wedding stationery with a live preview.

| Card type | Fields shown |
|-----------|-------------|
| Place Card | Couple names, date, venue, guest name |
| Thank You Card | Couple names, date, venue, personal message |
| Menu Card | Couple names, date, venue, menu items |
| Invitation | All fields combined |

- Every input updates the preview card in real time.
- **Print / Save as PDF** opens a new browser window with just the card and triggers the browser print dialog. Any modern browser's "Save as PDF" option produces a print-ready file.

#### Settings Menu (gear icon)

- **Manage Vendors** — view and remove vendors from your sidebar.
- **Write a Review** — rate and review any vendor; reviews are saved to `localStorage` and visible to that vendor in their dashboard.
- **Knowledge Base** — upload documents or load a built-in sample wedding plan.
- **Sign Out** — clears the session and returns to `landing.html`.

#### Floating AI Assistant

A gold star button (bottom-right corner, visible whenever you are logged in as a couple) opens a dedicated AI chat panel. Ask anything wedding-related — budgets, timelines, vendor recommendations, etiquette — without leaving your current tab. The panel streams responses from the backend when online, or uses a comprehensive local fallback when offline.

---

### 2.2 Vendor Dashboard

After logging in as a vendor, you see a chat list of the couples assigned to you.

- **Couple Chats** — select any couple to open their shared chat channel. Vendors and couples share the same message history.
- **Business Analytics** (slide-over) — shows bookings, revenue, average rating, and a monthly bar chart.
- **My Reviews** (slide-over) — shows Google Reviews (sample data) and any WedBoard reviews left by couples.
- **Manage Couples** (slide-over) — list of couple clients with the option to blacklist.

---

### 2.3 Landing Page (`landing.html`)

A fully standalone marketing site:

- Fixed glassmorphism navbar with smooth-scroll anchor links
- Hero section with headline, app mockup screenshot, and two CTAs
- Feature strip (trust badges)
- Feature grid — AI Vendor Chat, Smart Discovery, Seamless Seating, Digital Card Studio
- "How It Works" — three-step process
- Testimonials from three sample couples
- CTA banner
- Four-column footer
- Login / Register modal — authenticates against the same `localStorage` store as the main app; on success redirects to `index.html`

---

## 3. Architecture

```
┌─────────────────────────────────────────────┐
│               Browser (Client)              │
│                                             │
│  landing.html   ─────────────►  index.html  │
│  (marketing)    redirect           (SPA)    │
│       │                             │       │
│  Embedded JS               app.js + styles  │
│  (auth only)               (full app logic) │
│                                             │
│  localStorage  ──── session, users,         │
│                     chat history,           │
│                     seating state,          │
│                     reviews, city pref      │
└────────────────────┬────────────────────────┘
                     │ HTTP (fetch)
                     │ SSE (streaming AI)
                     ▼
┌─────────────────────────────────────────────┐
│           Flask Backend (Python)            │
│           backend/app.py  :5000             │
│                                             │
│  /api/status          health check          │
│  /api/join            user / cohort upsert  │
│  /api/message         save chat message     │
│  /api/messages        load chat history     │
│  /api/upload          chunk + embed doc     │
│  /api/ai-query        non-streaming AI      │
│  /api/ai-query-stream streaming AI (SSE)    │
│  /api/generate-doc    build .docx file      │
│  /api/download-doc    serve .docx file      │
│  /api/knowledge-base  list uploaded docs    │
│                                             │
│  SQLite (cohort.db)   messages, docs, users │
│  ChromaDB             vector embeddings     │
│  OpenAI               embeddings + GPT-3.5  │
└─────────────────────────────────────────────┘
```

**Offline / no-backend mode:** The frontend detects whether the backend is reachable at startup (`/api/status`). If it is not, all data falls back to `localStorage` and the floating AI assistant uses a built-in local response engine that covers 10+ topic areas (budget, timeline, vendors, seating, florals, catering, music, photography, vows, honeymoon).

---

## 4. Folder Structure

```
FinalProject-main/
├── index.html              # Main SPA — all views in one file
├── landing.html            # Marketing / sign-up page (self-contained)
├── app.js                  # All frontend logic (~900 lines)
├── styles.css              # Luxury design system and component styles
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline caching)
├── sample-wedding-plan.txt # Built-in demo document for the Knowledge Base
│
├── backend/
│   ├── app.py              # Flask API server
│   ├── requirements.txt    # Python dependencies
│   ├── cohort.db           # SQLite database (auto-created on first run)
│   ├── chroma_data/        # ChromaDB vector store (auto-created)
│   └── generated_docs/     # Output folder for .docx files
│
├── icons/                  # PWA icons (72 → 512 px)
│
├── android/                # Android WebView wrapper (Capacitor/Gradle)
│   └── app/src/main/       # Native Android project files
│
└── Other/
    ├── Milestone_1_Demo_Script.md
    ├── Milestone_1_Slides_Outline.md
    └── Milestone_1_Submission_Package.md
```

---

## 5. Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| Vanilla HTML / CSS / JavaScript | Full SPA — no framework |
| CSS Custom Properties | Design token system (colors, shadows, radius) |
| Google Fonts CDN | Playfair Display (headings) + Inter (body) |
| Lucide Icons CDN | SVG icon set used on `landing.html` |
| marked.js CDN | Markdown rendering for AI chat responses |
| localStorage | Auth, session, chat history, seating, reviews |
| Service Worker | Offline caching (PWA) |
| Fetch API + ReadableStream | Server-Sent Events for streaming AI responses |

### Backend
| Technology | Purpose |
|------------|---------|
| Python 3.x | Runtime |
| Flask 3.0 | HTTP server and REST API |
| Flask-CORS | Cross-origin requests from the browser |
| SQLite | Persistent storage for users, cohorts, messages, documents |
| ChromaDB | Vector store for document embeddings |
| OpenAI SDK | `text-embedding-ada-002` embeddings + `gpt-3.5-turbo` completions |
| python-docx | Generates formatted `.docx` documents |
| python-dotenv | Loads `OPENAI_API_KEY` from `.env` file |

---

## 6. Launching the App

### Option A — Frontend only (no backend, no AI)

This is the fastest way to see the app. No installation required.

1. Open `landing.html` in any modern browser (Chrome, Firefox, Edge, Safari).
2. Click **Start Planning Free** or **Log In**.
3. Register a new couple account and start exploring.

All features except live AI responses and `.docx` generation work fully offline. The floating AI assistant uses its built-in local response engine.

> **Tip — VS Code Live Server:** If you use VS Code, right-click `landing.html` → *Open with Live Server* to avoid any browser file-protocol restrictions.

---

### Option B — Full stack (frontend + AI backend)

This enables live GPT responses, semantic document retrieval, and `.docx` generation.

#### Prerequisites

- Python 3.9 or higher
- An OpenAI API key ([platform.openai.com](https://platform.openai.com))

#### Step 1 — Install Python dependencies

```bash
cd backend
pip install flask flask-cors openai chromadb python-docx python-dotenv
```

Or install from the full requirements file:

```bash
pip install -r backend/requirements.txt
```

#### Step 2 — Create the environment file

Create a file named `.env` inside the `backend/` folder:

```
OPENAI_API_KEY=sk-...your-key-here...
```

#### Step 3 — Start the backend server

```bash
cd backend
python app.py
```

You should see:

```
  AI Cohort Assistant – Flask Backend
  OpenAI key  : configured
  SQLite db   : .../backend/cohort.db
  ChromaDB    : .../backend/chroma_data
  Generated   : .../backend/generated_docs
  Open        : http://0.0.0.0:5000
```

The server listens on **port 5000** on all interfaces.

#### Step 4 — Update the backend URL in app.js

Open [app.js](app.js) and find line 9:

```javascript
const BACKEND_URL = "http://192.168.0.149:5000";
```

Replace the IP address with your machine's local IP (or `http://localhost:5000` if you are running the browser on the same machine):

```javascript
const BACKEND_URL = "http://localhost:5000";
```

#### Step 5 — Open the app

Open `landing.html` in your browser (or navigate to `http://localhost:5000` — the Flask server also serves the static files directly).

---

## 7. Backend Setup

### Database

SQLite (`cohort.db`) is created automatically when `app.py` first runs. It contains five tables:

| Table | Contents |
|-------|----------|
| `users` | Username + creation date |
| `cohorts` | Named wedding workspaces (e.g. "Mia & Ethan Wedding") |
| `messages` | All chat messages with sender type (human / ai / system) |
| `documents` | Uploaded document metadata per cohort |
| `generated_docs` | Records of every `.docx` file generated |

### Vector Store

ChromaDB stores embeddings on disk in `backend/chroma_data/`. Each cohort gets its own collection named `cohort_{id}`. Embeddings are generated using OpenAI's `text-embedding-ada-002` model at upload time. At query time the same model embeds the question and ChromaDB returns the top-3 most semantically similar chunks as context.

### Document Generation

When a user sends `@ai generate doc <description>`:

1. Keywords are extracted from the description.
2. Recent chat messages matching those keywords are retrieved from SQLite.
3. The top-5 relevant knowledge base chunks are retrieved from ChromaDB.
4. Both are assembled into a prompt and sent to GPT-3.5-Turbo.
5. GPT returns a structured JSON array of `{heading, body}` sections.
6. `python-docx` builds a formatted `.docx` file saved to `backend/generated_docs/`.
7. The file is available for immediate download via `/api/download-doc/<id>`.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/status` | Health check — returns backend and OpenAI status |
| POST | `/api/join` | Upsert user + cohort, return IDs |
| GET | `/api/messages?cohort_id=` | Fetch message history for a cohort |
| POST | `/api/message` | Save a single message |
| POST | `/api/upload` | Upload, chunk, embed, and index a document |
| POST | `/api/ai-query` | Non-streaming AI answer (fallback) |
| POST | `/api/ai-query-stream` | Streaming AI answer via SSE |
| POST | `/api/generate-doc` | Generate and save a `.docx` document |
| GET | `/api/download-doc/<id>` | Download a generated `.docx` |
| GET | `/api/generated-docs?cohort_id=` | List all generated docs for a cohort |
| GET | `/api/knowledge-base?cohort_id=` | List uploaded documents for a cohort |

---

## 8. Configuration Reference

| Location | Variable | Default | Effect |
|----------|----------|---------|--------|
| `app.js` line 9 | `BACKEND_URL` | `http://192.168.0.149:5000` | Points the frontend at your Flask server. Change to `http://localhost:5000` for local dev. |
| `backend/.env` | `OPENAI_API_KEY` | *(empty)* | Required for AI features. Without it the backend returns 503 on AI endpoints. |
| `backend/app.py` line 669 | `port=5000` | `5000` | The port Flask listens on. Change if 5000 is occupied. |

---

## 9. User Accounts & Auth

Authentication is intentionally lightweight — no server session, no JWT. Everything lives in `localStorage` under two keys:

| Key | Contents |
|-----|----------|
| `wedboard:users` | JSON object mapping lowercase username → user record |
| `wedboard:session` | JSON object `{ userId, username, role }` |

**Password hashing** uses a client-side FNV-1a hash (`simpleHash()` in both `app.js` and `landing.html`). This is sufficient for a prototype but should be replaced with a real server-side auth system (bcrypt + secure session tokens) before any production deployment.

**Roles:**

- `couple` — accesses the couple dashboard with all four planning tabs.
- `vendor` — accesses the vendor dashboard with couple chat channels and analytics.

Registration collects different information per role:

- **Couple** — Partner 1 name, Partner 2 name, username, password, wedding date, venue, guest count, style.
- **Vendor** — username, password, business name, category, packages with prices, portfolio photos, address, city, service radius, phone, website, about.

---

## 10. Vendor Discovery Data

The Discover tab is pre-populated with **210 real-world vendors** — 5 per category × 7 categories × 6 cities. All data is static and embedded in `app.js` as the `DISCOVERY_VENDORS` array.

### Cities covered

| City | State |
|------|-------|
| New York | NY |
| Los Angeles | CA |
| Chicago | IL |
| Miami | FL |
| Nashville | TN |
| San Francisco | CA |

### Categories and avatar colors

| Category | Color code | Gradient |
|----------|-----------|---------|
| Photographer | `peach` | Orange → Burnt Sienna |
| Florist | `mint` | Sage Green → Forest |
| Caterer | `lavender` | Soft Purple → Indigo |
| DJ / Music | `sky` | Sky Blue → Navy |
| Planner | `blush` | Rose → Burgundy |
| Venue | `gold` | Amber → Dark Gold |
| Bakery | `rose` | Blush Rose → Deep Rose |

The selected city is stored in `localStorage` under `wedboard:discoverCity` and restored on next visit.

---

## 11. Progressive Web App & Android

### PWA

WedBoard is installable as a Progressive Web App on any device:

- `manifest.json` defines the app name, icons (72 px → 512 px), theme color, and standalone display mode.
- `sw.js` registers a service worker that caches static assets for offline use.
- On Chrome / Edge, an "Install" prompt will appear automatically when you visit the app.

### Android

The `android/` folder contains a Gradle project that wraps the web app in a native Android WebView using Capacitor. To build the Android APK:

1. Ensure Android Studio and the Android SDK are installed.
2. Make sure the backend URL in `app.js` points to a reachable server.
3. Open the `android/` folder in Android Studio.
4. Run **Build → Generate Signed Bundle / APK**.

The network security configuration in `android/app/src/main/res/xml/network_security_config.xml` already permits cleartext HTTP traffic for local network addresses during development.

---

## 12. Known Limitations

| Limitation | Notes |
|------------|-------|
| Client-side auth only | Passwords are hashed in the browser, not on a server. Do not use in production as-is. |
| Single-device data | `localStorage` is not shared between devices or browsers. A real database-backed auth layer would be needed for multi-device support. |
| Backend URL is hardcoded | `BACKEND_URL` in `app.js` must be manually updated to match your machine's IP. |
| OpenAI costs | Every `@ai` query and document upload incurs OpenAI API usage. Monitor your usage at [platform.openai.com](https://platform.openai.com). |
| Vendor data is static | The 210 discovery vendors are embedded in `app.js`. No CMS or database backs them. |
| No real-time sync | Two users in the same cohort do not see each other's messages without refreshing. Implementing WebSockets would be the next step. |
| Document generation requires backend | The `@ai generate doc` command only works when the Flask server is running and OpenAI is configured. |
