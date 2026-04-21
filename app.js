// ── Sample document ───────────────────────────────────────────────────────────
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

// ── NLP helpers ───────────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","by","for","from","has",
  "have","in","is","it","its","of","on","or","that","the","to",
  "was","were","will","with","what","when","where","who","how","why",
  "we","you","your","our","this","these","those","they","their","i"
]);

// ── Backend configuration ─────────────────────────────────────────────────────
const BACKEND_URL = "http://localhost:5000";
let backendOnline = false;

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  // Auth
  currentUser: null,          // { id, username }
  // Chat
  joined:    false,
  cohort:    "Mia & Ethan Wedding",
  messages:  [],
  resources: [],
  chunks:    [],
  // Backend IDs
  userId:   null,
  cohortId: null,
  // AI state
  aiStreaming: false,
};

// ── DOM references ────────────────────────────────────────────────────────────
const chatFeed        = document.getElementById("chat-feed");
const sendButton      = document.getElementById("send-button");
const messageInput    = document.getElementById("message-input");
const chatTitle       = document.getElementById("chat-title");
const topbarUserLabel = document.getElementById("topbar-user-label");
const fileInput       = document.getElementById("file-input");
const resourceList    = document.getElementById("resource-list");
const knowledgeStatus = document.getElementById("knowledge-status");
const docCount        = document.getElementById("doc-count");
const loadSampleBtn   = document.getElementById("load-sample");
const retrievalLabel  = document.getElementById("retrieval-label");
const backendStatusEl = document.getElementById("backend-status");
const cohortSelect    = document.getElementById("cohort-select");

// Auth panel
const authPanel        = document.getElementById("auth-panel");
const authForm         = document.getElementById("auth-form");
const authLoggedIn     = document.getElementById("auth-logged-in");
const authTitle        = document.getElementById("auth-title");
const authUsernameInput= document.getElementById("auth-username");
const authPasswordInput= document.getElementById("auth-password");
const authError        = document.getElementById("auth-error");
const loginButton      = document.getElementById("login-button");
const registerButton   = document.getElementById("register-button");
const logoutButton     = document.getElementById("logout-button");
const openChatButton   = document.getElementById("open-chat-button");
const loggedInName     = document.getElementById("logged-in-name");
const userAvatarBadge  = document.getElementById("user-avatar-badge");

// ── Initialise ────────────────────────────────────────────────────────────────
checkBackend();
restoreSession();
renderWelcomeFeed();

// ── Auth: localStorage schema ─────────────────────────────────────────────────
// wedboard:users          → { [username_lc]: { id, username, pwHash } }
// wedboard:session        → { userId, username }
// wedboard:history:<uid>:<cohort> → [ { type, author, text, time } ]

function getUsers() {
  try { return JSON.parse(localStorage.getItem("wedboard:users") || "{}"); }
  catch { return {}; }
}
function saveUsers(users) {
  localStorage.setItem("wedboard:users", JSON.stringify(users));
}
function getHistory(userId, cohort) {
  const key = `wedboard:history:${userId}:${cohort}`;
  try { return JSON.parse(localStorage.getItem(key) || "[]"); }
  catch { return []; }
}
function saveHistory(userId, cohort, messages) {
  const key = `wedboard:history:${userId}:${cohort}`;
  // Persist up to 200 messages to avoid quota issues
  const slice = messages.slice(-200);
  localStorage.setItem(key, JSON.stringify(slice));
}

/** Very simple deterministic hash — not cryptographic, fine for a local demo */
function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

function restoreSession() {
  try {
    const session = JSON.parse(localStorage.getItem("wedboard:session") || "null");
    if (session && session.userId && session.username) {
      state.currentUser = { id: session.userId, username: session.username };
      showLoggedInUI();
    } else {
      showLoggedOutUI();
    }
  } catch {
    showLoggedOutUI();
  }
}

function showLoggedOutUI() {
  authForm.classList.remove("hidden");
  authLoggedIn.classList.add("hidden");
  authTitle.textContent = "Sign In";
  authError.textContent = "";
  authUsernameInput.value = "";
  authPasswordInput.value = "";
  messageInput.disabled = true;
  messageInput.placeholder = "Sign in to start messaging…";
  sendButton.disabled = true;
}

function showLoggedInUI() {
  authForm.classList.add("hidden");
  authLoggedIn.classList.remove("hidden");
  loggedInName.textContent = state.currentUser.username;
  userAvatarBadge.textContent = state.currentUser.username.charAt(0).toUpperCase();
  topbarUserLabel.textContent = `Signed in as ${state.currentUser.username}`;
  messageInput.disabled = false;
  messageInput.placeholder = "Message the planner team or ask @ai a question…";
  sendButton.disabled = false;
}

// ── Auth event listeners ──────────────────────────────────────────────────────

// Allow Enter key in password field to trigger login
authPasswordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); doLogin(); }
});
authUsernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); doLogin(); }
});

loginButton.addEventListener("click", doLogin);
registerButton.addEventListener("click", doRegister);
logoutButton.addEventListener("click", doLogout);

openChatButton.addEventListener("click", async () => {
  state.cohort = cohortSelect.value;
  state.joined = true;
  chatTitle.textContent = state.cohort;

  // Load this user's saved history for the selected workspace
  loadLocalHistory();

  if (backendOnline) {
    try {
      const res = await apiPost("/api/join", {
        username: state.currentUser.username,
        cohort:   state.cohort
      });
      state.userId   = res.user_id;
      state.cohortId = res.cohort_id;

      // Merge server history on top
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
        appendSystemMsg(`${state.currentUser.username} rejoined ${state.cohort}. History loaded from server.`);
        return;
      }
    } catch { /* fall through to local */ }
  }

  // Local path
  if (state.messages.length <= 1) {
    // Fresh workspace — seed intro messages
    seedMessages();
  } else {
    appendSystemMsg(`Welcome back, ${state.currentUser.username}! Continuing ${state.cohort}.`);
  }
});

function doLogin() {
  authError.textContent = "";
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username || !password) {
    authError.textContent = "Please enter your username and password.";
    return;
  }

  const users = getUsers();
  const key   = username.toLowerCase();
  const user  = users[key];

  if (!user) {
    authError.textContent = "Account not found. Click Create Account to register.";
    return;
  }

  if (user.pwHash !== simpleHash(password)) {
    authError.textContent = "Incorrect password. Please try again.";
    return;
  }

  state.currentUser = { id: user.id, username: user.username };
  localStorage.setItem("wedboard:session", JSON.stringify({
    userId:   user.id,
    username: user.username
  }));

  showLoggedInUI();
  renderWelcomeFeed();
}

function doRegister() {
  authError.textContent = "";
  const username = authUsernameInput.value.trim();
  const password = authPasswordInput.value;

  if (!username) {
    authError.textContent = "Please choose a username.";
    return;
  }
  if (username.length < 2) {
    authError.textContent = "Username must be at least 2 characters.";
    return;
  }
  if (!password || password.length < 4) {
    authError.textContent = "Password must be at least 4 characters.";
    return;
  }

  const users = getUsers();
  const key   = username.toLowerCase();

  if (users[key]) {
    authError.textContent = "That username is taken. Try signing in instead.";
    return;
  }

  const newUser = {
    id:       crypto.randomUUID(),
    username: username,
    pwHash:   simpleHash(password)
  };
  users[key] = newUser;
  saveUsers(users);

  state.currentUser = { id: newUser.id, username: newUser.username };
  localStorage.setItem("wedboard:session", JSON.stringify({
    userId:   newUser.id,
    username: newUser.username
  }));

  showLoggedInUI();
  renderWelcomeFeed();
  appendSystemMsg(`Welcome to Wed Board, ${newUser.username}! Your account has been created.`);
}

function doLogout() {
  // Save current history before logging out
  if (state.currentUser && state.joined) {
    saveHistory(state.currentUser.id, state.cohort, state.messages);
  }

  state.currentUser = null;
  state.joined      = false;
  state.messages    = [];
  state.resources   = [];
  state.chunks      = [];
  state.userId      = null;
  state.cohortId    = null;

  localStorage.removeItem("wedboard:session");

  chatTitle.textContent = "Wed Board";
  topbarUserLabel.textContent = " ";
  showLoggedOutUI();
  renderWelcomeFeed();
  renderResources();
}

// ── Chat history helpers ──────────────────────────────────────────────────────
function loadLocalHistory() {
  if (!state.currentUser) return;

  const stored = getHistory(state.currentUser.id, state.cohort);
  if (stored.length) {
    state.messages = stored.map(m => ({
      ...m,
      id:   crypto.randomUUID(),
      time: new Date(m.time)
    }));
    renderMessages();
  } else {
    state.messages = [];
    renderMessages();
  }
}

/** Persist current messages after every mutation */
function persistHistory() {
  if (state.currentUser && state.joined) {
    saveHistory(state.currentUser.id, state.cohort, state.messages);
  }
}

// ── Messaging ────────────────────────────────────────────────────────────────
sendButton.addEventListener("click", handleSend);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});

function handleSend() {
  if (!state.currentUser) {
    authError.textContent = "Please sign in first.";
    authUsernameInput.focus();
    return;
  }

  // Block sending while AI is streaming
  if (state.aiStreaming) return;

  const text = messageInput.value.trim();
  if (!text) return;

  if (!state.joined) {
    // Auto-open last selected cohort if user hits Send without clicking "Open"
    state.cohort = cohortSelect.value;
    state.joined = true;
    chatTitle.textContent = state.cohort;
    loadLocalHistory();
  }

  addMessage("human", state.currentUser.username, text);
  messageInput.value = "";

  // Persist to backend if available
  if (backendOnline && state.cohortId) {
    apiPost("/api/message", {
      cohort_id:   state.cohortId,
      user_id:     state.userId,
      content:     text,
      sender_type: "human"
    }).catch(() => {});
  }

  if (text.toLowerCase().startsWith("@ai")) {
    const afterAi = text.replace(/^@ai\s*/i, "").trim();

    // Detect document generation triggers
    const docMatch = afterAi.match(
      /^(?:generate\s+doc(?:ument)?|create\s+doc(?:ument)?|make\s+doc(?:ument)?|write\s+doc(?:ument)?)\s*(.*)/i
    );

    if (docMatch) {
      const docPrompt = docMatch[1].trim() || afterAi;
      generateDocument(docPrompt);
    } else {
      respondToAi(afterAi);
    }
  }
}

function addMessage(type, author, text) {
  state.messages.push({
    id:     crypto.randomUUID(),
    type,
    author,
    text,
    time:   new Date()
  });
  renderMessages();
  persistHistory();
}

function appendSystemMsg(text) {
  addMessage("system", "System", text);
}

function renderWelcomeFeed() {
  if (!state.currentUser) {
    state.messages = [];
    addMessage("system", "System", "Welcome to AI Wedding Planner. Sign in or create an account to begin.");
    return;
  }
  if (!state.joined) {
    state.messages = [];
    addMessage("system", "System",
      `Hello, ${state.currentUser.username}! Select a wedding workspace and click Open Wedding Chat.`);
  }
}

// ── Seed messages (first-time workspace) ─────────────────────────────────────
function seedMessages() {
  addMessage("system",  "System",       `${state.currentUser.username} opened ${state.cohort}. Ready for demo.`);
  addMessage("human",   "Lead Planner", "I uploaded the event schedule draft and vendor checklist.");
  addMessage("human",   "Photographer", "Please confirm the ceremony start time before I finalize my arrival.");
  addMessage("human",   "Bride",        "I want the floral style to stay modern and minimal.");
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function showTypingIndicator() {
  removeTypingIndicator();
  const indicator = document.createElement("article");
  indicator.className = "message ai typing-indicator-msg";
  indicator.id = "ai-typing-indicator";
  indicator.innerHTML = `
    <div class="message-avatar"></div>
    <div class="message-body">
      <div class="message-meta">
        <strong class="message-author">AI Assistant</strong>
      </div>
      <div class="typing-indicator">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>
  `;
  chatFeed.appendChild(indicator);
  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function removeTypingIndicator() {
  const existing = document.getElementById("ai-typing-indicator");
  if (existing) existing.remove();
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderMessages() {
  chatFeed.innerHTML = "";
  const template = document.getElementById("message-template");

  for (const message of state.messages) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(message.type);
    node.querySelector(".message-author").textContent = message.author;
    node.querySelector(".message-time").textContent   = formatTime(message.time);
    node.querySelector(".message-text").innerHTML     = formatMessage(message.text, message.type);
    chatFeed.appendChild(node);
  }

  chatFeed.scrollTop = chatFeed.scrollHeight;
}

function renderResources() {
  docCount.textContent = `${state.resources.length} ${state.resources.length === 1 ? "doc" : "docs"}`;
  resourceList.innerHTML = "";

  if (!state.resources.length) {
    knowledgeStatus.textContent = "No wedding documents uploaded yet.";
    retrievalLabel.textContent  = "Retrieval idle";
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
      img.src       = resource.previewUrl;
      img.alt       = resource.name;
      card.appendChild(img);
    }

    resourceList.appendChild(card);
  });
}

// ── File uploads ──────────────────────────────────────────────────────────────
fileInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;

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

loadSampleBtn.addEventListener("click", async () => {
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
    id:         crypto.randomUUID(),
    name:       file.name,
    type:       "image",
    summary:    "Image uploaded successfully and available for display in the wedding workspace.",
    previewUrl
  });
  addMessage("system", "System",
    `Uploaded image ${file.name}. You can use it as decor inspiration or venue reference in the demo.`);
}

function addDocumentFromText(name, text) {
  const cleaned = text.trim();
  if (!cleaned) return;

  const chunks = chunkText(cleaned, 360);
  state.resources.unshift({
    id:         crypto.randomUUID(),
    name,
    type:       "text",
    summary:    `${chunks.length} retrieval chunk(s) created.`,
    previewUrl: null
  });

  chunks.forEach((content, index) => {
    state.chunks.push({
      id:      crypto.randomUUID(),
      source:  name,
      index:   index + 1,
      content,
      vector:  vectorize(content)
    });
  });

  renderResources();
}

// ── AI Retrieval (streaming) ─────────────────────────────────────────────────
function respondToAi(question) {
  if (!question) {
    addMessage("ai", "AI Assistant", "Ask a question after `@ai` so I can search the knowledge base.");
    return;
  }

  retrievalLabel.textContent = "Querying…";

  if (backendOnline && state.cohortId) {
    // Show typing indicator
    showTypingIndicator();
    state.aiStreaming = true;

    // Use streaming endpoint
    fetch(`${BACKEND_URL}/api/ai-query-stream`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        cohort_id: state.cohortId,
        question,
        user_id:   state.userId
      })
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader  = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = "";
        let fullText  = "";
        let sources   = [];
        let msgNode   = null;  // the DOM node we update live

        function processSSE(text) {
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const evt = JSON.parse(jsonStr);

              if (evt.type === "sources") {
                sources = evt.sources || [];
              }

              if (evt.type === "chunk") {
                // First chunk → replace typing indicator with real message
                if (!msgNode) {
                  removeTypingIndicator();
                  // Create a live AI message node
                  const template = document.getElementById("message-template");
                  msgNode = template.content.firstElementChild.cloneNode(true);
                  msgNode.classList.add("ai");
                  msgNode.querySelector(".message-author").textContent = "AI Assistant";
                  msgNode.querySelector(".message-time").textContent   = formatTime(new Date());
                  msgNode.querySelector(".message-text").innerHTML     = "";
                  chatFeed.appendChild(msgNode);
                }
                fullText += evt.content;
                // Re-render the full markdown each chunk for correct formatting
                msgNode.querySelector(".message-text").innerHTML = renderMarkdown(fullText);
                chatFeed.scrollTop = chatFeed.scrollHeight;
              }

              if (evt.type === "done") {
                // Add source note
                if (sources.length) {
                  fullText += `\n\n*Sources: ${sources.join(", ")}*`;
                  if (msgNode) {
                    msgNode.querySelector(".message-text").innerHTML = renderMarkdown(fullText);
                  }
                }

                // Save to state
                state.messages.push({
                  id:     crypto.randomUUID(),
                  type:   "ai",
                  author: "AI Assistant",
                  text:   fullText,
                  time:   new Date()
                });
                persistHistory();

                retrievalLabel.textContent = sources.length
                  ? "Retrieval grounded in ChromaDB docs"
                  : "Answered from general knowledge";
                state.aiStreaming = false;
              }
            } catch (e) {
              // skip malformed JSON
            }
          }
        }

        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              // Process any remaining buffer
              if (buffer.trim()) processSSE("\n");
              state.aiStreaming = false;
              removeTypingIndicator();
              return;
            }
            processSSE(decoder.decode(value, { stream: true }));
            return pump();
          });
        }

        return pump();
      })
      .catch(() => {
        removeTypingIndicator();
        state.aiStreaming = false;
        retrievalLabel.textContent = "Error";
        addMessage("ai", "AI Assistant",
          "Backend error while querying. Check that OPENAI_API_KEY is set in backend/.env.");
      });
    return;
  }

  // Local bag-of-words fallback (non-streaming)
  showTypingIndicator();
  setTimeout(() => {
    removeTypingIndicator();
    const results = searchKnowledgeBase(question);
    retrievalLabel.textContent = results.length
      ? "Retrieval grounded in docs"
      : "No matching context found";

    if (!results.length) {
      addMessage("ai", "AI Assistant",
        "No relevant content found locally. Upload a document or click `Load Sample Doc`, then ask again.");
      return;
    }

    addMessage("ai", "AI Assistant", buildAnswer(question, results[0], results[1]));
  }, 450);
}

// ── Document generation ──────────────────────────────────────────────────────
function generateDocument(prompt) {
  if (!prompt) {
    addMessage("ai", "AI Assistant",
      "Please describe what document you'd like after `@ai generate doc`. For example:\n`@ai generate doc vendor schedule and contact details`");
    return;
  }

  retrievalLabel.textContent = "Generating document…";
  showTypingIndicator();
  state.aiStreaming = true;

  if (backendOnline && state.cohortId) {
    apiPost("/api/generate-doc", {
      cohort_id: state.cohortId,
      user_id:   state.userId,
      prompt:    prompt
    })
      .then(data => {
        removeTypingIndicator();
        state.aiStreaming = false;

        const sourceNote = data.sources && data.sources.length
          ? `\n\n*Sources used: ${data.sources.join(", ")}*`
          : "";
        const downloadUrl = `${BACKEND_URL}/api/download-doc/${data.doc_id}`;
        const msg = `**Your document has been generated!**\n\n`
          + `**Document:** ${data.filename}\n`
          + `**Sections:** ${data.sections}${sourceNote}\n\n`
          + `[Download Document](${downloadUrl})`;

        addMessage("ai", "AI Assistant", msg);
        retrievalLabel.textContent = "Document generated";
      })
      .catch(async (err) => {
        removeTypingIndicator();
        state.aiStreaming = false;
        let errorMsg = "Failed to generate document.";
        try {
          if (err.response) {
            const errData = await err.response.json();
            errorMsg = errData.error || errorMsg;
          }
        } catch {}
        addMessage("ai", "AI Assistant", `**Error:** ${errorMsg}\nPlease check that the backend is running and OPENAI_API_KEY is set.`);
        retrievalLabel.textContent = "Document generation failed";
      });
    return;
  }

  // No backend
  removeTypingIndicator();
  state.aiStreaming = false;
  addMessage("ai", "AI Assistant",
    "Document generation requires the Flask backend to be running. Start it with `cd backend && python app.py` and reload.");
  retrievalLabel.textContent = "Backend offline";
}

function searchKnowledgeBase(question) {
  const queryVector = vectorize(question);
  return state.chunks
    .map(chunk => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.vector) }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function buildAnswer(question, best, support) {
  const lead    = best.content.split(/\n+/)[0].trim();
  const excerpt = compressWhitespace(best.content).slice(0, 240);
  const supportLine = support
    ? `\nSupporting context: ${compressWhitespace(support.content).slice(0, 140)}`
    : "";

  return `Based on the uploaded wedding materials, here is the most relevant guidance for "${question}":

${lead}

Key retrieved excerpt: "${excerpt}${excerpt.length >= 240 ? "…" : ""}"
Source: ${best.source} (chunk ${best.index})${supportLine}

 `;
}

// ── NLP ───────────────────────────────────────────────────────────────────────
function chunkText(text, maxLength) {
  const normalized = text.replace(/\r/g, "");
  const paragraphs = normalized.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= maxLength) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      if (current) chunks.push(current);
      if (paragraph.length <= maxLength) {
        current = paragraph;
      } else {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        current = "";
        for (const sentence of sentences) {
          if ((current + " " + sentence).trim().length <= maxLength) {
            current = current ? `${current} ${sentence}` : sentence;
          } else {
            if (current) chunks.push(current);
            current = sentence;
          }
        }
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function vectorize(text) {
  const terms  = tokenize(text);
  const vector = {};
  for (const term of terms) vector[term] = (vector[term] || 0) + 1;
  return vector;
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

function cosineSimilarity(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dot = 0, magA = 0, magB = 0;
  keys.forEach(key => {
    const av = a[key] || 0, bv = b[key] || 0;
    dot  += av * bv;
    magA += av * av;
    magB += bv * bv;
  });
  return (!magA || !magB) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Markdown rendering ───────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (typeof marked !== "undefined") {
    // Use marked.js for full markdown parsing
    marked.setOptions({
      breaks: true,
      gfm: true,
      sanitize: false,
    });
    return marked.parse(text);
  }
  // Fallback if marked.js hasn't loaded
  return fallbackMarkdown(text);
}

function fallbackMarkdown(text) {
  // Basic markdown rendering without external lib
  let html = escapeHtml(text);
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');
  // Line breaks
  html = html.replace(/\n/g, "<br>");
  return html;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sanitizeName(v) { return v.replace(/\s+/g, " ").trim(); }

function formatTime(date) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatMessage(text, type) {
  // Use markdown rendering for AI messages, basic formatting for others
  if (type === "ai") {
    return renderMarkdown(text);
  }
  // Human / system messages: simple escape + code + line breaks
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

function compressWhitespace(text) { return text.replace(/\s+/g, " ").trim(); }

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ── Backend helpers ───────────────────────────────────────────────────────────
async function checkBackend() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2500) });
    if (res.ok) {
      backendOnline = true;
      if (backendStatusEl) {
        backendStatusEl.textContent = "Backend online";
        backendStatusEl.className   = "pill backend-online";
      }
    }
  } catch { backendOnline = false; }
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