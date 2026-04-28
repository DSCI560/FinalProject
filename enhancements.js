(() => {
  if (typeof window === "undefined") return;
  if (typeof state === "undefined") return;

  const ENH = {
    initialized: false,
    wrapped: false,
    mealFilter: "all",
    discoverSection: "marketplace",
    websiteSiteId: null,
    websiteContent: null,
    taskSuggestions: [],
    planItems: [],
    map: null,
    mapOverlay: null,
    cardData: null,
    three: { inited: false, frame: null, renderer: null },
  };

  function safeJsonParse(v, fallback) {
    try { return JSON.parse(v); } catch { return fallback; }
  }

  function currentWeddingFromProfile() {
    const p = state.currentUser?.profile || {};
    if (p.partner1 && p.partner2) return `${p.partner1} & ${p.partner2} Wedding`;
    if (state.currentUser?.username) return `${state.currentUser.username}'s Wedding`;
    return state.cohort || "";
  }

  async function chooseDataModeForWedding() {
    const wid = currentWeddingFromProfile();
    if (!wid) return;
    if (!backendOnline) {
      state.dataMode = "local";
      document.body.dataset.sourceMode = "local";
      return;
    }
    try {
      const [rb, rt, rg] = await Promise.all([
        apiGet(`/api/budgets?wedding_id=${encodeURIComponent(wid)}`).catch(() => []),
        apiGet(`/api/tasks?wedding_id=${encodeURIComponent(wid)}`).catch(() => []),
        apiGet(`/api/guests?wedding_id=${encodeURIComponent(wid)}`).catch(() => []),
      ]);
      const localCounts = {
        budgets: getLocal(`budgets:${wid}`).length,
        tasks: getLocal(`tasks:${wid}`).length,
        guests: getLocal(`guests:${wid}`).length,
      };
      const remoteCounts = {
        budgets: Array.isArray(rb) ? rb.length : 0,
        tasks: Array.isArray(rt) ? rt.length : 0,
        guests: Array.isArray(rg) ? rg.length : 0,
      };
      const localHasAny = Object.values(localCounts).some((v) => v > 0);
      const remoteHasAny = Object.values(remoteCounts).some((v) => v > 0);
      const remoteMissingLocalDomain = Object.keys(localCounts).some(
        (k) => localCounts[k] > 0 && remoteCounts[k] === 0
      );

      if (localHasAny && (!remoteHasAny || remoteMissingLocalDomain)) {
        state.dataMode = "local";
      } else {
        state.dataMode = "backend";
      }
    } catch {
      state.dataMode = "local";
    }
    document.body.dataset.sourceMode = state.dataMode;
  }

  function initTheme() {
    const saved = localStorage.getItem("wedboard:theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    const btn = document.getElementById("c-theme-toggle");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.onclick = () => {
      const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("wedboard:theme", next);
      refreshIcons();
    };
  }

  function initThreeBackground() {
    if (ENH.three.inited) return;
    const host = document.getElementById("scene-bg");
    if (!host || !window.THREE) return;
    ENH.three.inited = true;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 6;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    host.innerHTML = "";
    host.appendChild(renderer.domElement);
    ENH.three.renderer = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xd8c7ff, 1.2);
    dir.position.set(3, 2, 4);
    scene.add(dir);

    const geo = new THREE.TorusKnotGeometry(1.5, 0.35, 160, 24);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x8b6fd8,
      metalness: 0.25,
      roughness: 0.32,
      transparent: true,
      opacity: 0.6,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const renderLoop = () => {
      mesh.rotation.x += 0.002;
      mesh.rotation.y += 0.003;
      renderer.render(scene, camera);
      ENH.three.frame = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function showDiscoverSection(section) {
    ENH.discoverSection = section;
    const sectionBtns = document.querySelectorAll("#c-discover-sections .filter-tab");
    sectionBtns.forEach((b) => b.classList.toggle("active", b.dataset.section === section));
    const ids = {
      marketplace: "discover-marketplace-panel",
      website: "discover-website-panel",
      plans: "discover-plans-panel",
      cards: "discover-cards-panel",
      announcements: "discover-announcements-panel",
    };
    Object.entries(ids).forEach(([k, id]) => {
      const panel = document.getElementById(id);
      if (!panel) return;
      panel.classList.toggle("hidden", k !== section);
      panel.classList.toggle("active", k === section);
    });
    if (section === "website") loadWebsiteDraft();
    if (section === "plans") loadVisualPlanItems();
    if (section === "announcements") loadAnnouncementChannels();
    if (section === "cards") drawCardPreview();
    refreshIcons();
  }
  window.showDiscoverSection = showDiscoverSection;

  function bindDiscoverSections() {
    const wrap = document.getElementById("c-discover-sections");
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    wrap.querySelectorAll(".filter-tab").forEach((b) => {
      b.addEventListener("click", () => showDiscoverSection(b.dataset.section));
    });
  }

  function inferActionTarget(type, explicitTarget) {
    if (explicitTarget) return explicitTarget;
    const t = String(type || "").toLowerCase();
    if (t.includes("budget")) return { tab: "budget" };
    if (t.includes("task")) return { tab: "tasks" };
    if (t.includes("guest") || t.includes("invite")) return { tab: "guests" };
    if (t.includes("website")) return { tab: "website" };
    if (t.includes("card")) return { tab: "cards" };
    if (t.includes("announcement")) return { tab: "announcements" };
    if (t.includes("plan") || t.includes("seating") || t.includes("stay")) return { tab: "plans" };
    return null;
  }

  async function addNotificationEnhanced(type, title, message, actionTarget = null) {
    const finalTarget = inferActionTarget(type, actionTarget);
    if (state.dataMode === "backend" && backendOnline) {
      try {
        await apiPost("/api/notifications", {
          wedding_id: getWeddingId(),
          type,
          title,
          message,
          action_target: finalTarget,
        });
      } catch {}
    } else {
      const notifs = getLocal(`notifs:${getWeddingId()}`);
      notifs.unshift({
        id: Date.now(),
        wedding_id: getWeddingId(),
        type,
        title,
        message,
        read_status: 0,
        action_target: finalTarget,
        created_at: new Date().toISOString(),
      });
      setLocal(`notifs:${getWeddingId()}`, notifs);
    }
    loadNotifications();
  }

  function deepLinkToTarget(target) {
    if (!target) return;
    let t = target;
    if (typeof t === "string") {
      try { t = JSON.parse(t); } catch { t = { selector: target }; }
    }
    const tab = String(t.tab || "").toLowerCase();
    if (tab) {
      if (["website", "plans", "cards", "announcements"].includes(tab)) {
        switchTab("discover");
        showDiscoverSection(tab);
      } else {
        switchTab(tab);
      }
    }
    const selector = t.selector || "";
    if (selector) {
      const el = document.querySelector(selector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("deep-link-pulse");
        setTimeout(() => el.classList.remove("deep-link-pulse"), 3800);
      }
    }
  }

  async function markNotificationReadEnhanced(id) {
    if (state.dataMode === "backend" && backendOnline) {
      try { await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, { method: "PUT" }); } catch {}
    } else {
      const notifs = getLocal(`notifs:${getWeddingId()}`);
      const n = notifs.find((x) => Number(x.id) === Number(id));
      if (n) n.read_status = 1;
      setLocal(`notifs:${getWeddingId()}`, notifs);
    }
  }

  function renderNotificationsEnhanced() {
    const badge = document.getElementById("c-notif-badge");
    if (state.unreadNotifs > 0) {
      badge.textContent = state.unreadNotifs;
      badge.classList.remove("hidden");
    } else badge.classList.add("hidden");

    const list = document.getElementById("c-notif-list");
    if (!state.notifications.length) {
      list.innerHTML = '<p class="muted sm" style="padding:10px">No notifications yet.</p>';
      return;
    }
    list.innerHTML = state.notifications.slice(0, 50).map((n) => `
      <div class="notif-item ${n.read_status ? "" : "unread"}" onclick="handleNotificationClick(${n.id})">
        <p class="notif-title">${esc(n.title)}</p>
        <p class="notif-msg">${esc(n.message || "")}</p>
        <p class="notif-time">${timeAgo(new Date(n.created_at))}</p>
      </div>
    `).join("");
  }

  window.handleNotificationClick = async function(id) {
    const n = state.notifications.find((x) => Number(x.id) === Number(id));
    await markNotificationReadEnhanced(id);
    if (n?.action_target) deepLinkToTarget(n.action_target);
    else if (n?.action_url) deepLinkToTarget(n.action_url);
    loadNotifications();
  };

  function normKey(k) {
    return String(k || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function mapGuestRow(row) {
    const mapped = {};
    const keys = Object.keys(row || {});
    const byNorm = {};
    keys.forEach((k) => { byNorm[normKey(k)] = row[k]; });
    const pick = (...aliases) => {
      for (const a of aliases) {
        if (byNorm[a] !== undefined && byNorm[a] !== null) return byNorm[a];
      }
      return "";
    };
    mapped.name = String(pick("name", "guestname", "fullname")).trim();
    mapped.email = String(pick("email", "emailaddress")).trim();
    mapped.phone = String(pick("phone", "phonenumber", "mobile")).trim();
    mapped.rsvp_status = String(pick("rsvp", "rsvpstatus", "status") || "pending").toLowerCase();
    mapped.meal_preference = String(pick("meal", "mealpreference", "food")).trim();
    mapped.plus_one = Number(pick("plusone", "plus1", "plus")) ? 1 : 0;
    mapped.table_number = pick("table", "tablenumber", "table#") || null;
    mapped.group_name = String(pick("group", "groupname", "side")).trim();
    mapped.notes = String(pick("notes", "note", "comment")).trim();
    return mapped;
  }

  async function importGuestRows(rows) {
    if (!rows.length) return;
    if (state.dataMode === "backend" && backendOnline) {
      try {
        const out = await apiPost("/api/guests/import", { wedding_id: getWeddingId(), rows });
        await addNotificationEnhanced("guest", "Guest Import Complete", `Created ${out.created}, updated ${out.updated}, skipped ${out.skipped}.`, { tab: "guests", selector: "#c-guest-table" });
      } catch (e) {
        alert(`Guest import failed: ${e.message || e}`);
      }
    } else {
      const all = getLocal(`guests:${getWeddingId()}`);
      let created = 0, updated = 0;
      rows.forEach((r) => {
        if (!r.name) return;
        let ex = null;
        if (r.email) ex = all.find((g) => String(g.email || "").toLowerCase() === r.email.toLowerCase());
        if (!ex) ex = all.find((g) => g.name === r.name && String(g.phone || "") === String(r.phone || ""));
        if (ex) {
          Object.assign(ex, r);
          updated += 1;
        } else {
          all.push({ ...r, wedding_id: getWeddingId(), id: Date.now() + Math.floor(Math.random() * 1000), created_at: new Date().toISOString() });
          created += 1;
        }
      });
      setLocal(`guests:${getWeddingId()}`, all);
      await addNotificationEnhanced("guest", "Guest Import Complete", `Created ${created}, updated ${updated}.`, { tab: "guests", selector: "#c-guest-table" });
    }
    loadGuests();
  }

  function bindGuestImport() {
    const btn = document.getElementById("c-import-guests-btn");
    const input = document.getElementById("c-guest-import-input");
    if (!btn || !input || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.onclick = () => input.click();
    input.onchange = async (e) => {
      const file = (e.target.files || [])[0];
      if (!file) return;
      if (!window.XLSX) {
        alert("Spreadsheet parser failed to load.");
        return;
      }
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }).map(mapGuestRow);
      await importGuestRows(rows);
      input.value = "";
    };
  }

  async function sendGuestInvites() {
    if (!backendOnline) {
      alert("Invite links require backend connectivity.");
      return;
    }
    let ids = state.guests.filter((g) => g.rsvp_status !== "attending").map((g) => g.id);
    try {
      if (state.dataMode === "local") {
        await apiPost("/api/guests/import", { wedding_id: getWeddingId(), rows: state.guests });
        const synced = await apiGet(`/api/guests?wedding_id=${encodeURIComponent(getWeddingId())}`);
        const byKey = new Map();
        (synced || []).forEach((g) => {
          const emailKey = String(g.email || "").toLowerCase();
          if (emailKey) byKey.set(`email:${emailKey}`, g.id);
          byKey.set(`name:${String(g.name || "").toLowerCase()}|phone:${String(g.phone || "")}`, g.id);
        });
        ids = state.guests
          .filter((g) => g.rsvp_status !== "attending")
          .map((g) => {
            const emailKey = String(g.email || "").toLowerCase();
            if (emailKey && byKey.has(`email:${emailKey}`)) return byKey.get(`email:${emailKey}`);
            return byKey.get(`name:${String(g.name || "").toLowerCase()}|phone:${String(g.phone || "")}`);
          })
          .filter((v) => Number.isFinite(Number(v)));
      }
      const out = await apiPost("/api/guest-invites/send", {
        wedding_id: getWeddingId(),
        guest_ids: ids,
        send_email: true,
      });
      await addNotificationEnhanced(
        "guest",
        "Invite Dispatch Complete",
        `Generated ${out.results?.length || 0} invite links${out.smtp_ready ? " and attempted email delivery." : "."}`,
        { tab: "announcements", selector: "#c-ann-feed" }
      );
      switchTab("discover");
      showDiscoverSection("announcements");
      loadAnnouncementChannels();
    } catch (e) {
      alert(`Invite sending failed: ${e.message || e}`);
    }
  }

  function bindInviteDispatch() {
    const btn = document.getElementById("c-send-invites-btn");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.onclick = () => sendGuestInvites();
  }

  async function updateGuestField(id, field, value) {
    const patch = { [field]: value };
    if (field === "plus_one") patch[field] = Number(value) ? 1 : 0;
    if (field === "table_number") patch[field] = value ? Number(value) : null;
    if (state.dataMode === "backend" && backendOnline) {
      try {
        await apiPut(`/api/guests/${id}`, patch);
      } catch (e) {
        alert(`Could not update guest: ${e.message || e}`);
        return;
      }
    } else {
      const guests = getLocal(`guests:${getWeddingId()}`);
      const g = guests.find((x) => Number(x.id) === Number(id));
      if (g) Object.assign(g, patch);
      setLocal(`guests:${getWeddingId()}`, guests);
    }
    loadGuests();
  }
  window.updateGuestField = updateGuestField;

  function renderGuestTableEnhanced() {
    const container = document.getElementById("c-guest-table");
    const attending = state.guests.filter((g) => g.rsvp_status === "attending");
    const plusOnes = attending.reduce((s, g) => s + (Number(g.plus_one) || 0), 0);
    const pendingCount = state.guests.filter((g) => g.rsvp_status === "pending").length;
    const declinedCount = state.guests.filter((g) => g.rsvp_status === "declined").length;

    document.getElementById("c-go-attending").textContent = attending.length;
    document.getElementById("c-go-pending").textContent = pendingCount;
    document.getElementById("c-go-declined").textContent = declinedCount;
    document.getElementById("c-go-total-seats").textContent = attending.length + plusOnes;

    const mealMap = {};
    state.guests.forEach((g) => {
      const meal = String(g.meal_preference || "").trim();
      if (!meal) return;
      mealMap[meal] = (mealMap[meal] || 0) + 1;
    });
    const mealBreakdown = document.getElementById("c-meal-breakdown");
    const mealList = document.getElementById("c-meal-list");
    const mealEntries = Object.entries(mealMap);
    if (mealEntries.length) {
      mealBreakdown.classList.remove("hidden");
      const chips = [`<button class="meal-chip ${ENH.mealFilter === "all" ? "active" : ""}" onclick="setMealFilter('all')"><strong>${state.guests.length}</strong> All Meals</button>`];
      mealEntries.forEach(([meal, cnt]) => {
        const active = ENH.mealFilter === meal.toLowerCase() ? "active" : "";
        chips.push(`<button class="meal-chip ${active}" onclick="setMealFilter(${JSON.stringify(meal.toLowerCase())})"><strong>${cnt}</strong> ${esc(meal)}</button>`);
      });
      mealList.innerHTML = chips.join("");
    } else {
      mealBreakdown.classList.add("hidden");
    }

    let filtered = state.guests.slice();
    if (typeof activeGuestFilter !== "undefined" && activeGuestFilter !== "all") {
      filtered = filtered.filter((g) => g.rsvp_status === activeGuestFilter);
    }
    if (ENH.mealFilter !== "all") {
      filtered = filtered.filter((g) => String(g.meal_preference || "").toLowerCase() === ENH.mealFilter);
    }

    if (!filtered.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="users"></i></div><p>No guests to show</p></div>';
      refreshIcons();
      return;
    }

    const mealOptions = ["", "Standard", "Vegetarian", "Vegan", "Gluten-Free", "Kosher", "Halal"];
    let html = '<table class="guest-table"><thead><tr><th>Name</th><th>Contact</th><th>RSVP</th><th>Meal</th><th>Group</th><th>+1</th><th>Table</th><th></th></tr></thead><tbody>';
    filtered.forEach((g) => {
      html += `<tr>
        <td><input value="${esc(g.name || "")}" onchange="updateGuestField(${g.id},'name',this.value)" /></td>
        <td>
          <input value="${esc(g.email || "")}" placeholder="Email" onchange="updateGuestField(${g.id},'email',this.value)" />
          <input value="${esc(g.phone || "")}" placeholder="Phone" onchange="updateGuestField(${g.id},'phone',this.value)" style="margin-top:6px" />
        </td>
        <td>
          <select class="guest-rsvp-select rsvp-badge ${g.rsvp_status}" onchange="updateGuestField(${g.id},'rsvp_status',this.value)">
            <option value="pending" ${g.rsvp_status === "pending" ? "selected" : ""}>Pending</option>
            <option value="attending" ${g.rsvp_status === "attending" ? "selected" : ""}>Attending</option>
            <option value="declined" ${g.rsvp_status === "declined" ? "selected" : ""}>Declined</option>
            <option value="maybe" ${g.rsvp_status === "maybe" ? "selected" : ""}>Maybe</option>
          </select>
        </td>
        <td>
          <select onchange="updateGuestField(${g.id},'meal_preference',this.value)">
            ${mealOptions.map((m) => `<option value="${m}" ${String(g.meal_preference || "") === m ? "selected" : ""}>${m || "Not set"}</option>`).join("")}
          </select>
        </td>
        <td><input value="${esc(g.group_name || "")}" onchange="updateGuestField(${g.id},'group_name',this.value)" /></td>
        <td>
          <select onchange="updateGuestField(${g.id},'plus_one',this.value)">
            <option value="0" ${(Number(g.plus_one) || 0) === 0 ? "selected" : ""}>No</option>
            <option value="1" ${(Number(g.plus_one) || 0) > 0 ? "selected" : ""}>Yes</option>
          </select>
        </td>
        <td><input type="number" min="1" value="${g.table_number || ""}" onchange="updateGuestField(${g.id},'table_number',this.value)" /></td>
        <td class="guest-actions"><button onclick="deleteGuest(${g.id})"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></td>
      </tr>`;
    });
    html += "</tbody></table>";
    container.innerHTML = html;
    refreshIcons();
  }

  window.setMealFilter = function(filter) {
    ENH.mealFilter = filter || "all";
    renderGuestTable();
  };

  function inferDueDateFromText(text) {
    const raw = String(text || "").trim();
    const lower = raw.toLowerCase();
    const explicit = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (explicit) return explicit[1];

    const now = new Date();
    const out = new Date(now.getTime());
    if (/\btomorrow\b/.test(lower)) {
      out.setDate(out.getDate() + 1);
      return out.toISOString().slice(0, 10);
    }
    if (/\bnext week\b/.test(lower)) {
      out.setDate(out.getDate() + 7);
      return out.toISOString().slice(0, 10);
    }
    if (/\bthis week\b/.test(lower)) {
      out.setDate(out.getDate() + 3);
      return out.toISOString().slice(0, 10);
    }

    const dayMap = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    };
    for (const [day, idx] of Object.entries(dayMap)) {
      if (!new RegExp(`\\b${day}\\b`, "i").test(lower)) continue;
      const delta = ((idx - now.getDay()) + 7) % 7 || 7;
      out.setDate(out.getDate() + delta);
      return out.toISOString().slice(0, 10);
    }
    return "";
  }

  function quickLocalTaskCandidates(text) {
    const clean = String(text || "").trim();
    if (!clean) return [];
    const lower = clean.toLowerCase();
    const candidates = [];
    const activeChatName = state.activeVendorChat || "vendor";
    const due = inferDueDateFromText(clean);

    const mentionsMeeting = /\b(meet|meeting|call|sync|catch[- ]?up|go through|walk through|review together)\b/i.test(lower);
    const asksForTime = /\b(when|what time|good time|available|schedule|tomorrow|next week|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lower);
    if (mentionsMeeting && asksForTime) {
      candidates.push({
        title: `Schedule meeting with ${activeChatName}`,
        description: clean,
        due_date: due,
        priority: "high",
        assigned_to: state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
        category: "Vendors",
        confidence: 0.8,
      });
    }

    if (/\b(final list|finalize list|review list|confirm list)\b/i.test(lower)) {
      candidates.push({
        title: `Finalize list with ${activeChatName}`,
        description: clean,
        due_date: due || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        priority: "high",
        assigned_to: state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
        category: "Planning",
        confidence: 0.72,
      });
    }

    if (/\b(book|finali[sz]e|confirm|send|review|arrange|schedule|create)\b/i.test(lower)) {
      candidates.push({
        title: clean.slice(0, 80),
        description: clean,
        due_date: due,
        priority: "medium",
        assigned_to: "",
        category: "Planning",
        confidence: 0.58,
      });
    }
    return candidates;
  }

  function renderChatTaskSuggestions() {
    const box = document.getElementById("c-chat-task-suggestions");
    if (!box) return;
    if (state.currentUser?.role !== "couple" || state.activeTab !== "chat" || state.isPrivateChat || !ENH.taskSuggestions.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    const visible = ENH.taskSuggestions.slice(0, 2);
    box.classList.remove("hidden");
    box.innerHTML = visible.map((s, idx) => `
      <article class="chat-task-suggestion">
        <p><strong>AI noticed a task:</strong> ${esc(s.title)}</p>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="meta">${s.due_date ? `Due ${esc(s.due_date)}` : "No due date"}</span>
          <button class="btn btn-primary btn-tiny" onclick="createSuggestedTask(${idx})">Add</button>
        </div>
      </article>
    `).join("");
  }

  function backfillChatTaskSignals() {
    if (state.currentUser?.role !== "couple" || state.activeTab !== "chat" || state.isPrivateChat) {
      renderChatTaskSuggestions();
      return;
    }
    const recentHuman = (state.messages || [])
      .filter((m) => m && m.type === "human" && m.text)
      .slice(-10);
    let added = false;
    recentHuman.forEach((m) => {
      quickLocalTaskCandidates(m.text).forEach((cand) => {
        if (!cand?.title) return;
        const normalized = String(cand.title).trim().toLowerCase();
        const exists = ENH.taskSuggestions.some((s) => String(s.title || "").trim().toLowerCase() === normalized);
        if (!exists) {
          ENH.taskSuggestions.unshift(cand);
          added = true;
        }
      });
    });
    ENH.taskSuggestions = ENH.taskSuggestions.slice(0, 6);
    if (added) renderTaskSuggestions();
    else renderChatTaskSuggestions();
  }

  async function maybeSuggestTaskFromText(text) {
    const clean = String(text || "").trim();
    if (!clean || /^@ai\b/i.test(clean)) return;
    let candidates = [];
    if (backendOnline) {
      try {
        const out = await apiPost("/api/ai/task-candidates", { wedding_id: getWeddingId(), text: clean });
        candidates = Array.isArray(out.candidates) ? out.candidates : [];
      } catch {}
    }

    const heuristic = quickLocalTaskCandidates(clean);
    if (!candidates.length) candidates = heuristic;
    else candidates = [...candidates, ...heuristic];

    if (!candidates.length) return;
    candidates.forEach((cand) => {
      if (!cand || !cand.title) return;
      const normalized = String(cand.title).trim().toLowerCase();
      const exists = ENH.taskSuggestions.some((s) => String(s.title || "").trim().toLowerCase() === normalized);
      if (!exists) ENH.taskSuggestions.unshift(cand);
    });
    ENH.taskSuggestions = ENH.taskSuggestions.slice(0, 6);
    renderTaskSuggestions();
  }

  function renderTaskSuggestions() {
    const box = document.getElementById("c-task-ai-suggestions");
    if (!box) return;
    if (!ENH.taskSuggestions.length) {
      box.classList.add("hidden");
      box.innerHTML = "";
      renderChatTaskSuggestions();
      return;
    }
    box.classList.remove("hidden");
    box.innerHTML = ENH.taskSuggestions.map((s, idx) => `
      <div class="task-ai-suggestion">
        <p><strong>AI Suggestion:</strong> ${esc(s.title)}${s.due_date ? ` (Due ${esc(s.due_date)})` : ""}</p>
        <button class="btn btn-primary btn-tiny" onclick="createSuggestedTask(${idx})">Create Task</button>
      </div>
    `).join("");
    renderChatTaskSuggestions();
  }

  function bindQuickTaskCreate() {
    const btn = document.getElementById("c-task-quick-add");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";
    btn.onclick = async () => {
      const titleEl = document.getElementById("c-task-quick-title");
      const dueEl = document.getElementById("c-task-quick-due");
      const assigneeEl = document.getElementById("c-task-quick-assignee");
      const title = String(titleEl?.value || "").trim();
      if (!title) {
        alert("Enter a task title.");
        return;
      }
      const payload = {
        wedding_id: getWeddingId(),
        title,
        description: "",
        due_date: dueEl?.value || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        priority: "medium",
        assigned_to: String(assigneeEl?.value || "").trim() || state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
        category: "Planning",
        status: "pending",
      };
      if (backendOnline) {
        try {
          await apiPost("/api/tasks", payload);
        } catch (e) {
          alert(`Could not create task: ${e.message || e}`);
          return;
        }
      } else {
        const rows = getLocal(`tasks:${getWeddingId()}`);
        rows.unshift({ ...payload, id: Date.now(), created_at: new Date().toISOString() });
        setLocal(`tasks:${getWeddingId()}`, rows);
      }
      titleEl.value = "";
      if (assigneeEl) assigneeEl.value = "";
      await addNotificationEnhanced("task", "Task Created", `"${payload.title}" created.`, { tab: "tasks", selector: "#c-task-board" });
      loadTasks();
    };
  }

  window.createSuggestedTask = async function(idx) {
    const s = ENH.taskSuggestions[idx];
    if (!s) return;
    const payload = {
      wedding_id: getWeddingId(),
      title: s.title,
      description: s.description || "",
      due_date: s.due_date || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      priority: s.priority || "medium",
      assigned_to: s.assigned_to || state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
      category: s.category || "Planning",
      status: "pending",
    };
    let created = false;
    if (backendOnline) {
      try {
        await apiPost("/api/tasks", payload);
        created = true;
      } catch (e) {
        alert(`Could not create suggested task: ${e.message || e}`);
        return;
      }
    } else {
      const tasks = getLocal(`tasks:${getWeddingId()}`);
      tasks.push({ ...payload, id: Date.now(), created_at: new Date().toISOString() });
      setLocal(`tasks:${getWeddingId()}`, tasks);
      created = true;
    }
    if (!created) return;
    ENH.taskSuggestions.splice(idx, 1);
    renderTaskSuggestions();
    await addNotificationEnhanced("task", "Task Created by AI Suggestion", `"${payload.title}" added to tasks.`, { tab: "tasks", selector: "#c-task-board" });
    loadTasks();
  };

  function actionSummaryLines(actions) {
    return (actions || []).map((a) => `- ${a.type}${a.title ? `: ${a.title}` : ""}`).join("\n");
  }

  function wrapAiActionFlow() {
    if (ENH.wrapped) return;
    ENH.wrapped = true;

    const originalAddMessage = addMessage;
    addMessage = function(type, author, text) {
      originalAddMessage(type, author, text);
      if (type === "human" && state.currentUser?.role === "couple") maybeSuggestTaskFromText(text);
    };

    const originalRenderMessages = renderMessages;
    renderMessages = function() {
      originalRenderMessages();
      backfillChatTaskSignals();
    };

    const originalHandleSend = handleSend;
    handleSend = async function(dash) {
      const input = getInput();
      const t = String(input?.value || "").trim().toLowerCase();
      if (state.pendingAiConfirmation && t && !t.startsWith("@ai")) {
        if (/^(confirm|yes|proceed|run|do it|cancel|no|stop)\b/.test(t)) {
          input.value = `@ai ${input.value.trim()}`;
        }
      }
      return originalHandleSend(dash);
    };

    const originalMaybeHandle = maybeHandleAiActions;
    maybeHandleAiActions = async function(instruction, context = "main", options = {}) {
      const text = String(instruction || "").trim();
      if (!text) return { handled: false };
      const lowered = text.toLowerCase().replace(/^@ai\s*/i, "");

      if (state.pendingAiConfirmation) {
        if (/^(confirm|yes|proceed|run|do it)\b/.test(lowered)) {
          const pending = state.pendingAiConfirmation;
          state.pendingAiConfirmation = null;
          clearPendingClarification();
          state.lastAiInstruction = pending.instruction;
          state.lastAiPlan = pending.plan;
          const exec = await executeAiActions(pending.plan.actions || [], pending.context || context);
          let msg = pending.plan.summary || "Executed approved AI plan.";
          if (exec.completed.length) msg += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
          if (exec.failed.length) msg += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
          pushAssistantMessage(msg, pending.context || context);
          return { handled: true, plan: pending.plan, exec };
        }
        if (/^(cancel|no|stop)\b/.test(lowered)) {
          state.pendingAiConfirmation = null;
          pushAssistantMessage("Understood. I canceled that pending plan.", context);
          return { handled: true, cancelled: true };
        }
      }

      const immediateFromCopilot = options.forcePlan && options.suggestionContext;
      if (!immediateFromCopilot && !options.forcePlan && !isLikelyActionInstruction(text)) {
        return { handled: false };
      }

      const plan = await getAiActionPlan(text, options.suggestionContext || null);
      if (!plan || plan.status === "not_actionable") return { handled: false, plan };

      if (plan.status === "needs_clarification") {
        const localFallback = localPlanAiActions(text, options.suggestionContext || null);
        if (localFallback?.status === "ready" && Array.isArray(localFallback.actions) && localFallback.actions.length) {
          if (!immediateFromCopilot) {
            state.pendingAiConfirmation = { context, instruction: text, plan: localFallback, createdAt: Date.now() };
            const lines = actionSummaryLines(localFallback.actions || []);
            pushAssistantMessage(
              `${localFallback.summary || "I inferred an executable plan from your instruction."}\n\nProposed actions:\n${lines || "- No actions listed"}\n\nReply with \`@ai confirm\` to execute or \`@ai cancel\` to skip.`,
              context
            );
            return { handled: true, plan: localFallback, pending_confirmation: true };
          }
          state.lastAiInstruction = text;
          state.lastAiPlan = localFallback;
          const exec = await executeAiActions(localFallback.actions || [], context);
          let response = localFallback.summary || "I inferred defaults and executed the request.";
          if (exec.completed.length) response += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
          if (exec.failed.length) response += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
          pushAssistantMessage(response, context);
          return { handled: true, plan: localFallback, exec };
        }
        state.pendingAiClarification = {
          type: "ai_action",
          context,
          instruction: text,
          suggestionContext: options.suggestionContext || null,
          createdAt: Date.now(),
        };
        pushAssistantMessage(plan.question || "I need one more detail before I can execute that.", context);
        return { handled: true, plan };
      }

      if (!immediateFromCopilot) {
        state.pendingAiConfirmation = { context, instruction: text, plan, createdAt: Date.now() };
        const lines = actionSummaryLines(plan.actions || []);
        pushAssistantMessage(
          `${plan.summary || "I built an execution plan."}\n\nProposed actions:\n${lines || "- No actions listed"}\n\nReply with \`@ai confirm\` to execute or \`@ai cancel\` to skip.`,
          context
        );
        return { handled: true, plan, pending_confirmation: true };
      }

      state.lastAiInstruction = text;
      state.lastAiPlan = plan;
      const exec = await executeAiActions(plan.actions || [], context);
      let response = plan.summary || "I executed your requested changes.";
      if (exec.completed.length) response += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
      if (exec.failed.length) response += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
      pushAssistantMessage(response, context);
      return { handled: true, plan, exec };
    };

    const originalExecute = executeAiActions;
    executeAiActions = async function(actions, context = "main") {
      const result = await originalExecute(actions, context);
      if (backendOnline && state.cohortId) {
        try {
          await apiPost("/api/ai-actions/log", {
            wedding_id: getWeddingId(),
            user_id: state.userId || "",
            context,
            instruction: state.lastAiInstruction || "",
            plan: state.lastAiPlan || { actions },
            result,
            status: result.failed?.length ? "partial" : "success",
          });
        } catch {}
      } else {
        const logs = getLocal(`ai_action_logs:${getWeddingId()}`);
        logs.unshift({
          id: Date.now(),
          wedding_id: getWeddingId(),
          context,
          instruction: state.lastAiInstruction || "",
          plan: state.lastAiPlan || { actions },
          result,
          created_at: new Date().toISOString(),
        });
        setLocal(`ai_action_logs:${getWeddingId()}`, logs.slice(0, 100));
      }
      return result;
    };
  }

  async function loadWebsiteDraft() {
    if (!backendOnline) return;
    try {
      const sites = await apiGet(`/api/wedding-sites?wedding_id=${encodeURIComponent(getWeddingId())}`);
      if (!Array.isArray(sites) || !sites.length) return;
      const site = sites[0];
      ENH.websiteSiteId = site.id;
      ENH.websiteContent = site.content_json || {};
      document.getElementById("c-site-title").value = site.title || "";
      document.getElementById("c-site-theme").value = site.theme || "classic";
      document.getElementById("c-site-slug").value = site.slug || "";
      renderWebsitePreview(ENH.websiteContent);
      if (site.slug && site.status === "published") {
        document.getElementById("c-site-share-link").innerHTML = `Published: <a href="${BACKEND_URL}/w/${site.slug}" target="_blank">${BACKEND_URL}/w/${site.slug}</a>`;
      }
    } catch {}
  }

  function renderWebsitePreview(content) {
    const box = document.getElementById("c-site-preview");
    if (!box) return;
    const c = content || {};
    const schedule = Array.isArray(c.schedule) ? c.schedule : [];
    box.innerHTML = `
      <h2>${esc(c.title || document.getElementById("c-site-title")?.value || "Wedding Website")}</h2>
      <p>${esc(c.hero_subtitle || "A polished website draft is ready.")}</p>
      <p>${esc(c.story || "")}</p>
      <ul>${schedule.slice(0, 4).map((s) => `<li>${esc(s.time || "")} ${esc(s.label || "")}</li>`).join("")}</ul>
    `;
  }

  function bindWebsiteBuilder() {
    const gen = document.getElementById("c-site-generate-btn");
    const save = document.getElementById("c-site-save-btn");
    const publish = document.getElementById("c-site-publish-btn");
    if (!gen || gen.dataset.bound === "1") return;
    gen.dataset.bound = "1";
    gen.onclick = async () => {
      if (!backendOnline) {
        alert("AI website generation requires backend connectivity.");
        return;
      }
      const prompt = document.getElementById("c-site-prompt").value.trim();
      let out = null;
      try {
        out = await apiPost("/api/wedding-sites/generate", { wedding_id: getWeddingId(), prompt });
      } catch (e) {
        alert(`Could not generate website draft: ${e.message || e}`);
        return;
      }
      ENH.websiteContent = out.content || {};
      if (!document.getElementById("c-site-title").value && ENH.websiteContent.title) {
        document.getElementById("c-site-title").value = ENH.websiteContent.title;
      }
      renderWebsitePreview(ENH.websiteContent);
      addNotificationEnhanced("website", "Website Draft Generated", "AI generated a wedding website draft.", { tab: "website", selector: "#c-site-preview" });
    };

    save.onclick = async () => {
      if (!backendOnline) {
        alert("Saving website drafts requires backend connectivity.");
        return;
      }
      const title = document.getElementById("c-site-title").value.trim() || "Wedding Website";
      const theme = document.getElementById("c-site-theme").value;
      const content = ENH.websiteContent || {
        title,
        hero_subtitle: "Welcome to our celebration.",
        story: "",
        schedule: [],
        travel: "",
        faq: [],
      };
      content.title = title;
      let out = null;
      try {
        out = await apiPost("/api/wedding-sites", {
          id: ENH.websiteSiteId,
          wedding_id: getWeddingId(),
          title,
          theme,
          content,
        });
      } catch (e) {
        alert(`Could not save website draft: ${e.message || e}`);
        return;
      }
      ENH.websiteSiteId = out.id;
      addNotificationEnhanced("website", "Website Draft Saved", "Saved latest website draft.", { tab: "website", selector: "#c-site-preview" });
    };

    publish.onclick = async () => {
      if (!backendOnline) {
        alert("Publishing requires backend connectivity.");
        return;
      }
      if (!ENH.websiteSiteId) await save.onclick();
      if (!ENH.websiteSiteId) return;
      const slug = document.getElementById("c-site-slug").value.trim();
      let out = null;
      try {
        out = await apiPut(`/api/wedding-sites/${ENH.websiteSiteId}/publish`, { slug });
      } catch (e) {
        alert(`Could not publish website: ${e.message || e}`);
        return;
      }
      document.getElementById("c-site-share-link").innerHTML = `Published: <a href="${out.url}" target="_blank">${out.url}</a>`;
      addNotificationEnhanced("website", "Website Published", `Website is live at ${out.url}`, { tab: "website", selector: "#c-site-share-link" });
    };
  }

  async function loadAnnouncementChannels() {
    const sel = document.getElementById("c-ann-channel");
    const feed = document.getElementById("c-ann-feed");
    if (!sel || !feed) return;
    if (backendOnline) {
      try {
        const channels = await apiGet(`/api/announcements/channels?wedding_id=${encodeURIComponent(getWeddingId())}`);
        sel.innerHTML = channels.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
        await loadAnnouncementMessages();
        return;
      } catch {}
    }
    const key = `ann_channels:${getWeddingId()}`;
    const localChannels = getLocal(key);
    if (!localChannels.length) {
      localChannels.push({ id: Date.now(), name: "Announcements", is_default: 1 });
      setLocal(key, localChannels);
    }
    sel.innerHTML = localChannels.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    loadAnnouncementMessages();
  }

  async function loadAnnouncementMessages() {
    const sel = document.getElementById("c-ann-channel");
    const feed = document.getElementById("c-ann-feed");
    if (!sel || !feed) return;
    const channelId = sel.value;
    let rows = [];
    if (backendOnline) {
      try {
        rows = await apiGet(`/api/announcements/messages?wedding_id=${encodeURIComponent(getWeddingId())}&channel_id=${encodeURIComponent(channelId)}`);
      } catch { rows = []; }
    } else {
      rows = getLocal(`ann_messages:${getWeddingId()}:${channelId}`);
    }
    feed.innerHTML = rows.map((m) => `
      <article class="ann-item">
        <strong>${esc(m.author_name || m.author_type || "Announcement")}</strong>
        <p>${esc(m.message || "")}</p>
        <span class="muted">${timeAgo(new Date(m.created_at || Date.now()))}</span>
      </article>
    `).join("") || '<p class="muted sm">No announcements yet.</p>';
  }

  function bindAnnouncements() {
    const refresh = document.getElementById("c-ann-refresh");
    const send = document.getElementById("c-ann-send-btn");
    const sel = document.getElementById("c-ann-channel");
    if (!refresh || refresh.dataset.bound === "1") return;
    refresh.dataset.bound = "1";
    refresh.onclick = () => loadAnnouncementChannels();
    sel.onchange = () => loadAnnouncementMessages();
    send.onclick = async () => {
      const input = document.getElementById("c-ann-input");
      const text = input.value.trim();
      if (!text) return;
      const channelId = document.getElementById("c-ann-channel").value;
      if (backendOnline) {
        try {
          await apiPost("/api/announcements/messages", {
            wedding_id: getWeddingId(),
            channel_id: channelId,
            author_type: "user",
            author_name: state.currentUser?.profile?.partner1 || state.currentUser?.username || "Planner",
            message: text,
          });
        } catch (e) {
          alert(`Could not post announcement: ${e.message || e}`);
          return;
        }
      } else {
        const key = `ann_messages:${getWeddingId()}:${channelId}`;
        const rows = getLocal(key);
        rows.unshift({
          id: Date.now(),
          author_type: "user",
          author_name: state.currentUser?.profile?.partner1 || state.currentUser?.username || "Planner",
          message: text,
          created_at: new Date().toISOString(),
        });
        setLocal(key, rows);
      }
      input.value = "";
      loadAnnouncementMessages();
    };
  }

  function bindMapPlanner() {
    const initBtn = document.getElementById("c-map-init-btn");
    const addBtn = document.getElementById("c-plan-add-item-btn");
    if (!initBtn || initBtn.dataset.bound === "1") return;
    initBtn.dataset.bound = "1";

    const mapStyles = {
      liberty: "https://tiles.openfreemap.org/styles/liberty",
      dark: "https://tiles.openfreemap.org/styles/dark",
    };

    initBtn.onclick = () => {
      if (!window.maplibregl) {
        alert("Map library not loaded.");
        return;
      }
      const selected = document.getElementById("c-map-style")?.value || "liberty";
      const styleUrl = mapStyles[selected] || mapStyles.liberty;
      localStorage.setItem("wedboard:map_style", selected);
      const host = document.getElementById("c-plan-map");
      if (ENH.map) ENH.map.remove();
      ENH.map = new maplibregl.Map({
        container: host,
        style: styleUrl,
        center: [-118.2437, 34.0522],
        zoom: 8,
      });
      ENH.map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
      ENH.map.on("load", () => renderPlanLayer());
    };

    addBtn.onclick = async () => {
      const item = {
        wedding_id: getWeddingId(),
        item_type: document.getElementById("c-plan-item-type").value,
        label: document.getElementById("c-plan-item-label").value.trim(),
        lat: Number(document.getElementById("c-plan-item-lat").value),
        lng: Number(document.getElementById("c-plan-item-lng").value),
        capacity: Number(document.getElementById("c-plan-item-capacity").value) || null,
        table_number: Number(document.getElementById("c-plan-item-table").value) || null,
        details: { text: document.getElementById("c-plan-item-details").value.trim() },
      };
      if (!item.label) {
        alert("Label is required.");
        return;
      }
      if (state.dataMode === "backend" && backendOnline) {
        try {
          await apiPost("/api/visual-plan-items", item);
        } catch (e) {
          alert(`Could not add plan item: ${e.message || e}`);
          return;
        }
      } else {
        const key = `visual_items:${getWeddingId()}`;
        const rows = getLocal(key);
        rows.unshift({ ...item, id: Date.now(), details_json: item.details, assigned_guests_json: [] });
        setLocal(key, rows);
      }
      loadVisualPlanItems();
    };

    const savedStyle = localStorage.getItem("wedboard:map_style") || "liberty";
    const styleSelect = document.getElementById("c-map-style");
    if (styleSelect) styleSelect.value = savedStyle in mapStyles ? savedStyle : "liberty";
  }

  async function loadVisualPlanItems() {
    let rows = [];
    if (state.dataMode === "backend" && backendOnline) {
      try { rows = await apiGet(`/api/visual-plan-items?wedding_id=${encodeURIComponent(getWeddingId())}`); } catch {}
    } else {
      rows = getLocal(`visual_items:${getWeddingId()}`);
    }
    ENH.planItems = Array.isArray(rows) ? rows : [];
    renderPlanList();
    renderPlanLayer();
  }

  function renderPlanList() {
    const list = document.getElementById("c-plan-items-list");
    if (!list) return;
    list.innerHTML = ENH.planItems.map((i) => `
      <article class="plan-item-card" data-entity-id="plan-${i.id}">
        <div class="row">
          <strong>${esc(i.label || "")}</strong>
          <span class="pill">${esc(i.item_type || "")}</span>
        </div>
        <p class="muted sm">${esc((i.details_json?.text || i.details?.text || "").toString())}</p>
      </article>
    `).join("") || '<p class="muted sm">No visual items yet.</p>';
  }

  function renderPlanLayer() {
    if (!ENH.map || !window.deck || !window.deck.MapboxOverlay) return;
    const valid = ENH.planItems.filter((i) => Number.isFinite(Number(i.lng)) && Number.isFinite(Number(i.lat)));
    const layer = new deck.ScatterplotLayer({
      id: "wedding-plan-layer",
      data: valid,
      getPosition: (d) => [Number(d.lng), Number(d.lat)],
      getRadius: (d) => d.item_type === "stay" ? 160 : 120,
      getFillColor: (d) => d.item_type === "stay" ? [79, 145, 233, 210] : [177, 117, 240, 210],
      pickable: true,
      radiusUnits: "meters",
      onClick: (info) => {
        if (!info.object) return;
        new maplibregl.Popup()
          .setLngLat([Number(info.object.lng), Number(info.object.lat)])
          .setHTML(`<strong>${esc(info.object.label || "")}</strong><br>${esc((info.object.details_json?.text || info.object.details?.text || "").toString())}`)
          .addTo(ENH.map);
      },
    });

    if (!ENH.mapOverlay) {
      ENH.mapOverlay = new deck.MapboxOverlay({ layers: [layer] });
      ENH.map.addControl(ENH.mapOverlay);
    } else {
      ENH.mapOverlay.setProps({ layers: [layer] });
    }
  }

  function drawCardPreview() {
    const canvas = document.getElementById("c-card-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const title = (document.getElementById("c-card-title")?.value || "Wedding Invitation").trim();
    const prompt = (document.getElementById("c-card-prompt")?.value || "").trim();
    const theme = document.getElementById("c-card-theme")?.value || "classic";

    const themes = {
      classic: ["#fef6f9", "#f2dded"],
      modern: ["#edf6ff", "#dce8ff"],
      royal: ["#f7f1ff", "#e8dcff"],
      minimal: ["#f8f8f8", "#ececec"],
    };
    const aiPalette = Array.isArray(ENH.cardData?.palette) ? ENH.cardData.palette : null;
    const colors = aiPalette && aiPalette.length >= 2 ? [aiPalette[0], aiPalette[1]] : (themes[theme] || themes.classic);
    const subtitle = String(ENH.cardData?.subtitle || "").trim();
    const bodyCopy = String(ENH.cardData?.body || "").trim();
    ENH.cardData = { ...ENH.cardData, title, prompt, theme, subtitle, body: bodyCopy, palette: colors };

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(111,73,182,0.35)";
    ctx.lineWidth = 5;
    ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);

    ctx.fillStyle = "#3f2a65";
    ctx.font = "700 68px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(title, canvas.width / 2, 170);

    const p = state.currentUser?.profile || {};
    const weddingLine = subtitle || `${p.partner1 || "Couple"} & ${p.partner2 || "Family"}`;
    ctx.font = "500 40px Inter, Arial, sans-serif";
    ctx.fillText(weddingLine, canvas.width / 2, 248);

    const body = bodyCopy || prompt || `Join us on ${p.weddingDate || "our special day"} at ${p.venue || "the wedding venue"}.`;
    ctx.font = "400 30px Inter, Arial, sans-serif";
    wrapCanvasText(ctx, body, canvas.width / 2, 340, 860, 44);
  }

  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || "").split(" ");
    let line = "";
    let yy = y;
    for (let i = 0; i < words.length; i++) {
      const test = line + words[i] + " ";
      const w = ctx.measureText(test).width;
      if (w > maxWidth && i > 0) {
        ctx.fillText(line.trim(), x, yy);
        line = words[i] + " ";
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line.trim(), x, yy);
  }

  function bindCardStudio() {
    const gen = document.getElementById("c-card-generate-btn");
    const share = document.getElementById("c-card-share-btn");
    const png = document.getElementById("c-card-export-png-btn");
    const pdf = document.getElementById("c-card-export-pdf-btn");
    if (!gen || gen.dataset.bound === "1") return;
    gen.dataset.bound = "1";

    gen.onclick = async () => {
      const titleInput = document.getElementById("c-card-title");
      const promptInput = document.getElementById("c-card-prompt");
      const themeInput = document.getElementById("c-card-theme");
      const title = (titleInput?.value || "Wedding Invitation").trim();
      const prompt = (promptInput?.value || "").trim();
      const theme = (themeInput?.value || "classic").trim();
      ENH.cardData = { title, prompt, theme, subtitle: "", body: "", palette: null };

      if (backendOnline) {
        try {
          const ai = await apiPost("/api/cards/generate", {
            wedding_id: getWeddingId(),
            title,
            prompt,
            theme,
          });
          if (ai?.content && typeof ai.content === "object") {
            ENH.cardData = { ...ENH.cardData, ...ai.content };
            if (ai.content.title && titleInput) titleInput.value = ai.content.title;
            if (ai.content.theme && themeInput) themeInput.value = ai.content.theme;
          }
        } catch {}
      }

      drawCardPreview();
      if (backendOnline) {
        try {
          await apiPost("/api/cards", {
            wedding_id: getWeddingId(),
            title: ENH.cardData?.title || "Wedding Invitation",
            prompt: ENH.cardData?.prompt || "",
            theme: ENH.cardData?.theme || "classic",
            content: ENH.cardData || {},
            created_by: state.currentUser?.username || "",
          });
        } catch {}
      }
      addNotificationEnhanced("cards", "Invitation Card Generated", "A new invitation card design is ready.", { tab: "cards", selector: "#c-card-canvas" });
    };

    png.onclick = () => {
      const canvas = document.getElementById("c-card-canvas");
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${(ENH.cardData?.title || "invitation").replace(/\s+/g, "_").toLowerCase()}.png`;
      a.click();
    };

    pdf.onclick = () => {
      const canvas = document.getElementById("c-card-canvas");
      if (!canvas || !window.jspdf?.jsPDF) return;
      const pdfDoc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "px", format: [1200, 675] });
      pdfDoc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 1200, 675);
      pdfDoc.save(`${(ENH.cardData?.title || "invitation").replace(/\s+/g, "_").toLowerCase()}.pdf`);
    };

    share.onclick = async () => {
      const title = ENH.cardData?.title || "Invitation Card";
      const message = `New invitation card ready: "${title}". Exports available as PNG and PDF in Card Studio.`;
      if (backendOnline) {
        try {
          await apiPost("/api/announcements/messages", {
            wedding_id: getWeddingId(),
            author_type: "ai",
            author_name: "AI Assistant",
            message,
            metadata: { type: "card_share", title },
          });
        } catch {}
      } else {
        const ch = getLocal(`ann_channels:${getWeddingId()}`)[0];
        if (ch) {
          const key = `ann_messages:${getWeddingId()}:${ch.id}`;
          const rows = getLocal(key);
          rows.unshift({ id: Date.now(), author_type: "ai", author_name: "AI Assistant", message, created_at: new Date().toISOString() });
          setLocal(key, rows);
        }
      }
      switchTab("discover");
      showDiscoverSection("announcements");
      loadAnnouncementChannels();
    };
  }

  function overrideGuestRenderer() {
    renderGuestTable = renderGuestTableEnhanced;
    window.updateGuestRSVP = (id, status) => updateGuestField(id, "rsvp_status", status);
  }

  function overrideNotificationSystem() {
    addNotification = addNotificationEnhanced;
    renderNotifications = renderNotificationsEnhanced;
  }

  function initBindings() {
    initTheme();
    initThreeBackground();
    bindDiscoverSections();
    bindGuestImport();
    bindInviteDispatch();
    bindWebsiteBuilder();
    bindMapPlanner();
    bindCardStudio();
    bindAnnouncements();
    bindQuickTaskCreate();
    overrideGuestRenderer();
    overrideNotificationSystem();
    wrapAiActionFlow();
    if (!ENH.initialized) {
      ENH.initialized = true;
      showDiscoverSection("marketplace");
    }
  }

  const originalShowCoupleDash = showCoupleDash;
  showCoupleDash = async function() {
    await chooseDataModeForWedding();
    const out = originalShowCoupleDash();
    setTimeout(() => {
      initBindings();
      if (state.currentUser?.role === "couple") {
        loadGuests();
        loadNotifications();
      }
    }, 120);
    return out;
  };

  (async () => {
    await chooseDataModeForWedding();
    initBindings();
    if (state.currentUser?.role === "couple" && state.joined) {
      loadGuests();
      loadNotifications();
    }
  })();
})();
