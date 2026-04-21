"""
AI Cohort Assistant – Flask backend
Stack : Flask · SQLite · ChromaDB · OpenAI · python-docx
Run   : cd backend && python app.py
"""

import os
import re
import json
import uuid
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, send_file, Response
from flask_cors import CORS
from dotenv import load_dotenv
import chromadb
from openai import OpenAI
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

load_dotenv()

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR  = Path(__file__).parent
DB_PATH      = BACKEND_DIR / "cohort.db"
CHROMA_PATH  = BACKEND_DIR / "chroma_data"
DOCS_OUT_DIR = BACKEND_DIR / "generated_docs"
DOCS_OUT_DIR.mkdir(exist_ok=True)

# ── App ───────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ── OpenAI ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
openai_client  = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# ── ChromaDB (persistent on disk) ─────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path=str(CHROMA_PATH))


# ── SQLite helpers ────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS cohorts (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            name       TEXT UNIQUE NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cohort_id   INTEGER NOT NULL REFERENCES cohorts(id),
            user_id     INTEGER REFERENCES users(id),
            content     TEXT NOT NULL,
            sender_type TEXT NOT NULL CHECK(sender_type IN ('human','ai','system')),
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS documents (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cohort_id   INTEGER NOT NULL REFERENCES cohorts(id),
            filename    TEXT NOT NULL,
            chunk_count INTEGER,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS generated_docs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            cohort_id   INTEGER NOT NULL REFERENCES cohorts(id),
            user_id     INTEGER REFERENCES users(id),
            prompt      TEXT NOT NULL,
            filename    TEXT NOT NULL,
            filepath    TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        """)


# ── Text / embedding helpers ──────────────────────────────────────────────────
def chunk_text(text: str, max_chars: int = 400) -> list:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for para in paragraphs:
        if len(current) + len(para) < max_chars:
            current += ("\n\n" if current else "") + para
        else:
            if current:
                chunks.append(current)
            current = para
    if current:
        chunks.append(current)
    return chunks or [text]


def embed(texts: list) -> list:
    if not openai_client:
        raise RuntimeError("OPENAI_API_KEY not configured – check backend/.env")
    resp = openai_client.embeddings.create(model="text-embedding-ada-002", input=texts)
    return [item.embedding for item in resp.data]


def get_or_create_collection(cohort_id):
    name = f"cohort_{cohort_id}"
    try:
        return chroma_client.get_collection(name)
    except Exception:
        return chroma_client.create_collection(name)


# ── Static file serving ───────────────────────────────────────────────────────
@app.route("/")
def serve_index():
    return send_from_directory(PROJECT_ROOT, "index.html")


@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(PROJECT_ROOT, filename)


# ── API: health check ─────────────────────────────────────────────────────────
@app.route("/api/status")
def status():
    return jsonify({
        "status":           "ok",
        "openai_ready":     bool(OPENAI_API_KEY),
        "sqlite_db":        str(DB_PATH),
        "chroma_path":      str(CHROMA_PATH),
    })


# ── API: join / auth ──────────────────────────────────────────────────────────
@app.route("/api/join", methods=["POST"])
def join():
    data       = request.get_json() or {}
    username   = (data.get("username") or "").strip()
    cohort_name = (data.get("cohort") or "").strip()

    if not username or not cohort_name:
        return jsonify({"error": "username and cohort are required"}), 400

    with get_db() as conn:
        conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
        user = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()

        conn.execute("INSERT OR IGNORE INTO cohorts (name) VALUES (?)", (cohort_name,))
        cohort = conn.execute("SELECT * FROM cohorts WHERE name=?", (cohort_name,)).fetchone()

    return jsonify({"user_id": user["id"], "cohort_id": cohort["id"]})


# ── API: messages ─────────────────────────────────────────────────────────────
@app.route("/api/messages")
def get_messages():
    cohort_id = request.args.get("cohort_id")
    with get_db() as conn:
        rows = conn.execute("""
            SELECT m.id, m.content, m.sender_type, m.created_at, u.username
            FROM   messages m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE  m.cohort_id = ?
            ORDER  BY m.created_at
        """, (cohort_id,)).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/message", methods=["POST"])
def send_message():
    data = request.get_json() or {}
    with get_db() as conn:
        conn.execute(
            "INSERT INTO messages (cohort_id, user_id, content, sender_type) VALUES (?,?,?,?)",
            (data.get("cohort_id"), data.get("user_id"), data.get("content"), data.get("sender_type", "human"))
        )
    return jsonify({"success": True})


# ── API: document upload → chunk → embed → ChromaDB ──────────────────────────
@app.route("/api/upload", methods=["POST"])
def upload():
    cohort_id = request.form.get("cohort_id")
    file      = request.files.get("file")

    if not file:
        return jsonify({"error": "no file provided"}), 400
    if not cohort_id:
        return jsonify({"error": "cohort_id required"}), 400

    text     = file.read().decode("utf-8", errors="replace")
    filename = file.filename
    chunks   = chunk_text(text)

    # Embed with OpenAI → store in ChromaDB
    embeddings = embed(chunks)
    collection = get_or_create_collection(cohort_id)
    ids = [f"{filename}_{uuid.uuid4().hex[:8]}_{i}" for i in range(len(chunks))]
    collection.add(
        documents=chunks,
        embeddings=embeddings,
        ids=ids,
        metadatas=[{"filename": filename, "chunk_idx": i} for i in range(len(chunks))]
    )

    # Record in SQLite
    with get_db() as conn:
        conn.execute(
            "INSERT INTO documents (cohort_id, filename, chunk_count) VALUES (?,?,?)",
            (cohort_id, filename, len(chunks))
        )

    return jsonify({"success": True, "filename": filename, "chunks": len(chunks)})


# ── API: AI query (original non-streaming — kept as fallback) ────────────────
@app.route("/api/ai-query", methods=["POST"])
def ai_query():
    if not openai_client:
        return jsonify({"error": "OPENAI_API_KEY not configured in backend/.env"}), 503

    data      = request.get_json() or {}
    cohort_id = data.get("cohort_id")
    question  = (data.get("question") or "").strip()
    user_id   = data.get("user_id")

    if not question:
        return jsonify({"error": "question is required"}), 400

    # Step 1 – embed the question
    q_embedding = embed([question])[0]

    # Step 2 – retrieve top-3 chunks from ChromaDB
    context_text, sources = "", []
    try:
        collection = get_or_create_collection(cohort_id)
        results    = collection.query(query_embeddings=[q_embedding], n_results=3)
        docs       = results["documents"][0]
        metas      = results["metadatas"][0]
        if docs:
            context_text = "\n\n---\n\n".join(docs)
            sources      = list({m["filename"] for m in metas})
    except Exception:
        pass  # empty collection – answer without context

    # Step 3 – build prompt and call GPT
    system_prompt = _build_system_prompt()
    user_prompt = (
        f"Context from uploaded documents:\n{context_text}\n\n---\n\nQuestion: {question}"
        if context_text
        else f"Question: {question}"
    )

    completion = openai_client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_prompt},
        ],
        max_tokens=600,
        temperature=0.4,
    )
    answer = completion.choices[0].message.content

    # Step 4 – persist AI response to SQLite
    with get_db() as conn:
        conn.execute(
            "INSERT INTO messages (cohort_id, user_id, content, sender_type) VALUES (?,?,?,?)",
            (cohort_id, None, answer, "ai")
        )

    return jsonify({"response": answer, "sources": sources})


# ── Shared system prompt builder ─────────────────────────────────────────────
def _build_system_prompt():
    return """You are an expert wedding planning assistant powered by a curated knowledge base of wedding venues, vendors, timelines, budgets, etiquette guides, and real couple experiences.

**How to answer:**
1. Answer ONLY from the provided context documents. Every factual claim must reference its source.
2. After each claim, add an inline citation in the format [Source: <document_name>, Section: <section>].
3. If multiple sources agree, cite all of them.
4. If the context does not contain enough information to answer fully, clearly state: "Based on the available documents, I can confirm [what you found]. However, I don't have information on [what's missing] — I'd recommend consulting [specific professional]."
5. Never fabricate vendor names, prices, availability, or policies.

**Response format:**
- Lead with a direct answer, then supporting details.
- When comparing options (venues, vendors, packages), use a structured breakdown: Name, Price Range, Capacity, Pros, Cons — all cited.
- Use markdown formatting: **bold** for emphasis, bullet lists with `-`, numbered lists, headings with `##`.
- End every response with a "Sources Used" section listing each document referenced.

**Domain rules:**
- Budget figures must always include the date they were recorded, since pricing changes seasonally.
- Venue availability is time-sensitive — remind users to verify directly with vendors.
- For etiquette questions, note if advice varies by culture or region and cite the relevant guide.
- Flag any potential conflicts (e.g., a vendor's blackout dates overlapping with the user's wedding date) proactively.
"""


# ── API: Streaming AI query (SSE) ────────────────────────────────────────────
@app.route("/api/ai-query-stream", methods=["POST"])
def ai_query_stream():
    if not openai_client:
        return jsonify({"error": "OPENAI_API_KEY not configured in backend/.env"}), 503

    data      = request.get_json() or {}
    cohort_id = data.get("cohort_id")
    question  = (data.get("question") or "").strip()
    user_id   = data.get("user_id")

    if not question:
        return jsonify({"error": "question is required"}), 400

    # Embed + retrieve (non-streaming part)
    q_embedding = embed([question])[0]

    context_text, sources = "", []
    try:
        collection = get_or_create_collection(cohort_id)
        results    = collection.query(query_embeddings=[q_embedding], n_results=3)
        docs       = results["documents"][0]
        metas      = results["metadatas"][0]
        if docs:
            context_text = "\n\n---\n\n".join(docs)
            sources      = list({m["filename"] for m in metas})
    except Exception:
        pass

    system_prompt = _build_system_prompt()
    user_prompt = (
        f"Context from uploaded documents:\n{context_text}\n\n---\n\nQuestion: {question}"
        if context_text
        else f"Question: {question}"
    )

    def generate():
        full_answer = ""

        # Send sources metadata first
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

        # Stream OpenAI response
        stream = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=600,
            temperature=0.4,
            stream=True,
        )

        for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                full_answer += delta.content
                yield f"data: {json.dumps({'type': 'chunk', 'content': delta.content})}\n\n"

        # Persist the full answer
        with get_db() as conn:
            conn.execute(
                "INSERT INTO messages (cohort_id, user_id, content, sender_type) VALUES (?,?,?,?)",
                (cohort_id, None, full_answer, "ai")
            )

        # Signal stream end
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Keyword helpers for doc generation ────────────────────────────────────────
STOP_WORDS = {
    "a","an","and","are","as","at","be","by","for","from","has","have","in",
    "is","it","its","of","on","or","that","the","to","was","were","will",
    "with","what","when","where","who","how","why","we","you","your","our",
    "this","these","those","they","their","i","me","my","about","create",
    "generate","doc","document","make","write","please","can","could","would",
    "should","want","need","like","into","also","some","all","do","does","did",
}


def extract_keywords(text: str) -> list:
    """Pull meaningful keywords from a user prompt for SQLite LIKE search."""
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    return [t for t in tokens if len(t) > 2 and t not in STOP_WORDS]


def search_messages_by_keywords(cohort_id, keywords, limit=30):
    """Search chat messages for rows matching ANY keyword (OR logic)."""
    if not keywords:
        return []
    clauses = " OR ".join(["content LIKE ?"] * len(keywords))
    params  = [f"%{kw}%" for kw in keywords]
    with get_db() as conn:
        rows = conn.execute(f"""
            SELECT content, sender_type, created_at
            FROM   messages
            WHERE  cohort_id = ? AND ({clauses})
            ORDER  BY created_at DESC
            LIMIT  ?
        """, [cohort_id] + params + [limit]).fetchall()
    return [dict(r) for r in rows]


def build_docx(title: str, sections: list, filename: str) -> Path:
    """Create a formatted .docx from structured sections."""
    doc = Document()

    # ── Styles ──
    style = doc.styles["Normal"]
    font  = style.font
    font.name = "Calibri"
    font.size = Pt(11)
    font.color.rgb = RGBColor(0x1D, 0x1A, 0x16)
    style.paragraph_format.space_after = Pt(6)

    # ── Title ──
    title_para = doc.add_heading(title, level=0)
    title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_para.runs[0]
    run.font.color.rgb = RGBColor(0xB3, 0x4D, 0x2E)

    # ── Timestamp ──
    ts = doc.add_paragraph(f"Generated on {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")
    ts.alignment = WD_ALIGN_PARAGRAPH.CENTER
    ts.runs[0].font.size  = Pt(9)
    ts.runs[0].font.color.rgb = RGBColor(0x6B, 0x62, 0x55)

    doc.add_paragraph("")  # spacer

    # ── Sections ──
    for section in sections:
        heading_text = section.get("heading", "")
        body_text    = section.get("body", "")

        if heading_text:
            h = doc.add_heading(heading_text, level=2)
            for r in h.runs:
                r.font.color.rgb = RGBColor(0x8E, 0x37, 0x1C)

        if body_text:
            for para_text in body_text.split("\n"):
                stripped = para_text.strip()
                if not stripped:
                    continue
                if stripped.startswith("- ") or stripped.startswith("• "):
                    doc.add_paragraph(stripped[2:], style="List Bullet")
                elif re.match(r"^\d+[\.\)]\s", stripped):
                    doc.add_paragraph(re.sub(r"^\d+[\.\)]\s*", "", stripped), style="List Number")
                else:
                    doc.add_paragraph(stripped)

    filepath = DOCS_OUT_DIR / filename
    doc.save(str(filepath))
    return filepath


# ── API: generate document from chat + knowledge base ────────────────────────
@app.route("/api/generate-doc", methods=["POST"])
def generate_doc():
    if not openai_client:
        return jsonify({"error": "OPENAI_API_KEY not configured in backend/.env"}), 503

    data      = request.get_json() or {}
    cohort_id = data.get("cohort_id")
    user_id   = data.get("user_id")
    prompt    = (data.get("prompt") or "").strip()

    if not prompt:
        return jsonify({"error": "prompt is required"}), 400
    if not cohort_id:
        return jsonify({"error": "cohort_id is required"}), 400

    # ── Step 1: Extract keywords ──
    keywords = extract_keywords(prompt)

    # ── Step 2: Search chat messages ──
    matched_msgs = search_messages_by_keywords(cohort_id, keywords, limit=30)
    chat_context = ""
    if matched_msgs:
        chat_lines = []
        for m in matched_msgs:
            tag = m["sender_type"].upper()
            chat_lines.append(f"[{tag} – {m['created_at']}] {m['content']}")
        chat_context = "\n".join(chat_lines)

    # ── Step 3: Search ChromaDB ──
    kb_context = ""
    kb_sources = []
    try:
        q_embedding = embed([prompt])[0]
        collection  = get_or_create_collection(cohort_id)
        results     = collection.query(query_embeddings=[q_embedding], n_results=5)
        docs  = results["documents"][0]
        metas = results["metadatas"][0]
        if docs:
            kb_context = "\n\n---\n\n".join(docs)
            kb_sources = list({m["filename"] for m in metas})
    except Exception:
        pass

    # ── Step 4: GPT structured doc content ──
    system_prompt = """You are a professional document writer for a wedding planning team.
You will be given context from two sources:
  1) CHAT HISTORY — messages exchanged inside the wedding planning workspace.
  2) KNOWLEDGE BASE — excerpts from uploaded planning documents.

Your job is to generate a polished, well-structured document based on the user's request.

**Output format — strict JSON array:**
Return ONLY a JSON array of section objects. No markdown fences, no commentary outside the JSON.
Each object has two keys:
  - "heading": a short section title (string)
  - "body": the section content (string, may include newlines, bullet lines starting with "- ")

Example:
[
  {"heading": "Overview", "body": "This section covers..."},
  {"heading": "Vendor Details", "body": "- Photographer: Golden Hour Studio\\n- Florist: Petal & Vine"}
]

**Rules:**
- Use ONLY information present in the provided context. Do not fabricate names, prices, or dates.
- If information is missing, note it clearly (e.g., "To be confirmed").
- Organise content logically with clear headings.
- Write in a professional yet warm tone appropriate for wedding planning.
- Be thorough — include all relevant details from the context.
"""

    combined_context = ""
    if chat_context:
        combined_context += f"=== CHAT HISTORY ===\n{chat_context}\n\n"
    if kb_context:
        combined_context += f"=== KNOWLEDGE BASE ===\n{kb_context}\n\n"

    if not combined_context.strip():
        return jsonify({"error": "No relevant content found in chat history or knowledge base. Try a different description."}), 404

    user_prompt = f"{combined_context}---\n\nUser request: {prompt}"

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        raw_answer = completion.choices[0].message.content.strip()
    except Exception as e:
        return jsonify({"error": f"OpenAI API error: {str(e)}"}), 502

    # ── Step 5: Parse JSON sections ──
    try:
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw_answer)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        sections = json.loads(cleaned)
        if not isinstance(sections, list):
            raise ValueError("Expected a JSON array")
    except (json.JSONDecodeError, ValueError):
        sections = [{"heading": "Document", "body": raw_answer}]

    # ── Step 6: Title from prompt ──
    title_words = prompt.split()[:8]
    doc_title   = " ".join(title_words).title()
    if len(prompt.split()) > 8:
        doc_title += "..."

    # ── Step 7: Build .docx ──
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = re.sub(r"[^a-z0-9]+", "_", prompt.lower())[:40].strip("_")
    filename  = f"{safe_name}_{timestamp}.docx"
    filepath  = build_docx(doc_title, sections, filename)

    # ── Step 8: Save metadata ──
    with get_db() as conn:
        conn.execute(
            "INSERT INTO generated_docs (cohort_id, user_id, prompt, filename, filepath) VALUES (?,?,?,?,?)",
            (cohort_id, user_id, prompt, filename, str(filepath))
        )
        doc_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

        source_note = f" (Sources: {', '.join(kb_sources)})" if kb_sources else ""
        ai_msg = f"Document generated: **{filename}**{source_note}"
        conn.execute(
            "INSERT INTO messages (cohort_id, user_id, content, sender_type) VALUES (?,?,?,?)",
            (cohort_id, None, ai_msg, "ai")
        )

    return jsonify({
        "success":  True,
        "doc_id":   doc_id,
        "filename": filename,
        "sources":  kb_sources,
        "sections": len(sections),
    })


# ── API: download generated document ─────────────────────────────────────────
@app.route("/api/download-doc/<int:doc_id>")
def download_doc(doc_id):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM generated_docs WHERE id = ?", (doc_id,)).fetchone()
    if not row:
        return jsonify({"error": "Document not found"}), 404

    filepath = Path(row["filepath"])
    if not filepath.exists():
        return jsonify({"error": "File missing from server"}), 404

    return send_file(str(filepath), as_attachment=True, download_name=row["filename"])


# ── API: list generated docs ─────────────────────────────────────────────────
@app.route("/api/generated-docs")
def list_generated_docs():
    cohort_id = request.args.get("cohort_id")
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, prompt, filename, created_at FROM generated_docs WHERE cohort_id=? ORDER BY created_at DESC",
            (cohort_id,)
        ).fetchall()
    return jsonify([dict(r) for r in rows])


# ── API: knowledge base status ────────────────────────────────────────────────
@app.route("/api/knowledge-base")
def knowledge_base():
    cohort_id = request.args.get("cohort_id")
    with get_db() as conn:
        docs = conn.execute(
            "SELECT filename, chunk_count, created_at FROM documents WHERE cohort_id=? ORDER BY created_at DESC",
            (cohort_id,)
        ).fetchall()
    return jsonify([dict(d) for d in docs])


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_db()
    key_status = "configured" if OPENAI_API_KEY else "MISSING – add it to backend/.env"
    print(f"\n  AI Cohort Assistant – Flask Backend")
    print(f"  OpenAI key  : {key_status}")
    print(f"  SQLite db   : {DB_PATH}")
    print(f"  ChromaDB    : {CHROMA_PATH}")
    print(f"  Generated   : {DOCS_OUT_DIR}")
    print(f"  Open        : http://localhost:5000\n")
    app.run(debug=True, port=5000)