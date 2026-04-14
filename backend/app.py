"""
AI Cohort Assistant – Flask backend
Stack : Flask · SQLite · ChromaDB · OpenAI
Run   : cd backend && python app.py
"""

import os
import uuid
import sqlite3
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
import chromadb
from openai import OpenAI

load_dotenv()

# ── Paths ─────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent
BACKEND_DIR  = Path(__file__).parent
DB_PATH      = BACKEND_DIR / "cohort.db"
CHROMA_PATH  = BACKEND_DIR / "chroma_data"

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


# ── API: AI query (RAG pipeline) ──────────────────────────────────────────────
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
    system_prompt = """You are an expert wedding planning assistant powered by a curated knowledge base of wedding venues, vendors, timelines, budgets, etiquette guides, and real couple experiences.

    **How to answer:**
    1. Answer ONLY from the provided context documents. Every factual claim must reference its source.
    2. After each claim, add an inline citation in the format [Source: <document_name>, Section: <section>].
    3. If multiple sources agree, cite all of them.
    4. If the context does not contain enough information to answer fully, clearly state: "Based on the available documents, I can confirm [what you found]. However, I don't have information on [what's missing] — I'd recommend consulting [specific professional]."
    5. Never fabricate vendor names, prices, availability, or policies.

    **Response format:**
    - Lead with a direct answer, then supporting details.
    - When comparing options (venues, vendors, packages), use a structured breakdown: Name, Price Range, Capacity, Pros, Cons — all cited.
    - End every response with a "Sources Used" section listing each document referenced.

    **Domain rules:**
    - Budget figures must always include the date they were recorded, since pricing changes seasonally.
    - Venue availability is time-sensitive — remind users to verify directly with vendors.
    - For etiquette questions, note if advice varies by culture or region and cite the relevant guide.
    - Flag any potential conflicts (e.g., a vendor's blackout dates overlapping with the user's wedding date) proactively.

    """
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
    print(f"  Open        : http://localhost:5000\n")
    app.run(debug=True, port=5000)
