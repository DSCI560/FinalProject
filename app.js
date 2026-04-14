const SAMPLE_DOC = `AI Wedding Planner - Event Planning Brief

Event overview:
- Couple: Mia and Ethan .
- Wedding date: June 21.
- Venue: Rosewood Garden Estate.
- Ceremony start time: 4:30 PM.
- Guest arrival begins at 4:00 PM.
- Reception start time: 6:00 PM.

Vendor schedule:
- Photographer: Golden Hour Studio, arrival at 1:30 PM.
- Florist: Petal & Vine, setup completed by 2:00 PM.
- DJ: Blue Note Events, sound check at 3:00 PM.
- Catering: Hearth Table, dinner service at 6:30 PM.

Planning notes:
- The bride wants a modern minimalist style with ivory florals and soft candle lighting.
- The couple wants a shared workspace where the planner, photographer, florist, and family can coordinate quickly.
- The system should support file uploads for contracts, schedules, and inspiration boards.
- The assistant should answer questions from uploaded planning documents and display images inside the workspace.

Milestone 1 demo goals:
- Show a shared wedding planning chat.
- Upload a planning document or inspiration image.
- Ask the assistant a schedule or vendor question.
- Return an answer grounded in the uploaded material.`;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has",
  "have", "in", "is", "it", "its", "of", "on", "or", "that", "the", "to",
  "was", "were", "will", "with", "what", "when", "where", "who", "how", "why",
  "we", "you", "your", "our", "this", "these", "those", "they", "their", "i"
]);

// ── Backend configuration ─────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";
let backendOnline = false;

const state = {
  joined: false,
  userName: "Planner",
  cohort: "Mia & Ethan Wedding",
  messages: [],
  resources: [],
  chunks: [],
  userId: null,
  cohortId: null
};

const chatFeed = document.getElementById("chat-feed");
const usernameInput = document.getElementById("username");
const cohortSelect = document.getElementById("cohort-select");
const joinButton = document.getElementById("join-button");
const sendButton = document.getElementById("send-button");
const messageInput = document.getElementById("message-input");
const chatTitle = document.getElementById("chat-title");
const fileInput = document.getElementById("file-input");
const resourceList = document.getElementById("resource-list");
const knowledgeStatus = document.getElementById("knowledge-status");
const docCount = document.getElementById("doc-count");
const loadSampleButton = document.getElementById("load-sample");
const retrievalLabel = document.getElementById("retrieval-label");
const backendStatus  = document.getElementById("backend-status");

seedMessages();
renderMessages();
renderResources();
checkBackend();

joinButton.addEventListener("click", async () => {
  state.userName = sanitizeName(usernameInput.value) || "Team Member";
  state.cohort   = cohortSelect.value;
  state.joined   = true;
  chatTitle.textContent = state.cohort;

  if (backendOnline) {
    try {
      const res = await apiPost("/api/join", { username: state.userName, cohort: state.cohort });
      state.userId   = res.user_id;
      state.cohortId = res.cohort_id;

      // Load persisted message history from SQLite
      const history = await apiGet(`/api/messages?cohort_id=${state.cohortId}`);
      if (history.length) {
        state.messages = [];
        history.forEach(m => {
          state.messages.push({
            id:     crypto.randomUUID(),
            type:   m.sender_type,
            author: m.username || (m.sender_type === "ai" ? "AI Assistant" : "System"),
            text:   m.content,
            time:   new Date(m.created_at + "Z")
          });
        });
        renderMessages();
        addMessage("system", "System",
          `${state.userName} rejoined ${state.cohort}. Chat history loaded from SQLite.`);
      } else {
        addMessage("system", "System",
          `${state.userName} joined ${state.cohort}. Connected to Flask + SQLite + ChromaDB.`);
      }
    } catch (err) {
      addMessage("system", "System",
        `${state.userName} joined ${state.cohort}. (Backend error – running in local mode.)`);
    }
  } else {
    addMessage("system", "System",
      `${state.userName} joined ${state.cohort}. Ready for demo.`);
  }
});

sendButton.addEventListener("click", handleSend);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});

fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  for (const file of files) {
    if (file.type.startsWith("image/")) {
      await addImageResource(file);
    } else {
      await addTextResource(file);
    }
  }

  fileInput.value = "";
  renderResources();
});

loadSampleButton.addEventListener("click", async () => {
  if (backendOnline && state.cohortId) {
    const blob = new Blob([SAMPLE_DOC], { type: "text/plain" });
    const file = new File([blob], "sample-wedding-plan.txt", { type: "text/plain" });
    await addTextResource(file);
  } else {
    addDocumentFromText("sample-wedding-plan.txt", SAMPLE_DOC);
    addMessage("system", "System",
      "Loaded sample doc locally. Ask `@ai what time does the ceremony start?`");
  }
});

function seedMessages() {
  addMessage("system", "System", "Welcome to AI Wedding Planner. Open a wedding workspace to begin.");
  addMessage("human", "Lead Planner", "I uploaded the event schedule draft and vendor checklist.");
  addMessage("human", "Photographer", "Please confirm the ceremony start time before I finalize my arrival.");
  addMessage("human", "Bride", "I want the floral style to stay modern and minimal.");
}

function handleSend() {
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  if (!state.joined) {
    state.userName = sanitizeName(usernameInput.value) || "Team Member";
    state.cohort   = cohortSelect.value;
    state.joined   = true;
    chatTitle.textContent = state.cohort;
  }

  addMessage("human", state.userName, text);
  messageInput.value = "";

  // Persist human message to SQLite
  if (backendOnline && state.cohortId) {
    apiPost("/api/message", {
      cohort_id:   state.cohortId,
      user_id:     state.userId,
      content:     text,
      sender_type: "human"
    }).catch(() => {});
  }

  if (text.toLowerCase().startsWith("@ai")) {
    const question = text.replace(/^@ai\s*/i, "").trim();
    respondToAi(question);
  }
}

function addMessage(type, author, text) {
  state.messages.push({
    id: crypto.randomUUID(),
    type,
    author,
    text,
    time: new Date()
  });
  renderMessages();
}

function renderMessages() {
  chatFeed.innerHTML = "";
  const template = document.getElementById("message-template");

  for (const message of state.messages) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(message.type);
    node.querySelector(".message-author").textContent = message.author;
    node.querySelector(".message-time").textContent = formatTime(message.time);
    node.querySelector(".message-text").innerHTML = formatMessage(message.text);
    chatFeed.appendChild(node);
  }

  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function renderResources() {
  docCount.textContent = `${state.resources.length} ${state.resources.length === 1 ? "doc" : "docs"}`;
  resourceList.innerHTML = "";

  if (!state.resources.length) {
    knowledgeStatus.textContent = "No wedding documents uploaded yet.";
    retrievalLabel.textContent = "Retrieval idle";
    return;
  }

  knowledgeStatus.textContent =
    `${state.resources.length} resource(s) loaded, ${state.chunks.length} chunk(s) indexed for retrieval.`;

  state.resources.forEach((resource) => {
    const card = document.createElement("article");
    card.className = "resource-card";
    card.innerHTML = `
      <div class="resource-title">
        <strong>${escapeHtml(resource.name)}</strong>
        <span class="pill">${resource.type}</span>
      </div>
      <p class="resource-meta">${escapeHtml(resource.summary)}</p>
    `;

    if (resource.previewUrl) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = resource.previewUrl;
      img.alt = resource.name;
      card.appendChild(img);
    }

    resourceList.appendChild(card);
  });
}

async function addTextResource(file) {
  if (backendOnline && state.cohortId) {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("cohort_id", state.cohortId);
      const res  = await fetch(`${BACKEND_URL}/api/upload`, { method: "POST", body: form });
      const data = await res.json();
      state.resources.unshift({
        id:         crypto.randomUUID(),
        name:       file.name,
        type:       "text",
        summary:    `${data.chunks} chunk(s) embedded with OpenAI ada-002 and stored in ChromaDB.`,
        previewUrl: null
      });
      renderResources();
      addMessage("system", "System",
        `Uploaded ${file.name} → ${data.chunks} chunks embedded with OpenAI and indexed in ChromaDB.`);
      return;
    } catch (err) {
      console.warn("Backend upload failed, falling back to local:", err);
    }
  }

  // Local fallback
  const text = await readFileAsText(file);
  addDocumentFromText(file.name, text);
  addMessage("system", "System", `Uploaded ${file.name} and indexed it locally for retrieval.`);
}

async function addImageResource(file) {
  const previewUrl = await readFileAsDataUrl(file);
  state.resources.unshift({
    id: crypto.randomUUID(),
    name: file.name,
    type: "image",
    summary: "Image uploaded successfully and available for display in the wedding workspace.",
    previewUrl
  });
  addMessage("system", "System", `Uploaded image ${file.name}. You can use it as decor inspiration or venue reference in the demo.`);
}

function addDocumentFromText(name, text) {
  const cleaned = text.trim();
  if (!cleaned) {
    return;
  }

  const chunks = chunkText(cleaned, 360);
  state.resources.unshift({
    id: crypto.randomUUID(),
    name,
    type: "text",
    summary: `${chunks.length} retrieval chunk(s) created.`,
    previewUrl: null
  });

  chunks.forEach((content, index) => {
    state.chunks.push({
      id: crypto.randomUUID(),
      source: name,
      index: index + 1,
      content,
      vector: vectorize(content)
    });
  });

  renderResources();
}

function respondToAi(question) {
  if (!question) {
    addMessage("ai", "AI Assistant", "Ask a question after `@ai` so I can search the knowledge base.");
    return;
  }

  retrievalLabel.textContent = "Querying...";

  if (backendOnline && state.cohortId) {
    apiPost("/api/ai-query", { cohort_id: state.cohortId, question, user_id: state.userId })
      .then(data => {
        const sourceNote = data.sources && data.sources.length
          ? `\n\nSources: ${data.sources.join(", ")}`
          : "";
        addMessage("ai", "AI Assistant", data.response + sourceNote);
        retrievalLabel.textContent = data.sources && data.sources.length
          ? "Retrieval grounded in ChromaDB docs"
          : "Answered from general knowledge";
      })
      .catch(() => {
        retrievalLabel.textContent = "Error";
        addMessage("ai", "AI Assistant",
          "Backend error while querying. Check that OPENAI_API_KEY is set in backend/.env.");
      });
    return;
  }

  // Local fallback (bag-of-words cosine similarity)
  setTimeout(() => {
    const results = searchKnowledgeBase(question);
    retrievalLabel.textContent = results.length ? "Retrieval grounded in docs" : "No matching context found";

    if (!results.length) {
      addMessage("ai", "AI Assistant",
        "No relevant content found locally. Upload a document or click `Load Sample Doc`, then ask again.");
      return;
    }

    const best   = results[0];
    const support = results[1];
    addMessage("ai", "AI Assistant", buildAnswer(question, best, support));
  }, 450);
}

function searchKnowledgeBase(question) {
  const queryVector = vectorize(question);

  return state.chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, chunk.vector)
    }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildAnswer(question, best, support) {
  const lead = best.content.split(/\n+/)[0].trim();
  const excerpt = compressWhitespace(best.content).slice(0, 240);
  const supportLine = support
    ? `\nSupporting context: ${compressWhitespace(support.content).slice(0, 140)}`
    : "";

  return `Based on the uploaded wedding materials, here is the most relevant guidance for "${question}":

${lead}

Key retrieved excerpt: "${excerpt}${excerpt.length >= 240 ? "..." : ""}"
Source: ${best.source} (chunk ${best.index})${supportLine}

 `;
}

function chunkText(text, maxLength) {
  const normalized = text.replace(/\r/g, "");
  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= maxLength) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      if (current) {
        chunks.push(current);
      }
      if (paragraph.length <= maxLength) {
        current = paragraph;
      } else {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        current = "";
        for (const sentence of sentences) {
          if ((current + " " + sentence).trim().length <= maxLength) {
            current = current ? `${current} ${sentence}` : sentence;
          } else {
            if (current) {
              chunks.push(current);
            }
            current = sentence;
          }
        }
      }
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function vectorize(text) {
  const terms = tokenize(text);
  const vector = {};

  for (const term of terms) {
    vector[term] = (vector[term] || 0) + 1;
  }

  return vector;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0;
  let magA = 0;
  let magB = 0;

  keys.forEach((key) => {
    const aValue = a[key] || 0;
    const bValue = b[key] || 0;
    dot += aValue * bValue;
    magA += aValue * aValue;
    magB += bValue * bValue;
  });

  if (!magA || !magB) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function sanitizeName(value) {
  return value.replace(/\s+/g, " ").trim();
}

function formatTime(date) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatMessage(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function compressWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Backend API helpers ───────────────────────────────────────────────────────
async function checkBackend() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`, {
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      backendOnline = true;
      if (backendStatus) {
        backendStatus.textContent = "Backend online";
        backendStatus.className   = "pill backend-online";
      }
    }
  } catch {
    backendOnline = false;
  }
}

async function apiPost(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
