// ═══════════════════════════════════════════════════════════════════════════════
// WedBoard — Modern Messenger SPA
// ═══════════════════════════════════════════════════════════════════════════════

const SAMPLE_DOC = `AI Wedding Planner - Event Planning Brief\n\nEvent overview:\n- Couple: Mia and Ethan.\n- Wedding date: June 21.\n- Venue: Rosewood Garden Estate.\n- Ceremony start time: 4:30 PM.\n- Guest arrival begins at 4:00 PM.\n- Reception start time: 6:00 PM.\n\nVendor schedule:\n- Photographer: Golden Hour Studio, arrival at 1:30 PM.\n- Florist: Petal & Vine, setup completed by 2:00 PM.\n- DJ: Blue Note Events, sound check at 3:00 PM.\n- Catering: Hearth Table, dinner service at 6:30 PM.\n\nPlanning notes:\n- The bride wants a modern minimalist style with ivory florals and soft candle lighting.\n- The couple wants a shared workspace where the planner, photographer, florist, and family can coordinate quickly.\n- The system should support file uploads for contracts, schedules, and inspiration boards.\n- The assistant should answer questions from uploaded planning documents.`;

const STOP_WORDS = new Set(["a","an","and","are","as","at","be","by","for","from","has","have","in","is","it","its","of","on","or","that","the","to","was","were","will","with","what","when","where","who","how","why","we","you","your","our","this","these","those","they","their","i"]);

const BACKEND_URL = "http://192.168.0.149:5000";
let backendOnline = false;

// ── AI key (Gemini offline fallback) ──────────────────────────────────────────
function getApiKey() { return localStorage.getItem("wedboard:gemini_key") || ""; }
function saveApiKey(k) { k ? localStorage.setItem("wedboard:gemini_key", k) : localStorage.removeItem("wedboard:gemini_key"); }

const state = {
  currentUser: null,
  joined: false,
  cohort: "",
  messages: [],
  resources: [],
  chunks: [],
  userId: null,
  cohortId: null,
  aiStreaming: false,
  selectedRole: null,
  activeVendorChat: null,
  reviewRating: 0,
};

// ── View management ──────────────────────────────────────────────────────────
const V = {};
["landing","signin","reg-couple","reg-vendor","couple","vendor"].forEach(k => V[k] = document.getElementById("view-" + k));
function showView(name) { Object.values(V).forEach(v => v.classList.add("hidden")); V[name].classList.remove("hidden"); }

// ── Storage ──────────────────────────────────────────────────────────────────
function getUsers() { try { return JSON.parse(localStorage.getItem("wedboard:users") || "{}"); } catch { return {}; } }
function saveUsers(u) { localStorage.setItem("wedboard:users", JSON.stringify(u)); }
function getHistory(uid, key) { try { return JSON.parse(localStorage.getItem(`wedboard:h:${uid}:${key}`) || "[]"); } catch { return []; } }
function saveHistory(uid, key, msgs) { localStorage.setItem(`wedboard:h:${uid}:${key}`, JSON.stringify(msgs.slice(-200))); }
function getReviews() { try { return JSON.parse(localStorage.getItem("wedboard:reviews") || "[]"); } catch { return []; } }
function saveReviews(r) { localStorage.setItem("wedboard:reviews", JSON.stringify(r)); }
function getLastRead(uid, chatKey) { return localStorage.getItem(`wedboard:lr:${uid}:${chatKey}`) || ""; }
function saveLastRead(uid, chatKey) { localStorage.setItem(`wedboard:lr:${uid}:${chatKey}`, new Date().toISOString()); }
function simpleHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; } return h.toString(16); }

// ── Init ─────────────────────────────────────────────────────────────────────
checkBackend();
restoreSession();

function restoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem("wedboard:session") || "null");
    if (s && s.userId && s.username && s.role) {
      const users = getUsers();
      const u = users[s.username.toLowerCase()];
      state.currentUser = { id: s.userId, username: s.username, role: s.role, profile: u ? u.profile : {} };
      s.role === "couple" ? showCoupleDash() : showVendorDash();
      return;
    }
  } catch {}
  showView("landing");
}

// ═══ LANDING ═══════════════════════════════════════════════════════════════════
document.getElementById("role-couple").onclick = () => { state.selectedRole = "couple"; showView("reg-couple"); };
document.getElementById("role-vendor").onclick = () => { state.selectedRole = "vendor"; showView("reg-vendor"); };
document.getElementById("go-signin").onclick = e => { e.preventDefault(); showView("signin"); };

// ═══ SIGN IN ══════════════════════════════════════════════════════════════════
document.getElementById("signin-back").onclick = () => showView("landing");
document.getElementById("go-register").onclick = e => { e.preventDefault(); showView("landing"); };
document.getElementById("signin-form").onsubmit = e => { e.preventDefault(); doSignIn(); };

function doSignIn() {
  const err = document.getElementById("si-err");
  err.textContent = "";
  const username = document.getElementById("si-user").value.trim();
  const password = document.getElementById("si-pass").value;
  if (!username || !password) { err.textContent = "Enter username and password."; return; }
  const users = getUsers(), key = username.toLowerCase(), user = users[key];
  if (!user) { err.textContent = "Account not found."; return; }
  if (user.pwHash !== simpleHash(password)) { err.textContent = "Wrong password."; return; }
  state.currentUser = { id: user.id, username: user.username, role: user.role, profile: user.profile || {} };
  localStorage.setItem("wedboard:session", JSON.stringify({ userId: user.id, username: user.username, role: user.role }));
  user.role === "couple" ? showCoupleDash() : showVendorDash();
}

// ═══ COUPLE REGISTRATION ══════════════════════════════════════════════════════
document.getElementById("rc-back").onclick = () => showView("landing");
document.getElementById("rc-next").onclick = () => {
  const n1 = document.getElementById("rc-n1").value.trim(), n2 = document.getElementById("rc-n2").value.trim();
  const u = document.getElementById("rc-user").value.trim(), p = document.getElementById("rc-pass").value;
  if (!n1 || !n2) { alert("Enter both partner names."); return; }
  if (!u || u.length < 2) { alert("Username: min 2 chars."); return; }
  if (!p || p.length < 4) { alert("Password: min 4 chars."); return; }
  if (getUsers()[u.toLowerCase()]) { alert("Username taken."); return; }
  document.getElementById("rc-s1").classList.add("hidden");
  document.getElementById("rc-s2").classList.remove("hidden");
  setDots("rc-steps", 2);
};
document.getElementById("rc-prev").onclick = () => { document.getElementById("rc-s2").classList.add("hidden"); document.getElementById("rc-s1").classList.remove("hidden"); setDots("rc-steps", 1); };
document.getElementById("rc-form").onsubmit = e => {
  e.preventDefault();
  const err = document.getElementById("rc-err"); err.textContent = "";
  const username = document.getElementById("rc-user").value.trim(), password = document.getElementById("rc-pass").value;
  const users = getUsers(), key = username.toLowerCase();
  if (users[key]) { err.textContent = "Username taken."; return; }
  const profile = { partner1: document.getElementById("rc-n1").value.trim(), partner2: document.getElementById("rc-n2").value.trim(), weddingDate: document.getElementById("rc-date").value, venue: document.getElementById("rc-venue").value.trim(), guestCount: document.getElementById("rc-guests").value, style: document.getElementById("rc-style").value };
  const nu = { id: crypto.randomUUID(), username, role: "couple", profile, pwHash: simpleHash(password), createdAt: new Date().toISOString() };
  users[key] = nu; saveUsers(users);
  state.currentUser = { id: nu.id, username, role: "couple", profile };
  localStorage.setItem("wedboard:session", JSON.stringify({ userId: nu.id, username, role: "couple" }));
  showCoupleDash();
  setTimeout(() => startTutorial(), 600);
};

// ═══ VENDOR REGISTRATION ══════════════════════════════════════════════════════
document.getElementById("rv-back").onclick = () => showView("landing");
document.getElementById("rv-next1").onclick = () => {
  const u = document.getElementById("rv-user").value.trim(), p = document.getElementById("rv-pass").value;
  const b = document.getElementById("rv-biz").value.trim(), c = document.getElementById("rv-cat").value;
  if (!u || u.length < 2) { alert("Username: min 2 chars."); return; }
  if (!p || p.length < 4) { alert("Password: min 4 chars."); return; }
  if (!b) { alert("Enter business name."); return; }
  if (!c) { alert("Select category."); return; }
  if (getUsers()[u.toLowerCase()]) { alert("Username taken."); return; }
  document.getElementById("rv-s1").classList.add("hidden"); document.getElementById("rv-s2").classList.remove("hidden"); setDots("rv-steps", 2);
};
document.getElementById("rv-prev2").onclick = () => { document.getElementById("rv-s2").classList.add("hidden"); document.getElementById("rv-s1").classList.remove("hidden"); setDots("rv-steps", 1); };
document.getElementById("rv-next2").onclick = () => { document.getElementById("rv-s2").classList.add("hidden"); document.getElementById("rv-s3").classList.remove("hidden"); setDots("rv-steps", 3); };
document.getElementById("rv-prev3").onclick = () => { document.getElementById("rv-s3").classList.add("hidden"); document.getElementById("rv-s2").classList.remove("hidden"); setDots("rv-steps", 2); };
document.getElementById("rv-add-pkg").onclick = () => {
  const d = document.createElement("div"); d.className = "pkg-card";
  d.innerHTML = '<div class="row"><label class="f"><span>Package Name</span><input type="text" class="pkg-name" placeholder="e.g. Half Day"></label><label class="f"><span>Price ($)</span><input type="number" class="pkg-price" placeholder="1800" min="0"></label></div><label class="f"><span>Description</span><textarea class="pkg-desc" rows="2" placeholder="Describe..."></textarea></label>';
  document.getElementById("rv-products").appendChild(d);
};
document.getElementById("rv-photos").onchange = e => {
  const grid = document.getElementById("rv-photo-grid"); grid.innerHTML = "";
  Array.from(e.target.files).forEach(f => { if (!f.type.startsWith("image/")) return; const img = document.createElement("img"); img.src = URL.createObjectURL(f); grid.appendChild(img); });
};
document.getElementById("rv-form").onsubmit = e => {
  e.preventDefault();
  const err = document.getElementById("rv-err"); err.textContent = "";
  const username = document.getElementById("rv-user").value.trim(), password = document.getElementById("rv-pass").value;
  const users = getUsers(), key = username.toLowerCase();
  if (users[key]) { err.textContent = "Username taken."; return; }
  const products = []; document.querySelectorAll("#rv-products .pkg-card").forEach(entry => {
    const n = entry.querySelector(".pkg-name").value.trim(), p = entry.querySelector(".pkg-price").value, d = entry.querySelector(".pkg-desc").value.trim();
    if (n) products.push({ name: n, price: p || "TBD", description: d });
  });
  const profile = { businessName: document.getElementById("rv-biz").value.trim(), category: document.getElementById("rv-cat").value, products, address: document.getElementById("rv-addr").value.trim(), city: document.getElementById("rv-city").value.trim(), serviceRadius: document.getElementById("rv-radius").value, phone: document.getElementById("rv-phone").value.trim(), website: document.getElementById("rv-web").value.trim(), about: document.getElementById("rv-about").value.trim() };
  const nu = { id: crypto.randomUUID(), username, role: "vendor", profile, pwHash: simpleHash(password), createdAt: new Date().toISOString() };
  users[key] = nu; saveUsers(users);
  state.currentUser = { id: nu.id, username, role: "vendor", profile };
  localStorage.setItem("wedboard:session", JSON.stringify({ userId: nu.id, username, role: "vendor" }));
  showVendorDash();
};

function setDots(id, active) {
  document.querySelectorAll(`#${id} .dot`).forEach(d => {
    const n = parseInt(d.textContent); d.classList.remove("on", "done");
    if (n === active) d.classList.add("on"); else if (n < active) d.classList.add("done");
  });
}

// ═══ COUPLE DASHBOARD ═════════════════════════════════════════════════════════
function getCoupleWeddingName() {
  const p = state.currentUser.profile;
  return (p.partner1 && p.partner2) ? `${p.partner1} & ${p.partner2} Wedding` : `${state.currentUser.username}'s Wedding`;
}

function showCoupleDash() {
  showView("couple");
  if (typeof lucide !== "undefined") lucide.createIcons();
  const u = state.currentUser;
  document.getElementById("c-dd-avatar").textContent = u.username.charAt(0).toUpperCase();
  const display = (u.profile.partner1 && u.profile.partner2) ? `${u.profile.partner1} & ${u.profile.partner2}` : u.username;
  document.getElementById("c-dd-name").textContent = display;
  document.getElementById("c-wedding-name").textContent = getCoupleWeddingName();
  state.cohort = getCoupleWeddingName();
  state.joined = true;

  // Show conversations inbox (not a thread)
  document.getElementById("c-conversations-view").classList.remove("hidden");
  document.getElementById("c-thread-view").classList.add("hidden");
  state.activeVendorChat = null;

  renderConversations();
  renderManageVendors();
}

function loadCoupleVendorChat() {
  const vn = state.activeVendorChat; if (!vn) return;
  const chatKey = `${state.cohort}::${vn}`;
  const stored = getHistory(state.currentUser.id, chatKey);
  if (stored.length) {
    state.messages = stored.map(m => ({ ...m, id: crypto.randomUUID(), time: new Date(m.time) }));
    renderMessages();
  } else {
    state.messages = [];
    addMessage("system", "System", `Chat with ${vn}. Use @ai for help.`);
  }
  if (backendOnline) {
    apiPost("/api/join", { username: state.currentUser.username, cohort: state.cohort })
      .then(r => { state.userId = r.user_id; state.cohortId = r.cohort_id; }).catch(() => {});
  }
}

function renderConversations() {
  if (!state.currentUser) return;
  const list = document.getElementById("c-conversations-list");
  list.innerHTML = "";
  const vendors = Array.from(document.querySelectorAll(".c-vendor-btn"));
  if (!vendors.length) {
    list.innerHTML = '<div class="conv-empty"><i data-lucide="message-circle-dashed"></i><p>No vendors yet.</p><p class="muted sm">Add vendors from Discover to start chatting.</p></div>';
    if (typeof lucide !== "undefined") lucide.createIcons();
    document.getElementById("c-conv-count").textContent = "0 conversations";
    return;
  }
  const uid = state.currentUser.id;
  const cohort = state.cohort || getCoupleWeddingName();

  const items = vendors.map(btn => {
    const vendorName = btn.dataset.vendor;
    const cat = btn.dataset.cat;
    const colorClass = btn.dataset.color || btn.querySelector(".m-avatar")?.className.replace("m-avatar","").trim() || "peach";
    const chatKey = `${cohort}::${vendorName}`;
    const history = getHistory(uid, chatKey);
    const msgs = history.filter(m => m.type !== "system");
    const lastMsg = msgs.slice(-1)[0] || null;
    const lastReadTs = getLastRead(uid, chatKey);
    const unreadCount = lastReadTs ? msgs.filter(m => new Date(m.time) > new Date(lastReadTs)).length : msgs.length;
    return { vendorName, cat, colorClass, lastMsg, unreadCount };
  });

  items.sort((a, b) => {
    const ta = a.lastMsg ? new Date(a.lastMsg.time) : 0;
    const tb = b.lastMsg ? new Date(b.lastMsg.time) : 0;
    return tb - ta;
  });

  const total = items.length;
  const unreadTotal = items.filter(i => i.unreadCount > 0).length;
  document.getElementById("c-conv-count").textContent = unreadTotal > 0
    ? `${total} conversations · ${unreadTotal} unread`
    : `${total} conversation${total !== 1 ? "s" : ""}`;

  items.forEach(({ vendorName, cat, colorClass, lastMsg, unreadCount }) => {
    const item = document.createElement("button");
    item.className = "conversation-item" + (unreadCount > 0 ? " unread" : "");
    const preview = lastMsg
      ? (lastMsg.text.length > 65 ? lastMsg.text.slice(0, 65) + "…" : lastMsg.text)
      : "Start a conversation";
    const timeStr = lastMsg ? timeAgo(new Date(lastMsg.time)) : "";
    item.innerHTML = `<div class="m-avatar ${colorClass}">${vendorName.charAt(0)}</div>
      <div class="conv-body">
        <div class="conv-header">
          <span class="conv-name">${esc(vendorName)}</span>
          <span class="conv-time">${timeStr}</span>
        </div>
        <div class="conv-footer">
          <span class="conv-preview">${esc(preview)}</span>
          ${unreadCount > 0 ? `<span class="conv-unread">${unreadCount}</span>` : ""}
        </div>
        <span class="conv-cat">${esc(cat)}</span>
      </div>`;
    item.addEventListener("click", () => openThread(vendorName, cat, colorClass));
    list.appendChild(item);
  });
}

function openThread(vendorName, cat, colorClass) {
  if (!state.currentUser) return;
  if (state.activeVendorChat) {
    saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
  }
  saveLastRead(state.currentUser.id, `${state.cohort}::${vendorName}`);

  document.querySelectorAll(".c-vendor-btn").forEach(i => i.classList.remove("active"));
  const btn = document.querySelector(`.c-vendor-btn[data-vendor="${vendorName.replace(/"/g, '\\"')}"]`);
  if (btn) btn.classList.add("active");
  state.activeVendorChat = vendorName;

  document.getElementById("c-chat-title").textContent = vendorName;
  document.getElementById("c-chat-subtitle").textContent = cat;
  const avatar = document.getElementById("c-thread-avatar");
  avatar.textContent = vendorName.charAt(0);
  avatar.className = "m-avatar-sm " + (colorClass || "peach");

  document.getElementById("c-input").disabled = false;
  document.getElementById("c-send").disabled = false;

  document.getElementById("c-conversations-view").classList.add("hidden");
  document.getElementById("c-thread-view").classList.remove("hidden");

  loadCoupleVendorChat();
}

function backToConversations() {
  if (state.currentUser && state.activeVendorChat) {
    saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
    saveLastRead(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`);
  }
  state.activeVendorChat = null;
  document.getElementById("c-thread-view").classList.add("hidden");
  document.getElementById("c-conversations-view").classList.remove("hidden");
  renderConversations();
}

// Couple vendor clicks — SCOPED selector: only .c-vendor-btn
document.querySelectorAll(".c-vendor-btn").forEach(item => {
  item.addEventListener("click", () => {
    const colorClass = item.dataset.color || item.querySelector(".m-avatar")?.className.replace("m-avatar","").trim() || "peach";
    // Switch to chat tab if not already active
    const chatTab = document.querySelector(".c-tab-btn[data-tab='chat']");
    if (!chatTab.classList.contains("active")) {
      document.querySelectorAll(".c-tab-btn").forEach(b => b.classList.remove("active"));
      chatTab.classList.add("active");
      document.querySelectorAll(".c-tab-panel").forEach(p => p.classList.add("hidden"));
      document.getElementById("c-tab-chat").classList.remove("hidden");
    }
    openThread(item.dataset.vendor, item.dataset.cat, colorClass);
  });
});

// Conversations inbox wiring
document.getElementById("c-back-btn").onclick = backToConversations;
document.getElementById("c-new-chat-btn").onclick = () => document.querySelector(".c-tab-btn[data-tab='discover']").click();
document.getElementById("c-conv-search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".conversation-item").forEach(item => {
    const name = item.querySelector(".conv-name")?.textContent.toLowerCase() || "";
    const preview = item.querySelector(".conv-preview")?.textContent.toLowerCase() || "";
    item.style.display = (!q || name.includes(q) || preview.includes(q)) ? "" : "none";
  });
});

// Settings dropdown
document.getElementById("c-settings-btn").onclick = () => document.getElementById("c-settings-menu").classList.toggle("hidden");
document.addEventListener("click", e => { if (!e.target.closest("#c-settings-btn") && !e.target.closest("#c-settings-menu")) document.getElementById("c-settings-menu").classList.add("hidden"); });
document.getElementById("c-logout").onclick = doLogout;

// Slide-over panels
function openSlide(panelId, overlayId) { document.getElementById(panelId).classList.remove("hidden"); document.getElementById(overlayId).classList.remove("hidden"); }
function closeSlide(panelId, overlayId) { document.getElementById(panelId).classList.add("hidden"); document.getElementById(overlayId).classList.add("hidden"); }

document.getElementById("c-kb-btn").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-kb-panel", "c-overlay"); };
document.getElementById("c-configure-ai-btn").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openAiKeyModal(); };
document.getElementById("c-kb-close").onclick = () => closeSlide("c-kb-panel", "c-overlay");
document.getElementById("c-manage-vendors").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-manage-panel", "c-overlay"); };
document.getElementById("c-manage-close").onclick = () => closeSlide("c-manage-panel", "c-overlay");
document.getElementById("c-write-review").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-review-panel", "c-overlay"); renderCoupleReviews(); };
document.getElementById("c-review-close").onclick = () => closeSlide("c-review-panel", "c-overlay");
document.getElementById("c-overlay").onclick = () => { document.querySelectorAll("#view-couple .slideover").forEach(s => s.classList.add("hidden")); document.getElementById("c-overlay").classList.add("hidden"); };

// Couple send
document.getElementById("c-send").onclick = () => handleSend("couple");
document.getElementById("c-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend("couple"); } });
document.getElementById("c-ai-quick-btn").onclick = () => switchToAiTab("");

// Auto-resize textarea
function autoResize(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
document.getElementById("c-input").addEventListener("input", e => autoResize(e.target));

// Vendor sidebar search
document.getElementById("c-vendor-search").addEventListener("input", e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".c-vendor-btn").forEach(btn => {
    const name = (btn.dataset.vendor || "").toLowerCase();
    const cat  = (btn.dataset.cat  || "").toLowerCase();
    btn.style.display = (!q || name.includes(q) || cat.includes(q)) ? "" : "none";
  });
});

// KB
document.getElementById("c-file-input").onchange = async e => { for (const f of Array.from(e.target.files || [])) { f.type.startsWith("image/") ? await addImageResource(f) : await addTextResource(f); } e.target.value = ""; renderResources(); };
document.getElementById("c-load-sample").onclick = async () => {
  if (backendOnline && state.cohortId) { const blob = new Blob([SAMPLE_DOC], { type: "text/plain" }); await addTextResource(new File([blob], "sample-wedding-plan.txt", { type: "text/plain" })); }
  else { addDocumentFromText("sample-wedding-plan.txt", SAMPLE_DOC); addMessage("system", "System", "Loaded sample doc. Ask @ai a question."); }
};

// Manage vendors
function renderManageVendors() {
  const list = document.getElementById("c-vendor-manage-list"); list.innerHTML = "";
  [{ name: "Golden Hour Studio", cat: "Photographer", c: "peach" }, { name: "Petal & Vine", cat: "Florist", c: "mint" }, { name: "Blue Note Events", cat: "DJ", c: "sky" }, { name: "Hearth Table", cat: "Caterer", c: "lavender" }].forEach(v => {
    const d = document.createElement("div"); d.className = "manage-item";
    d.innerHTML = `<div class="m-avatar-sm ${v.c}">${v.name.charAt(0)}</div><div><strong>${v.name}</strong><span class="muted sm">${v.cat}</span></div><button class="btn btn-ghost btn-tiny danger">Remove</button>`;
    list.appendChild(d);
  });
}

// ═══ VENDOR DASHBOARD ═════════════════════════════════════════════════════════
function showVendorDash() {
  showView("vendor");
  if (typeof lucide !== "undefined") lucide.createIcons();
  const u = state.currentUser;
  document.getElementById("v-dd-avatar").textContent = u.username.charAt(0).toUpperCase();
  document.getElementById("v-dd-name").textContent = u.profile.businessName || u.username;
  document.getElementById("v-dd-cat").textContent = fmtCat(u.profile.category || "Vendor");
  document.getElementById("v-input").disabled = false;
  document.getElementById("v-send").disabled = false;
  state.cohort = "Mia & Ethan Wedding";
  state.joined = true;
  document.getElementById("v-chat-title").textContent = state.cohort;
  state.messages = [];
  addMessage("system", "System", `Welcome, ${u.profile.businessName || u.username}! Select a chat.`);
  renderVendorWBReviews();
}

function fmtCat(c) { return c.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()); }

// Vendor couple clicks — SCOPED selector: only .v-couple-btn (FIX for 400 bug)
document.querySelectorAll(".v-couple-btn").forEach(item => {
  item.addEventListener("click", async () => {
    if (state.currentUser && state.joined) saveHistory(state.currentUser.id, state.cohort, state.messages);
    document.querySelectorAll(".v-couple-btn").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    state.cohort = item.dataset.cohort;
    document.getElementById("v-chat-title").textContent = state.cohort;
    // Load local history
    const stored = getHistory(state.currentUser.id, state.cohort);
    if (stored.length) {
      state.messages = stored.map(m => ({ ...m, id: crypto.randomUUID(), time: new Date(m.time) }));
      renderMessages();
    } else { state.messages = []; seedMessages(); }
    // Backend join
    if (backendOnline) {
      try { const r = await apiPost("/api/join", { username: state.currentUser.username, cohort: state.cohort }); state.userId = r.user_id; state.cohortId = r.cohort_id; } catch {}
    }
  });
});

// Vendor settings
document.getElementById("v-settings-btn").onclick = () => document.getElementById("v-settings-menu").classList.toggle("hidden");
document.addEventListener("click", e => { if (!e.target.closest("#v-settings-btn") && !e.target.closest("#v-settings-menu")) document.getElementById("v-settings-menu").classList.add("hidden"); });
document.getElementById("v-logout").onclick = doLogout;

document.getElementById("v-analytics-btn").onclick = () => { document.getElementById("v-settings-menu").classList.add("hidden"); openSlide("v-analytics-panel", "v-overlay"); };
document.getElementById("v-analytics-close").onclick = () => closeSlide("v-analytics-panel", "v-overlay");
document.getElementById("v-reviews-btn").onclick = () => { document.getElementById("v-settings-menu").classList.add("hidden"); openSlide("v-reviews-panel", "v-overlay"); };
document.getElementById("v-reviews-close").onclick = () => closeSlide("v-reviews-panel", "v-overlay");
document.getElementById("v-manage-couples-btn").onclick = () => { document.getElementById("v-settings-menu").classList.add("hidden"); openSlide("v-manage-panel", "v-overlay"); };
document.getElementById("v-manage-close").onclick = () => closeSlide("v-manage-panel", "v-overlay");
document.getElementById("v-overlay").onclick = () => { document.querySelectorAll("#view-vendor .slideover").forEach(s => s.classList.add("hidden")); document.getElementById("v-overlay").classList.add("hidden"); };

document.getElementById("v-send").onclick = () => handleSend("vendor");
document.getElementById("v-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend("vendor"); } });

// ═══ REVIEWS ══════════════════════════════════════════════════════════════════
document.querySelectorAll("#rv-stars .star").forEach(s => {
  s.onclick = () => { state.reviewRating = parseInt(s.dataset.v); updateStars(); };
  s.onmouseenter = () => { const v = parseInt(s.dataset.v); document.querySelectorAll("#rv-stars .star").forEach(x => x.classList.toggle("hov", parseInt(x.dataset.v) <= v)); };
  s.onmouseleave = () => document.querySelectorAll("#rv-stars .star").forEach(x => x.classList.remove("hov"));
});
function updateStars() { document.querySelectorAll("#rv-stars .star").forEach(s => s.classList.toggle("on", parseInt(s.dataset.v) <= state.reviewRating)); }

document.getElementById("rv-submit").onclick = () => {
  const vendor = document.getElementById("rv-select").value, text = document.getElementById("rv-text").value.trim(), rating = state.reviewRating;
  if (!vendor) { alert("Select a vendor."); return; } if (!rating) { alert("Select a rating."); return; } if (!text) { alert("Write a review."); return; }
  const reviews = getReviews();
  reviews.push({ id: crypto.randomUUID(), vendor, vendorName: document.getElementById("rv-select").options[document.getElementById("rv-select").selectedIndex].text, rating, text, author: state.currentUser.username, date: new Date().toISOString() });
  saveReviews(reviews);
  document.getElementById("rv-select").value = ""; document.getElementById("rv-text").value = ""; state.reviewRating = 0; updateStars();
  renderCoupleReviews();
  addMessage("system", "System", "Review submitted!");
};

function renderCoupleReviews() {
  const reviews = getReviews(), list = document.getElementById("c-reviews-list"); list.innerHTML = "";
  const mine = reviews.filter(r => r.author === (state.currentUser ? state.currentUser.username : ""));
  if (!mine.length) { list.innerHTML = '<p class="muted sm">No reviews yet.</p>'; return; }
  mine.forEach(r => { const d = document.createElement("div"); d.className = "review-card"; d.innerHTML = `<div class="review-top"><span class="star-display">${"\u2605".repeat(r.rating)}${"\u2606".repeat(5 - r.rating)}</span><span class="muted sm">${timeAgo(new Date(r.date))}</span></div><p class="review-author">${esc(r.vendorName)}</p><p class="review-body">${esc(r.text)}</p>`; list.appendChild(d); });
}

function renderVendorWBReviews() {
  const reviews = getReviews(), list = document.getElementById("v-wb-reviews"); list.innerHTML = "";
  if (!reviews.length) { list.innerHTML = '<p class="muted sm">No WedBoard reviews yet.</p>'; return; }
  reviews.forEach(r => { const d = document.createElement("div"); d.className = "review-card"; d.innerHTML = `<div class="review-top"><span class="star-display">${"\u2605".repeat(r.rating)}${"\u2606".repeat(5 - r.rating)}</span><span class="muted sm">${timeAgo(new Date(r.date))}</span></div><p class="review-author">${esc(r.author)}</p><p class="review-body">${esc(r.text)}</p>`; list.appendChild(d); });
}

function timeAgo(d) { const s = Math.floor((new Date() - d) / 1000); if (s < 60) return "now"; const m = Math.floor(s / 60); if (m < 60) return m + "m"; const h = Math.floor(m / 60); if (h < 24) return h + "h"; const dy = Math.floor(h / 24); return dy < 30 ? dy + "d" : Math.floor(dy / 30) + "mo"; }

// ═══ TUTORIAL ═════════════════════════════════════════════════════════════════
const tutSteps = [
  { target: ".tab-wedding-chip", text: "Your wedding workspace — all planning, chats, and documents live here." },
  { target: ".c-tab-btn[data-tab='chat']", text: "The Chat tab is your conversations inbox. Click any vendor to open a thread." },
  { target: ".m-composer", text: "Type messages here. Use @ai for AI help or @ai generate doc to create documents." },
  { target: "#c-settings-btn", text: "Open settings to manage vendors, write reviews, or access your knowledge base." },
];
let tutIdx = 0;
function startTutorial() { tutIdx = 0; showTutStep(); }
function showTutStep() {
  const ov = document.getElementById("tutorial-overlay"), tip = document.getElementById("tutorial-tip"), hl = document.getElementById("tutorial-hl");
  if (tutIdx >= tutSteps.length) { ov.classList.add("hidden"); return; }
  ov.classList.remove("hidden");
  const step = tutSteps[tutIdx], el = document.querySelector(step.target);
  document.getElementById("tut-text").textContent = step.text;
  document.getElementById("tut-counter").textContent = `${tutIdx + 1} / ${tutSteps.length}`;
  document.getElementById("tut-next").textContent = tutIdx === tutSteps.length - 1 ? "Done" : "Next";
  if (el) { const r = el.getBoundingClientRect(), pad = 6; hl.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`; tip.style.top = Math.min(r.bottom + 12, innerHeight - 180) + "px"; tip.style.left = Math.max(12, Math.min(r.left, innerWidth - 320)) + "px"; }
}
document.getElementById("tut-next").onclick = () => { tutIdx++; showTutStep(); };
document.querySelector(".tutorial-bg").onclick = () => document.getElementById("tutorial-overlay").classList.add("hidden");

// ═══ MESSAGING (shared) ══════════════════════════════════════════════════════
function getFeed() { return state.currentUser?.role === "vendor" ? document.getElementById("v-chat-feed") : document.getElementById("c-chat-feed"); }
function getInput() { return state.currentUser?.role === "vendor" ? document.getElementById("v-input") : document.getElementById("c-input"); }
function getRetLabel() { return state.currentUser?.role === "vendor" ? document.getElementById("v-retrieval") : document.getElementById("c-retrieval"); }

function handleSend(dash) {
  if (!state.currentUser || state.aiStreaming) return;
  const input = getInput(), text = input.value.trim(); if (!text) return;
  if (!state.joined) { state.cohort = dash === "couple" ? getCoupleWeddingName() : state.cohort; state.joined = true; }
  if (text.toLowerCase().startsWith("@ai")) {
    // Redirect @ai commands to the dedicated AI tab
    input.value = "";
    const after = text.replace(/^@ai\s*/i, "").trim();
    switchToAiTab(after);
    return;
  }
  addMessage("human", state.currentUser.username, text); input.value = "";
  if (backendOnline && state.cohortId) { apiPost("/api/message", { cohort_id: state.cohortId, user_id: state.userId, content: text, sender_type: "human" }).catch(() => {}); }
}

function addMessage(type, author, text) { state.messages.push({ id: crypto.randomUUID(), type, author, text, time: new Date() }); renderMessages(); persistHistory(); }
function appendSystemMsg(t) { addMessage("system", "System", t); }
function seedMessages() { addMessage("system", "System", `${state.currentUser.username} opened ${state.cohort}.`); addMessage("human", "Lead Planner", "I uploaded the event schedule and vendor checklist."); addMessage("human", "Photographer", "Please confirm ceremony start time."); }

function persistHistory() {
  if (!state.currentUser || !state.joined) return;
  if (state.currentUser.role === "couple" && state.activeVendorChat) saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
  else saveHistory(state.currentUser.id, state.cohort, state.messages);
}

function doLogout() {
  if (state.currentUser && state.joined) {
    if (state.currentUser.role === "couple" && state.activeVendorChat) saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
    else saveHistory(state.currentUser.id, state.cohort, state.messages);
  }
  state.currentUser = null; state.joined = false; state.messages = []; state.resources = []; state.chunks = []; state.userId = null; state.cohortId = null; state.activeVendorChat = null;
  localStorage.removeItem("wedboard:session");
  showView("landing");
}

// Typing indicator
function showTyping() { removeTyping(); const feed = getFeed(), d = document.createElement("article"); d.className = "msg ai"; d.id = "typing-ind"; d.innerHTML = '<div class="msg-av"></div><div class="msg-body"><div class="msg-meta"><strong class="msg-author">AI Assistant</strong></div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>'; feed.appendChild(d); feed.scrollTop = feed.scrollHeight; }
function removeTyping() { const e = document.getElementById("typing-ind"); if (e) e.remove(); }

function renderMessages() {
  const feed = getFeed(); feed.innerHTML = "";
  const tpl = document.getElementById("msg-tpl");
  let lastDate = null, lastAuthor = null, lastType = null;

  for (const m of state.messages) {
    // ── Day separator ──────────────────────────────────────────────────
    const msgDate = new Date(m.time);
    const dateKey = msgDate.toDateString();
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      lastAuthor = null; // reset grouping on new day
      const sep = document.createElement("div");
      sep.className = "msg-day-sep";
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      sep.innerHTML = `<span>${dateKey === today ? "Today" : dateKey === yesterday ? "Yesterday" : msgDate.toLocaleDateString([], { month:"short", day:"numeric" })}</span>`;
      feed.appendChild(sep);
    }

    // ── Message grouping: suppress header for consecutive same-author ──
    const sameGroup = (m.type !== "system") && (m.author === lastAuthor) && (m.type === lastType);
    lastAuthor = m.author; lastType = m.type;

    const n = tpl.content.firstElementChild.cloneNode(true);
    n.classList.add(m.type);
    if (sameGroup) n.classList.add("msg-grouped");
    n.querySelector(".msg-author").textContent = m.author;
    n.querySelector(".msg-time").textContent = fmtTime(m.time);
    n.querySelector(".msg-text").innerHTML = fmtMsg(m.text, m.type);
    feed.appendChild(n);
  }
  feed.scrollTop = feed.scrollHeight;
}

function renderResources() {
  const dc = document.getElementById("c-doc-count"), rl = document.getElementById("c-resource-list"), st = document.getElementById("c-kb-status");
  dc.textContent = `${state.resources.length} docs`; rl.innerHTML = "";
  if (!state.resources.length) { st.textContent = "No documents uploaded yet."; return; }
  st.textContent = `${state.resources.length} resource(s), ${state.chunks.length} chunk(s) indexed.`;
  state.resources.forEach(r => { const c = document.createElement("article"); c.className = "resource-card"; c.innerHTML = `<div class="resource-title"><strong>${esc(r.name)}</strong><span class="pill">${r.type}</span></div><p class="resource-meta">${esc(r.summary)}</p>`; if (r.previewUrl) { const img = document.createElement("img"); img.className = "thumb"; img.src = r.previewUrl; c.appendChild(img); } rl.appendChild(c); });
}

// Files
async function addTextResource(file) {
  if (backendOnline && state.cohortId) { try { const form = new FormData(); form.append("file", file); form.append("cohort_id", state.cohortId); const r = await (await fetch(`${BACKEND_URL}/api/upload`, { method: "POST", body: form })).json(); state.resources.unshift({ id: crypto.randomUUID(), name: file.name, type: "text", summary: `${r.chunks} chunks indexed.`, previewUrl: null }); renderResources(); addMessage("system", "System", `Uploaded ${file.name} — ${r.chunks} chunks.`); return; } catch {} }
  const text = await readText(file); addDocumentFromText(file.name, text); addMessage("system", "System", `Uploaded ${file.name} locally.`);
}
async function addImageResource(file) { const url = await readDataUrl(file); state.resources.unshift({ id: crypto.randomUUID(), name: file.name, type: "image", summary: "Image uploaded.", previewUrl: url }); addMessage("system", "System", `Uploaded image ${file.name}.`); }
function addDocumentFromText(name, text) { const cl = text.trim(); if (!cl) return; const chunks = chunkText(cl, 360); state.resources.unshift({ id: crypto.randomUUID(), name, type: "text", summary: `${chunks.length} chunks.`, previewUrl: null }); chunks.forEach((c, i) => state.chunks.push({ id: crypto.randomUUID(), source: name, index: i + 1, content: c, vector: vectorize(c) })); renderResources(); }

// ═══ AI ═══════════════════════════════════════════════════════════════════════
function respondToAi(q) {
  if (!q) { addMessage("ai", "AI Assistant", "Ask a question after `@ai`."); return; }
  const rl = getRetLabel(); rl.textContent = "Querying...";
  const messages = buildAIMessages(q);

  // Vendor-enriched backend question for Flask context
  const vendorName = state.activeVendorChat;
  const vendorBtn = vendorName
    ? document.querySelector(`.c-vendor-btn[data-vendor="${vendorName.replace(/"/g, '\\"')}"]`)
    : null;
  const vendorCat = vendorBtn?.dataset?.cat || "";
  const backendQ = (vendorName && vendorCat) ? `[Vendor: ${vendorName} (${vendorCat})] ${q}` : q;

  const feed = getFeed();
  let node = null, full = "";
  state.aiStreaming = true;

  dispatchAI(messages, backendQ, {
    showTypingFn: showTyping,
    removeTypingFn: removeTyping,
    onThinking(text) {
      const ind = document.getElementById("typing-ind");
      if (ind) { const a = ind.querySelector(".msg-author"); if (a) a.textContent = text; }
    },
    onChunk(chunk) {
      if (!node) {
        removeTyping();
        const tpl = document.getElementById("msg-tpl");
        node = tpl.content.firstElementChild.cloneNode(true);
        node.classList.add("ai");
        node.querySelector(".msg-author").textContent = "AI Assistant";
        node.querySelector(".msg-time").textContent = fmtTime(new Date());
        feed.appendChild(node);
      }
      full += chunk;
      node.querySelector(".msg-text").innerHTML = renderMd(full);
      feed.scrollTop = feed.scrollHeight;
    },
    onDone(sources) {
      removeTyping();
      if (sources && sources.length && node) {
        full += `\n\n*Sources: ${sources.join(", ")}*`;
        node.querySelector(".msg-text").innerHTML = renderMd(full);
      }
      state.messages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: full || "Done.", time: new Date() });
      persistHistory();
      rl.textContent = (sources && sources.length) ? "Grounded" : "AI";
      state.aiStreaming = false;
    },
    onError(err) {
      removeTyping();
      state.aiStreaming = false;
      if (err === "no_key") {
        const hits = searchKB(q);
        rl.textContent = hits.length ? "Grounded" : "Local";
        if (hits.length && hits[0].score > 0.12) {
          addMessage("ai", "AI Assistant", buildAnswer(q, hits[0], hits[1]));
        } else {
          addMessage("ai", "AI Assistant", aiLocalResponse(q) + "\n\n---\n*Add an OpenAI API key in **Settings → Configure AI** for live AI responses.*");
        }
      } else {
        rl.textContent = "Error";
        addMessage("ai", "AI Assistant", `**AI error:** ${err}`);
      }
    }
  });
}

function generateDocument(prompt) {
  if (!prompt) { addMessage("ai", "AI Assistant", "Describe the document after @ai generate doc."); return; }
  const rl = getRetLabel(); rl.textContent = "Generating..."; showTyping(); state.aiStreaming = true;
  if (backendOnline && state.cohortId) {
    apiPost("/api/generate-doc", { cohort_id: state.cohortId, user_id: state.userId, prompt })
      .then(d => { removeTyping(); state.aiStreaming = false; addMessage("ai", "AI Assistant", `**Document generated!**\n\n**File:** ${d.filename}\n**Sections:** ${d.sections}\n\n[Download](${BACKEND_URL}/api/download-doc/${d.doc_id})`); rl.textContent = "Done"; })
      .catch(() => { removeTyping(); state.aiStreaming = false; addMessage("ai", "AI Assistant", "Generation failed."); rl.textContent = "Failed"; });
    return;
  }
  removeTyping(); state.aiStreaming = false; addMessage("ai", "AI Assistant", "Need backend for doc generation."); rl.textContent = "Offline";
}

// ═══ NLP ══════════════════════════════════════════════════════════════════════
function searchKB(q) { const qv = vectorize(q); return state.chunks.map(c => ({ ...c, score: cosine(qv, c.vector) })).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3); }
function buildAnswer(q, best, sup) { const lead = best.content.split(/\n+/)[0].trim(), exc = compress(best.content).slice(0, 240); return `Based on uploaded materials for "${q}":\n\n${lead}\n\nExcerpt: "${exc}${exc.length >= 240 ? "..." : ""}"\nSource: ${best.source} (chunk ${best.index})${sup ? "\nAlso: " + compress(sup.content).slice(0, 140) : ""}`; }
function chunkText(text, max) { const paras = text.replace(/\r/g, "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean), chunks = []; let cur = ""; for (const p of paras) { if ((cur + "\n\n" + p).trim().length <= max) cur = cur ? cur + "\n\n" + p : p; else { if (cur) chunks.push(cur); if (p.length <= max) cur = p; else { const sents = p.split(/(?<=[.!?])\s+/); cur = ""; for (const s of sents) { if ((cur + " " + s).trim().length <= max) cur = cur ? cur + " " + s : s; else { if (cur) chunks.push(cur); cur = s; } } } } } if (cur) chunks.push(cur); return chunks; }
function vectorize(t) { const v = {}; tokenize(t).forEach(w => v[w] = (v[w] || 0) + 1); return v; }
function tokenize(t) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w)); }
function cosine(a, b) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let dot = 0, ma = 0, mb = 0; keys.forEach(k => { const av = a[k] || 0, bv = b[k] || 0; dot += av * bv; ma += av * av; mb += bv * bv; }); return (!ma || !mb) ? 0 : dot / (Math.sqrt(ma) * Math.sqrt(mb)); }

// ═══ UTILS ════════════════════════════════════════════════════════════════════
function renderMd(t) { if (typeof marked !== "undefined") { marked.setOptions({ breaks: true, gfm: true }); return marked.parse(t); } return fallbackMd(t); }
function fallbackMd(t) { let h = esc(t); h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); h = h.replace(/\*(.+?)\*/g, "<em>$1</em>"); h = h.replace(/`([^`]+)`/g, "<code>$1</code>"); h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); return h.replace(/\n/g, "<br>"); }
function fmtTime(d) { return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(d); }
function fmtMsg(t, type) { return type === "ai" ? renderMd(t) : esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>"); }
function esc(t) { return t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function compress(t) { return t.replace(/\s+/g, " ").trim(); }
function readText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsText(f); }); }
function readDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }

// ═══ BACKEND ══════════════════════════════════════════════════════════════════
async function checkBackend() {
  try {
    const r = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      backendOnline = true;
      // Race-condition fix: restoreSession runs before this resolves, so join may have been
      // skipped. Retry it now that we know the backend is up.
      if (state.currentUser && state.cohort && !state.cohortId) {
        try {
          const j = await apiPost("/api/join", { username: state.currentUser.username, cohort: state.cohort });
          state.userId   = j.user_id;
          state.cohortId = j.cohort_id;
        } catch {}
      }
    }
  } catch { backendOnline = false; }
}
async function apiPost(path, body) { const r = await fetch(`${BACKEND_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiGet(path) { const r = await fetch(`${BACKEND_URL}${path}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }

// ── Build vendor-aware AI message array ───────────────────────────────────────
// chatHistory: array of {type, author, text} — defaults to state.messages
function buildAIMessages(question, chatHistory) {
  const msgs = chatHistory !== undefined ? chatHistory : state.messages;
  const u = state.currentUser;
  const profile = u?.profile || {};
  const vendorName = state.activeVendorChat || null;
  const vendorBtn  = vendorName
    ? document.querySelector(`.c-vendor-btn[data-vendor="${vendorName.replace(/"/g, '\\"')}"]`)
    : null;
  const vendorCat = vendorBtn?.dataset?.cat || "";

  // ── System prompt ──────────────────────────────────────────────────────────
  let sys = "You are an expert AI wedding planning assistant embedded in WedBoard, an elegant wedding coordination platform. You have deep knowledge of wedding planning: vendor coordination, budgets, timelines, etiquette, seating, florals, catering, photography, music, and stationery.\n\n";

  // Wedding profile context
  const coupleName = [profile.partner1, profile.partner2].filter(Boolean).join(" & ");
  if (coupleName) sys += `COUPLE: ${coupleName}\n`;
  if (profile.weddingDate) sys += `WEDDING DATE: ${profile.weddingDate}\n`;
  if (profile.venue)       sys += `VENUE: ${profile.venue}\n`;
  if (profile.guestCount)  sys += `GUEST COUNT: ${profile.guestCount}\n`;
  if (profile.style)       sys += `STYLE: ${profile.style}\n`;

  // Vendor context — most important for @ai in a vendor chat
  if (vendorName && vendorCat) {
    sys += `\nCURRENT VENDOR CONVERSATION: ${vendorName} (${vendorCat})\n`;
    sys += `The couple is communicating with their ${vendorCat}. Focus your answer on ${vendorCat.toLowerCase()}-specific advice and this vendor relationship. `;
    sys += `If the user asks what to discuss or ask, suggest relevant ${vendorCat.toLowerCase()} consultation questions.\n`;
  }

  sys += "\nFormat responses with markdown (bold, bullets, headings). Be concise, warm, and actionable. Never fabricate specific vendor pricing, availability, or contact details.";

  const result = [{ role: "system", content: sys }];

  // ── Recent conversation history (last 8 non-system messages) ──────────────
  const recent = msgs.filter(m => m.type !== "system").slice(-8);
  for (const m of recent) {
    result.push({
      role: m.type === "ai" ? "assistant" : "user",
      content: m.type === "ai" ? m.text : `${m.author}: ${m.text}`
    });
  }

  result.push({ role: "user", content: question });
  return result;
}

// ── Direct Gemini streaming (offline fallback via OpenAI-compatible endpoint) ──
// onChunk(text), onDone(sources=[]), onError(msg)
async function streamFromGemini(messages, onChunk, onDone, onError) {
  const key = getApiKey();
  if (!key) { onError("no_key"); return; }
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ model: "gemini-2.0-flash-lite", messages, stream: true, max_tokens: 900, temperature: 0.5 })
    });
    if (!res.ok) {
      let msg = `Gemini API error (${res.status})`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      onError(msg); return;
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", done = false;
    const proc = (t) => {
      buf += t;
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") { done = true; onDone([]); return; }
        try { const c = JSON.parse(raw)?.choices?.[0]?.delta?.content; if (c) onChunk(c); } catch {}
      }
    };
    const pump = () => reader.read().then(({ done: d, value }) => {
      if (d) { if (!done) onDone([]); return; }
      proc(dec.decode(value, { stream: true }));
      return pump();
    });
    await pump();
  } catch (e) { onError(e.message || "Network error"); }
}

// ── UI command dispatcher (called by agent SSE stream) ───────────────────────
function handleUICommands(commands) {
  for (const cmd of commands) {
    if (cmd.action === "switch_tab") {
      const btn = document.querySelector(`.c-tab-btn[data-tab="${cmd.tab}"]`);
      if (btn) btn.click();

    } else if (cmd.action === "populate_discover_tab") {
      const normalized = (cmd.vendors || []).map(v => ({
        id:      v.vendor_id,
        name:    v.name,
        cat:     v.category,
        city:    v.city,
        rating:  v.rating,
        reviews: v.reviews,
        price:   v.price,
        desc:    v.description,
        av:      (v.name || "V")[0].toUpperCase(),
        color:   DISCOVER_CAT_COLORS[v.category] || "peach",
        website: v.website,
        phone:   v.phone,
      }));
      if (cmd.location) {
        discoverLocation = cmd.location;
        localStorage.setItem("wedboard:discoverLocation", discoverLocation);
        const inp = document.getElementById("c-location-input");
        if (inp) inp.value = discoverLocation;
      }
      const cacheKey = `${cmd.location}|${cmd.category || "all"}`;
      discoverCache[cacheKey] = normalized;
      const panel = document.getElementById("c-tab-discover");
      if (panel && !panel.classList.contains("hidden")) {
        _setDiscoverStatus(normalized.length ? `✦ ${normalized.length} vendors found in ${cmd.location}` : "");
        _renderVendorCards(normalized);
      }

    } else if (cmd.action === "update_seating") {
      for (const op of (cmd.operations || [])) {
        const guest = seatingState.guests.find(
          g => g.name.toLowerCase() === (op.guest || "").toLowerCase()
        );
        if (!guest) continue;
        if (op.action === "seat") {
          guest.tableId = (op.table || 1) - 1;
          guest.seat    = (op.seat  || 1) - 1;
        } else if (op.action === "move") {
          guest.tableId = (op.to_table || 1) - 1;
          const taken = new Set(
            seatingState.guests.filter(g => g.tableId === guest.tableId && g.id !== guest.id).map(g => g.seat)
          );
          let s = 0; while (taken.has(s)) s++;
          guest.seat = s;
        } else if (op.action === "unseat") {
          guest.tableId = null;
          guest.seat    = null;
        }
      }
      renderSeating();

    } else if (cmd.action === "trigger_doc_generation") {
      generateDocument(cmd.prompt || "");
    }
  }
}

// ── Unified AI dispatch: backend → direct OpenAI → local ─────────────────────
// callbacks: { onChunk, onDone, onError, showTypingFn, removeTypingFn, onThinking? }
function dispatchAI(messages, backendQuestion, callbacks) {
  const { onChunk, onDone, onError, showTypingFn, removeTypingFn, onThinking } = callbacks;
  showTypingFn();

  // ── Tier 1: Flask backend agent stream ────────────────────────────────────
  if (backendOnline && state.cohortId) {
    const guestList = seatingState.guests.map(g => g.name);
    const currentSeating = {
      guests:        seatingState.guests.map(g => ({ name: g.name, tableId: g.tableId, seat: g.seat })),
      tables:        seatingState.tables,
      seatsPerTable: seatingState.seatsPerTable,
    };
    fetch(`${BACKEND_URL}/api/agent-chat-stream`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cohort_id:       state.cohortId,
        question:        backendQuestion,
        user_id:         state.userId,
        guest_list:      guestList,
        current_seating: currentSeating,
      })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", srcs = [];
      const proc = (t) => {
        buf += t;
        const lines = buf.split("\n"); buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(l.slice(6));
            if (ev.type === "thinking")    { if (onThinking) onThinking(ev.text); }
            if (ev.type === "ui_commands") handleUICommands(ev.commands || []);
            if (ev.type === "sources")     srcs = ev.sources || [];
            if (ev.type === "chunk")       onChunk(ev.content);
            if (ev.type === "done")        onDone(srcs);
          } catch {}
        }
      };
      const pump = () => reader.read().then(({ done, value }) => {
        if (done) { onDone(srcs); return; }
        proc(dec.decode(value, { stream: true })); return pump();
      });
      return pump();
    }).catch(() => {
      // Backend failed — fall through to direct OpenAI
      removeTypingFn();
      streamFromGemini(messages, onChunk, onDone, onError);
    });
    return;
  }

  // ── Tier 2: Direct Gemini API (only when backend is confirmed offline) ───────
  if (!backendOnline && getApiKey()) {
    streamFromGemini(messages, onChunk, onDone, onError);
    return;
  }

  // ── Tier 3: Local fallback ────────────────────────────────────────────────
  removeTypingFn();
  onError("no_key");
}

// ═══ TAB NAVIGATION ═══════════════════════════════════════════════════════════
document.querySelectorAll(".c-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".c-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".c-tab-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById("c-tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "chat") {
      document.getElementById("c-conversations-view").classList.remove("hidden");
      document.getElementById("c-thread-view").classList.add("hidden");
      renderConversations();
    }
    if (btn.dataset.tab === "discover")  renderDiscovery();
    if (btn.dataset.tab === "seating")   renderSeating();
    if (btn.dataset.tab === "cards")     initCard();
    if (btn.dataset.tab === "party")     renderParty();
    if (btn.dataset.tab === "budget")    renderBudget();
    if (btn.dataset.tab === "checklist") renderChecklist();
    if (btn.dataset.tab === "ai-chat")   initAiTab();
  });
});

// ═══ DISCOVERY ════════════════════════════════════════════════════════════════
// Static fallback vendors — shown when the backend/API is unavailable
const DISCOVERY_VENDORS_STATIC = [
  // ── NEW YORK ──────────────────────────────────────────────────────────────
  // Photographers
  { id:"ny-ph1", name:"Christian Oth Studio",        cat:"photographer", city:"New York",      rating:4.9, reviews:312, price:"$$$$", desc:"Refined editorial portraits at New York's most iconic venues.",             av:"C", color:"peach" },
  { id:"ny-ph2", name:"KT Merry Photography",         cat:"photographer", city:"New York",      rating:4.9, reviews:245, price:"$$$$", desc:"Luminous fine-art photography for the most discerning New York couples.",   av:"K", color:"peach" },
  { id:"ny-ph3", name:"Ryan Ray Photography",         cat:"photographer", city:"New York",      rating:4.8, reviews:187, price:"$$$$", desc:"Cinematic documentary storytelling with a timeless film quality.",          av:"R", color:"peach" },
  { id:"ny-ph4", name:"Jasmine Lee Photography",      cat:"photographer", city:"New York",      rating:4.8, reviews:156, price:"$$$",  desc:"Warm, romantic portraits with a candid and editorial NYC sensibility.",    av:"J", color:"peach" },
  { id:"ny-ph5", name:"Elisa B Photography",          cat:"photographer", city:"New York",      rating:4.7, reviews:134, price:"$$$",  desc:"Natural light wedding photography with a soft, dreamy New York aesthetic.", av:"E", color:"peach" },
  // Florists
  { id:"ny-fl1", name:"Putnam & Putnam",              cat:"florist",      city:"New York",      rating:4.9, reviews:198, price:"$$$$", desc:"Sculptural, lush floral designs that redefine New York wedding luxury.",    av:"P", color:"mint" },
  { id:"ny-fl2", name:"Saipua",                       cat:"florist",      city:"New York",      rating:4.8, reviews:143, price:"$$$",  desc:"Wild, romantic botanicals grown on their own Hudson Valley farm.",          av:"S", color:"mint" },
  { id:"ny-fl3", name:"Lewis Miller Design",          cat:"florist",      city:"New York",      rating:4.9, reviews:112, price:"$$$$", desc:"Theatrical floral installations that transform entire event spaces.",        av:"L", color:"mint" },
  { id:"ny-fl4", name:"Flower Girl NYC",              cat:"florist",      city:"New York",      rating:4.7, reviews:98,  price:"$$$",  desc:"Minimalist modern botanicals for the fashion-forward NYC couple.",          av:"F", color:"mint" },
  { id:"ny-fl5", name:"Jasmine M Events",             cat:"florist",      city:"New York",      rating:4.8, reviews:87,  price:"$$$$", desc:"Opulent garden-to-ballroom designs for grand New York celebrations.",       av:"J", color:"mint" },
  // Caterers
  { id:"ny-ca1", name:"Abigail Kirsch Catering",      cat:"caterer",      city:"New York",      rating:4.9, reviews:456, price:"$$$$", desc:"Legendary New York catering with flawless execution since 1975.",           av:"A", color:"lavender" },
  { id:"ny-ca2", name:"Great Performances NYC",       cat:"caterer",      city:"New York",      rating:4.8, reviews:312, price:"$$$",  desc:"Farm-to-table cuisine celebrating 40 years of New York event excellence.",  av:"G", color:"lavender" },
  { id:"ny-ca3", name:"Robbins Wolfe Eventeurs",      cat:"caterer",      city:"New York",      rating:4.9, reviews:234, price:"$$$$", desc:"Sophisticated menus by James Beard–nominated chefs for elite events.",      av:"R", color:"lavender" },
  { id:"ny-ca4", name:"Olivier Cheng Catering",       cat:"caterer",      city:"New York",      rating:4.8, reviews:178, price:"$$$$", desc:"European-inspired fine dining for New York's most prestigious weddings.",   av:"O", color:"lavender" },
  { id:"ny-ca5", name:"Rock Paper Scissors Catering", cat:"caterer",      city:"New York",      rating:4.7, reviews:145, price:"$$$",  desc:"Creative seasonal menus with bold culinary storytelling and custom plating.", av:"R", color:"lavender" },
  // DJ / Music
  { id:"ny-dj1", name:"Scott Stander & Associates",   cat:"dj-music",     city:"New York",      rating:4.9, reviews:198, price:"$$$$", desc:"New York's premier entertainment agency for luxury weddings and galas.",     av:"S", color:"sky" },
  { id:"ny-dj2", name:"DJ Reach Entertainment",       cat:"dj-music",     city:"New York",      rating:4.8, reviews:167, price:"$$$",  desc:"Sophisticated DJ known for seamless sets that keep every guest dancing.",   av:"D", color:"sky" },
  { id:"ny-dj3", name:"Melody & Moonlight Agency",    cat:"dj-music",     city:"New York",      rating:4.8, reviews:143, price:"$$$",  desc:"Live music and DJ fusion services for ceremony and reception magic.",       av:"M", color:"sky" },
  { id:"ny-dj4", name:"Marek Entertainment NYC",      cat:"dj-music",     city:"New York",      rating:4.7, reviews:112, price:"$$$",  desc:"High-energy sets blending chart hits and timeless wedding classics.",       av:"M", color:"sky" },
  { id:"ny-dj5", name:"Spin Entertainment NYC",       cat:"dj-music",     city:"New York",      rating:4.7, reviews:98,  price:"$$",   desc:"Boutique DJ collective curating unforgettable musical journeys.",           av:"S", color:"sky" },
  // Planners
  { id:"ny-pl1", name:"Colin Cowie Weddings",         cat:"planner",      city:"New York",      rating:5.0, reviews:134, price:"$$$$", desc:"The world's most iconic luxury planner to royalty and A-list celebrities.", av:"C", color:"blush" },
  { id:"ny-pl2", name:"Marcy Blum Associates",        cat:"planner",      city:"New York",      rating:4.9, reviews:187, price:"$$$$", desc:"New York's most trusted full-service event planning for 30 years.",          av:"M", color:"blush" },
  { id:"ny-pl3", name:"Mindy Weiss NY",               cat:"planner",      city:"New York",      rating:4.9, reviews:212, price:"$$$$", desc:"Meticulous planning that turns your grandest vision into flawless reality.",  av:"M", color:"blush" },
  { id:"ny-pl4", name:"Michelle Rago Ltd",            cat:"planner",      city:"New York",      rating:4.8, reviews:156, price:"$$$$", desc:"Award-winning destination and New York wedding design since 2002.",          av:"M", color:"blush" },
  { id:"ny-pl5", name:"Tara Guerard Soiree NY",       cat:"planner",      city:"New York",      rating:4.8, reviews:98,  price:"$$$",  desc:"Story-driven, design-forward planning with a refined personal touch.",       av:"T", color:"blush" },
  // Venues
  { id:"ny-ve1", name:"The Plaza Hotel",              cat:"venue",        city:"New York",      rating:4.9, reviews:876, price:"$$$$", desc:"Manhattan's most iconic address with timeless Grand Ballroom grandeur.",     av:"P", color:"gold" },
  { id:"ny-ve2", name:"Cipriani 42nd Street",         cat:"venue",        city:"New York",      rating:4.9, reviews:543, price:"$$$$", desc:"Soaring Beaux-Arts ceilings and marble columns in Midtown Manhattan.",       av:"C", color:"gold" },
  { id:"ny-ve3", name:"The Rainbow Room",             cat:"venue",        city:"New York",      rating:4.9, reviews:412, price:"$$$$", desc:"65th-floor Art Deco grandeur with unmatched Manhattan skyline views.",       av:"R", color:"gold" },
  { id:"ny-ve4", name:"Gotham Hall NYC",              cat:"venue",        city:"New York",      rating:4.8, reviews:312, price:"$$$$", desc:"Historic neoclassical banking hall — dramatic, towering, unforgettable.",    av:"G", color:"gold" },
  { id:"ny-ve5", name:"The Bowery Hotel",             cat:"venue",        city:"New York",      rating:4.7, reviews:234, price:"$$$",  desc:"Industrial-chic boutique hotel with a lush garden and intimate ballroom.",  av:"B", color:"gold" },
  // Bakery
  { id:"ny-bk1", name:"Ron Ben-Israel Cakes",         cat:"bakery",       city:"New York",      rating:4.9, reviews:312, price:"$$$$", desc:"Sculpted edible masterpieces by New York's most celebrated cake artist.",    av:"R", color:"rose" },
  { id:"ny-bk2", name:"Sylvia Weinstock Cakes",       cat:"bakery",       city:"New York",      rating:4.9, reviews:267, price:"$$$$", desc:"Legendary lifelike sugar flowers and architectural tiers since 1975.",        av:"S", color:"rose" },
  { id:"ny-bk3", name:"Sugar Flower Cake Shop",       cat:"bakery",       city:"New York",      rating:4.8, reviews:198, price:"$$$$", desc:"Hand-painted sculpted sugar art cakes of breathtaking gallery quality.",     av:"S", color:"rose" },
  { id:"ny-bk4", name:"Lael Cakes NYC",               cat:"bakery",       city:"New York",      rating:4.8, reviews:156, price:"$$$",  desc:"Modern, minimalist custom cakes with architectural elegance and panache.",   av:"L", color:"rose" },
  { id:"ny-bk5", name:"Nine Cakes",                   cat:"bakery",       city:"New York",      rating:4.7, reviews:134, price:"$$$",  desc:"Seasonal flavors and hand-sculpted botanicals on sleek, modern tiers.",     av:"N", color:"rose" },

  // ── LOS ANGELES ───────────────────────────────────────────────────────────
  // Photographers
  { id:"la-ph1", name:"Jose Villa Photography",       cat:"photographer", city:"Los Angeles",   rating:4.9, reviews:387, price:"$$$$", desc:"Sun-drenched fine-art photography with an ethereal California editorial vision.", av:"J", color:"peach" },
  { id:"la-ph2", name:"Kurt Boomer Photography",      cat:"photographer", city:"Los Angeles",   rating:4.9, reviews:256, price:"$$$$", desc:"Cinematic storytelling with a refined editorial sensibility and bold light.", av:"K", color:"peach" },
  { id:"la-ph3", name:"Braedon Flynn Photography",    cat:"photographer", city:"Los Angeles",   rating:4.8, reviews:198, price:"$$$$", desc:"Emotive documentary photography for luxury California destination weddings.", av:"B", color:"peach" },
  { id:"la-ph4", name:"Sasha Gulish Photography",     cat:"photographer", city:"Los Angeles",   rating:4.8, reviews:167, price:"$$$",  desc:"Modern, fashion-forward photography for the style-conscious LA couple.",    av:"S", color:"peach" },
  { id:"la-ph5", name:"Elizabeth Messina",            cat:"photographer", city:"Los Angeles",   rating:4.9, reviews:234, price:"$$$$", desc:"Poetic, luminous imagery that captures the soul of every love story.",       av:"E", color:"peach" },
  // Florists
  { id:"la-fl1", name:"Mark's Garden",                cat:"florist",      city:"Los Angeles",   rating:4.9, reviews:312, price:"$$$$", desc:"Hollywood institution crafting spectacular floral environments since 1981.",   av:"M", color:"mint" },
  { id:"la-fl2", name:"Mindy Rice Floral Design",     cat:"florist",      city:"Los Angeles",   rating:4.9, reviews:198, price:"$$$$", desc:"Organic, garden-gathered botanicals with an elevated California aesthetic.",  av:"M", color:"mint" },
  { id:"la-fl3", name:"Holly Flora LA",               cat:"florist",      city:"Los Angeles",   rating:4.8, reviews:167, price:"$$$",  desc:"Wild, romantic florals overflowing with seasonal blooms and artful abandon.", av:"H", color:"mint" },
  { id:"la-fl4", name:"White Lilac Inc",              cat:"florist",      city:"Los Angeles",   rating:4.7, reviews:134, price:"$$$",  desc:"Minimalist luxury florals with a distinctly Californian, spa-like serenity.", av:"W", color:"mint" },
  { id:"la-fl5", name:"Bloom Box LA",                 cat:"florist",      city:"Los Angeles",   rating:4.8, reviews:112, price:"$$$$", desc:"Studio-fresh sculptural arrangements for Hollywood's most sought-after events.", av:"B", color:"mint" },
  // Caterers
  { id:"la-ca1", name:"Wolfgang Puck Catering",       cat:"caterer",      city:"Los Angeles",   rating:4.9, reviews:678, price:"$$$$", desc:"Iconic California cuisine by Hollywood's most celebrated chef.",             av:"W", color:"lavender" },
  { id:"la-ca2", name:"Patina Catering",              cat:"caterer",      city:"Los Angeles",   rating:4.8, reviews:423, price:"$$$$", desc:"Museum-quality dining experiences in LA's most prestigious venues.",          av:"P", color:"lavender" },
  { id:"la-ca3", name:"Along Came Mary",              cat:"caterer",      city:"Los Angeles",   rating:4.8, reviews:387, price:"$$$",  desc:"Creative, show-stopping event catering with 40 years of LA excellence.",     av:"A", color:"lavender" },
  { id:"la-ca4", name:"Gourmet Celebrations",         cat:"caterer",      city:"Los Angeles",   rating:4.7, reviews:234, price:"$$$",  desc:"Globally-inspired seasonal menus for luxury weddings and celebrity events.", av:"G", color:"lavender" },
  { id:"la-ca5", name:"Design Cuisine LA",            cat:"caterer",      city:"Los Angeles",   rating:4.9, reviews:198, price:"$$$$", desc:"Artisanal seasonal menus with dramatic tablescapes and custom presentation.", av:"D", color:"lavender" },
  // DJ / Music
  { id:"la-dj1", name:"Ira Westreich Entertainment",  cat:"dj-music",     city:"Los Angeles",   rating:4.9, reviews:245, price:"$$$$", desc:"Hollywood's premier music agency for elite weddings and celebrity events.",   av:"I", color:"sky" },
  { id:"la-dj2", name:"Modern Music LA",              cat:"dj-music",     city:"Los Angeles",   rating:4.8, reviews:178, price:"$$$",  desc:"Boutique DJ agency specializing in luxury LA weddings since 2005.",          av:"M", color:"sky" },
  { id:"la-dj3", name:"DJ Liquid Todd",               cat:"dj-music",     city:"Los Angeles",   rating:4.8, reviews:156, price:"$$$",  desc:"Award-winning DJ blending electronic and timeless classics for a packed floor.", av:"D", color:"sky" },
  { id:"la-dj4", name:"West Coast DJ Entertainment",  cat:"dj-music",     city:"Los Angeles",   rating:4.7, reviews:134, price:"$$$",  desc:"Full-service music production with lighting and live musician add-ons.",     av:"W", color:"sky" },
  { id:"la-dj5", name:"DJ Steve Ito",                 cat:"dj-music",     city:"Los Angeles",   rating:4.7, reviews:112, price:"$$",   desc:"Versatile DJ celebrated for seamless multi-genre sets at any wedding.",      av:"D", color:"sky" },
  // Planners
  { id:"la-pl1", name:"Mindy Weiss Party Consultants",cat:"planner",      city:"Los Angeles",   rating:4.9, reviews:312, price:"$$$$", desc:"Celebrity wedding planner crafting magazine-worthy events for A-listers.",   av:"M", color:"blush" },
  { id:"la-pl2", name:"Lisa Vorce Events",            cat:"planner",      city:"Los Angeles",   rating:4.9, reviews:198, price:"$$$$", desc:"Boutique luxury planning with a deeply personal, design-forward approach.",  av:"L", color:"blush" },
  { id:"la-pl3", name:"Revelry Event Design",         cat:"planner",      city:"Los Angeles",   rating:4.8, reviews:167, price:"$$$",  desc:"Bold, theatrical event design transforming spaces into unforgettable worlds.", av:"R", color:"blush" },
  { id:"la-pl4", name:"Yifat Oren & Associates",      cat:"planner",      city:"Los Angeles",   rating:4.8, reviews:145, price:"$$$$", desc:"Detail-obsessed luxury planner for LA's most intimate and grand celebrations.", av:"Y", color:"blush" },
  { id:"la-pl5", name:"White Lilac Events",           cat:"planner",      city:"Los Angeles",   rating:4.7, reviews:123, price:"$$$",  desc:"Effortlessly elegant California wedding planning for every style of love.",  av:"W", color:"blush" },
  // Venues
  { id:"la-ve1", name:"Greystone Mansion",            cat:"venue",        city:"Los Angeles",   rating:4.9, reviews:456, price:"$$$$", desc:"Historic 55-room Beverly Hills estate with manicured garden terraces.",      av:"G", color:"gold" },
  { id:"la-ve2", name:"Vibiana Downtown LA",          cat:"venue",        city:"Los Angeles",   rating:4.9, reviews:345, price:"$$$$", desc:"Restored 1876 cathedral with soaring ceilings in the heart of downtown.",    av:"V", color:"gold" },
  { id:"la-ve3", name:"The Beverly Hills Hotel",      cat:"venue",        city:"Los Angeles",   rating:4.9, reviews:678, price:"$$$$", desc:"The iconic Pink Palace — legendary ballrooms with true Hollywood glamour.",  av:"B", color:"gold" },
  { id:"la-ve4", name:"Calamigos Ranch",              cat:"venue",        city:"Los Angeles",   rating:4.8, reviews:312, price:"$$$$", desc:"Private 280-acre Malibu ranch estate nestled in the Santa Monica Mountains.", av:"C", color:"gold" },
  { id:"la-ve5", name:"Saddlerock Ranch",             cat:"venue",        city:"Los Angeles",   rating:4.7, reviews:234, price:"$$$",  desc:"Rolling Malibu vineyard estate with mountain views and rustic-chic charm.",  av:"S", color:"gold" },
  // Bakery
  { id:"la-bk1", name:"Hansen's Cakes",               cat:"bakery",       city:"Los Angeles",   rating:4.9, reviews:423, price:"$$",   desc:"Hollywood's legendary cake studio since 1959, beloved by generations of couples.", av:"H", color:"rose" },
  { id:"la-bk2", name:"Valerie Confections",          cat:"bakery",       city:"Los Angeles",   rating:4.8, reviews:267, price:"$$$",  desc:"Architecturally inspired tiers with exquisite hand-painted seasonal details.", av:"V", color:"rose" },
  { id:"la-bk3", name:"Cake Divas",                   cat:"bakery",       city:"Los Angeles",   rating:4.9, reviews:312, price:"$$$",  desc:"Custom sculptural cakes featured in 15 TV shows and countless luxury weddings.", av:"C", color:"rose" },
  { id:"la-bk4", name:"Sweet Lady Jane",              cat:"bakery",       city:"Los Angeles",   rating:4.7, reviews:345, price:"$$",   desc:"Charming artisan cakes with hand-painted florals and fresh seasonal layers.",  av:"S", color:"rose" },
  { id:"la-bk5", name:"The Butter End Cakery",        cat:"bakery",       city:"Los Angeles",   rating:4.7, reviews:198, price:"$$$",  desc:"Whimsical, hand-crafted cakes with vibrant artistic expression and bold flavor.", av:"B", color:"rose" },

  // ── CHICAGO ───────────────────────────────────────────────────────────────
  // Photographers
  { id:"ch-ph1", name:"Eric Boneske Photography",     cat:"photographer", city:"Chicago",       rating:4.9, reviews:234, price:"$$$",  desc:"Dynamic, editorial wedding photography at Chicago's most stunning venues.",  av:"E", color:"peach" },
  { id:"ch-ph2", name:"Bozena Voytko Photography",    cat:"photographer", city:"Chicago",       rating:4.8, reviews:187, price:"$$$",  desc:"Romantic fine-art portraits with a soft, timeless Chicago photographic style.", av:"B", color:"peach" },
  { id:"ch-ph3", name:"Katie & Sarah Photography",    cat:"photographer", city:"Chicago",       rating:4.9, reviews:198, price:"$$",   desc:"Candid, joyful wedding storytelling for modern Chicago couples.",            av:"K", color:"peach" },
  { id:"ch-ph4", name:"Theresa Furey Photography",    cat:"photographer", city:"Chicago",       rating:4.8, reviews:156, price:"$$$",  desc:"Luminous light and heartfelt moments in a timeless editorial style.",        av:"T", color:"peach" },
  { id:"ch-ph5", name:"Studio A Photography",         cat:"photographer", city:"Chicago",       rating:4.7, reviews:134, price:"$$",   desc:"Bold, modern wedding photography with a striking use of light and color.",   av:"S", color:"peach" },
  // Florists
  { id:"ch-fl1", name:"Belle Fleur Chicago",          cat:"florist",      city:"Chicago",       rating:4.8, reviews:167, price:"$$$$", desc:"European-inspired luxury florals for Chicago's most prestigious weddings.",  av:"B", color:"mint" },
  { id:"ch-fl2", name:"Kehoe Designs",                cat:"florist",      city:"Chicago",       rating:4.9, reviews:234, price:"$$$$", desc:"Grand-scale floral and décor transformations for the Midwest's finest events.", av:"K", color:"mint" },
  { id:"ch-fl3", name:"Bough & Bower",                cat:"florist",      city:"Chicago",       rating:4.8, reviews:145, price:"$$$",  desc:"Wild, seasonal botanicals with a lush garden-gathered Chicago aesthetic.",   av:"B", color:"mint" },
  { id:"ch-fl4", name:"Tablescapes Event Design",     cat:"florist",      city:"Chicago",       rating:4.7, reviews:112, price:"$$$",  desc:"Romantic, lush arrangements woven seamlessly into stunning tablescapes.",    av:"T", color:"mint" },
  { id:"ch-fl5", name:"Flowers for Dreams",           cat:"florist",      city:"Chicago",       rating:4.7, reviews:198, price:"$$",   desc:"Affordable luxury florals with a social mission to give back locally.",      av:"F", color:"mint" },
  // Caterers
  { id:"ch-ca1", name:"Limelight Catering",           cat:"caterer",      city:"Chicago",       rating:4.9, reviews:312, price:"$$$$", desc:"Chicago's premier event caterer with three decades of culinary excellence.",  av:"L", color:"lavender" },
  { id:"ch-ca2", name:"Blue Plate Catering",          cat:"caterer",      city:"Chicago",       rating:4.8, reviews:267, price:"$$$",  desc:"Creative American cuisine with seasonal menus and elegant presentation.",    av:"B", color:"lavender" },
  { id:"ch-ca3", name:"Entertaining Company",         cat:"caterer",      city:"Chicago",       rating:4.8, reviews:198, price:"$$$",  desc:"Globally inspired menus and impeccable service for every Chicago wedding.",  av:"E", color:"lavender" },
  { id:"ch-ca4", name:"Inspired Catering Chicago",    cat:"caterer",      city:"Chicago",       rating:4.7, reviews:167, price:"$$",   desc:"Fresh, handcrafted menus using locally sourced Midwest ingredients.",        av:"I", color:"lavender" },
  { id:"ch-ca5", name:"Feast by Firelight",           cat:"caterer",      city:"Chicago",       rating:4.8, reviews:145, price:"$$$",  desc:"Hearth-fired and wood-smoked cuisine for couples who crave bold flavor.",    av:"F", color:"lavender" },
  // DJ / Music
  { id:"ch-dj1", name:"GIG Productions Chicago",      cat:"dj-music",     city:"Chicago",       rating:4.9, reviews:198, price:"$$$",  desc:"Award-winning agency representing Chicago's finest wedding DJs.",            av:"G", color:"sky" },
  { id:"ch-dj2", name:"DJ Naeem Chicago",             cat:"dj-music",     city:"Chicago",       rating:4.8, reviews:156, price:"$$",   desc:"High-energy DJ known for seamless mixing across every genre and culture.",   av:"D", color:"sky" },
  { id:"ch-dj3", name:"Chicago Entertainment Group",  cat:"dj-music",     city:"Chicago",       rating:4.8, reviews:178, price:"$$$",  desc:"Full-service music and lighting production for Chicago's luxury weddings.",  av:"C", color:"sky" },
  { id:"ch-dj4", name:"DJ Capri Chicago",             cat:"dj-music",     city:"Chicago",       rating:4.7, reviews:134, price:"$$",   desc:"Sophisticated open-format DJ delivering unforgettable dance-floor energy.",  av:"D", color:"sky" },
  { id:"ch-dj5", name:"Sound Advice DJ Services",     cat:"dj-music",     city:"Chicago",       rating:4.7, reviews:112, price:"$$",   desc:"Custom curated playlists and seamless transitions for every wedding vibe.",  av:"S", color:"sky" },
  // Planners
  { id:"ch-pl1", name:"Sterling Engagements",         cat:"planner",      city:"Chicago",       rating:4.9, reviews:178, price:"$$$$", desc:"Luxury full-service planning with a signature for grand, magazine-worthy events.", av:"S", color:"blush" },
  { id:"ch-pl2", name:"Invision Events Chicago",      cat:"planner",      city:"Chicago",       rating:4.9, reviews:156, price:"$$$$", desc:"Creative, design-driven Chicago wedding planning with a bold artistic voice.", av:"I", color:"blush" },
  { id:"ch-pl3", name:"Magnificent Events",           cat:"planner",      city:"Chicago",       rating:4.8, reviews:134, price:"$$$",  desc:"Thoughtful, personalized planning for every couple's unique Chicago vision.",  av:"M", color:"blush" },
  { id:"ch-pl4", name:"Jubilee Events Chicago",       cat:"planner",      city:"Chicago",       rating:4.8, reviews:112, price:"$$$",  desc:"Bold event design and seamless logistics for the Midwest's most coveted weddings.", av:"J", color:"blush" },
  { id:"ch-pl5", name:"Kara Lissa Events",            cat:"planner",      city:"Chicago",       rating:4.7, reviews:98,  price:"$$",   desc:"Intimate, detail-obsessed planning for couples who want every moment perfect.", av:"K", color:"blush" },
  // Venues
  { id:"ch-ve1", name:"The Geraghty",                 cat:"venue",        city:"Chicago",       rating:4.9, reviews:312, price:"$$$$", desc:"Chicago's most romantic venue — an art-filled landmark with lake views.",    av:"G", color:"gold" },
  { id:"ch-ve2", name:"Chicago Cultural Center",      cat:"venue",        city:"Chicago",       rating:4.9, reviews:456, price:"$$$",  desc:"Iconic Tiffany glass domes and Venetian mosaics in a breathtaking civic palace.", av:"C", color:"gold" },
  { id:"ch-ve3", name:"Bridgeport Art Center",        cat:"venue",        city:"Chicago",       rating:4.8, reviews:234, price:"$$$",  desc:"Industrial-chic rooftop and galleries with panoramic Chicago skyline views.",  av:"B", color:"gold" },
  { id:"ch-ve4", name:"The Ivy Room Chicago",         cat:"venue",        city:"Chicago",       rating:4.8, reviews:198, price:"$$$$", desc:"Stunning ballroom with skylights, exposed brick and garden-inspired design.",  av:"I", color:"gold" },
  { id:"ch-ve5", name:"River Roast Chicago",          cat:"venue",        city:"Chicago",       rating:4.7, reviews:167, price:"$$$",  desc:"Riverfront restaurant venue with panoramic Chicago River and skyline views.",  av:"R", color:"gold" },
  // Bakery
  { id:"ch-bk1", name:"Alliance Bakery",              cat:"bakery",       city:"Chicago",       rating:4.8, reviews:234, price:"$$$",  desc:"Artisan wedding cakes crafted with precision, love and bold creative flair.",  av:"A", color:"rose" },
  { id:"ch-bk2", name:"Vanille Patisserie",           cat:"bakery",       city:"Chicago",       rating:4.9, reviews:312, price:"$$$",  desc:"French-inspired confections with breathtaking sugar flowers and elegant tiers.", av:"V", color:"rose" },
  { id:"ch-bk3", name:"Bad Wolf Bakery",              cat:"bakery",       city:"Chicago",       rating:4.8, reviews:198, price:"$$",   desc:"Whimsical, scratch-made cakes with natural buttercream and seasonal flavors.",  av:"B", color:"rose" },
  { id:"ch-bk4", name:"Sweet Mandy B's",              cat:"bakery",       city:"Chicago",       rating:4.7, reviews:267, price:"$",    desc:"Beloved Chicago bakery known for classic layers, vibrant color and pure joy.",  av:"S", color:"rose" },
  { id:"ch-bk5", name:"Bittersweet Pastry Shop",      cat:"bakery",       city:"Chicago",       rating:4.8, reviews:189, price:"$$",   desc:"Elegant, French-inspired wedding cakes with a warm Chicago neighborhood soul.", av:"B", color:"rose" },

  // ── MIAMI ─────────────────────────────────────────────────────────────────
  // Photographers
  { id:"mi-ph1", name:"Limelight Photography Miami",  cat:"photographer", city:"Miami",         rating:4.9, reviews:312, price:"$$$$", desc:"Luxury destination wedding photography with an editorial South Florida vision.", av:"L", color:"peach" },
  { id:"mi-ph2", name:"Brandon Kidd Photography",     cat:"photographer", city:"Miami",         rating:4.8, reviews:234, price:"$$$$", desc:"Fine-art film photography with a warm, luminous Miami Beach aesthetic.",       av:"B", color:"peach" },
  { id:"mi-ph3", name:"Kat Braman Photography",       cat:"photographer", city:"Miami",         rating:4.8, reviews:187, price:"$$$",  desc:"Romantic, natural-light portraits for Miami's most stylish couples.",         av:"K", color:"peach" },
  { id:"mi-ph4", name:"Karrie Porter Bridal",         cat:"photographer", city:"Miami",         rating:4.7, reviews:156, price:"$$$",  desc:"Documentary-style storytelling with a vibrant Miami color palette.",          av:"K", color:"peach" },
  { id:"mi-ph5", name:"Rafael Tongol Photography",    cat:"photographer", city:"Miami",         rating:4.9, reviews:178, price:"$$$$", desc:"Magazine-quality editorial photography for Miami's most exclusive weddings.",  av:"R", color:"peach" },
  // Florists
  { id:"mi-fl1", name:"Flowerbx Miami",               cat:"florist",      city:"Miami",         rating:4.8, reviews:178, price:"$$$$", desc:"Minimalist editorial florals using single-variety blooms in pure luxury.",     av:"F", color:"mint" },
  { id:"mi-fl2", name:"Flora Fauna Miami",            cat:"florist",      city:"Miami",         rating:4.9, reviews:145, price:"$$$",  desc:"Tropical-infused luxury florals celebrating Miami's bold botanical abundance.", av:"F", color:"mint" },
  { id:"mi-fl3", name:"Buds of Joy Miami",            cat:"florist",      city:"Miami",         rating:4.8, reviews:134, price:"$$$",  desc:"Lush, romantic arrangements with a distinctly Miami tropical elegance.",       av:"B", color:"mint" },
  { id:"mi-fl4", name:"Eden Floral Design",           cat:"florist",      city:"Miami",         rating:4.7, reviews:112, price:"$$",   desc:"Vibrant, organic florals inspired by South Florida's natural landscape.",      av:"E", color:"mint" },
  { id:"mi-fl5", name:"Flowers & Champagne",          cat:"florist",      city:"Miami",         rating:4.9, reviews:198, price:"$$$$", desc:"Lavish, over-the-top floral designs for Miami's most opulent celebrations.",   av:"F", color:"mint" },
  // Caterers
  { id:"mi-ca1", name:"Concept Cuisine Miami",        cat:"caterer",      city:"Miami",         rating:4.9, reviews:198, price:"$$$$", desc:"Avant-garde culinary experiences for Miami's most exclusive event spaces.",     av:"C", color:"lavender" },
  { id:"mi-ca2", name:"Top Hat Catering",             cat:"caterer",      city:"Miami",         rating:4.8, reviews:312, price:"$$$",  desc:"South Florida's trusted caterer for luxury weddings since 1987.",             av:"T", color:"lavender" },
  { id:"mi-ca3", name:"Social Catering & Events",     cat:"caterer",      city:"Miami",         rating:4.9, reviews:156, price:"$$$$", desc:"Globally inspired fine-dining menus by Miami's celebrated culinary team.",     av:"S", color:"lavender" },
  { id:"mi-ca4", name:"Karla's Catering Miami",       cat:"caterer",      city:"Miami",         rating:4.8, reviews:234, price:"$$$",  desc:"Latin-fusion cuisine celebrating Miami's rich culinary cultural tapestry.",    av:"K", color:"lavender" },
  { id:"mi-ca5", name:"Bakers Events Catering",       cat:"caterer",      city:"Miami",         rating:4.7, reviews:178, price:"$$$",  desc:"Fresh seafood-forward menus showcasing the finest of Florida's coast.",        av:"B", color:"lavender" },
  // DJ / Music
  { id:"mi-dj1", name:"DJ Irie",                      cat:"dj-music",     city:"Miami",         rating:4.9, reviews:234, price:"$$$$", desc:"Miami Heat's official DJ and South Florida's most sought-after entertainer.",  av:"D", color:"sky" },
  { id:"mi-dj2", name:"MNDATORY Entertainment",       cat:"dj-music",     city:"Miami",         rating:4.8, reviews:178, price:"$$$",  desc:"Premier Miami DJ agency known for high-energy, culturally rich dance floors.",  av:"M", color:"sky" },
  { id:"mi-dj3", name:"DJ Latin Prince",              cat:"dj-music",     city:"Miami",         rating:4.8, reviews:156, price:"$$$",  desc:"Latin and global fusion DJ creating electric, unforgettable wedding nights.",  av:"D", color:"sky" },
  { id:"mi-dj4", name:"Sound Factory Miami",          cat:"dj-music",     city:"Miami",         rating:4.7, reviews:134, price:"$$$",  desc:"Full audio-visual production with world-class DJ talent and sound design.",   av:"S", color:"sky" },
  { id:"mi-dj5", name:"Oceansound Entertainment",     cat:"dj-music",     city:"Miami",         rating:4.7, reviews:112, price:"$$",   desc:"Custom Miami DJ packages with live percussion and saxophone add-ons.",         av:"O", color:"sky" },
  // Planners
  { id:"mi-pl1", name:"Elegant Affairs Miami",        cat:"planner",      city:"Miami",         rating:4.9, reviews:198, price:"$$$$", desc:"Flawless luxury wedding planning for Miami's most high-profile couples.",      av:"E", color:"blush" },
  { id:"mi-pl2", name:"Panache Events Miami",         cat:"planner",      city:"Miami",         rating:4.9, reviews:178, price:"$$$$", desc:"Bold, theatrical event design for couples who want the extraordinary.",         av:"P", color:"blush" },
  { id:"mi-pl3", name:"Bliss Events Miami",           cat:"planner",      city:"Miami",         rating:4.8, reviews:167, price:"$$$",  desc:"Modern, design-forward planning with a signature South Florida flair.",        av:"B", color:"blush" },
  { id:"mi-pl4", name:"One Fine Day Events Miami",    cat:"planner",      city:"Miami",         rating:4.8, reviews:145, price:"$$$",  desc:"Intimate, personalized wedding planning with an eye for every exquisite detail.", av:"O", color:"blush" },
  { id:"mi-pl5", name:"Weddings by Paloma",           cat:"planner",      city:"Miami",         rating:4.7, reviews:123, price:"$$",   desc:"Boutique Miami wedding planning celebrating every couple's unique vision.",    av:"W", color:"blush" },
  // Venues
  { id:"mi-ve1", name:"Vizcaya Museum & Gardens",     cat:"venue",        city:"Miami",         rating:4.9, reviews:567, price:"$$$$", desc:"Breathtaking Italian Renaissance villa with Biscayne Bay waterfront gardens.",  av:"V", color:"gold" },
  { id:"mi-ve2", name:"Faena Hotel Miami Beach",      cat:"venue",        city:"Miami",         rating:4.9, reviews:412, price:"$$$$", desc:"Ultra-luxury beachfront hotel with theatrical interiors by Baz Luhrmann.",    av:"F", color:"gold" },
  { id:"mi-ve3", name:"The Biltmore Hotel",           cat:"venue",        city:"Miami",         rating:4.9, reviews:456, price:"$$$$", desc:"Iconic 1926 Mediterranean Revival estate with legendary Coral Gables ballrooms.", av:"B", color:"gold" },
  { id:"mi-ve4", name:"Loews Miami Beach Hotel",      cat:"venue",        city:"Miami",         rating:4.8, reviews:334, price:"$$$",  desc:"Art Deco oceanfront grandeur with sweeping Atlantic views and expert service.", av:"L", color:"gold" },
  { id:"mi-ve5", name:"The Kampong Garden",           cat:"venue",        city:"Miami",         rating:4.7, reviews:189, price:"$$$",  desc:"Lush tropical botanical garden with a private estate feel in Coconut Grove.", av:"K", color:"gold" },
  // Bakery
  { id:"mi-bk1", name:"Pastry Arts Bakery Miami",     cat:"bakery",       city:"Miami",         rating:4.9, reviews:234, price:"$$$",  desc:"Award-winning custom cakes with meticulous fondant artistry and bold flavors.", av:"P", color:"rose" },
  { id:"mi-bk2", name:"Dolce Mia Cakes",              cat:"bakery",       city:"Miami",         rating:4.8, reviews:145, price:"$$$",  desc:"Italian-inspired luxury cakes with hand-crafted sugar flowers and elegant tiers.", av:"D", color:"rose" },
  { id:"mi-bk3", name:"The Cake Spot Miami",          cat:"bakery",       city:"Miami",         rating:4.8, reviews:198, price:"$$$",  desc:"Custom Miami wedding cakes with bold tropical flavors and artistic flair.",    av:"C", color:"rose" },
  { id:"mi-bk4", name:"Sugar Rush Bakery Miami",      cat:"bakery",       city:"Miami",         rating:4.7, reviews:167, price:"$$",   desc:"Fresh, scratch-baked wedding cakes with vibrant Miami-inspired flavors.",      av:"S", color:"rose" },
  { id:"mi-bk5", name:"Lulu's Bakery Miami",          cat:"bakery",       city:"Miami",         rating:4.7, reviews:123, price:"$$",   desc:"Charming Miami institution beloved for fresh, flavorful layered wedding cakes.", av:"L", color:"rose" },

  // ── NASHVILLE ─────────────────────────────────────────────────────────────
  // Photographers
  { id:"na-ph1", name:"Pattengale Photography",       cat:"photographer", city:"Nashville",     rating:4.9, reviews:287, price:"$$$$", desc:"Award-winning editorial photography capturing Nashville's most romantic weddings.", av:"P", color:"peach" },
  { id:"na-ph2", name:"Kristyn Hogan Photography",    cat:"photographer", city:"Nashville",     rating:4.9, reviews:312, price:"$$$",  desc:"Nationally published, deeply personal storytelling for Southern weddings.",   av:"K", color:"peach" },
  { id:"na-ph3", name:"Erin Wilson Photography",      cat:"photographer", city:"Nashville",     rating:4.8, reviews:198, price:"$$$",  desc:"Luminous, editorial film photography with a golden Tennessee warmth.",         av:"E", color:"peach" },
  { id:"na-ph4", name:"Molly Lichten Photography",    cat:"photographer", city:"Nashville",     rating:4.8, reviews:156, price:"$$",   desc:"Candid, emotive documentary photography celebrating every real moment.",       av:"M", color:"peach" },
  { id:"na-ph5", name:"Riverland Studios",            cat:"photographer", city:"Nashville",     rating:4.7, reviews:134, price:"$$",   desc:"Bold, modern wedding photography infused with Nashville's creative spirit.",   av:"R", color:"peach" },
  // Florists
  { id:"na-fl1", name:"Enchanted Florist Nashville",  cat:"florist",      city:"Nashville",     rating:4.9, reviews:234, price:"$$$",  desc:"Nashville's most-booked florist with lush, romantic garden-inspired designs.", av:"E", color:"mint" },
  { id:"na-fl2", name:"Rosemary & Finch Floral",      cat:"florist",      city:"Nashville",     rating:4.9, reviews:198, price:"$$$",  desc:"Wild, ethereal florals inspired by Tennessee's rolling pastoral countryside.", av:"R", color:"mint" },
  { id:"na-fl3", name:"Stems Nashville",              cat:"florist",      city:"Nashville",     rating:4.8, reviews:187, price:"$$",   desc:"Fresh, seasonal botanicals with a beautiful rustic Tennessee aesthetic.",       av:"S", color:"mint" },
  { id:"na-fl4", name:"Cedarwood Floral Design",      cat:"florist",      city:"Nashville",     rating:4.8, reviews:145, price:"$$$",  desc:"Organic, garden-gathered arrangements for Nashville's most scenic venues.",    av:"C", color:"mint" },
  { id:"na-fl5", name:"Oleander Nashville",           cat:"florist",      city:"Nashville",     rating:4.7, reviews:112, price:"$$",   desc:"Contemporary minimalist florals for the modern, design-conscious couple.",    av:"O", color:"mint" },
  // Caterers
  { id:"na-ca1", name:"Hors d'Oeuvres Unlimited",     cat:"caterer",      city:"Nashville",     rating:4.9, reviews:312, price:"$$$",  desc:"Nashville's premier event caterer delivering Southern hospitality at its finest.", av:"H", color:"lavender" },
  { id:"na-ca2", name:"Taste Catering Nashville",     cat:"caterer",      city:"Nashville",     rating:4.8, reviews:198, price:"$$$",  desc:"Modern American cuisine with a Southern soul for discerning Nashville couples.", av:"T", color:"lavender" },
  { id:"na-ca3", name:"Bread & Company Catering",     cat:"caterer",      city:"Nashville",     rating:4.8, reviews:256, price:"$$",   desc:"Fresh, handcrafted menus with artisanal breads and seasonal Southern flavors.", av:"B", color:"lavender" },
  { id:"na-ca4", name:"Chef's Market Catering",       cat:"caterer",      city:"Nashville",     rating:4.8, reviews:145, price:"$$$",  desc:"Farm-fresh menus celebrating Tennessee's bounty for refined receptions.",      av:"C", color:"lavender" },
  { id:"na-ca5", name:"Dream Events & Catering",      cat:"caterer",      city:"Nashville",     rating:4.7, reviews:167, price:"$$",   desc:"Full-service catering with a specialty in heartwarming Southern comfort dishes.", av:"D", color:"lavender" },
  // DJ / Music
  { id:"na-dj1", name:"Nashville Wedding DJ",         cat:"dj-music",     city:"Nashville",     rating:4.9, reviews:198, price:"$$",   desc:"Nashville's premier wedding DJ blending country, pop and rock seamlessly.",   av:"N", color:"sky" },
  { id:"na-dj2", name:"Music City DJ",                cat:"dj-music",     city:"Nashville",     rating:4.8, reviews:178, price:"$$",   desc:"High-energy DJ sets celebrating Music City's rich and eclectic sound.",        av:"M", color:"sky" },
  { id:"na-dj3", name:"DJ Ace Productions Nashville", cat:"dj-music",     city:"Nashville",     rating:4.8, reviews:156, price:"$$$",  desc:"Full entertainment production with custom lighting and live band options.",    av:"D", color:"sky" },
  { id:"na-dj4", name:"Southern Sound Entertainment", cat:"dj-music",     city:"Nashville",     rating:4.7, reviews:134, price:"$$",   desc:"Authentic Nashville sound experience for intimate and grand weddings alike.",  av:"S", color:"sky" },
  { id:"na-dj5", name:"Harmony Wedding DJs",          cat:"dj-music",     city:"Nashville",     rating:4.7, reviews:112, price:"$$",   desc:"Versatile, crowd-reading DJs who keep the dance floor alive all night long.",  av:"H", color:"sky" },
  // Planners
  { id:"na-pl1", name:"Cedarwood Weddings",           cat:"planner",      city:"Nashville",     rating:4.9, reviews:287, price:"$$$",  desc:"Beloved Nashville planning team crafting romantic, timeless wedding days.",    av:"C", color:"blush" },
  { id:"na-pl2", name:"Honey & Bee Events",           cat:"planner",      city:"Nashville",     rating:4.9, reviews:198, price:"$$",   desc:"Warm, detail-obsessed planning for Nashville's most personal celebrations.",   av:"H", color:"blush" },
  { id:"na-pl3", name:"A Classic Party Rental",       cat:"planner",      city:"Nashville",     rating:4.8, reviews:167, price:"$$$",  desc:"Full-service event design and planning with stunning Tennessee backdrops.",    av:"A", color:"blush" },
  { id:"na-pl4", name:"Nuptials Nashville",           cat:"planner",      city:"Nashville",     rating:4.8, reviews:145, price:"$$",   desc:"Boutique Nashville wedding planning with a signature rustic-elegant flair.",   av:"N", color:"blush" },
  { id:"na-pl5", name:"L'Abri Nashville Events",      cat:"planner",      city:"Nashville",     rating:4.7, reviews:123, price:"$$",   desc:"Personalized, story-driven planning celebrating every couple's unique love.",  av:"L", color:"blush" },
  // Venues
  { id:"na-ve1", name:"Cheekwood Estate & Gardens",   cat:"venue",        city:"Nashville",     rating:4.9, reviews:456, price:"$$$$", desc:"Spectacular 55-acre botanical gardens and 1930s Georgian mansion estate.",    av:"C", color:"gold" },
  { id:"na-ve2", name:"The Inn at Fontanel",          cat:"venue",        city:"Nashville",     rating:4.8, reviews:312, price:"$$$",  desc:"Award-winning rustic-luxury venue nestled in Nashville's forested hills.",    av:"I", color:"gold" },
  { id:"na-ve3", name:"Cedarwood Nashville",          cat:"venue",        city:"Nashville",     rating:4.9, reviews:387, price:"$$$",  desc:"Nashville's most beloved garden venue with a romantic, wooded estate feel.",  av:"C", color:"gold" },
  { id:"na-ve4", name:"The Bell Tower Nashville",     cat:"venue",        city:"Nashville",     rating:4.8, reviews:267, price:"$$$$", desc:"Historic 1874 Gothic church tower transformed into a dramatic event space.",   av:"B", color:"gold" },
  { id:"na-ve5", name:"The Cordelle Nashville",       cat:"venue",        city:"Nashville",     rating:4.8, reviews:234, price:"$$$$", desc:"Industrial-chic venue with exposed brick and stunning Nashville skyline views.", av:"C", color:"gold" },
  // Bakery
  { id:"na-bk1", name:"Dulce Desserts Nashville",     cat:"bakery",       city:"Nashville",     rating:4.9, reviews:234, price:"$$$",  desc:"Award-winning Nashville cake studio with sculptural artistry and rich flavor.",  av:"D", color:"rose" },
  { id:"na-bk2", name:"The Dessert Stand",            cat:"bakery",       city:"Nashville",     rating:4.8, reviews:198, price:"$$",   desc:"Beautiful, seasonal wedding cakes crafted with Tennessee-grown ingredients.",  av:"D", color:"rose" },
  { id:"na-bk3", name:"Edible Art Pastry Shop",       cat:"bakery",       city:"Nashville",     rating:4.8, reviews:156, price:"$$$",  desc:"Sculpted sugar masterpieces as beautiful to look at as they are to taste.",   av:"E", color:"rose" },
  { id:"na-bk4", name:"Flavor Cupcakery Nashville",   cat:"bakery",       city:"Nashville",     rating:4.7, reviews:178, price:"$$",   desc:"Charming Nashville bakery with bold flavors and whimsical wedding tower designs.", av:"F", color:"rose" },
  { id:"na-bk5", name:"Christie Cookie Company",      cat:"bakery",       city:"Nashville",     rating:4.7, reviews:312, price:"$",    desc:"Nashville's iconic warm cookie brand now crafting stunning custom wedding cakes.", av:"C", color:"rose" },

  // ── SAN FRANCISCO ─────────────────────────────────────────────────────────
  // Photographers
  { id:"sf-ph1", name:"Golden Hour Studio",           cat:"photographer", city:"San Francisco", rating:4.9, reviews:128, price:"$$$",  desc:"Award-winning Bay Area photography capturing every golden magical moment.",   av:"G", color:"peach" },
  { id:"sf-ph2", name:"This Modern Romance",          cat:"photographer", city:"San Francisco", rating:4.9, reviews:198, price:"$$$$", desc:"Cinematic fine-art wedding photography across Northern California.",          av:"T", color:"peach" },
  { id:"sf-ph3", name:"Jasmine Lee Photo SF",         cat:"photographer", city:"San Francisco", rating:4.8, reviews:167, price:"$$$",  desc:"Vibrant, editorial wedding photography with a Bay Area soul.",                av:"J", color:"peach" },
  { id:"sf-ph4", name:"Sherry Chen Photography",      cat:"photographer", city:"San Francisco", rating:4.8, reviews:143, price:"$$$",  desc:"Romantic, luminous portraits for San Francisco's diverse and stylish couples.", av:"S", color:"peach" },
  { id:"sf-ph5", name:"Lens & Light",                 cat:"photographer", city:"San Francisco", rating:4.6, reviews:61,  price:"$$",   desc:"Natural light portraits with a candid documentary Bay Area style.",           av:"L", color:"peach" },
  // Florists
  { id:"sf-fl1", name:"Studio Mondine",               cat:"florist",      city:"San Francisco", rating:4.9, reviews:167, price:"$$$$", desc:"Bay Area's most celebrated florist — organic, sculptural and achingly beautiful.", av:"S", color:"mint" },
  { id:"sf-fl2", name:"Tulipina",                     cat:"florist",      city:"San Francisco", rating:4.9, reviews:198, price:"$$$$", desc:"Opulent, overflowing arrangements that redefine luxury wedding floristry.",    av:"T", color:"mint" },
  { id:"sf-fl3", name:"Gorgeous and Green",           cat:"florist",      city:"San Francisco", rating:4.8, reviews:134, price:"$$$",  desc:"Sustainable, locally sourced florals celebrating Northern California's botanicals.", av:"G", color:"mint" },
  { id:"sf-fl4", name:"Petal & Vine",                 cat:"florist",      city:"San Francisco", rating:4.8, reviews:94,  price:"$$",   desc:"Lush garden-style florals and custom floral installations across the Bay Area.", av:"P", color:"mint" },
  { id:"sf-fl5", name:"Branch Design Studio SF",      cat:"florist",      city:"San Francisco", rating:4.7, reviews:112, price:"$$$",  desc:"Contemporary, architectural floral designs for the design-forward Bay Area couple.", av:"B", color:"mint" },
  // Caterers
  { id:"sf-ca1", name:"McCalls Catering",             cat:"caterer",      city:"San Francisco", rating:4.9, reviews:312, price:"$$$$", desc:"Four decades of San Francisco event excellence and culinary innovation.",       av:"M", color:"lavender" },
  { id:"sf-ca2", name:"Hearth Table",                 cat:"caterer",      city:"San Francisco", rating:4.9, reviews:205, price:"$$$",  desc:"Farm-to-table cuisine for intimate and grand Bay Area weddings.",             av:"H", color:"lavender" },
  { id:"sf-ca3", name:"Taste Catering SF",            cat:"caterer",      city:"San Francisco", rating:4.8, reviews:189, price:"$$$",  desc:"Modern California cuisine with seasonal menus and impeccable Bay Area service.", av:"T", color:"lavender" },
  { id:"sf-ca4", name:"Bon Vivant Catering",          cat:"caterer",      city:"San Francisco", rating:4.8, reviews:156, price:"$$",   desc:"French-Californian fusion cuisine for the Bay Area's most celebrated events.", av:"B", color:"lavender" },
  { id:"sf-ca5", name:"Catered Too SF",               cat:"caterer",      city:"San Francisco", rating:4.7, reviews:134, price:"$$",   desc:"Creative, globally-inspired menus for weddings across the Bay Area.",         av:"C", color:"lavender" },
  // DJ / Music
  { id:"sf-dj1", name:"Skyline DJ Entertainment",     cat:"dj-music",     city:"San Francisco", rating:4.8, reviews:134, price:"$$$",  desc:"Premium Bay Area DJ services with full lighting and sound production.",        av:"S", color:"sky" },
  { id:"sf-dj2", name:"Blue Note Events",             cat:"dj-music",     city:"San Francisco", rating:4.7, reviews:73,  price:"$$",   desc:"Keeping the Bay Area dance floor packed with energy since 2010.",             av:"B", color:"sky" },
  { id:"sf-dj3", name:"Melody Keys SF",               cat:"dj-music",     city:"San Francisco", rating:4.8, reviews:55,  price:"$$",   desc:"Live music and DJ hybrid services for Bay Area ceremony and reception.",       av:"M", color:"sky" },
  { id:"sf-dj4", name:"DJKAM Bay Area",               cat:"dj-music",     city:"San Francisco", rating:4.8, reviews:98,  price:"$$$",  desc:"Award-winning Bay Area DJ known for electric multi-cultural dance floors.",    av:"D", color:"sky" },
  { id:"sf-dj5", name:"Bay Area Wedding DJs",         cat:"dj-music",     city:"San Francisco", rating:4.7, reviews:112, price:"$$",   desc:"Versatile open-format DJs serving the entire San Francisco Bay Area.",         av:"B", color:"sky" },
  // Planners
  { id:"sf-pl1", name:"Laurie Arons Special Events",  cat:"planner",      city:"San Francisco", rating:4.9, reviews:198, price:"$$$$", desc:"Bay Area's most distinguished luxury planner for three celebrated decades.",   av:"L", color:"blush" },
  { id:"sf-pl2", name:"Passport to Joy",              cat:"planner",      city:"San Francisco", rating:4.9, reviews:167, price:"$$$$", desc:"Award-winning SF wedding planning with a deeply personal and artful approach.", av:"P", color:"blush" },
  { id:"sf-pl3", name:"Grace & White",                cat:"planner",      city:"San Francisco", rating:4.9, reviews:83,  price:"$$$",  desc:"Full-service Bay Area planning with a sophisticated eye for design and detail.", av:"G", color:"blush" },
  { id:"sf-pl4", name:"Lemon Tree Events SF",         cat:"planner",      city:"San Francisco", rating:4.8, reviews:134, price:"$$$",  desc:"Fresh, modern wedding planning with a warm, meticulous Bay Area sensibility.", av:"L", color:"blush" },
  { id:"sf-pl5", name:"Emily Clarke Events",          cat:"planner",      city:"San Francisco", rating:4.7, reviews:112, price:"$$",   desc:"Boutique San Francisco planning for the couple who wants every detail perfect.", av:"E", color:"blush" },
  // Venues
  { id:"sf-ve1", name:"The Fairmont San Francisco",   cat:"venue",        city:"San Francisco", rating:4.9, reviews:567, price:"$$$$", desc:"Nob Hill's crown jewel — legendary ballrooms with panoramic city views.",      av:"F", color:"gold" },
  { id:"sf-ve2", name:"Cavallo Point Lodge",          cat:"venue",        city:"San Francisco", rating:4.9, reviews:345, price:"$$$$", desc:"Stunning Golden Gate views from a waterfront lodge in a national park.",       av:"C", color:"gold" },
  { id:"sf-ve3", name:"San Francisco City Hall",      cat:"venue",        city:"San Francisco", rating:4.9, reviews:789, price:"$$",   desc:"Iconic Beaux-Arts rotunda with breathtaking marble staircases and city soul.",  av:"C", color:"gold" },
  { id:"sf-ve4", name:"The Julia Morgan Ballroom",    cat:"venue",        city:"San Francisco", rating:4.8, reviews:312, price:"$$$",  desc:"Historic 1903 landmark ballroom with gilded ceilings and old-world grandeur.",  av:"J", color:"gold" },
  { id:"sf-ve5", name:"Rosewood Rentals",             cat:"venue",        city:"San Francisco", rating:4.7, reviews:44,  price:"$$$",  desc:"Romantic coastal estate with garden ceremony and elegant Bay Area ballroom.",  av:"R", color:"gold" },
  // Bakery
  { id:"sf-bk1", name:"Satura Cakes",                 cat:"bakery",       city:"San Francisco", rating:4.9, reviews:234, price:"$$$",  desc:"Japanese-inspired precision with light, fresh flavors in every ethereal layer.", av:"S", color:"rose" },
  { id:"sf-bk2", name:"B Patisserie",                 cat:"bakery",       city:"San Francisco", rating:4.9, reviews:289, price:"$$$",  desc:"French-Californian pastry artistry yielding hauntingly beautiful wedding cakes.", av:"B", color:"rose" },
  { id:"sf-bk3", name:"Sugar Blossom Bake Shop",      cat:"bakery",       city:"San Francisco", rating:4.8, reviews:198, price:"$$",   desc:"Charming Bay Area bakery crafting fresh, elegant wedding cakes with love.",     av:"S", color:"rose" },
  { id:"sf-bk4", name:"Criolla Kitchen",              cat:"bakery",       city:"San Francisco", rating:4.8, reviews:167, price:"$$",   desc:"New Orleans-inspired flavors meet Bay Area craft in gorgeous wedding tiers.",  av:"C", color:"rose" },
  { id:"sf-bk5", name:"Noe Valley Bakery",            cat:"bakery",       city:"San Francisco", rating:4.7, reviews:156, price:"$$",   desc:"Beloved SF neighborhood bakery celebrated for fresh, seasonal wedding cakes.",  av:"N", color:"rose" },
];

// ── Discover state ────────────────────────────────────────────────────────────
let discoverFilter   = "all";
let discoverLocation = localStorage.getItem("wedboard:discoverLocation") || "";
let discoverAPIReady = false; // true once we confirm the Flask backend is up
// In-memory result cache: "location|category" → vendor[]
const discoverCache  = {};

// Category → avatar colour (mirrors backend CATEGORY_COLORS)
const DISCOVER_CAT_COLORS = {
  photographer: "peach", florist: "mint",   caterer:  "lavender",
  "dj-music":   "sky",   planner: "blush",  venue:    "gold",
  bakery:       "rose",
};

// Probe the Flask backend once on load; sets discoverAPIReady
async function _probeDiscoverAPI() {
  try {
    const r = await fetch("/api/status", { signal: AbortSignal.timeout(1800) });
    if (r.ok) discoverAPIReady = true;
  } catch { /* backend not running — stay on static data */ }
}

// ── Main entry point called by tab switch ─────────────────────────────────────
function renderDiscovery() {
  // Sync text input
  const inp = document.getElementById("c-location-input");
  if (inp && inp.value !== discoverLocation) inp.value = discoverLocation;

  // Category filter pills
  document.querySelectorAll("#c-discover-filters .filter-pill").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.cat === discoverFilter);
    btn.onclick = () => { discoverFilter = btn.dataset.cat; renderDiscovery(); };
  });

  // Route to live or static rendering
  if (discoverLocation && discoverAPIReady) {
    _renderDiscoveryLive();
  } else {
    _renderDiscoveryStatic();
  }
}

// ── Static fallback: filter DISCOVERY_VENDORS_STATIC ─────────────────────────
function _renderDiscoveryStatic() {
  const STATIC_CITY_MAP = {
    "new york": "New York", "los angeles": "Los Angeles",
    chicago: "Chicago",     miami: "Miami",
    nashville: "Nashville", "san francisco": "San Francisco",
  };
  let vendors = DISCOVERY_VENDORS_STATIC;
  if (discoverLocation) {
    const loc  = discoverLocation.toLowerCase();
    const city = Object.keys(STATIC_CITY_MAP).find(k => loc.includes(k));
    vendors    = city ? vendors.filter(v => v.city === STATIC_CITY_MAP[city]) : [];
  }
  if (discoverFilter !== "all") vendors = vendors.filter(v => v.cat === discoverFilter);
  _renderVendorCards(vendors);
}

// ── Live path: fetch from /api/discover-vendors ───────────────────────────────
async function _renderDiscoveryLive() {
  const cacheKey = `${discoverLocation}|${discoverFilter}`;
  if (discoverCache[cacheKey]) { _renderVendorCards(discoverCache[cacheKey]); return; }

  const grid = document.getElementById("c-vendor-discover-grid");
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:44px 0">
      <div class="discover-spinner"></div>
      <p class="muted sm" style="margin-top:14px">Finding vendors in <strong>${esc(discoverLocation)}</strong>…</p>
    </div>`;
  _setDiscoverStatus("");

  try {
    const qs  = new URLSearchParams({ location: discoverLocation, category: discoverFilter });
    const res = await fetch(`/api/discover-vendors?${qs}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data.error && !data.vendors?.length) {
      // API key missing — tell the user and fall back
      _setDiscoverStatus("⚙ Google Places API key not configured — showing curated vendors.", "error");
      _renderDiscoveryStatic();
      return;
    }

    // Normalise API shape → card shape expected by _renderVendorCards
    const vendors = (data.vendors || []).map(v => ({
      id:      v.vendor_id,
      name:    v.name,
      cat:     v.category,
      city:    v.city,
      rating:  v.rating,
      reviews: v.reviews,
      price:   v.price,
      desc:    v.description,
      av:      (v.name || "V")[0].toUpperCase(),
      color:   DISCOVER_CAT_COLORS[v.category] || "peach",
      website: v.website,
      phone:   v.phone,
    }));

    discoverCache[cacheKey] = vendors;
    _setDiscoverStatus(
      vendors.length
        ? `✦ ${vendors.length} vendors found in ${discoverLocation}`
        : ""
    );
    _renderVendorCards(vendors);

  } catch (err) {
    _setDiscoverStatus("⚠ Live search unavailable — showing curated vendors.", "error");
    _renderDiscoveryStatic();
  }
}

// ── Status bar helper ─────────────────────────────────────────────────────────
function _setDiscoverStatus(msg, type = "") {
  const bar = document.getElementById("c-discover-status");
  if (!bar) return;
  bar.textContent = msg;
  bar.className   = "discover-status-bar" + (type ? ` ${type}` : "") + (msg ? "" : " hidden");
}

// ── Shared card renderer ──────────────────────────────────────────────────────
function _renderVendorCards(vendors) {
  const grid = document.getElementById("c-vendor-discover-grid");
  grid.innerHTML = "";

  if (!vendors.length) {
    grid.innerHTML = `<p class="muted sm" style="padding:24px 0;grid-column:1/-1">No vendors found for this location and category.</p>`;
    return;
  }

  vendors.forEach(v => {
    const card  = document.createElement("div");
    card.className = "vendor-discover-card";
    const stars  = "★".repeat(Math.round(v.rating)) + "☆".repeat(5 - Math.round(v.rating));
    const inList = !!document.querySelector(`.c-vendor-btn[data-vendor="${v.name}"]`);
    const ratingDisplay = v.rating > 0
      ? `${v.rating} <span class="muted sm">${v.reviews > 0 ? `(${v.reviews})` : ""}</span>`
      : `<span class="muted sm">No rating</span>`;
    card.innerHTML = `
      <div class="vdc-header">
        <div class="m-avatar ${v.color}">${v.av}</div>
        <div class="vdc-info">
          <strong>${esc(v.name)}</strong>
          <span class="muted sm">${fmtCat(v.cat)} &middot; ${esc(v.city)}</span>
        </div>
        <span class="vdc-price">${v.price}</span>
      </div>
      <p class="vdc-desc">${esc(v.desc)}</p>
      <div class="vdc-footer">
        <span class="vdc-rating">
          <span class="star-display">${stars}</span> ${ratingDisplay}
        </span>
        ${inList
          ? `<span class="pill" style="font-size:.72rem">Added</span>`
          : `<button class="btn btn-primary btn-tiny" data-id="${v.id}">+ Add</button>`
        }
      </div>`;
    if (!inList) card.querySelector("button").onclick = () => addDiscoveredVendor(v);
    grid.appendChild(card);
  });
}

// ── Location search input wiring ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const inp    = document.getElementById("c-location-input");
  const searchBtn = document.getElementById("c-location-search");

  // Restore last location
  if (inp) inp.value = discoverLocation;

  function triggerSearch() {
    const val = (inp?.value || "").trim();
    if (!val) return;
    discoverLocation = val;
    localStorage.setItem("wedboard:discoverLocation", val);
    renderDiscovery();
  }

  if (inp)      inp.addEventListener("keydown", e => { if (e.key === "Enter") triggerSearch(); });
  if (searchBtn) searchBtn.addEventListener("click", triggerSearch);

  // Probe backend availability asynchronously
  _probeDiscoverAPI();
});

function addDiscoveredVendor(v) {
  if (document.querySelector(`.c-vendor-btn[data-vendor="${v.name}"]`)) { renderDiscovery(); return; }
  const list = document.getElementById("c-vendor-list");
  const btn = document.createElement("button");
  btn.className = "m-chat-item c-vendor-btn";
  btn.dataset.vendor = v.name;
  btn.dataset.cat = fmtCat(v.cat);
  btn.dataset.color = v.color;
  btn.innerHTML = `<div class="m-avatar ${v.color}">${v.av}</div><div class="m-chat-info"><strong>${esc(v.name)}</strong><span>${fmtCat(v.cat)}</span></div>`;
  btn.addEventListener("click", () => {
    const chatTab = document.querySelector(".c-tab-btn[data-tab='chat']");
    if (!chatTab.classList.contains("active")) {
      document.querySelectorAll(".c-tab-btn").forEach(b => b.classList.remove("active"));
      chatTab.classList.add("active");
      document.querySelectorAll(".c-tab-panel").forEach(p => p.classList.add("hidden"));
      document.getElementById("c-tab-chat").classList.remove("hidden");
    }
    openThread(btn.dataset.vendor, btn.dataset.cat, v.color);
  });
  list.appendChild(btn);
  // Switch to chat tab and open the new vendor's thread directly
  document.querySelectorAll(".c-tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(".c-tab-btn[data-tab='chat']").classList.add("active");
  document.querySelectorAll(".c-tab-panel").forEach(p => p.classList.add("hidden"));
  document.getElementById("c-tab-chat").classList.remove("hidden");
  openThread(v.name, fmtCat(v.cat), v.color);
  addMessage("system", "System", `${v.name} added to your vendors!`);
}

// ═══ SEATING CHART ════════════════════════════════════════════════════════════
const seatingState = {
  guests: [], tables: 4, seatsPerTable: 8, selected: null,
  tableNames: {},  // { idx: "Custom Name" }
  tableSizes: {}   // { idx: overrideCount }
};

const TAG_COLORS = { veg:"#5E9978", vegan:"#2D7A52", gf:"#D4935A", child:"#6B9FD4", vip:"#C1A775" };
const TAG_LABELS = { veg:"Vegetarian", vegan:"Vegan", gf:"Gluten-free", child:"Child", vip:"VIP" };

function tableSeats(t) { return seatingState.tableSizes[t] ?? seatingState.seatsPerTable; }
function tableName(t)  { return seatingState.tableNames[t] || `Table ${t + 1}`; }

function renderSeating() { renderUnassigned(); renderTables(); updateSeatingStats(); }

function renderUnassigned() {
  const container = document.getElementById("c-guest-unassigned");
  const unassigned = seatingState.guests.filter(g => g.tableId === null);
  container.innerHTML = "";
  if (!unassigned.length) { container.innerHTML = '<p class="muted sm" style="padding:6px 0">All guests seated! ✦</p>'; return; }
  if (seatingState.selected) {
    const hint = document.createElement("p");
    hint.className = "assign-hint";
    hint.textContent = "Click an empty seat ○ on any table to assign";
    container.appendChild(hint);
  }
  unassigned.forEach(g => {
    const chip = document.createElement("div");
    chip.className = "guest-chip" + (seatingState.selected === g.id ? " selected" : "");
    chip.onclick = () => { seatingState.selected = seatingState.selected === g.id ? null : g.id; renderSeating(); };
    if (g.tag) {
      const dot = document.createElement("span");
      dot.className = "guest-tag-dot"; dot.style.background = TAG_COLORS[g.tag] || "#ccc"; dot.title = TAG_LABELS[g.tag] || g.tag;
      chip.appendChild(dot);
    }
    const nameSpan = document.createElement("span"); nameSpan.textContent = g.name; chip.appendChild(nameSpan);
    const del = document.createElement("button"); del.className = "guest-chip-del"; del.textContent = "\xd7";
    del.onclick = e => { e.stopPropagation(); seatingState.guests = seatingState.guests.filter(x => x.id !== g.id); if (seatingState.selected === g.id) seatingState.selected = null; renderSeating(); };
    chip.appendChild(del); container.appendChild(chip);
  });
}

function renderTables() {
  const grid = document.getElementById("c-tables-grid"); grid.innerHTML = "";
  const selGuest = seatingState.selected ? seatingState.guests.find(g => g.id === seatingState.selected) : null;

  for (let t = 0; t < seatingState.tables; t++) {
    const N = tableSeats(t);
    const count = seatingState.guests.filter(g => g.tableId === t).length;
    const name  = tableName(t);

    const tableEl = document.createElement("div");
    tableEl.className = "seating-table-card";

    // Header
    const hdr = document.createElement("div"); hdr.className = "seating-table-header";
    hdr.innerHTML = `<span>${esc(name)}</span><div class="seating-table-header-right"><span class="muted sm">${count}/${N}</span><span class="seating-open-hint">Edit ›</span></div>`;
    tableEl.appendChild(hdr);

    // Circular visual
    const size = 180, seatD = 26, orbit = size/2 - seatD/2 - 6;
    const wrap = document.createElement("div");
    wrap.className = "table-visual-wrap";
    wrap.style.cssText = `width:${size}px;height:${size}px`;

    const surface = document.createElement("div"); surface.className = "table-visual-surface";
    const sw = Math.round(size * 0.4), sh = sw;
    surface.style.cssText = `width:${sw}px;height:${sh}px`;
    surface.innerHTML = `<span class="table-surface-label">${count > 0 ? count+"/"+N : "✦"}</span>`;
    wrap.appendChild(surface);

    for (let s = 0; s < N; s++) {
      const angle = (2 * Math.PI * s / N) - Math.PI / 2;
      const cx = size/2 + orbit * Math.cos(angle), cy = size/2 + orbit * Math.sin(angle);
      const guest = seatingState.guests.find(g => g.tableId === t && g.seat === s);
      const seat = document.createElement("div");
      seat.className = "seating-seat-round " + (guest ? "filled" : "empty");
      seat.style.cssText = `left:${cx - seatD/2}px;top:${cy - seatD/2}px;width:${seatD}px;height:${seatD}px`;
      if (guest) {
        seat.textContent = guest.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
        seat.title = guest.name + (guest.tag ? ` · ${TAG_LABELS[guest.tag]}` : "");
        if (guest.tag) seat.style.borderColor = TAG_COLORS[guest.tag];
      } else {
        seat.title = selGuest ? `Assign ${selGuest.name} here` : "Open table to manage seats";
        if (selGuest) {
          seat.classList.add("assignable");
          seat.addEventListener("click", e => {
            e.stopPropagation();
            selGuest.tableId = t; selGuest.seat = s; seatingState.selected = null; renderSeating();
          });
        } else {
          seat.addEventListener("click", e => { e.stopPropagation(); openTableModal(t); });
        }
      }
      wrap.appendChild(seat);
    }
    tableEl.appendChild(wrap);
    tableEl.onclick = () => openTableModal(t);
    grid.appendChild(tableEl);
  }
}

// ── Table Modal ───────────────────────────────────────────────────────────────
let modalTableIndex = null;

function openTableModal(tableIdx) {
  modalTableIndex = tableIdx;
  const inp = document.getElementById("c-modal-title-input");
  inp.value = seatingState.tableNames[tableIdx] || "";
  inp.placeholder = `Table ${tableIdx + 1}`;
  document.getElementById("c-modal-seats-val").textContent = tableSeats(tableIdx);
  renderModalSeats();
  document.getElementById("c-seating-modal-overlay").classList.remove("hidden");
  setTimeout(() => { const first = document.querySelector(".modal-seat-input:placeholder-shown"); if (first) first.focus(); }, 60);
}

function renderModalSeats() {
  const body = document.getElementById("c-seating-modal-seats");
  const t = modalTableIndex;
  body.innerHTML = "";
  for (let s = 0; s < tableSeats(t); s++) {
    const guest = seatingState.guests.find(g => g.tableId === t && g.seat === s);
    const row = document.createElement("div"); row.className = "modal-seat-row";

    const num = document.createElement("span"); num.className = "modal-seat-num"; num.textContent = s + 1;

    const input = document.createElement("input");
    input.className = "modal-seat-input"; input.type = "text"; input.placeholder = "Guest name…"; input.value = guest ? guest.name : "";

    const tagSel = document.createElement("select");
    tagSel.className = "modal-seat-tag"; tagSel.disabled = !guest; tagSel.title = "Tag";
    [["","—"],["veg","Veg"],["vegan","Vegan"],["gf","GF"],["child","Child"],["vip","VIP"]].forEach(([v,l]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = l;
      if (guest && guest.tag === v) o.selected = true;
      tagSel.appendChild(o);
    });

    const clearBtn = document.createElement("button"); clearBtn.className = "modal-seat-clear" + (guest ? "" : " hidden"); clearBtn.title = "Remove"; clearBtn.innerHTML = "&times;";

    input.addEventListener("input", () => {
      const val = input.value.trim();
      const existing = seatingState.guests.find(g => g.tableId === t && g.seat === s);
      if (existing) { if (val) existing.name = val; else { seatingState.guests = seatingState.guests.filter(g => !(g.tableId === t && g.seat === s)); tagSel.value = ""; tagSel.disabled = true; } }
      else if (val) { seatingState.guests.push({ id: crypto.randomUUID(), name: val, tableId: t, seat: s, tag: null }); tagSel.disabled = false; }
      clearBtn.classList.toggle("hidden", !val); updateModalStats();
    });
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { const ins = body.querySelectorAll(".modal-seat-input"); const next = ins[Array.from(ins).indexOf(input) + 1]; if (next) next.focus(); else document.getElementById("c-seating-modal-close").click(); }
    });
    tagSel.addEventListener("change", () => { const g = seatingState.guests.find(g => g.tableId === t && g.seat === s); if (g) g.tag = tagSel.value || null; });
    clearBtn.addEventListener("click", () => { seatingState.guests = seatingState.guests.filter(g => !(g.tableId === t && g.seat === s)); input.value = ""; clearBtn.classList.add("hidden"); tagSel.value = ""; tagSel.disabled = true; input.focus(); updateModalStats(); });

    row.appendChild(num); row.appendChild(input); row.appendChild(tagSel); row.appendChild(clearBtn);
    body.appendChild(row);
  }
  updateModalStats();
}

function updateModalStats() {
  const t = modalTableIndex;
  const count = seatingState.guests.filter(g => g.tableId === t).length;
  document.getElementById("c-modal-table-stats").textContent = `${count} / ${tableSeats(t)} seated`;
}

document.getElementById("c-modal-title-input").addEventListener("input", e => {
  if (modalTableIndex === null) return;
  const val = e.target.value.trim();
  if (val) seatingState.tableNames[modalTableIndex] = val; else delete seatingState.tableNames[modalTableIndex];
});
document.getElementById("c-modal-seats-dec").onclick = () => {
  if (modalTableIndex === null) return;
  const cur = tableSeats(modalTableIndex); if (cur <= 2) return;
  seatingState.tableSizes[modalTableIndex] = cur - 1;
  seatingState.guests.forEach(g => { if (g.tableId === modalTableIndex && g.seat >= cur - 1) { g.tableId = null; g.seat = null; } });
  document.getElementById("c-modal-seats-val").textContent = tableSeats(modalTableIndex); renderModalSeats();
};
document.getElementById("c-modal-seats-inc").onclick = () => {
  if (modalTableIndex === null) return;
  const cur = tableSeats(modalTableIndex); if (cur >= 16) return;
  seatingState.tableSizes[modalTableIndex] = cur + 1;
  document.getElementById("c-modal-seats-val").textContent = tableSeats(modalTableIndex); renderModalSeats();
};
document.getElementById("c-seating-modal-close").onclick = () => { document.getElementById("c-seating-modal-overlay").classList.add("hidden"); renderSeating(); };
document.getElementById("c-seating-modal-overlay").addEventListener("click", e => { if (e.target === document.getElementById("c-seating-modal-overlay")) document.getElementById("c-seating-modal-close").click(); });

function updateSeatingStats() {
  const total = seatingState.guests.length, seated = seatingState.guests.filter(g => g.tableId !== null).length;
  document.getElementById("c-seating-stats").textContent = `${total} guest${total !== 1 ? "s" : ""} · ${seated} seated`;
}

document.getElementById("c-guest-add").onclick = () => {
  const input = document.getElementById("c-guest-input"), name = input.value.trim(); if (!name) return;
  seatingState.guests.push({ id: crypto.randomUUID(), name, tableId: null, seat: null, tag: null }); input.value = ""; renderSeating();
};
document.getElementById("c-guest-input").addEventListener("keydown", e => { if (e.key === "Enter") document.getElementById("c-guest-add").click(); });
document.getElementById("c-seating-clear").onclick = () => {
  if (!seatingState.guests.length) return;
  if (confirm("Remove all guests and clear the seating chart?")) { seatingState.guests = []; seatingState.selected = null; renderSeating(); }
};
document.getElementById("c-import-csv").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const names = reader.result.split(/[\r\n,]+/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 60);
    let added = 0;
    names.forEach(name => { if (!seatingState.guests.some(g => g.name.toLowerCase() === name.toLowerCase())) { seatingState.guests.push({ id: crypto.randomUUID(), name, tableId: null, seat: null, tag: null }); added++; } });
    renderSeating();
    if (!added) alert("No new guests found in the imported file.");
  };
  reader.readAsText(file); e.target.value = "";
});

// Table / seat count steppers
function updateSeatingConfig() {
  document.getElementById("c-tables-count").textContent = seatingState.tables;
  document.getElementById("c-seats-count").textContent = seatingState.seatsPerTable;
  seatingState.guests.forEach(g => { if (g.tableId !== null && (g.tableId >= seatingState.tables || g.seat >= tableSeats(g.tableId))) { g.tableId = null; g.seat = null; } });
  renderSeating();
}
document.getElementById("c-tables-dec").onclick = () => { if (seatingState.tables > 1) { seatingState.tables--; updateSeatingConfig(); } };
document.getElementById("c-tables-inc").onclick = () => { if (seatingState.tables < 20) { seatingState.tables++; updateSeatingConfig(); } };
document.getElementById("c-seats-dec").onclick  = () => { if (seatingState.seatsPerTable > 2) { seatingState.seatsPerTable--; updateSeatingConfig(); } };
document.getElementById("c-seats-inc").onclick  = () => { if (seatingState.seatsPerTable < 16) { seatingState.seatsPerTable++; updateSeatingConfig(); } };

// ═══ BRIDAL PARTY ══════════════════════════════════════════════════════════════
const ROLE_COLORS = { "Maid of Honor":"#D4909E","Best Man":"#6B9FD4","Bridesmaid":"#EDAAB6","Groomsman":"#7AA890","Matron of Honor":"#C47575","Usher":"#5E9978","Flower Girl":"#F0B8C4","Ring Bearer":"#A0B8D8","Officiant":"#C1A775","Parent of Bride":"#B090C8","Parent of Groom":"#8898C8","Guest of Honor":"#C8A0B0" };
function getPartyMembers() { try { return JSON.parse(localStorage.getItem("wedboard:party") || "[]"); } catch { return []; } }
function savePartyMembers(m) { localStorage.setItem("wedboard:party", JSON.stringify(m)); }

function renderParty() {
  const members = getPartyMembers();
  const body = document.getElementById("c-party-body");
  if (!members.length) {
    body.innerHTML = '<div class="party-empty"><div style="font-size:2.2rem;margin-bottom:14px">&#128140;</div><p style="font-weight:600;color:var(--ink2);margin-bottom:6px">No party members yet</p><p>Click <strong>+ Add Member</strong> to assign roles to your wedding party.</p></div>';
    return;
  }
  const groups = {};
  members.forEach(m => { (groups[m.role] = groups[m.role] || []).push(m); });
  body.innerHTML = "";
  Object.entries(groups).forEach(([role, ppl]) => {
    const g = document.createElement("div"); g.className = "party-role-group";
    g.innerHTML = `<div class="party-role-group-title">${esc(role)} <span style="font-weight:400;opacity:.55">(${ppl.length})</span></div><div class="party-cards" id="pg-${esc(role)}"></div>`;
    const grid = g.querySelector(".party-cards");
    ppl.forEach(p => {
      const color = ROLE_COLORS[p.role] || "#C1A775";
      const initials = p.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const card = document.createElement("div"); card.className = "party-card";
      card.innerHTML = `<div class="party-card-avatar" style="background:${color}">${initials}</div><div class="party-card-name">${esc(p.name)}</div><span class="party-card-role-badge" style="background:${color}">${esc(p.role)}</span>${p.email || p.phone ? `<div class="party-card-meta">${[p.email, p.phone].filter(Boolean).map(v => `<div>${esc(v)}</div>`).join("")}</div>` : ""}${p.note ? `<div class="party-card-meta" style="margin-top:5px;font-style:italic">${esc(p.note)}</div>` : ""}<button class="party-card-del" title="Remove">&times;</button>`;
      card.querySelector(".party-card-del").onclick = e => { e.stopPropagation(); savePartyMembers(getPartyMembers().filter(x => x.id !== p.id)); renderParty(); };
      grid.appendChild(card);
    });
    body.appendChild(g);
  });
}
document.getElementById("c-party-add-btn").onclick = () => {
  ["party-name","party-email","party-phone","party-note"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("party-role").value = "";
  document.getElementById("party-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("party-name").focus(), 60);
};
document.getElementById("party-modal-close").onclick = () => document.getElementById("party-modal").classList.add("hidden");
document.getElementById("party-modal").addEventListener("click", e => { if (e.target === document.getElementById("party-modal")) e.target.classList.add("hidden"); });
document.getElementById("party-modal-save").onclick = () => {
  const name = document.getElementById("party-name").value.trim(), role = document.getElementById("party-role").value;
  if (!name) { document.getElementById("party-name").focus(); return; }
  if (!role) { document.getElementById("party-role").focus(); return; }
  const all = getPartyMembers();
  all.push({ id: crypto.randomUUID(), name, role, email: document.getElementById("party-email").value.trim(), phone: document.getElementById("party-phone").value.trim(), note: document.getElementById("party-note").value.trim() });
  savePartyMembers(all); document.getElementById("party-modal").classList.add("hidden"); renderParty();
};

// ═══ BUDGET TRACKER ════════════════════════════════════════════════════════════
const CAT_META = {
  venue:       { name:"Venue",       icon:"landmark",      color:"#C1A775" },
  catering:    { name:"Catering",    icon:"utensils",      color:"#D4909E" },
  photography: { name:"Photography", icon:"camera",        color:"#7AA890" },
  florals:     { name:"Florals",     icon:"flower-2",      color:"#B5A0C8" },
  music:       { name:"Music / DJ",  icon:"music",         color:"#6B9FD4" },
  attire:      { name:"Attire",      icon:"shirt",         color:"#D4A07A" },
  invitations: { name:"Invitations", icon:"mail",          color:"#90B890" },
  decor:       { name:"Décor",       icon:"sparkles",      color:"#C8A0B0" },
  other:       { name:"Other",       icon:"clipboard-list",color:"#9B917E" },
};

function lucideIcon(name, size, color) {
  const sz = size || 16;
  const col = color || "currentColor";
  return `<i data-lucide="${name}" style="width:${sz}px;height:${sz}px;stroke:${col};display:inline-block;vertical-align:middle"></i>`;
}
function getBudgetData() { try { return JSON.parse(localStorage.getItem("wedboard:budget") || "null"); } catch { return null; } }
function saveBudgetData(d) { localStorage.setItem("wedboard:budget", JSON.stringify(d)); }
function budgetData()    { const d = getBudgetData(); return d || { total: 0, expenses: [] }; }

// ── Budget duplicate detection ─────────────────────────────────────────────────
function markBudgetDuplicates(expenses) {
  const seen = {};
  expenses.forEach(e => {
    const key = `${e.description.toLowerCase().trim()}|${e.category}`;
    seen[key] = (seen[key] || 0) + 1;
  });
  expenses.forEach(e => {
    const key = `${e.description.toLowerCase().trim()}|${e.category}`;
    e._duplicate = seen[key] > 1;
  });
  return expenses;
}

function removeBudgetDuplicates() {
  const bd = budgetData();
  const seen = new Set(); let removed = 0;
  bd.expenses = bd.expenses.filter(e => {
    const key = `${e.description.toLowerCase().trim()}|${e.category}`;
    if (seen.has(key)) { removed++; return false; }
    seen.add(key); return true;
  });
  saveBudgetData(bd);
  return removed;
}

function renderBudget() {
  const d = budgetData(), exp = markBudgetDuplicates(d.expenses || []);
  const spent = exp.reduce((s, e) => s + (e.actual || 0), 0);
  const est   = exp.reduce((s, e) => s + (e.estimated || 0), 0);
  const pct   = d.total > 0 ? Math.min((spent / d.total) * 100, 100) : 0;
  const over  = d.total > 0 && spent > d.total;
  document.getElementById("c-budget-stat").textContent = d.total > 0
    ? `$${spent.toLocaleString()} of $${d.total.toLocaleString()} spent · Est. $${est.toLocaleString()}`
    : "Set your total budget to begin";

  const dupCount = exp.filter(e => e._duplicate).length;
  const overviewEl = document.getElementById("c-budget-overview");
  overviewEl.innerHTML = (d.total > 0 ? `
    <div class="budget-overview-card">
      <div class="budget-ov-row"><span class="budget-ov-label">Total Budget</span><span class="budget-ov-amount">$${d.total.toLocaleString()}</span></div>
      <div class="budget-bar-wrap"><div class="budget-bar-fill${over ? " over" : ""}" style="width:${pct}%"></div></div>
      <div class="budget-bar-meta"><span>Spent: $${spent.toLocaleString()}</span><span>${over ? "⚠ Over budget by $" + (spent - d.total).toLocaleString() : "Remaining: $" + (d.total - spent).toLocaleString()}</span></div>
    </div>` : "") +
    (dupCount > 0 ? `<div class="budget-inconsistency-banner" id="budget-dup-banner">${lucideIcon('alert-triangle',16,'#c97a1a')} <span><strong>${dupCount} duplicate expense${dupCount > 1 ? "s" : ""} detected.</strong> These may be inflating your totals.</span><button class="btn btn-ghost btn-sm" id="budget-dedup-btn">Remove duplicates</button></div>` : "");

  if (dupCount > 0) {
    const dedupBtn = document.getElementById("budget-dedup-btn");
    if (dedupBtn) dedupBtn.onclick = () => { removeBudgetDuplicates(); renderBudget(); };
    if (typeof lucide !== "undefined") lucide.createIcons({ el: document.getElementById("budget-dup-banner") });
  }

  const grid = document.getElementById("c-budget-cats"); grid.innerHTML = "";
  const usedCats = [...new Set(exp.map(e => e.category))];
  if (!usedCats.length) {
    grid.innerHTML = '<div class="party-empty" style="grid-column:1/-1"><div style="font-size:2rem;margin-bottom:12px">&#128176;</div><p style="font-weight:600;color:var(--ink2);margin-bottom:6px">No expenses yet</p><p>Click <strong>+ Add Expense</strong> to start tracking your budget.</p></div>';
    return;
  }
  usedCats.forEach(catId => {
    const meta = CAT_META[catId] || CAT_META.other;
    const catExp = exp.filter(e => e.category === catId);
    const cAct = catExp.reduce((s,e)=>s+(e.actual||0),0), cEst = catExp.reduce((s,e)=>s+(e.estimated||0),0);
    const cPct = cEst > 0 ? Math.min((cAct/cEst)*100,100) : 0;
    const card = document.createElement("div"); card.className = "budget-cat-card";
    card.innerHTML = `<div class="budget-cat-head"><div class="budget-cat-icon" style="background:${meta.color}22">${lucideIcon(meta.icon, 18, meta.color)}</div><span class="budget-cat-name">${meta.name}</span></div><div class="budget-cat-amounts"><span>Est. $${cEst.toLocaleString()}</span><span style="color:${cAct>cEst?"var(--danger)":"inherit"}">Actual $${cAct.toLocaleString()}</span></div><div class="budget-cat-bar-wrap"><div class="budget-cat-bar-fill" style="width:${cPct}%;background:${meta.color}"></div></div><div class="budget-cat-expenses">${catExp.map(e=>`<div class="expense-row" data-id="${e.id}">${e._duplicate?`<span class="expense-dup-flag" title="Duplicate">${lucideIcon('alert-triangle',12,'#c97a1a')}</span>`:""}<span class="expense-desc" title="${esc(e.description)}">${esc(e.description)}</span><span class="expense-amount">$${(e.actual||e.estimated||0).toLocaleString()}</span>${e.paid?'<span class="expense-paid-badge">Paid</span>':e.dueDate?`<span class="expense-due-badge">Due ${e.dueDate}</span>`:""}<button class="expense-del" data-id="${e.id}" title="Remove">&times;</button></div>`).join("")}</div>`;
    card.querySelectorAll(".expense-del").forEach(btn => {
      btn.onclick = ev => { ev.stopPropagation(); const bd = budgetData(); bd.expenses = bd.expenses.filter(x => x.id !== btn.dataset.id); saveBudgetData(bd); renderBudget(); };
    });
    grid.appendChild(card);
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
}
document.getElementById("c-budget-set-btn").onclick = () => {
  document.getElementById("budget-total-input").value = budgetData().total || "";
  document.getElementById("budget-set-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("budget-total-input").focus(), 60);
};
document.getElementById("budget-set-close").onclick = () => document.getElementById("budget-set-modal").classList.add("hidden");
document.getElementById("budget-set-modal").addEventListener("click", e => { if (e.target === document.getElementById("budget-set-modal")) e.target.classList.add("hidden"); });
document.getElementById("budget-set-save").onclick = () => {
  const val = parseFloat(document.getElementById("budget-total-input").value);
  if (isNaN(val) || val < 0) { document.getElementById("budget-total-input").focus(); return; }
  const bd = budgetData(); bd.total = val; saveBudgetData(bd);
  document.getElementById("budget-set-modal").classList.add("hidden"); renderBudget();
};
document.getElementById("c-budget-add-btn").onclick = () => {
  ["exp-desc","exp-est","exp-act","exp-date"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("exp-cat").value = "venue"; document.getElementById("exp-paid").checked = false;
  document.getElementById("budget-add-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("exp-desc").focus(), 60);
};
document.getElementById("budget-add-close").onclick = () => document.getElementById("budget-add-modal").classList.add("hidden");
document.getElementById("budget-add-modal").addEventListener("click", e => { if (e.target === document.getElementById("budget-add-modal")) e.target.classList.add("hidden"); });
document.getElementById("budget-add-save").onclick = () => {
  const desc = document.getElementById("exp-desc").value.trim(); if (!desc) { document.getElementById("exp-desc").focus(); return; }
  const bd = budgetData();
  bd.expenses.push({ id: crypto.randomUUID(), description: desc, category: document.getElementById("exp-cat").value, estimated: parseFloat(document.getElementById("exp-est").value)||0, actual: parseFloat(document.getElementById("exp-act").value)||0, dueDate: document.getElementById("exp-date").value, paid: document.getElementById("exp-paid").checked });
  saveBudgetData(bd); document.getElementById("budget-add-modal").classList.add("hidden"); renderBudget();
};

// ═══ CHECKLIST ═════════════════════════════════════════════════════════════════
const TL_ORDER = ["12+ Months","9–12 Months","6–9 Months","3–6 Months","1–3 Months","1 Week Out"];
const DEFAULT_TASKS = [
  {id:"ct1",  title:"Set your wedding date",                  timeline:"12+ Months"},
  {id:"ct2",  title:"Create a preliminary guest list",        timeline:"12+ Months"},
  {id:"ct3",  title:"Book ceremony & reception venue",        timeline:"12+ Months"},
  {id:"ct4",  title:"Set your total wedding budget",          timeline:"12+ Months"},
  {id:"ct5",  title:"Hire wedding photographer",              timeline:"9–12 Months"},
  {id:"ct6",  title:"Book caterer or confirm venue catering", timeline:"9–12 Months"},
  {id:"ct7",  title:"Hire DJ or book a band",                 timeline:"9–12 Months"},
  {id:"ct8",  title:"Book florist",                           timeline:"6–9 Months"},
  {id:"ct9",  title:"Send save-the-dates",                    timeline:"6–9 Months"},
  {id:"ct10", title:"Purchase wedding attire",                timeline:"6–9 Months"},
  {id:"ct11", title:"Book hair & makeup artists",             timeline:"6–9 Months"},
  {id:"ct12", title:"Apply for marriage license",             timeline:"3–6 Months"},
  {id:"ct13", title:"Send formal invitations",                timeline:"3–6 Months"},
  {id:"ct14", title:"Plan rehearsal dinner",                  timeline:"3–6 Months"},
  {id:"ct15", title:"Choose wedding cake / bakery",           timeline:"3–6 Months"},
  {id:"ct16", title:"Final dress / suit fitting",             timeline:"1–3 Months"},
  {id:"ct17", title:"Create seating chart",                   timeline:"1–3 Months"},
  {id:"ct18", title:"Write personal vows",                    timeline:"1–3 Months"},
  {id:"ct19", title:"Confirm all vendor details",             timeline:"1 Week Out"},
  {id:"ct20", title:"Prepare vendor tips & payments",         timeline:"1 Week Out"},
  {id:"ct21", title:"Pack for honeymoon",                     timeline:"1 Week Out"},
].map(t => ({ ...t, done: false, dueDate: "", notes: "" }));

function getChecklistTasks() { try { return JSON.parse(localStorage.getItem("wedboard:checklist") || "null"); } catch { return null; } }
function saveChecklistTasks(t) { localStorage.setItem("wedboard:checklist", JSON.stringify(t)); }
function checklistTasks() { const t = getChecklistTasks(); if (!t) { saveChecklistTasks(DEFAULT_TASKS); return DEFAULT_TASKS; } return t; }

function renderChecklist() {
  const tasks = checklistTasks();
  const done = tasks.filter(t => t.done).length;
  document.getElementById("c-checklist-stat").textContent = `${done} of ${tasks.length} tasks completed`;
  const body = document.getElementById("c-checklist-body"); body.innerHTML = "";
  const today = new Date().toISOString().slice(0, 10);
  TL_ORDER.forEach(tl => {
    const group = tasks.filter(t => t.timeline === tl); if (!group.length) return;
    const dCnt = group.filter(t => t.done).length;
    const sec = document.createElement("div"); sec.className = "checklist-group";
    sec.innerHTML = `<div class="checklist-group-header"><span class="checklist-group-title">${lucideIcon('calendar-clock',14,'var(--accent)')} ${esc(tl)}</span><span class="checklist-group-progress">${dCnt}/${group.length}</span></div><div class="checklist-items"></div>`;
    const itemsEl = sec.querySelector(".checklist-items");
    group.forEach(task => {
      const overdue = task.dueDate && task.dueDate < today && !task.done;
      const item = document.createElement("div"); item.className = "checklist-item" + (task.done ? " done" : "");
      item.innerHTML = `<div class="checklist-item-check${task.done?" checked":""}"><span class="check-icon">${task.done ? lucideIcon('check',12,'#fff') : ''}</span></div><div class="checklist-item-body"><div class="checklist-item-title">${esc(task.title)}</div>${task.dueDate||task.notes?`<div class="checklist-item-meta${overdue?" checklist-item-overdue":""}">${task.dueDate?(overdue?`${lucideIcon('alert-triangle',11,'#c97a1a')} Overdue: `:`${lucideIcon('calendar',11,'var(--muted)')} `)+task.dueDate:""}${task.notes?" · "+esc(task.notes):""}</div>`:""}</div><button class="checklist-item-del" title="Remove">${lucideIcon('x',14,'var(--muted)')}</button>`;
      item.querySelector(".checklist-item-check").onclick = () => { const all = checklistTasks(); const t = all.find(x => x.id === task.id); if (t) t.done = !t.done; saveChecklistTasks(all); renderChecklist(); };
      item.querySelector(".checklist-item-del").onclick = () => { saveChecklistTasks(checklistTasks().filter(x => x.id !== task.id)); renderChecklist(); };
      itemsEl.appendChild(item);
    });
    body.appendChild(sec);
  });
  if (typeof lucide !== "undefined") lucide.createIcons();
}
document.getElementById("c-checklist-add-btn").onclick = () => {
  ["task-title","task-due","task-notes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("task-timeline").value = "3–6 Months";
  document.getElementById("checklist-add-modal").classList.remove("hidden");
  setTimeout(() => document.getElementById("task-title").focus(), 60);
};
document.getElementById("checklist-add-close").onclick = () => document.getElementById("checklist-add-modal").classList.add("hidden");
document.getElementById("checklist-add-modal").addEventListener("click", e => { if (e.target === document.getElementById("checklist-add-modal")) e.target.classList.add("hidden"); });
document.getElementById("checklist-add-save").onclick = () => {
  const title = document.getElementById("task-title").value.trim(); if (!title) { document.getElementById("task-title").focus(); return; }
  const all = checklistTasks();
  all.push({ id: crypto.randomUUID(), title, done: false, timeline: document.getElementById("task-timeline").value, dueDate: document.getElementById("task-due").value, notes: document.getElementById("task-notes").value.trim() });
  saveChecklistTasks(all); document.getElementById("checklist-add-modal").classList.add("hidden"); renderChecklist();
};

// ═══ CARD GENERATOR ═══════════════════════════════════════════════════════════
function initCard() {
  const p = state.currentUser?.profile || {};
  const coupleEl = document.getElementById("c-card-couple");
  const dateEl = document.getElementById("c-card-date");
  const venueEl = document.getElementById("c-card-venue");
  if (!coupleEl.value && p.partner1 && p.partner2) coupleEl.value = `${p.partner1} & ${p.partner2}`;
  // Seed menu rows on first open
  if (!document.querySelector("#c-menu-rows .menu-row")) {
    addMenuRow("Starter", "Garden Salad");
    addMenuRow("Main", "Roasted Chicken");
    addMenuRow("Dessert", "Wedding Cake");
  }
  if (!dateEl.value && p.weddingDate) {
    try { const d = new Date(p.weddingDate + "T12:00:00"); dateEl.value = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); } catch {}
  }
  if (!venueEl.value && p.venue) venueEl.value = p.venue;
  renderCard();
}

let cardTheme = "classic";
let cardZoom  = 1;

function addMenuRow(course, dish) {
  const container = document.getElementById("c-menu-rows");
  const row = document.createElement("div");
  row.className = "menu-row";
  const ci = document.createElement("input"); ci.type = "text"; ci.className = "menu-course"; ci.placeholder = "Course"; ci.value = course; ci.addEventListener("input", renderCard);
  const di = document.createElement("input"); di.type = "text"; di.className = "menu-dish";   di.placeholder = "Dish";   di.value = dish;   di.addEventListener("input", renderCard);
  const rb = document.createElement("button"); rb.type = "button"; rb.className = "menu-row-remove"; rb.title = "Remove"; rb.textContent = "×"; rb.onclick = () => { row.remove(); renderCard(); };
  row.appendChild(ci); row.appendChild(di); row.appendChild(rb);
  container.appendChild(row);
}

function getMenuText() {
  const lines = [];
  document.querySelectorAll("#c-menu-rows .menu-row").forEach(row => {
    const c = row.querySelector(".menu-course").value.trim();
    const d = row.querySelector(".menu-dish").value.trim();
    if (c || d) lines.push(c && d ? `${c}: ${d}` : (c || d));
  });
  return lines.length ? lines.join("\n") : "Starter: Garden Salad\nMain: Roasted Chicken\nDessert: Wedding Cake";
}

function renderCard() {
  const type   = document.getElementById("c-card-type").value;
  const couple = document.getElementById("c-card-couple").value || "Couple Names";
  const date   = document.getElementById("c-card-date").value   || "Wedding Date";
  const venue  = document.getElementById("c-card-venue").value  || "Venue";
  const guest  = document.getElementById("c-card-guest").value  || "Guest Name";
  const msg    = document.getElementById("c-card-msg").value    || "Thank you for celebrating this special day with us. Your presence made our wedding truly memorable.";
  const menu   = getMenuText();

  document.getElementById("c-card-guest-label").style.display = type === "place" ? "" : "none";
  document.getElementById("c-card-msg-label").style.display   = (type === "thankyou" || type === "invitation") ? "" : "none";
  document.getElementById("c-card-menu-label").style.display  = type === "menu" ? "" : "none";

  const th = ` data-theme="${cardTheme}"`;
  const preview = document.getElementById("c-card-preview-area");
  if (type === "place") {
    preview.innerHTML = `<div class="wedding-card place-card"${th}><div class="card-flourish">✦</div><p class="card-couple-name">${esc(couple)}</p><div class="card-divider"></div><p class="card-label">Please be seated</p><h2 class="card-guest-name">${esc(guest)}</h2></div>`;
  } else if (type === "thankyou") {
    preview.innerHTML = `<div class="wedding-card thankyou-card"${th}><div class="card-flourish">✸</div><h2 class="card-title">Thank You</h2><p class="card-couple-name">${esc(couple)}</p><div class="card-divider"></div><p class="card-body-text">${esc(msg)}</p><p class="card-date">${esc(date)}</p></div>`;
  } else if (type === "menu") {
    preview.innerHTML = `<div class="wedding-card menu-card"${th}><div class="card-flourish">✦</div><h2 class="card-title">Menu</h2><p class="card-couple-name">${esc(couple)}</p><div class="card-divider"></div><div class="card-menu-items">${menu.split("\n").map(l => `<p>${esc(l)}</p>`).join("")}</div></div>`;
  } else {
    preview.innerHTML = `<div class="wedding-card invitation-card"${th}><div class="card-flourish">✦ ✦ ✦</div><p class="card-eyebrow">Together with their families</p><h1 class="card-couple-big">${esc(couple)}</h1><p class="card-label">request the honour of your presence</p><div class="card-divider"></div><p class="card-date">${esc(date)}</p><p class="card-venue">${esc(venue)}</p>${msg !== "Thank you for celebrating this special day with us. Your presence made our wedding truly memorable." ? `<p class="card-body-text" style="margin-top:12px">${esc(msg)}</p>` : ""}</div>`;
  }
  applyCardZoom();
}

function applyCardZoom() {
  const card = document.querySelector("#c-card-preview-area .wedding-card");
  if (card) card.style.transform = `scale(${cardZoom})`;
  document.getElementById("c-zoom-label").textContent = Math.round(cardZoom * 100) + "%";
}

["c-card-type","c-card-couple","c-card-date","c-card-venue","c-card-guest","c-card-msg"].forEach(id => {
  const el = document.getElementById(id); el.addEventListener("input", renderCard); el.addEventListener("change", renderCard);
});
document.getElementById("c-menu-add").onclick = () => { addMenuRow("", ""); };

document.getElementById("c-card-theme").addEventListener("click", e => {
  const btn = e.target.closest(".theme-swatch"); if (!btn) return;
  cardTheme = btn.dataset.theme;
  document.querySelectorAll(".theme-swatch").forEach(s => s.classList.toggle("active", s === btn));
  renderCard();
});

document.getElementById("c-zoom-in").onclick  = () => { if (cardZoom < 1.5) { cardZoom = Math.round((cardZoom + 0.1) * 10) / 10; applyCardZoom(); } };
document.getElementById("c-zoom-out").onclick = () => { if (cardZoom > 0.5) { cardZoom = Math.round((cardZoom - 0.1) * 10) / 10; applyCardZoom(); } };

// ═══ ACTIONABLE AI COMMANDS ════════════════════════════════════════════════════
// Returns a formatted confirmation string if a command was executed, else null.
function tryExecuteActionCommand(q) {
  const lq = q.toLowerCase().trim();

  // ── Budget: "add $500 to florals" / "add 500 to the catering budget" ─────────
  const budgetAdd = q.match(/add\s+\$?(\d+(?:\.\d+)?)\s+(?:to|for)\s+(?:the\s+)?(\w+(?:\s+\w+)??)(?:\s+budget)?$/i);
  if (budgetAdd) {
    const amount = parseFloat(budgetAdd[1]);
    const rawCat = budgetAdd[2].toLowerCase().trim();
    const catMap = {
      venue:        "venue",
      catering:     "catering",    food:       "catering",   dining:      "catering",
      photography:  "photography", photo:      "photography",photographer:"photography",
      florals:      "florals",     floral:     "florals",    flowers:     "florals",
      music:        "music",       dj:         "music",      band:        "music",
      attire:       "attire",      dress:      "attire",     suit:        "attire",
      invitations:  "invitations", invitation: "invitations",stationery:  "invitations",
      decor:        "decor",       decoration: "decor",
      other:        "other",
    };
    const catId = catMap[rawCat] || "other";
    const meta = CAT_META[catId];
    const bd = budgetData();
    bd.expenses.push({
      id: crypto.randomUUID(),
      description: `AI: ${rawCat} expense`,
      category: catId,
      estimated: amount,
      actual: amount,
      dueDate: "",
      paid: false
    });
    saveBudgetData(bd);
    renderBudget();
    return `✅ **Done!** Added **$${amount.toLocaleString()}** to the **${meta.name}** budget.\n\nSwitch to the **Budget** tab to review your expenses.`;
  }

  // ── Budget: "remove duplicate expenses" / "clean up budget" ──────────────────
  if (lq.match(/(?:remove|delete|clean\s*up|deduplicate|fix)\s+duplicate/)) {
    const removed = removeBudgetDuplicates();
    renderBudget();
    return removed > 0
      ? `✅ Removed **${removed}** duplicate expense${removed > 1 ? "s" : ""} from your budget.`
      : `No exact duplicates found in your budget — it looks clean! ✦`;
  }

  // ── Checklist: "check off venue" / "mark 'send save-the-dates' as done" ─────
  const checkOff = q.match(/(?:check\s+off|complete|mark(?:\s+off)?|tick\s+off)\s+(?:the\s+)?['"]?(.+?)['"]?(?:\s+(?:from|in|on|off)\s+(?:the\s+)?checklist)?(?:\s+as\s+done)?$/i);
  if (checkOff) {
    const needle = checkOff[1].trim().toLowerCase();
    const tasks = checklistTasks();
    const matches = tasks.filter(t => t.title.toLowerCase().includes(needle));
    if (matches.length === 1) {
      matches[0].done = true;
      saveChecklistTasks(tasks);
      // If checklist tab is active, re-render
      if (!document.getElementById("c-tab-checklist").classList.contains("hidden")) renderChecklist();
      return `✅ **"${matches[0].title}"** marked as complete!\n\nSwitch to the **Checklist** tab to see your progress.`;
    } else if (matches.length > 1) {
      return `Found ${matches.length} matching tasks:\n${matches.map(t => `- ${t.title}`).join("\n")}\n\nPlease be more specific to check off just one.`;
    } else {
      return `I couldn't find a checklist task matching *"${needle}"*. Check the **Checklist** tab for exact task names.`;
    }
  }

  // ── Checklist: "uncheck / reopen venue" ──────────────────────────────────────
  const uncheck = q.match(/(?:uncheck|reopen|undo|unmark)\s+(?:the\s+)?['"]?(.+?)['"]?(?:\s+(?:from|in|on)\s+(?:the\s+)?checklist)?$/i);
  if (uncheck) {
    const needle = uncheck[1].trim().toLowerCase();
    const tasks = checklistTasks();
    const match = tasks.find(t => t.title.toLowerCase().includes(needle));
    if (match) {
      match.done = false;
      saveChecklistTasks(tasks);
      if (!document.getElementById("c-tab-checklist").classList.contains("hidden")) renderChecklist();
      return `↩️ **"${match.title}"** reopened — marked as not done.`;
    }
  }

  return null; // not a recognized command — hand off to AI
}

// ═══ AI ASSISTANT TAB ═════════════════════════════════════════════════════════
const aiTabState = { messages: [], streaming: false, initialized: false };

function initAiTab() {
  if (!aiTabState.initialized) {
    aiTabState.initialized = true;
    addAiTabMsg("ai", "Hello! I'm your AI Wedding Planner. ✦\n\nAsk me anything — vendor tips, budgeting, timelines, seating — or give me a command like:\n- *\"Add $800 to the catering budget\"*\n- *\"Check off 'Send save-the-dates' from the checklist\"*\n- *\"Show me my budget summary\"*");
  }
}

function switchToAiTab(question) {
  // Activate the AI tab
  document.querySelectorAll(".c-tab-btn").forEach(b => b.classList.remove("active"));
  const aiBtn = document.querySelector('.c-tab-btn[data-tab="ai-chat"]');
  if (aiBtn) aiBtn.classList.add("active");
  document.querySelectorAll(".c-tab-panel").forEach(p => p.classList.add("hidden"));
  document.getElementById("c-tab-ai-chat").classList.remove("hidden");
  initAiTab();
  if (question) {
    document.getElementById("c-ai-tab-input").value = question;
    sendAiTab();
  } else {
    setTimeout(() => document.getElementById("c-ai-tab-input").focus(), 80);
  }
}

document.getElementById("c-ai-tab-send").onclick = sendAiTab;
document.getElementById("c-ai-tab-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiTab(); }
});
document.getElementById("c-ai-tab-clear").onclick = () => {
  aiTabState.messages = []; aiTabState.initialized = false;
  document.getElementById("c-ai-tab-feed").innerHTML = "";
  document.getElementById("c-ai-tab-suggestions").style.display = "";
  initAiTab();
};
document.querySelectorAll(".ai-suggestion-chip").forEach(chip => {
  chip.onclick = () => {
    document.getElementById("c-ai-tab-input").value = chip.dataset.q;
    sendAiTab();
  };
});

function sendAiTab() {
  if (aiTabState.streaming) return;
  const input = document.getElementById("c-ai-tab-input");
  const q = input.value.trim(); if (!q) return;
  input.value = "";

  // Hide suggestion chips after first message
  document.getElementById("c-ai-tab-suggestions").style.display = "none";

  // Try to parse and execute action commands first
  const actionResult = tryExecuteActionCommand(q);
  if (actionResult) {
    addAiTabMsg("human", q);
    addAiTabMsg("ai", actionResult);
    return;
  }

  const tabHistory = aiTabState.messages.map(m => ({
    type: m.role === "ai" ? "ai" : "user",
    author: m.role === "ai" ? "AI Assistant" : "You",
    text: m.text
  }));
  const messages = buildAIMessages(q, tabHistory);

  addAiTabMsg("human", q);
  aiTabState.streaming = true;
  document.getElementById("c-ai-tab-retrieval").textContent = "Thinking…";

  const feed = document.getElementById("c-ai-tab-feed");
  let msgEl = null, full = "";

  dispatchAI(messages, q, {
    showTypingFn: showAiTabTyping,
    removeTypingFn: removeAiTabTyping,
    onThinking(text) {
      const ind = document.getElementById("ai-tab-typing");
      if (ind) { let lbl = ind.querySelector(".ap-think-lbl"); if (!lbl) { lbl = document.createElement("div"); lbl.className = "ap-think-lbl ai-panel-msg-text"; ind.appendChild(lbl); } lbl.textContent = text; }
    },
    onChunk(chunk) {
      removeAiTabTyping();
      if (!msgEl) { msgEl = createAiTabMsgEl("ai"); feed.appendChild(msgEl); }
      full += chunk;
      msgEl.querySelector(".ai-tab-msg-text").innerHTML = renderMd(full);
      feed.scrollTop = feed.scrollHeight;
    },
    onDone(sources) {
      if (full && sources && sources.length) {
        full += `\n\n*Sources: ${sources.join(", ")}*`;
        if (msgEl) msgEl.querySelector(".ai-tab-msg-text").innerHTML = renderMd(full);
      }
      if (full) aiTabState.messages.push({ role: "ai", text: full });
      aiTabState.streaming = false;
      document.getElementById("c-ai-tab-retrieval").textContent = sources && sources.length ? "Grounded" : "AI";
    },
    onError(err) {
      removeAiTabTyping();
      aiTabState.streaming = false;
      document.getElementById("c-ai-tab-retrieval").textContent = "Local";
      if (err === "no_key") {
        addAiTabMsg("ai", aiLocalResponse(q) + "\n\n---\n*Configure AI in **Settings → Configure AI** for live responses.*");
      } else {
        addAiTabMsg("ai", `**AI error:** ${err}`);
      }
    }
  });
}

function addAiTabMsg(role, text) {
  aiTabState.messages.push({ role, text });
  const el = createAiTabMsgEl(role);
  el.querySelector(".ai-tab-msg-text").innerHTML = role === "ai" ? renderMd(text) : esc(text).replace(/\n/g, "<br>");
  const feed = document.getElementById("c-ai-tab-feed");
  feed.appendChild(el); feed.scrollTop = feed.scrollHeight;
}
function createAiTabMsgEl(role) {
  const el = document.createElement("div");
  el.className = `ai-tab-msg ai-tab-msg--${role}`;
  el.innerHTML = `<div class="ai-tab-msg-text"></div>`;
  return el;
}
function showAiTabTyping() {
  removeAiTabTyping();
  const el = createAiTabMsgEl("ai"); el.id = "ai-tab-typing";
  el.innerHTML = `<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>`;
  const feed = document.getElementById("c-ai-tab-feed");
  feed.appendChild(el); feed.scrollTop = feed.scrollHeight;
}
function removeAiTabTyping() { const el = document.getElementById("ai-tab-typing"); if (el) el.remove(); }

function aiLocalResponse(q) {
  const lq = q.toLowerCase();
  if (state.chunks.length) {
    const hits = searchKB(q);
    if (hits.length && hits[0].score > 0.12) return buildAnswer(q, hits[0], hits[1]);
  }
  if (lq.match(/budget|cost|price|expensive|afford/))
    return "**Wedding Budget Guide**\n\n- **Venue** ~30% · **Catering** ~25% · **Photography** ~12%\n- **Florals** ~8% · **Music/DJ** ~5% · **Attire** ~8% · **Other** ~12%\n\n**Tips:** Book 12–18 months early for better pricing. A Friday or Sunday wedding saves 20–30% on venue costs. Always keep a 5–10% contingency buffer.";
  if (lq.match(/timeline|schedule|when|months|checklist|plan/))
    return "**Planning Timeline**\n\n- **12+ months:** Venue, date, rough guest list\n- **9–12 months:** Photographer, caterer, officiant\n- **6–9 months:** Florals, DJ/band, attire\n- **3–6 months:** Invitations, cake, honeymoon\n- **1–3 months:** Seating chart, final fittings, vendor confirmations\n- **1 week out:** Final headcount, tips, day-of timeline";
  if (lq.match(/venue|location|hall|estate|garden/))
    return "**Choosing a Venue**\n\n- Visit 3–5 venues before deciding\n- Ask about: capacity, catering policy, parking, rain backup plan\n- Check what's included — tables, chairs, linens add up\n- Read reviews and visit during an actual event if possible\n- Book 12+ months in advance for peak summer/fall weekends";
  if (lq.match(/photo|photograph|picture|camera|shoot/))
    return "**Photography Tips**\n\n- Meet before booking — personality fit matters as much as portfolio\n- Request a *full* gallery from a previous wedding, not just highlights\n- Book 10–14 months in advance for popular dates\n- Budget for 8–10 hours of coverage for a full-day wedding\n- Create a shot list, but give your photographer creative freedom";
  if (lq.match(/flower|floral|bouquet|centerpiece|bloom/))
    return "**Floral Planning**\n\n- Book 9–12 months out for peak season\n- In-season flowers cost 30–40% less than out-of-season\n- Bring 5–10 inspiration images to your first florist meeting\n- Items to budget: bridal bouquet, bridesmaids, boutonnieres, centerpieces, ceremony arch\n- Greenery-heavy arrangements are modern and cost-effective";
  if (lq.match(/seat|table|chart|arrangement|guest list/))
    return "**Seating Chart Tips**\n\n- Use the **Seating** tab to build your chart — click any table to add guests directly\n- Seat elderly guests near the entrance, away from speakers\n- Mix friends and family at tables to encourage mingling\n- Keep plus-ones together with their partners\n- Finalize 2–3 weeks before the wedding after all RSVPs are in\n- Round tables of 8–10 encourage conversation better than banquet rows";
  if (lq.match(/food|cater|menu|dinner|meal|catering/))
    return "**Catering Advice**\n\n- Offer 2–3 entrée options; always include a vegetarian choice\n- Cocktail hour bites keep guests happy during couple photos\n- Per-person cost typically ranges $85–$160+ depending on service style\n- Buffet is usually more affordable than plated service\n- Confirm final headcount 2 weeks before for accurate ordering";
  if (lq.match(/dj|music|band|song|dance|entertainment/))
    return "**Music & Entertainment**\n\n- DJ is typically more affordable and versatile than a live band\n- Create a 'must-play' and a 'do-not-play' list\n- Ceremony, cocktail hour, dinner, and dancing need different feels\n- Discuss volume levels — cocktail hour should allow conversation\n- Book 8–10 months ahead for popular dates";
  if (lq.match(/invit|card|stationery|rsvp|save the date/))
    return "**Invitations & Cards**\n\n- Use the **Cards** tab to design and print place cards, thank-you cards, and invitations\n- Save-the-dates: 6–12 months in advance\n- Invitations: 6–8 weeks out (12 weeks for destination weddings)\n- Set RSVP deadline 3–4 weeks before the event\n- Digital RSVPs via a wedding website are eco-friendly and easy to track";
  if (lq.match(/vendor|hire|book|find|discover/))
    return "**Finding Vendors**\n\n- Use the **Discover** tab to browse photographers, florists, caterers, and more\n- Add vendors you like directly to your chat list\n- Always check reviews on Google, WedBoard, and The Knot\n- Interview at least 2–3 vendors per category before deciding\n- Ask for references from recent weddings and follow up";
  if (lq.match(/stress|overwhelm|anxiety|worried|nervous/))
    return "**Managing Wedding Stress**\n\n- Delegate — your partner, family, and coordinator are there to help\n- Prioritize the 3 things that matter most to *you*, let the rest be flexible\n- Build buffer time into your day-of timeline\n- The day goes fast — pause intentionally to take it all in\n- Remember: it's a celebration of love, not a performance. It will be beautiful. ✦";
  return "I'm here to help with every part of your wedding planning! Ask me about **budgeting, timelines, vendors, seating, flowers, catering, photography, music, invitations**, or anything else on your mind. ✦";
}

// ═══ AI KEY MODAL ══════════════════════════════════════════════════════════════
function openAiKeyModal() {
  const modal = document.getElementById("ai-key-modal");
  const input = document.getElementById("ai-key-input");
  const status = document.getElementById("ai-key-status");
  const existing = getApiKey();
  input.value = existing ? existing : "";
  status.textContent = existing ? "Key saved in this browser." : "";
  status.className = "modal-hint" + (existing ? " ok" : "");
  modal.classList.remove("hidden");
  setTimeout(() => input.focus(), 60);
}

document.getElementById("ai-key-modal-close").onclick = () =>
  document.getElementById("ai-key-modal").classList.add("hidden");

document.getElementById("ai-key-modal").addEventListener("click", e => {
  if (e.target === document.getElementById("ai-key-modal"))
    document.getElementById("ai-key-modal").classList.add("hidden");
});

document.getElementById("ai-key-save").onclick = () => {
  const input = document.getElementById("ai-key-input");
  const status = document.getElementById("ai-key-status");
  const val = input.value.trim();
  if (!val) { status.textContent = "Enter a key first."; status.className = "modal-hint warn"; return; }
  if (!val.startsWith("AIza")) { status.textContent = "Gemini keys start with AIza…"; status.className = "modal-hint warn"; return; }
  saveApiKey(val);
  status.textContent = "Key saved successfully.";
  status.className = "modal-hint ok";
  setTimeout(() => document.getElementById("ai-key-modal").classList.add("hidden"), 900);
};

document.getElementById("ai-key-clear").onclick = () => {
  const status = document.getElementById("ai-key-status");
  saveApiKey("");
  document.getElementById("ai-key-input").value = "";
  status.textContent = "Key removed.";
  status.className = "modal-hint warn";
};

document.getElementById("c-card-download").onclick = () => {
  const cardEl = document.getElementById("c-card-preview-area").querySelector(".wedding-card");
  if (!cardEl) return;
  const styles = `body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Georgia,'Times New Roman',serif;background:#faf8f5}.wedding-card{background:#fff;border:1px solid #e8dfd0;border-radius:8px;padding:40px 36px;max-width:340px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.08)}.card-flourish{font-size:1.2rem;color:#b8960c;margin-bottom:14px;letter-spacing:6px}.card-divider{width:60px;height:1px;background:#d4c5a9;margin:14px auto}.card-couple-name{font-size:.85rem;color:#8b7355;letter-spacing:.15em;text-transform:uppercase;margin:0 0 6px}.card-label{font-size:.82rem;color:#9a8a76;margin:0 0 8px;font-style:italic}.card-guest-name{font-size:1.7rem;color:#3a2e24;margin:0;font-weight:400}.card-title{font-size:1.9rem;color:#3a2e24;margin:0 0 8px;font-weight:400;letter-spacing:.05em}.card-body-text{font-size:.85rem;color:#6b5d4e;line-height:1.7;margin:0 0 10px;font-style:italic}.card-date{font-size:.82rem;color:#8b7355;letter-spacing:.1em;margin:0;text-transform:uppercase}.card-venue{font-size:.85rem;color:#6b5d4e;margin:4px 0 0}.card-eyebrow{font-size:.78rem;color:#9a8a76;letter-spacing:.12em;text-transform:uppercase;margin:0 0 10px}.card-couple-big{font-size:2rem;color:#3a2e24;margin:0 0 8px;font-weight:400}.card-menu-items p{font-size:.82rem;color:#6b5d4e;margin:3px 0}`;
  const win = window.open("", "_blank");
  win.document.write(`<!DOCTYPE html><html><head><title>Wedding Card</title><style>${styles}</style></head><body>${cardEl.outerHTML}</body></html>`);
  win.document.close(); win.focus(); win.print();
};

// ── Global Lucide init (renders icons in static HTML on first load) ──────────
document.addEventListener("DOMContentLoaded", () => {
  if (typeof lucide !== "undefined") lucide.createIcons();
});
