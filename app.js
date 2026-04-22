// ═══════════════════════════════════════════════════════════════════════════════
// WedBoard — Modern Messenger SPA
// ═══════════════════════════════════════════════════════════════════════════════

const SAMPLE_DOC = `AI Wedding Planner - Event Planning Brief\n\nEvent overview:\n- Couple: Mia and Ethan.\n- Wedding date: June 21.\n- Venue: Rosewood Garden Estate.\n- Ceremony start time: 4:30 PM.\n- Guest arrival begins at 4:00 PM.\n- Reception start time: 6:00 PM.\n\nVendor schedule:\n- Photographer: Golden Hour Studio, arrival at 1:30 PM.\n- Florist: Petal & Vine, setup completed by 2:00 PM.\n- DJ: Blue Note Events, sound check at 3:00 PM.\n- Catering: Hearth Table, dinner service at 6:30 PM.\n\nPlanning notes:\n- The bride wants a modern minimalist style with ivory florals and soft candle lighting.\n- The couple wants a shared workspace where the planner, photographer, florist, and family can coordinate quickly.\n- The system should support file uploads for contracts, schedules, and inspiration boards.\n- The assistant should answer questions from uploaded planning documents.`;

const STOP_WORDS = new Set(["a","an","and","are","as","at","be","by","for","from","has","have","in","is","it","its","of","on","or","that","the","to","was","were","will","with","what","when","where","who","how","why","we","you","your","our","this","these","those","they","their","i"]);

const BACKEND_URL = "http://localhost:5000";
let backendOnline = false;

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
  const u = state.currentUser;
  document.getElementById("c-dd-avatar").textContent = u.username.charAt(0).toUpperCase();
  const display = (u.profile.partner1 && u.profile.partner2) ? `${u.profile.partner1} & ${u.profile.partner2}` : u.username;
  document.getElementById("c-dd-name").textContent = display;
  document.getElementById("c-wedding-name").textContent = getCoupleWeddingName();
  document.getElementById("c-input").disabled = false;
  document.getElementById("c-input").placeholder = "Type a message...";
  document.getElementById("c-send").disabled = false;
  state.cohort = getCoupleWeddingName();
  state.joined = true;

  // Auto-open first vendor
  const first = document.querySelector(".c-vendor-btn.active");
  if (first) {
    state.activeVendorChat = first.dataset.vendor;
    document.getElementById("c-chat-title").textContent = first.dataset.vendor;
    document.getElementById("c-chat-subtitle").textContent = first.dataset.cat;
    document.getElementById("c-topbar-avatar").textContent = first.dataset.vendor.charAt(0);
  }
  loadCoupleVendorChat();
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

// Couple vendor clicks — SCOPED selector: only .c-vendor-btn
document.querySelectorAll(".c-vendor-btn").forEach(item => {
  item.addEventListener("click", () => {
    if (state.currentUser && state.activeVendorChat) {
      saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
    }
    document.querySelectorAll(".c-vendor-btn").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    state.activeVendorChat = item.dataset.vendor;
    document.getElementById("c-chat-title").textContent = item.dataset.vendor;
    document.getElementById("c-chat-subtitle").textContent = item.dataset.cat;
    document.getElementById("c-topbar-avatar").textContent = item.dataset.vendor.charAt(0);
    loadCoupleVendorChat();
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
document.getElementById("c-kb-close").onclick = () => closeSlide("c-kb-panel", "c-overlay");
document.getElementById("c-manage-vendors").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-manage-panel", "c-overlay"); };
document.getElementById("c-manage-close").onclick = () => closeSlide("c-manage-panel", "c-overlay");
document.getElementById("c-write-review").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-review-panel", "c-overlay"); renderCoupleReviews(); };
document.getElementById("c-review-close").onclick = () => closeSlide("c-review-panel", "c-overlay");
document.getElementById("c-overlay").onclick = () => { document.querySelectorAll("#view-couple .slideover").forEach(s => s.classList.add("hidden")); document.getElementById("c-overlay").classList.add("hidden"); };

// Couple send
document.getElementById("c-send").onclick = () => handleSend("couple");
document.getElementById("c-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend("couple"); } });

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
  { target: ".m-wedding-label", text: "This is your wedding workspace. All planning happens here." },
  { target: "#c-vendor-list", text: "Your vendors are listed here. Click any to open a chat." },
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
  addMessage("human", state.currentUser.username, text); input.value = "";
  if (backendOnline && state.cohortId) { apiPost("/api/message", { cohort_id: state.cohortId, user_id: state.userId, content: text, sender_type: "human" }).catch(() => {}); }
  if (text.toLowerCase().startsWith("@ai")) {
    const after = text.replace(/^@ai\s*/i, "").trim();
    const dm = after.match(/^(?:generate|create|make|write)\s+doc(?:ument)?\s*(.*)/i);
    dm ? generateDocument(dm[1].trim() || after) : respondToAi(after);
  }
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
  localStorage.removeItem("wedboard:session"); showView("landing");
}

// Typing indicator
function showTyping() { removeTyping(); const feed = getFeed(), d = document.createElement("article"); d.className = "msg ai"; d.id = "typing-ind"; d.innerHTML = '<div class="msg-av"></div><div class="msg-body"><div class="msg-meta"><strong class="msg-author">AI Assistant</strong></div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>'; feed.appendChild(d); feed.scrollTop = feed.scrollHeight; }
function removeTyping() { const e = document.getElementById("typing-ind"); if (e) e.remove(); }

function renderMessages() {
  const feed = getFeed(); feed.innerHTML = "";
  const tpl = document.getElementById("msg-tpl");
  for (const m of state.messages) { const n = tpl.content.firstElementChild.cloneNode(true); n.classList.add(m.type); n.querySelector(".msg-author").textContent = m.author; n.querySelector(".msg-time").textContent = fmtTime(m.time); n.querySelector(".msg-text").innerHTML = fmtMsg(m.text, m.type); feed.appendChild(n); }
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
  if (backendOnline && state.cohortId) {
    showTyping(); state.aiStreaming = true;
    fetch(`${BACKEND_URL}/api/ai-query-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohort_id: state.cohortId, question: q, user_id: state.userId }) })
      .then(res => { if (!res.ok) throw new Error(); const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "", full = "", srcs = [], node = null; const feed = getFeed();
        function proc(t) { buf += t; const lines = buf.split("\n"); buf = lines.pop(); for (const l of lines) { if (!l.startsWith("data: ")) continue; try { const e = JSON.parse(l.slice(6)); if (e.type === "sources") srcs = e.sources || []; if (e.type === "chunk") { if (!node) { removeTyping(); const tpl = document.getElementById("msg-tpl"); node = tpl.content.firstElementChild.cloneNode(true); node.classList.add("ai"); node.querySelector(".msg-author").textContent = "AI Assistant"; node.querySelector(".msg-time").textContent = fmtTime(new Date()); feed.appendChild(node); } full += e.content; node.querySelector(".msg-text").innerHTML = renderMd(full); feed.scrollTop = feed.scrollHeight; } if (e.type === "done") { if (srcs.length) { full += `\n\n*Sources: ${srcs.join(", ")}*`; if (node) node.querySelector(".msg-text").innerHTML = renderMd(full); } state.messages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: full, time: new Date() }); persistHistory(); rl.textContent = srcs.length ? "Grounded" : "General"; state.aiStreaming = false; } } catch {} } }
        function pump() { return reader.read().then(({ done, value }) => { if (done) { if (buf.trim()) proc("\n"); state.aiStreaming = false; removeTyping(); return; } proc(dec.decode(value, { stream: true })); return pump(); }); }
        return pump();
      }).catch(() => { removeTyping(); state.aiStreaming = false; rl.textContent = "Error"; addMessage("ai", "AI Assistant", "Backend error."); });
    return;
  }
  showTyping();
  setTimeout(() => { removeTyping(); const res = searchKB(q); rl.textContent = res.length ? "Grounded" : "No matches"; if (!res.length) { addMessage("ai", "AI Assistant", "No content found. Upload a doc first."); return; } addMessage("ai", "AI Assistant", buildAnswer(q, res[0], res[1])); }, 450);
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
async function checkBackend() { try { const r = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2500) }); if (r.ok) backendOnline = true; } catch { backendOnline = false; } }
async function apiPost(path, body) { const r = await fetch(`${BACKEND_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiGet(path) { const r = await fetch(`${BACKEND_URL}${path}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
