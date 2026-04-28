// ═══════════════════════════════════════════════════════════════════════════════
// WedBoard — Full Feature SPA with AI Copilot
// Chat, Budget, Tasks, Guests, Marketplace, AI Copilot, Private Chat, Groups
// ═══════════════════════════════════════════════════════════════════════════════

const SAMPLE_DOC = `AI Wedding Planner - Event Planning Brief\n\nEvent overview:\n- Couple: Mia and Ethan.\n- Wedding date: June 21.\n- Venue: Rosewood Garden Estate.\n- Ceremony start time: 4:30 PM.\n- Guest arrival begins at 4:00 PM.\n- Reception start time: 6:00 PM.\n\nVendor schedule:\n- Photographer: Golden Hour Studio, arrival at 1:30 PM.\n- Florist: Petal & Vine, setup completed by 2:00 PM.\n- DJ: Blue Note Events, sound check at 3:00 PM.\n- Catering: Hearth Table, dinner service at 6:30 PM.\n\nPlanning notes:\n- The bride wants a modern minimalist style with ivory florals and soft candle lighting.\n- The couple wants a shared workspace where the planner, photographer, florist, and family can coordinate quickly.\n- The system should support file uploads for contracts, schedules, and inspiration boards.\n- The assistant should answer questions from uploaded planning documents.`;

const STOP_WORDS = new Set(["a","an","and","are","as","at","be","by","for","from","has","have","in","is","it","its","of","on","or","that","the","to","was","were","will","with","what","when","where","who","how","why","we","you","your","our","this","these","those","they","their","i"]);

const BACKEND_URL = "http://localhost:5000";
let backendOnline = false;

// Budget category icons (Lucide icon names)
const BUDGET_ICONS = {
  Venue:"landmark", Catering:"utensils", Photography:"camera", Videography:"video",
  Flowers:"flower-2", "Music/DJ":"music", Attire:"shirt", "Hair & Makeup":"sparkles",
  Decor:"palette", Transportation:"car", Invitations:"mail", Favors:"gift",
  Cake:"cake-slice", Officiant:"church", Rings:"gem", Honeymoon:"plane",
  Miscellaneous:"package"
};

// Sensitive info patterns
const SENSITIVE_PATTERNS = [
  { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, type: "credit card number" },
  { pattern: /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/, type: "SSN" },
  { pattern: /\bpassword\s*[:=]\s*\S+/i, type: "password" },
  { pattern: /\b(?:routing|account)\s*(?:number|#|no)?\s*[:=]?\s*\d{6,}/i, type: "bank account info" },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b.*(?:password|pwd|pin)/i, type: "login credentials" },
];

const state = {
  currentUser: null, joined: false, cohort: "", messages: [], resources: [], chunks: [],
  userId: null, cohortId: null, aiStreaming: false, selectedRole: null,
  activeVendorChat: null, reviewRating: 0, activeTab: "chat",
  budgets: [], expenses: [], tasks: [], events: [], guests: [],
  notifications: [], unreadNotifs: 0, marketplaceVendors: [], compareList: [],
  // New features
  privateMessages: [], groupChats: [], activeGroupChat: null,
  isPrivateChat: false, copilotSuggestions: [],
  pendingCopilotAction: null,
  pendingAiClarification: null,
};

// ── Lucide helper ───────────────────────────────────────────────────────────
function refreshIcons() { if (window.lucide) lucide.createIcons(); }

// ── View management ─────────────────────────────────────────────────────────
const V = {};
["landing","signin","reg-couple","reg-vendor","couple","vendor"].forEach(k => V[k] = document.getElementById("view-" + k));
function showView(name) { Object.values(V).forEach(v => v.classList.add("hidden")); V[name].classList.remove("hidden"); refreshIcons(); }

// ── Storage ─────────────────────────────────────────────────────────────────
function getUsers() { try { return JSON.parse(localStorage.getItem("wedboard:users") || "{}"); } catch { return {}; } }
function saveUsers(u) { localStorage.setItem("wedboard:users", JSON.stringify(u)); }
function getHistory(uid, key) { try { return JSON.parse(localStorage.getItem(`wedboard:h:${uid}:${key}`) || "[]"); } catch { return []; } }
function saveHistory(uid, key, msgs) { localStorage.setItem(`wedboard:h:${uid}:${key}`, JSON.stringify(msgs.slice(-200))); }
function getReviews() { try { return JSON.parse(localStorage.getItem("wedboard:reviews") || "[]"); } catch { return []; } }
function saveReviews(r) { localStorage.setItem("wedboard:reviews", JSON.stringify(r)); }
function simpleHash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; } return h.toString(16); }
function getLocal(key) { try { return JSON.parse(localStorage.getItem(`wedboard:${key}`) || "[]"); } catch { return []; } }
function setLocal(key, data) { localStorage.setItem(`wedboard:${key}`, JSON.stringify(data)); }

// ── Demo account seeding ───────────────────────────────────────────────────
function seedDemoAccount() {
  const DEMO_USER = "demo";
  const DEMO_PASS = "wedding2026";
  const users = getUsers();
  if (users[DEMO_USER]) return;

  const demoId = "demo-couple-" + Date.now();
  const profile = { partner1: "Riya", partner2: "Bhargav", weddingDate: "2026-08-15", venue: "Rosewood Garden Estate", guestCount: "150", style: "Modern Minimalist" };
  users[DEMO_USER] = { id: demoId, username: "demo", role: "couple", profile, pwHash: simpleHash(DEMO_PASS), createdAt: new Date().toISOString() };
  saveUsers(users);

  const wid = "Riya & Bhargav Wedding";

  // Budgets
  const budgets = [
    { id: 9001, wedding_id: wid, category: "Venue", allocated_amount: 15000, spent_amount: 12500, created_at: "2026-01-15T10:00:00Z" },
    { id: 9002, wedding_id: wid, category: "Catering", allocated_amount: 12000, spent_amount: 8400, created_at: "2026-01-20T10:00:00Z" },
    { id: 9003, wedding_id: wid, category: "Photography", allocated_amount: 5000, spent_amount: 3500, created_at: "2026-02-01T10:00:00Z" },
    { id: 9004, wedding_id: wid, category: "Flowers", allocated_amount: 3500, spent_amount: 3800, created_at: "2026-02-10T10:00:00Z" },
    { id: 9005, wedding_id: wid, category: "Music/DJ", allocated_amount: 2500, spent_amount: 2000, created_at: "2026-02-15T10:00:00Z" },
    { id: 9006, wedding_id: wid, category: "Attire", allocated_amount: 4000, spent_amount: 3200, created_at: "2026-03-01T10:00:00Z" },
    { id: 9007, wedding_id: wid, category: "Decor", allocated_amount: 3000, spent_amount: 1800, created_at: "2026-03-10T10:00:00Z" },
    { id: 9008, wedding_id: wid, category: "Cake", allocated_amount: 1500, spent_amount: 900, created_at: "2026-03-15T10:00:00Z" },
  ];
  setLocal(`budgets:${wid}`, budgets);

  setLocal("expenses:9001", [
    { id: 90101, budget_id: 9001, vendor_name: "Rosewood Estate", amount: 10000, description: "Venue rental deposit", created_at: "2026-01-20T10:00:00Z" },
    { id: 90102, budget_id: 9001, vendor_name: "Rosewood Estate", amount: 2500, description: "Garden ceremony fee", created_at: "2026-02-15T10:00:00Z" },
  ]);
  setLocal("expenses:9002", [
    { id: 90201, budget_id: 9002, vendor_name: "Hearth Table", amount: 6000, description: "Dinner service (150 guests)", created_at: "2026-02-20T10:00:00Z" },
    { id: 90202, budget_id: 9002, vendor_name: "Hearth Table", amount: 1200, description: "Cocktail hour appetizers", created_at: "2026-03-05T10:00:00Z" },
    { id: 90203, budget_id: 9002, vendor_name: "Sweet Sips Bar", amount: 1200, description: "Open bar package", created_at: "2026-03-10T10:00:00Z" },
  ]);
  setLocal("expenses:9003", [{ id: 90301, budget_id: 9003, vendor_name: "Golden Hour Studio", amount: 3500, description: "Full day photography package", created_at: "2026-02-25T10:00:00Z" }]);
  setLocal("expenses:9004", [
    { id: 90401, budget_id: 9004, vendor_name: "Petal & Vine", amount: 2200, description: "Ceremony + reception florals", created_at: "2026-03-01T10:00:00Z" },
    { id: 90402, budget_id: 9004, vendor_name: "Petal & Vine", amount: 800, description: "Bridal bouquet + boutonnieres", created_at: "2026-03-10T10:00:00Z" },
    { id: 90403, budget_id: 9004, vendor_name: "Petal & Vine", amount: 800, description: "Extra table arrangements", created_at: "2026-04-01T10:00:00Z" },
  ]);
  setLocal("expenses:9005", [{ id: 90501, budget_id: 9005, vendor_name: "Blue Note Events", amount: 2000, description: "DJ + sound system 6hrs", created_at: "2026-03-15T10:00:00Z" }]);
  setLocal("expenses:9006", [
    { id: 90601, budget_id: 9006, vendor_name: "The Bridal Suite", amount: 2200, description: "Wedding dress", created_at: "2026-02-10T10:00:00Z" },
    { id: 90602, budget_id: 9006, vendor_name: "Dapper & Co", amount: 1000, description: "Groom suit + accessories", created_at: "2026-03-05T10:00:00Z" },
  ]);
  setLocal("expenses:9007", [{ id: 90701, budget_id: 9007, vendor_name: "Luxe Rentals", amount: 1800, description: "Table linens, chair covers, arches", created_at: "2026-03-20T10:00:00Z" }]);
  setLocal("expenses:9008", [{ id: 90801, budget_id: 9008, vendor_name: "Sugar & Bloom Bakery", amount: 900, description: "3-tier wedding cake", created_at: "2026-03-25T10:00:00Z" }]);

  // Tasks
  const pastDate = d => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt.toISOString().slice(0, 10); };
  const futDate = d => { const dt = new Date(); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
  const tasks = [
    { id: 8001, wedding_id: wid, title: "Book venue", description: "Confirm Rosewood Garden Estate", due_date: pastDate(60), priority: "urgent", assigned_to: "Riya", category: "Venue", status: "completed", created_at: "2026-01-10T10:00:00Z" },
    { id: 8002, wedding_id: wid, title: "Finalize guest list", description: "Get final headcount from both families", due_date: pastDate(30), priority: "high", assigned_to: "Bhargav", category: "Guests", status: "completed", created_at: "2026-01-15T10:00:00Z" },
    { id: 8003, wedding_id: wid, title: "Book photographer", description: "Sign contract with Golden Hour Studio", due_date: pastDate(45), priority: "high", assigned_to: "Riya", category: "Photography", status: "completed", created_at: "2026-01-20T10:00:00Z" },
    { id: 8004, wedding_id: wid, title: "Order wedding dress", description: "Final fitting at The Bridal Suite", due_date: pastDate(20), priority: "urgent", assigned_to: "Riya", category: "Attire", status: "completed", created_at: "2026-02-01T10:00:00Z" },
    { id: 8005, wedding_id: wid, title: "Send out invitations", description: "Mail + digital invites to all guests", due_date: pastDate(10), priority: "high", assigned_to: "Bhargav", category: "Invitations", status: "completed", created_at: "2026-02-15T10:00:00Z" },
    { id: 8006, wedding_id: wid, title: "Confirm catering menu", description: "Final tasting with Hearth Table — choose 3 entrees", due_date: pastDate(5), priority: "high", assigned_to: "Riya", category: "Catering", status: "in_progress", created_at: "2026-03-01T10:00:00Z" },
    { id: 8007, wedding_id: wid, title: "Review floral mockups", description: "Petal & Vine sent centerpiece designs — need approval", due_date: pastDate(3), priority: "medium", assigned_to: "Riya", category: "Flowers", status: "pending", created_at: "2026-03-05T10:00:00Z" },
    { id: 8008, wedding_id: wid, title: "DJ playlist review", description: "Blue Note needs must-play and do-not-play lists", due_date: pastDate(1), priority: "medium", assigned_to: "Bhargav", category: "Music", status: "pending", created_at: "2026-03-10T10:00:00Z" },
    { id: 8009, wedding_id: wid, title: "Cake tasting appointment", description: "Sugar & Bloom — choose flavor + design", due_date: futDate(3), priority: "medium", assigned_to: "Riya", category: "Cake", status: "pending", created_at: "2026-03-15T10:00:00Z" },
    { id: 8010, wedding_id: wid, title: "Book rehearsal dinner venue", description: "Need a venue for 40 people night before", due_date: futDate(7), priority: "high", assigned_to: "Bhargav", category: "Venue", status: "pending", created_at: "2026-03-20T10:00:00Z" },
    { id: 8011, wedding_id: wid, title: "Order groomsmen gifts", description: "Personalized cufflinks + whiskey set", due_date: futDate(14), priority: "low", assigned_to: "Bhargav", category: "Gifts", status: "pending", created_at: "2026-03-25T10:00:00Z" },
    { id: 8012, wedding_id: wid, title: "Finalize seating chart", description: "Assign tables for 150 guests — check dietary reqs", due_date: futDate(21), priority: "high", assigned_to: "Riya", category: "Guests", status: "pending", created_at: "2026-04-01T10:00:00Z" },
    { id: 8013, wedding_id: wid, title: "Schedule hair & makeup trial", description: "Book trial run with artist for bridal party", due_date: futDate(10), priority: "medium", assigned_to: "Riya", category: "Beauty", status: "in_progress", created_at: "2026-04-05T10:00:00Z" },
    { id: 8014, wedding_id: wid, title: "Arrange transportation", description: "Limo for bride + shuttle for guests", due_date: futDate(28), priority: "medium", assigned_to: "Bhargav", category: "Transportation", status: "pending", created_at: "2026-04-10T10:00:00Z" },
    { id: 8015, wedding_id: wid, title: "Write vows", description: "Personal vows — both partners", due_date: futDate(45), priority: "high", assigned_to: "Both", category: "Ceremony", status: "pending", created_at: "2026-04-15T10:00:00Z" },
    { id: 8016, wedding_id: wid, title: "Confirm honeymoon flights", description: "Bali trip — book flights + resort", due_date: futDate(35), priority: "medium", assigned_to: "Bhargav", category: "Honeymoon", status: "pending", created_at: "2026-04-18T10:00:00Z" },
  ];
  setLocal(`tasks:${wid}`, tasks);

  // Events
  const events = [
    { id: 7001, wedding_id: wid, name: "Bridal Party Prep", start_time: "10:00", end_time: "13:00", vendor_name: "Glam Squad", location: "Bridal Suite", notes: "Hair & makeup for bride + 4 bridesmaids" },
    { id: 7002, wedding_id: wid, name: "Photography — First Look", start_time: "13:30", end_time: "14:30", vendor_name: "Golden Hour Studio", location: "Rose Garden", notes: "Private first look + couple portraits" },
    { id: 7003, wedding_id: wid, name: "Guest Arrival", start_time: "15:30", end_time: "16:00", vendor_name: "", location: "Main Entrance", notes: "Ushers guide guests to ceremony lawn" },
    { id: 7004, wedding_id: wid, name: "Ceremony", start_time: "16:00", end_time: "16:45", vendor_name: "Rev. Ananya Kapoor", location: "Garden Pavilion", notes: "Vows, ring exchange, recessional" },
    { id: 7005, wedding_id: wid, name: "Cocktail Hour", start_time: "17:00", end_time: "18:00", vendor_name: "Hearth Table", location: "Terrace", notes: "Appetizers + signature cocktails" },
    { id: 7006, wedding_id: wid, name: "Reception — Dinner", start_time: "18:00", end_time: "19:30", vendor_name: "Hearth Table", location: "Grand Ballroom", notes: "3-course dinner, toasts, first dance" },
    { id: 7007, wedding_id: wid, name: "DJ & Dancing", start_time: "19:30", end_time: "23:00", vendor_name: "Blue Note Events", location: "Grand Ballroom", notes: "Open dance floor, bouquet toss at 21:00" },
    { id: 7008, wedding_id: wid, name: "Sparkler Send-Off", start_time: "23:00", end_time: "23:30", vendor_name: "Golden Hour Studio", location: "Main Entrance", notes: "Photo op + couple departure" },
  ];
  setLocal(`events:${wid}`, events);

  // Guests
  const guests = [
    { id: 6001, wedding_id: wid, name: "Anita Sharma", email: "anita@email.com", phone: "(555) 100-0001", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 1, table_number: 1, group_name: "Family" },
    { id: 6002, wedding_id: wid, name: "Raj Patel", email: "raj@email.com", phone: "(555) 100-0002", rsvp_status: "attending", meal_preference: "Standard", plus_one: 1, table_number: 1, group_name: "Family" },
    { id: 6003, wedding_id: wid, name: "Priya Mehta", email: "priya@email.com", phone: "(555) 100-0003", rsvp_status: "attending", meal_preference: "Vegan", plus_one: 0, table_number: 2, group_name: "Family" },
    { id: 6004, wedding_id: wid, name: "Arjun Reddy", email: "arjun@email.com", phone: "(555) 100-0004", rsvp_status: "attending", meal_preference: "Standard", plus_one: 1, table_number: 2, group_name: "Family" },
    { id: 6005, wedding_id: wid, name: "Sarah Chen", email: "sarah@email.com", phone: "(555) 100-0005", rsvp_status: "attending", meal_preference: "Gluten-Free", plus_one: 0, table_number: 3, group_name: "College Friends" },
    { id: 6006, wedding_id: wid, name: "Michael Torres", email: "michael@email.com", phone: "(555) 100-0006", rsvp_status: "attending", meal_preference: "Standard", plus_one: 1, table_number: 3, group_name: "College Friends" },
    { id: 6007, wedding_id: wid, name: "Emily Johnson", email: "emily@email.com", phone: "(555) 100-0007", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 0, table_number: 4, group_name: "College Friends" },
    { id: 6008, wedding_id: wid, name: "David Kim", email: "david@email.com", phone: "(555) 100-0008", rsvp_status: "attending", meal_preference: "Standard", plus_one: 1, table_number: 4, group_name: "Work Friends" },
    { id: 6009, wedding_id: wid, name: "Jessica Williams", email: "jessica@email.com", phone: "(555) 100-0009", rsvp_status: "pending", meal_preference: "", plus_one: 1, table_number: null, group_name: "Work Friends" },
    { id: 6010, wedding_id: wid, name: "Chris Martinez", email: "chris@email.com", phone: "(555) 100-0010", rsvp_status: "pending", meal_preference: "", plus_one: 0, table_number: null, group_name: "Work Friends" },
    { id: 6011, wedding_id: wid, name: "Neha Gupta", email: "neha@email.com", phone: "(555) 100-0011", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 1, table_number: 5, group_name: "Family" },
    { id: 6012, wedding_id: wid, name: "Ryan O'Brien", email: "ryan@email.com", phone: "(555) 100-0012", rsvp_status: "declined", meal_preference: "", plus_one: 0, table_number: null, group_name: "College Friends" },
    { id: 6013, wedding_id: wid, name: "Aisha Rahman", email: "aisha@email.com", phone: "(555) 100-0013", rsvp_status: "attending", meal_preference: "Halal", plus_one: 0, table_number: 5, group_name: "Family" },
    { id: 6014, wedding_id: wid, name: "Tom Baker", email: "tom@email.com", phone: "(555) 100-0014", rsvp_status: "pending", meal_preference: "", plus_one: 1, table_number: null, group_name: "Neighbors" },
    { id: 6015, wedding_id: wid, name: "Sunita Desai", email: "sunita@email.com", phone: "(555) 100-0015", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 1, table_number: 6, group_name: "Family" },
    { id: 6016, wedding_id: wid, name: "James Lee", email: "james@email.com", phone: "(555) 100-0016", rsvp_status: "attending", meal_preference: "Standard", plus_one: 0, table_number: 6, group_name: "Work Friends" },
    { id: 6017, wedding_id: wid, name: "Maria Gonzalez", email: "maria@email.com", phone: "(555) 100-0017", rsvp_status: "declined", meal_preference: "", plus_one: 0, table_number: null, group_name: "Neighbors" },
    { id: 6018, wedding_id: wid, name: "Vikram Singh", email: "vikram@email.com", phone: "(555) 100-0018", rsvp_status: "attending", meal_preference: "Standard", plus_one: 1, table_number: 7, group_name: "Family" },
    { id: 6019, wedding_id: wid, name: "Lisa Park", email: "lisa@email.com", phone: "(555) 100-0019", rsvp_status: "pending", meal_preference: "", plus_one: 0, table_number: null, group_name: "College Friends" },
    { id: 6020, wedding_id: wid, name: "Daniel Brown", email: "daniel@email.com", phone: "(555) 100-0020", rsvp_status: "attending", meal_preference: "Standard", plus_one: 0, table_number: 7, group_name: "Work Friends" },
    { id: 6021, wedding_id: wid, name: "Kavita Nair", email: "kavita@email.com", phone: "(555) 100-0021", rsvp_status: "attending", meal_preference: "Vegan", plus_one: 1, table_number: 8, group_name: "Family" },
    { id: 6022, wedding_id: wid, name: "Alex Murphy", email: "alex@email.com", phone: "(555) 100-0022", rsvp_status: "pending", meal_preference: "", plus_one: 1, table_number: null, group_name: "College Friends" },
    { id: 6023, wedding_id: wid, name: "Deepa Joshi", email: "deepa@email.com", phone: "(555) 100-0023", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 0, table_number: 8, group_name: "Family" },
    { id: 6024, wedding_id: wid, name: "Brandon Taylor", email: "brandon@email.com", phone: "(555) 100-0024", rsvp_status: "maybe", meal_preference: "", plus_one: 0, table_number: null, group_name: "Work Friends" },
    { id: 6025, wedding_id: wid, name: "Meera Iyer", email: "meera@email.com", phone: "(555) 100-0025", rsvp_status: "attending", meal_preference: "Vegetarian", plus_one: 1, table_number: 9, group_name: "Family" },
  ];
  setLocal(`guests:${wid}`, guests);

  // Notifications
  const notifs = [
    { id: 5001, wedding_id: wid, type: "ai_alert", title: "Budget Alert: Flowers Over Budget", message: "Flowers category is $300 over the $3,500 budget. Consider reducing table arrangements.", read_status: 0, created_at: new Date(Date.now() - 3600000).toISOString() },
    { id: 5002, wedding_id: wid, type: "ai_alert", title: "Overdue: Review Floral Mockups", message: "The floral mockup review was due 3 days ago. Petal & Vine needs approval to proceed.", read_status: 0, created_at: new Date(Date.now() - 7200000).toISOString() },
    { id: 5003, wedding_id: wid, type: "ai_alert", title: "Overdue: DJ Playlist Review", message: "Blue Note Events is waiting for your must-play and do-not-play lists.", read_status: 0, created_at: new Date(Date.now() - 10800000).toISOString() },
    { id: 5004, wedding_id: wid, type: "rsvp", title: "5 RSVPs Still Pending", message: "Jessica, Chris, Tom, Lisa, and Alex haven't responded yet. Consider sending reminders.", read_status: 0, created_at: new Date(Date.now() - 14400000).toISOString() },
    { id: 5005, wedding_id: wid, type: "budget", title: "Budget 78% Used", message: "You've spent $36,100 of $46,500. On track but watch the Flowers overage.", read_status: 1, created_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 5006, wedding_id: wid, type: "task", title: "Task Completed: Send Invitations", message: "All 150 invitations have been sent!", read_status: 1, created_at: new Date(Date.now() - 172800000).toISOString() },
    { id: 5007, wedding_id: wid, type: "ai_suggestion", title: "AI Tip: Vendor Coordination", message: "Golden Hour Studio needs the final shot list. Consider adding it as a task.", read_status: 1, created_at: new Date(Date.now() - 259200000).toISOString() },
  ];
  setLocal(`notifs:${wid}`, notifs);

  // Chat histories
  const chatGolden = [
    { type: "system", author: "System", text: "Chat with Golden Hour Studio. Use @ai for help.", time: "2026-03-01T10:00:00Z" },
    { type: "human", author: "Riya", text: "Hi! We're so excited to work with you for our August wedding!", time: "2026-03-01T10:05:00Z" },
    { type: "human", author: "Golden Hour Studio", text: "Thank you Riya & Bhargav! I've reviewed your venue — Rosewood Garden Estate is gorgeous. The natural light in the garden pavilion is perfect for golden hour shots.", time: "2026-03-01T10:15:00Z" },
    { type: "human", author: "Riya", text: "That's so good to hear! We want a mix of candid and posed photos. Can you do a first look session?", time: "2026-03-01T10:20:00Z" },
    { type: "human", author: "Golden Hour Studio", text: "Absolutely! I'd suggest 1:30 PM arrival — first look at the rose garden, then couple portraits until the ceremony. I'll send a detailed shot list.", time: "2026-03-01T10:30:00Z" },
    { type: "human", author: "Bhargav", text: "@ai What questions should we ask our photographer about the wedding day timeline?", time: "2026-03-05T14:00:00Z" },
    { type: "ai", author: "AI Assistant", text: "Great question! Here are key questions for your photographer:\n\n**Timeline & Logistics:**\n1. What time do you need to arrive for setup?\n2. How long for couple portraits vs group shots?\n3. Do you have a shot list template?\n\n**Creative:**\n4. What's your style for ceremony coverage — documentary or directed?\n5. How do you handle low-light reception shots?\n6. Can you capture detail shots (rings, flowers, decor)?\n\n**Deliverables:**\n7. When will we receive edited photos?\n8. How many final images can we expect?\n9. Do you provide a highlight reel?\n\n*Based on your wedding details — ceremony at 4 PM with 150 guests — I'd suggest allocating 90 mins for pre-ceremony photos.*", time: "2026-03-05T14:01:00Z" },
    { type: "human", author: "Riya", text: "This is super helpful! Let me share this with the photographer.", time: "2026-03-05T14:05:00Z" },
    { type: "human", author: "Golden Hour Studio", text: "These are great points! I'll prepare a full shot list and timeline. Expect it by next week.", time: "2026-03-06T09:00:00Z" },
  ];
  saveHistory(demoId, `${wid}::Golden Hour Studio`, chatGolden);

  const chatPetal = [
    { type: "system", author: "System", text: "Chat with Petal & Vine. Use @ai for help.", time: "2026-03-01T11:00:00Z" },
    { type: "human", author: "Riya", text: "Hi! We'd love to discuss our floral arrangements. We're going for modern minimalist with ivory tones.", time: "2026-03-01T11:05:00Z" },
    { type: "human", author: "Petal & Vine", text: "Love that vision! I'm thinking garden roses, white ranunculus, and eucalyptus for the ceremony arch. For centerpieces, low arrangements with candles for an intimate feel.", time: "2026-03-01T11:20:00Z" },
    { type: "human", author: "Riya", text: "That sounds beautiful! What about the bridal bouquet?", time: "2026-03-01T11:25:00Z" },
    { type: "human", author: "Petal & Vine", text: "I'd suggest a cascading bouquet with white peonies, garden roses, and trailing greenery. Very romantic and elegant. I'll send mockup designs by Friday!", time: "2026-03-01T11:35:00Z" },
    { type: "human", author: "Bhargav", text: "@ai We're $300 over budget on flowers. What can we do?", time: "2026-04-02T10:00:00Z" },
    { type: "ai", author: "AI Assistant", text: "I can see your Flowers budget is at **$3,800 of $3,500** — $300 over. Here are some strategies:\n\n**Quick Wins:**\n- Use more greenery (eucalyptus, ferns) — cheaper than flowers but still elegant\n- Reduce table arrangements from all 9 tables to alternating (5 floral, 4 candle-only)\n- Reuse ceremony arch flowers as reception decor\n\n**Negotiate:**\n- Ask Petal & Vine about seasonal flower substitutions\n- Consider silk flowers for non-focal arrangements\n\n**Budget Shift:**\n- You have $1,200 remaining in Decor — move $300 to Flowers since they overlap\n\n*AI Flag: The extra table arrangements ($800) pushed you over. Canceling those alone saves $800.*", time: "2026-04-02T10:01:00Z" },
  ];
  saveHistory(demoId, `${wid}::Petal & Vine`, chatPetal);

  const chatBlue = [
    { type: "system", author: "System", text: "Chat with Blue Note Events. Use @ai for help.", time: "2026-03-10T10:00:00Z" },
    { type: "human", author: "Bhargav", text: "Hey! We need DJ services for our reception from 7:30 PM to 11 PM.", time: "2026-03-10T10:05:00Z" },
    { type: "human", author: "Blue Note Events", text: "Perfect! I'll bring a full PA system + wireless mics for toasts. What genres do you like?", time: "2026-03-10T10:20:00Z" },
    { type: "human", author: "Bhargav", text: "Mix of Bollywood, top 40, and classic rock. We also need a mic for speeches.", time: "2026-03-10T10:25:00Z" },
    { type: "human", author: "Blue Note Events", text: "Got it! I'll prepare a mixed set. Send me your must-play list and I'll build around it. Also — do you want me to MC the reception?", time: "2026-03-10T10:35:00Z" },
    { type: "human", author: "Bhargav", text: "Yes, MC would be great! Let me put together that playlist.", time: "2026-03-10T10:40:00Z" },
  ];
  saveHistory(demoId, `${wid}::Blue Note Events`, chatBlue);

  const chatHearth = [
    { type: "system", author: "System", text: "Chat with Hearth Table. Use @ai for help.", time: "2026-02-15T10:00:00Z" },
    { type: "human", author: "Riya", text: "Hi! We need catering for 150 guests. We'd like a 3-course plated dinner.", time: "2026-02-15T10:05:00Z" },
    { type: "human", author: "Hearth Table", text: "Wonderful! Here's what I propose:\n\nStarter: Roasted beet salad or tomato bisque\nMain: Choice of herb-crusted salmon, braised short rib, or grilled portobello (vegan)\nDessert: Seasonal tart alongside your wedding cake\n\nThe per-plate cost is $40 for the dinner package.", time: "2026-02-15T10:30:00Z" },
    { type: "human", author: "Riya", text: "That sounds wonderful! We'll also need cocktail hour appetizers.", time: "2026-02-15T10:35:00Z" },
    { type: "human", author: "Hearth Table", text: "Our cocktail package includes bruschetta, mini crab cakes, vegetable spring rolls, and a cheese board. $8 per person. Should I send a formal quote?", time: "2026-02-15T10:45:00Z" },
    { type: "human", author: "Riya", text: "@ai Can you help us figure out the total catering cost?", time: "2026-02-20T11:00:00Z" },
    { type: "ai", author: "AI Assistant", text: "Based on your conversation with Hearth Table:\n\n**Dinner:** 150 guests x $40/plate = **$6,000**\n**Cocktail hour:** 150 guests x $8/person = **$1,200**\n**Total estimated:** **$7,200**\n\nYour catering budget is $12,000 with $8,400 already spent (including $1,200 for the open bar). That leaves **$3,600 remaining** — plenty of room.\n\n*Tip: Ask about dietary accommodations. You have guests with Vegetarian, Vegan, Halal, and Gluten-Free needs based on your RSVP data.*", time: "2026-02-20T11:01:00Z" },
  ];
  saveHistory(demoId, `${wid}::Hearth Table`, chatHearth);

  // Seed private AI chat
  const privateChat = [
    { type: "system", author: "System", text: "Private AI Assistant. This chat is only visible to you. Safe for sensitive booking, financial, and personal information.", time: new Date(Date.now() - 86400000).toISOString() },
    { type: "human", author: "Riya", text: "@ai What's our total budget summary with all vendor contracts?", time: new Date(Date.now() - 85000000).toISOString() },
    { type: "ai", author: "AI Assistant", text: "Here's your confidential budget summary:\n\n**Total Allocated:** $46,500\n**Total Spent:** $36,100 (78%)\n**Remaining:** $10,400\n\n**Vendor Contracts:**\n- Rosewood Estate: $12,500 (paid) — Contract #RE-2026-0847\n- Golden Hour Studio: $3,500 (paid) — Contract signed 02/25\n- Petal & Vine: $3,800 (over by $300)\n- Blue Note Events: $2,000 (paid)\n- Hearth Table: $8,400 (partial) — Balance due June 1\n\n**Action Items:**\n- Flowers is $300 over budget — recommend reallocating from Decor\n- Hearth Table balance of $3,600 due in 2 months\n\n*This information is private and not shared with vendors.*", time: new Date(Date.now() - 84900000).toISOString() },
  ];
  saveHistory(demoId, `${wid}::__private_ai__`, privateChat);

  console.log("Demo account seeded: username='demo', password='wedding2026'");
}

seedDemoAccount();

// ── Init ────────────────────────────────────────────────────────────────────
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

// ═══ LANDING ═══
document.getElementById("role-couple").onclick = () => { state.selectedRole = "couple"; showView("reg-couple"); };
document.getElementById("role-vendor").onclick = () => { state.selectedRole = "vendor"; showView("reg-vendor"); };
document.getElementById("go-signin").onclick = e => { e.preventDefault(); showView("signin"); };

// ═══ SIGN IN ═══
document.getElementById("signin-back").onclick = () => showView("landing");
document.getElementById("go-register").onclick = e => { e.preventDefault(); showView("landing"); };
document.getElementById("signin-form").onsubmit = e => { e.preventDefault(); doSignIn(); };

function doSignIn() {
  const err = document.getElementById("si-err"); err.textContent = "";
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

// ═══ COUPLE REGISTRATION ═══
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

// ═══ VENDOR REGISTRATION ═══
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

// ═══ COUPLE DASHBOARD ═══
function getCoupleWeddingName() {
  const p = state.currentUser.profile;
  return (p.partner1 && p.partner2) ? `${p.partner1} & ${p.partner2} Wedding` : `${state.currentUser.username}'s Wedding`;
}
function getWeddingId() { return state.cohort || getCoupleWeddingName(); }

function showCoupleDash() {
  showView("couple");
  const u = state.currentUser;
  document.getElementById("c-dd-avatar").textContent = u.username.charAt(0).toUpperCase();
  const display = (u.profile.partner1 && u.profile.partner2) ? `${u.profile.partner1} & ${u.profile.partner2}` : u.username;
  document.getElementById("c-dd-name").textContent = display;
  document.getElementById("c-wedding-name").textContent = getCoupleWeddingName();
  document.getElementById("c-input").disabled = false;
  document.getElementById("c-send").disabled = false;
  state.cohort = getCoupleWeddingName();
  state.joined = true;
  state.isPrivateChat = false;

  const first = document.querySelector(".c-vendor-btn.active");
  if (first) {
    state.activeVendorChat = first.dataset.vendor;
    document.getElementById("c-chat-title").textContent = first.dataset.vendor;
    document.getElementById("c-chat-subtitle").textContent = first.dataset.cat;
    document.getElementById("c-topbar-avatar").textContent = first.dataset.vendor.charAt(0);
  }
  loadCoupleVendorChat();
  renderManageVendors();
  switchTab("chat");
  loadBudgets(); loadTasks(); loadEvents(); loadGuests(); loadNotifications(); loadMarketplace();
  loadGroupChats();

  setTimeout(() => {
    if (state.currentUser && state.currentUser.username === "demo" && !state.resources.length) {
      addDocumentFromText("sample-wedding-plan.txt", SAMPLE_DOC);
    }
    fetchAISuggestions();
  }, 300);
}

function loadCoupleVendorChat() {
  const vn = state.activeVendorChat; if (!vn) return;
  state.isPrivateChat = false;
  document.getElementById("c-private-ai-btn").classList.remove("active");
  document.querySelectorAll(".c-vendor-btn").forEach(b => {
    if (b.dataset.vendor === vn) b.classList.add("active"); else b.classList.remove("active");
  });
  // Show chat panel, hide private panel
  document.querySelectorAll("#view-couple .main-panel").forEach(mp => mp.classList.remove("active"));
  document.getElementById("c-main-chat").classList.add("active");

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

// ═══ PRIVATE AI CHAT ═══
document.getElementById("c-private-ai-btn").onclick = () => {
  if (state.currentUser && state.activeVendorChat && !state.isPrivateChat) {
    saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
  }
  state.isPrivateChat = true;
  state.activeVendorChat = null;
  document.querySelectorAll(".c-vendor-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".group-chat-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("c-private-ai-btn").classList.add("active");

  // Show private chat panel
  document.querySelectorAll("#view-couple .main-panel").forEach(mp => mp.classList.remove("active"));
  document.getElementById("c-main-private-ai").classList.add("active");

  // Load private chat history
  const chatKey = `${state.cohort}::__private_ai__`;
  const stored = getHistory(state.currentUser.id, chatKey);
  if (stored.length) {
    state.privateMessages = stored.map(m => ({ ...m, id: crypto.randomUUID(), time: new Date(m.time) }));
  } else {
    state.privateMessages = [{ id: crypto.randomUUID(), type: "system", author: "System", text: "Private AI Assistant. This chat is only visible to you. Safe for sensitive booking, financial, and personal information.", time: new Date() }];
  }
  renderPrivateMessages();
  refreshIcons();
};

document.getElementById("c-private-send").onclick = () => handlePrivateSend();
document.getElementById("c-private-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePrivateSend(); } });

async function handlePrivateSend() {
  if (!state.currentUser || state.aiStreaming) return;
  const input = document.getElementById("c-private-input");
  const text = input.value.trim(); if (!text) return;
  input.value = "";
  state.privateMessages.push({ id: crypto.randomUUID(), type: "human", author: state.currentUser.profile.partner1 || state.currentUser.username, text, time: new Date() });
  renderPrivateMessages();
  saveHistory(state.currentUser.id, `${state.cohort}::__private_ai__`, state.privateMessages);

  if (state.pendingAiClarification) {
    const clarHandled = await resolvePendingClarification(text.replace(/^@ai\s*/i, "").trim() || text, "private");
    if (clarHandled) return;
  }

  const query = text.replace(/^@ai\s*/i, "").trim() || text;
  const dm = query.match(/^(?:generate|create|make|write)\s+doc(?:ument)?\s*(.*)/i);
  if (dm) await handleGenerateDocumentIntent(dm[1].trim() || query, "private");
  else await respondToPrivateAi(query, "private");
}

async function respondToPrivateAi(q, context = "private") {
  if (!q) return;
  const actionResult = await maybeHandleAiActions(q, context);
  if (actionResult.handled) return;

  showTypingIn("c-private-feed");
  if (backendOnline && state.cohortId) {
    state.aiStreaming = true;
    fetch(`${BACKEND_URL}/api/ai-query-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohort_id: state.cohortId, question: q, user_id: state.userId, wedding_id: getWeddingId() }) })
      .then(res => { if (!res.ok) throw new Error(); const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "", full = "", srcs = [], node = null; const feed = document.getElementById("c-private-feed");
        function proc(t) { buf += t; const lines = buf.split("\n"); buf = lines.pop(); for (const l of lines) { if (!l.startsWith("data: ")) continue; try { const e = JSON.parse(l.slice(6)); if (e.type === "sources") srcs = e.sources || []; if (e.type === "chunk") { if (!node) { removeTypingFrom("c-private-feed"); const tpl = document.getElementById("msg-tpl"); node = tpl.content.firstElementChild.cloneNode(true); node.classList.add("ai"); node.querySelector(".msg-author").textContent = "AI Assistant"; node.querySelector(".msg-time").textContent = fmtTime(new Date()); feed.appendChild(node); } full += e.content; node.querySelector(".msg-text").innerHTML = renderMd(full); feed.scrollTop = feed.scrollHeight; } if (e.type === "done") { if (srcs.length) full += `\n\n*Sources: ${srcs.join(", ")}*`; if (node) node.querySelector(".msg-text").innerHTML = renderMd(full); state.privateMessages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: full, time: new Date() }); saveHistory(state.currentUser.id, `${state.cohort}::__private_ai__`, state.privateMessages); state.aiStreaming = false; } } catch {} } }
        function pump() { return reader.read().then(({ done, value }) => { if (done) { if (buf.trim()) proc("\n"); state.aiStreaming = false; removeTypingFrom("c-private-feed"); return; } proc(dec.decode(value, { stream: true })); return pump(); }); }
        return pump();
      }).catch(() => { removeTypingFrom("c-private-feed"); state.aiStreaming = false; state.privateMessages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: "Unable to reach AI backend. Please try again.", time: new Date() }); renderPrivateMessages(); });
    return;
  }
  setTimeout(() => {
    removeTypingFrom("c-private-feed");
    const res = searchKB(q);
    const answer = res.length ? buildAnswer(q, res[0], res[1]) : "I can help with your private wedding planning queries. Upload documents to the Knowledge Base for me to reference, or ask me about your budget, tasks, or vendor details.";
    state.privateMessages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: answer, time: new Date() });
    renderPrivateMessages();
    saveHistory(state.currentUser.id, `${state.cohort}::__private_ai__`, state.privateMessages);
  }, 500);
}

function renderPrivateMessages() {
  const feed = document.getElementById("c-private-feed"); feed.innerHTML = "";
  const tpl = document.getElementById("msg-tpl");
  for (const m of state.privateMessages) {
    const n = tpl.content.firstElementChild.cloneNode(true);
    n.classList.add(m.type);
    n.querySelector(".msg-author").textContent = m.author;
    n.querySelector(".msg-time").textContent = fmtTime(m.time);
    n.querySelector(".msg-text").innerHTML = fmtMsg(m.text, m.type);
    feed.appendChild(n);
  }
  feed.scrollTop = feed.scrollHeight;
  refreshIcons();
}

// ═══ SENSITIVE INFO DETECTION ═══
function checkSensitiveInfo(text) {
  for (const { pattern, type } of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return type;
  }
  return null;
}

document.getElementById("c-sensitive-dismiss").onclick = () => document.getElementById("c-sensitive-banner").classList.add("hidden");
document.getElementById("c-sensitive-move").onclick = () => {
  document.getElementById("c-sensitive-banner").classList.add("hidden");
  // Switch to private chat
  document.getElementById("c-private-ai-btn").click();
};

// ═══ GROUP CHATS ═══
function loadGroupChats() {
  state.groupChats = getLocal(`groupchats:${getWeddingId()}`);
  renderGroupChats();
}

function renderGroupChats() {
  const list = document.getElementById("c-group-chat-list");
  const title = document.getElementById("c-group-chats-title");
  list.innerHTML = "";
  if (!state.groupChats.length) { title.style.display = "none"; return; }
  title.style.display = "";
  state.groupChats.forEach(gc => {
    const btn = document.createElement("button");
    btn.className = `m-chat-item group-chat-btn${state.activeGroupChat === gc.id ? ' active' : ''}`;
    btn.dataset.groupId = gc.id;
    btn.innerHTML = `<div class="m-avatar lavender"><i data-lucide="users" style="width:16px;height:16px;color:#fff"></i></div><div class="m-chat-info"><strong>${esc(gc.name)}</strong><span>${gc.members.length} members</span></div>`;
    btn.onclick = () => openGroupChat(gc.id);
    list.appendChild(btn);
  });
  refreshIcons();
}

function openGroupChat(groupId) {
  if (state.currentUser && state.activeVendorChat && !state.isPrivateChat) {
    saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
  }
  state.isPrivateChat = false;
  state.activeGroupChat = groupId;
  state.activeVendorChat = null;
  document.querySelectorAll(".c-vendor-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("c-private-ai-btn").classList.remove("active");
  document.querySelectorAll(".group-chat-btn").forEach(b => b.classList.toggle("active", b.dataset.groupId == groupId));

  const gc = state.groupChats.find(g => g.id === groupId);
  if (!gc) return;

  document.querySelectorAll("#view-couple .main-panel").forEach(mp => mp.classList.remove("active"));
  document.getElementById("c-main-chat").classList.add("active");
  document.getElementById("c-chat-title").textContent = gc.name;
  document.getElementById("c-chat-subtitle").textContent = gc.members.join(", ");
  document.getElementById("c-topbar-avatar").textContent = gc.name.charAt(0);

  const chatKey = `${state.cohort}::group::${groupId}`;
  const stored = getHistory(state.currentUser.id, chatKey);
  if (stored.length) {
    state.messages = stored.map(m => ({ ...m, id: crypto.randomUUID(), time: new Date(m.time) }));
    renderMessages();
  } else {
    state.messages = [];
    addMessage("system", "System", `Group chat: ${gc.name}. Members: ${gc.members.join(", ")}. Use @ai for AI assistance.`);
  }
  refreshIcons();
}

// New Chat Modal
document.getElementById("c-new-chat-btn").onclick = () => document.getElementById("c-new-chat-modal").classList.remove("hidden");
document.getElementById("c-new-chat-close").onclick = () => document.getElementById("c-new-chat-modal").classList.add("hidden");
document.querySelectorAll(".chat-type-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".chat-type-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("new-chat-vendor").classList.toggle("hidden", btn.dataset.type !== "vendor");
    document.getElementById("new-chat-group").classList.toggle("hidden", btn.dataset.type !== "group");
  };
});
document.getElementById("nc-create-btn").onclick = () => {
  const activeType = document.querySelector(".chat-type-btn.active").dataset.type;
  if (activeType === "vendor") {
    const vendor = document.getElementById("nc-vendor-select").value;
    if (!vendor) { alert("Select a vendor."); return; }
    document.getElementById("c-new-chat-modal").classList.add("hidden");
    state.activeVendorChat = vendor;
    state.activeGroupChat = null;
    loadCoupleVendorChat();
  } else {
    const name = document.getElementById("nc-group-name").value.trim();
    if (!name) { alert("Enter a group name."); return; }
    const members = [];
    document.querySelectorAll("#nc-members input:checked").forEach(cb => members.push(cb.value));
    if (members.length < 1) { alert("Select at least one member."); return; }
    const includeAi = document.getElementById("nc-include-ai").checked;
    if (includeAi) members.push("AI Assistant");
    const gc = { id: Date.now(), name, members, created_at: new Date().toISOString() };
    state.groupChats.push(gc);
    setLocal(`groupchats:${getWeddingId()}`, state.groupChats);
    document.getElementById("c-new-chat-modal").classList.add("hidden");
    document.getElementById("nc-group-name").value = "";
    document.querySelectorAll("#nc-members input").forEach(cb => cb.checked = false);
    renderGroupChats();
    openGroupChat(gc.id);
    addNotification("chat", "Group Chat Created", `"${name}" with ${members.join(", ")}`);
  }
};
document.getElementById("c-new-chat-modal").onclick = e => { if (e.target.id === "c-new-chat-modal") e.target.classList.add("hidden"); };

// ═══ NAVIGATION TABS ═══
document.querySelectorAll("#c-nav-tabs .nav-tab").forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function switchTab(tabName) {
  state.activeTab = tabName;
  state.isPrivateChat = false;
  document.querySelectorAll("#c-nav-tabs .nav-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
  document.querySelectorAll("#view-couple .tab-content").forEach(tc => tc.classList.remove("active"));
  const tabContent = document.getElementById(`c-tab-${tabName}`);
  if (tabContent) tabContent.classList.add("active");
  document.querySelectorAll("#view-couple .main-panel").forEach(mp => mp.classList.remove("active"));
  const mainPanel = document.getElementById(`c-main-${tabName}`);
  if (mainPanel) mainPanel.classList.add("active");

  if (tabName === "chat") {
    if (state.activeVendorChat) loadCoupleVendorChat();
    else if (state.activeGroupChat) openGroupChat(state.activeGroupChat);
  }
  if (tabName === "budget") renderBudgetMain();
  if (tabName === "tasks") { renderTaskBoard(); renderEventsTimeline(); }
  if (tabName === "guests") renderGuestTable();
  if (tabName === "discover") renderMarketplaceGrid();
  refreshIcons();
}

// Couple vendor clicks
document.querySelectorAll(".c-vendor-btn").forEach(item => {
  item.addEventListener("click", () => {
    if (state.currentUser && state.activeVendorChat && !state.isPrivateChat) {
      saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
    }
    state.activeGroupChat = null;
    document.querySelectorAll(".group-chat-btn").forEach(b => b.classList.remove("active"));
    state.activeVendorChat = item.dataset.vendor;
    document.getElementById("c-chat-title").textContent = item.dataset.vendor;
    document.getElementById("c-chat-subtitle").textContent = item.dataset.cat;
    document.getElementById("c-topbar-avatar").textContent = item.dataset.vendor.charAt(0);
    loadCoupleVendorChat();
  });
});

// Settings dropdown
document.getElementById("c-settings-btn").onclick = () => { document.getElementById("c-settings-menu").classList.toggle("hidden"); document.getElementById("c-notif-menu").classList.add("hidden"); };
document.getElementById("c-notif-btn").onclick = () => { document.getElementById("c-notif-menu").classList.toggle("hidden"); document.getElementById("c-settings-menu").classList.add("hidden"); };
document.addEventListener("click", e => {
  if (!e.target.closest("#c-settings-btn") && !e.target.closest("#c-settings-menu")) document.getElementById("c-settings-menu").classList.add("hidden");
  if (!e.target.closest("#c-notif-btn") && !e.target.closest("#c-notif-menu")) document.getElementById("c-notif-menu").classList.add("hidden");
});
document.getElementById("c-logout").onclick = doLogout;

function openSlide(panelId, overlayId) { document.getElementById(panelId).classList.remove("hidden"); document.getElementById(overlayId).classList.remove("hidden"); refreshIcons(); }
function closeSlide(panelId, overlayId) { document.getElementById(panelId).classList.add("hidden"); document.getElementById(overlayId).classList.add("hidden"); }

document.getElementById("c-kb-btn").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-kb-panel", "c-overlay"); };
document.getElementById("c-kb-close").onclick = () => closeSlide("c-kb-panel", "c-overlay");
document.getElementById("c-manage-vendors").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-manage-panel", "c-overlay"); };
document.getElementById("c-manage-close").onclick = () => closeSlide("c-manage-panel", "c-overlay");
document.getElementById("c-write-review").onclick = () => { document.getElementById("c-settings-menu").classList.add("hidden"); openSlide("c-review-panel", "c-overlay"); renderCoupleReviews(); };
document.getElementById("c-review-close").onclick = () => closeSlide("c-review-panel", "c-overlay");
document.getElementById("c-overlay").onclick = () => { document.querySelectorAll("#view-couple .slideover").forEach(s => s.classList.add("hidden")); document.getElementById("c-overlay").classList.add("hidden"); };

document.getElementById("c-send").onclick = () => handleSend("couple");
document.getElementById("c-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend("couple"); } });

// KB
document.getElementById("c-file-input").onchange = async e => { for (const f of Array.from(e.target.files || [])) { f.type.startsWith("image/") ? await addImageResource(f) : await addTextResource(f); } e.target.value = ""; renderResources(); };
document.getElementById("c-load-sample").onclick = async () => {
  if (backendOnline && state.cohortId) { const blob = new Blob([SAMPLE_DOC], { type: "text/plain" }); await addTextResource(new File([blob], "sample-wedding-plan.txt", { type: "text/plain" })); }
  else { addDocumentFromText("sample-wedding-plan.txt", SAMPLE_DOC); addMessage("system", "System", "Loaded sample doc. Ask @ai a question."); }
};

function renderManageVendors() {
  const list = document.getElementById("c-vendor-manage-list"); list.innerHTML = "";
  [{ name: "Golden Hour Studio", cat: "Photographer", c: "peach" }, { name: "Petal & Vine", cat: "Florist", c: "mint" }, { name: "Blue Note Events", cat: "DJ", c: "sky" }, { name: "Hearth Table", cat: "Caterer", c: "lavender" }].forEach(v => {
    const d = document.createElement("div"); d.className = "manage-item";
    d.innerHTML = `<div class="m-avatar-sm ${v.c}">${v.name.charAt(0)}</div><div><strong>${v.name}</strong><span class="muted sm">${v.cat}</span></div><button class="btn btn-ghost btn-tiny danger">Remove</button>`;
    list.appendChild(d);
  });
}

// ═══ BUDGET TRACKER ═══
async function loadBudgets() {
  const wid = getWeddingId();
  if (backendOnline) { try { state.budgets = await apiGet(`/api/budgets?wedding_id=${encodeURIComponent(wid)}`); } catch { state.budgets = getLocal(`budgets:${wid}`); } }
  else { state.budgets = getLocal(`budgets:${wid}`); }
  renderBudgetSidebar(); renderBudgetMain();
}

function renderBudgetSidebar() {
  const list = document.getElementById("c-budget-cat-list"); list.innerHTML = "";
  const totalAlloc = state.budgets.reduce((s, b) => s + (b.allocated_amount || 0), 0);
  const totalSpent = state.budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
  const remaining = totalAlloc - totalSpent;
  const pct = totalAlloc > 0 ? Math.min(100, (totalSpent / totalAlloc * 100)) : 0;

  document.getElementById("c-budget-remaining").textContent = `$${remaining.toLocaleString()}`;
  document.getElementById("c-budget-spent").textContent = `$${totalSpent.toLocaleString()}`;
  document.getElementById("c-budget-total").textContent = `$${totalAlloc.toLocaleString()}`;
  document.getElementById("c-budget-bar").style.width = `${pct}%`;

  if (!state.budgets.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="wallet"></i></div><p>No budget categories yet</p></div>';
    refreshIcons(); return;
  }
  state.budgets.forEach(b => {
    const d = document.createElement("div"); d.className = "budget-sidebar-item";
    const iconName = BUDGET_ICONS[b.category] || "wallet";
    const rem = b.allocated_amount - b.spent_amount;
    d.innerHTML = `<div class="bsi-icon"><i data-lucide="${iconName}"></i></div><div class="bsi-info"><strong>${esc(b.category)}</strong><span>$${b.spent_amount.toLocaleString()} / $${b.allocated_amount.toLocaleString()}</span></div><div class="bsi-amt"${rem < 0 ? ' style="color:var(--danger)"' : ''}>$${rem.toLocaleString()}</div>`;
    list.appendChild(d);
  });
  refreshIcons();
}

function renderBudgetMain() {
  const totalAlloc = state.budgets.reduce((s, b) => s + (b.allocated_amount || 0), 0);
  const totalSpent = state.budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
  document.getElementById("c-bo-allocated").textContent = `$${totalAlloc.toLocaleString()}`;
  document.getElementById("c-bo-spent").textContent = `$${totalSpent.toLocaleString()}`;
  document.getElementById("c-bo-remaining").textContent = `$${(totalAlloc - totalSpent).toLocaleString()}`;
  document.getElementById("c-bo-cats").textContent = state.budgets.length;

  const boOverview = document.getElementById("c-budget-overview");
  boOverview.querySelectorAll('.ai-flag').forEach(f => f.remove());
  const overCats = state.budgets.filter(b => b.spent_amount > b.allocated_amount);
  if (overCats.length) {
    const flag = document.createElement("div");
    flag.className = "ai-flag ai-flag-danger";
    flag.style.cssText = "grid-column:1/-1;text-align:center;margin-top:4px";
    flag.innerHTML = `<i data-lucide="alert-circle" class="flag-icon"></i> ${overCats.length} categor${overCats.length > 1 ? 'ies' : 'y'} over budget: ${overCats.map(b => b.category).join(", ")}`;
    flag.onclick = () => openCopilotForBudget(overCats);
    boOverview.appendChild(flag);
  } else if (totalAlloc > 0 && totalSpent / totalAlloc > 0.85) {
    const flag = document.createElement("div");
    flag.className = "ai-flag ai-flag-warn";
    flag.style.cssText = "grid-column:1/-1;text-align:center;margin-top:4px";
    flag.innerHTML = `<i data-lucide="alert-triangle" class="flag-icon"></i> Budget ${Math.round(totalSpent / totalAlloc * 100)}% used — click for optimization tips`;
    flag.onclick = () => openCopilotForHighSpend(totalAlloc, totalSpent);
    boOverview.appendChild(flag);
  }

  const breakdown = document.getElementById("c-budget-breakdown"); breakdown.innerHTML = "";
  if (!state.budgets.length) {
    breakdown.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="wallet"></i></div><p>Add budget categories to track your spending</p><p class="muted sm">Click "+ Category" to get started</p></div>';
    refreshIcons(); return;
  }

  state.budgets.forEach(b => {
    const pct = b.allocated_amount > 0 ? (b.spent_amount / b.allocated_amount * 100) : 0;
    const barClass = pct > 100 ? "over" : pct > 80 ? "warn" : "ok";
    const isOver = b.spent_amount > b.allocated_amount;
    const isNearLimit = pct > 80 && pct <= 100;
    const card = document.createElement("div");
    card.className = `budget-cat-card${isOver ? ' overdue-glow' : ''}`;
    const overAmt = b.spent_amount - b.allocated_amount;
    const aiFlag = isOver
      ? `<span class="ai-flag ai-flag-danger" onclick="event.stopPropagation(); openCopilotForCategory(${b.id})"><i data-lucide="alert-circle" class="flag-icon"></i> Over by $${overAmt.toLocaleString()} — click for solution</span>`
      : isNearLimit ? `<span class="ai-flag ai-flag-warn"><i data-lucide="alert-triangle" class="flag-icon"></i> ${Math.round(pct)}% used</span>` : '';
    card.innerHTML = `
      <div class="budget-cat-header"><h4>${esc(b.category)}</h4>${aiFlag}<div><button class="btn btn-ghost btn-tiny" onclick="showAddExpense(${b.id})">+ Expense</button> <button class="btn btn-ghost btn-tiny danger" onclick="deleteBudget(${b.id})"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button></div></div>
      <div class="budget-cat-bar"><div class="budget-cat-bar-fill ${barClass}" style="width:${Math.min(100, pct)}%"></div></div>
      <div class="budget-cat-stats"><span>Allocated: <strong>$${b.allocated_amount.toLocaleString()}</strong></span><span>Spent: <strong>$${b.spent_amount.toLocaleString()}</strong></span><span>Remaining: <strong${(b.allocated_amount - b.spent_amount) < 0 ? ' style="color:var(--danger)"' : ''}>$${(b.allocated_amount - b.spent_amount).toLocaleString()}</strong></span></div>
      <div class="budget-expenses" id="expenses-${b.id}"></div>`;
    breakdown.appendChild(card);
    loadExpensesForBudget(b.id);
  });
  refreshIcons();
}

async function loadExpensesForBudget(budgetId) {
  let expenses = [];
  if (backendOnline) { try { expenses = await apiGet(`/api/expenses?budget_id=${budgetId}`); } catch {} }
  else { expenses = getLocal(`expenses:${budgetId}`); }
  const container = document.getElementById(`expenses-${budgetId}`);
  if (!container) return;
  if (!expenses.length) { container.innerHTML = '<p class="muted sm" style="margin:4px 0">No expenses yet</p>'; return; }
  container.innerHTML = expenses.map(e => `
    <div class="expense-row"><div class="expense-info"><strong>${esc(e.description || "Expense")}</strong><span>${esc(e.vendor_name || "")} · ${new Date(e.created_at).toLocaleDateString()}</span></div><span class="expense-amt">$${e.amount.toLocaleString()}</span><button class="expense-del" onclick="deleteExpense(${e.id})"><i data-lucide="x" style="width:12px;height:12px"></i></button></div>
  `).join("");
  refreshIcons();
}

document.getElementById("c-add-budget-btn").onclick = () => { document.getElementById("c-add-budget-form").classList.toggle("hidden"); document.getElementById("c-add-expense-form").classList.add("hidden"); };
document.getElementById("c-cancel-budget").onclick = () => document.getElementById("c-add-budget-form").classList.add("hidden");
document.getElementById("c-save-budget").onclick = async () => {
  const cat = document.getElementById("c-new-budget-cat").value;
  const amt = parseFloat(document.getElementById("c-new-budget-amt").value) || 0;
  if (!cat) { alert("Select a category."); return; }
  if (backendOnline) { try { await apiPost("/api/budgets", { wedding_id: getWeddingId(), category: cat, allocated_amount: amt }); } catch {} }
  else {
    const budgets = getLocal(`budgets:${getWeddingId()}`);
    budgets.push({ id: Date.now(), wedding_id: getWeddingId(), category: cat, allocated_amount: amt, spent_amount: 0, created_at: new Date().toISOString() });
    setLocal(`budgets:${getWeddingId()}`, budgets);
  }
  document.getElementById("c-new-budget-cat").value = ""; document.getElementById("c-new-budget-amt").value = "";
  document.getElementById("c-add-budget-form").classList.add("hidden");
  addNotification("budget", "Budget Updated", `Added ${cat} category with $${amt.toLocaleString()} budget`);
  loadBudgets();
};

window.showAddExpense = function(budgetId) { document.getElementById("c-expense-budget-id").value = budgetId; document.getElementById("c-add-expense-form").classList.remove("hidden"); document.getElementById("c-add-budget-form").classList.add("hidden"); };
document.getElementById("c-cancel-expense").onclick = () => document.getElementById("c-add-expense-form").classList.add("hidden");
document.getElementById("c-save-expense").onclick = async () => {
  const budgetId = parseInt(document.getElementById("c-expense-budget-id").value);
  const vendor = document.getElementById("c-expense-vendor").value.trim();
  const amount = parseFloat(document.getElementById("c-expense-amount").value) || 0;
  const desc = document.getElementById("c-expense-desc").value.trim();
  if (!amount) { alert("Enter an amount."); return; }
  if (backendOnline) { try { await apiPost("/api/expenses", { budget_id: budgetId, wedding_id: getWeddingId(), vendor_name: vendor, amount, description: desc }); } catch {} }
  else {
    const expenses = getLocal(`expenses:${budgetId}`);
    expenses.push({ id: Date.now(), budget_id: budgetId, wedding_id: getWeddingId(), vendor_name: vendor, amount, description: desc, created_at: new Date().toISOString() });
    setLocal(`expenses:${budgetId}`, expenses);
    const budgets = getLocal(`budgets:${getWeddingId()}`);
    const b = budgets.find(x => x.id === budgetId);
    if (b) { b.spent_amount = (b.spent_amount || 0) + amount; setLocal(`budgets:${getWeddingId()}`, budgets); }
  }
  ["c-expense-vendor","c-expense-amount","c-expense-desc"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("c-add-expense-form").classList.add("hidden");
  loadBudgets();
};

window.deleteBudget = async function(id) {
  if (!confirm("Delete this budget category and all its expenses?")) return;
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/budgets/${id}`, { method: "DELETE" }); } catch {} }
  else { let budgets = getLocal(`budgets:${getWeddingId()}`); budgets = budgets.filter(b => b.id !== id); setLocal(`budgets:${getWeddingId()}`, budgets); }
  loadBudgets();
};

window.deleteExpense = async function(id) {
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/expenses/${id}`, { method: "DELETE" }); } catch {} }
  else {
    const wid = getWeddingId(), budgets = getLocal(`budgets:${wid}`);
    for (const b of budgets) {
      let expenses = getLocal(`expenses:${b.id}`);
      const exp = expenses.find(e => e.id === id);
      if (exp) { expenses = expenses.filter(e => e.id !== id); setLocal(`expenses:${b.id}`, expenses); b.spent_amount = expenses.reduce((s, e) => s + (e.amount || 0), 0); setLocal(`budgets:${wid}`, budgets); break; }
    }
  }
  loadBudgets();
};

// ═══ TASKS / TIMELINE ═══
async function loadTasks() {
  const wid = getWeddingId();
  if (backendOnline) { try { state.tasks = await apiGet(`/api/tasks?wedding_id=${encodeURIComponent(wid)}`); } catch { state.tasks = getLocal(`tasks:${wid}`); } }
  else { state.tasks = getLocal(`tasks:${wid}`); }
  renderTaskSidebar(); renderTaskBoard();
}

function renderTaskSidebar() {
  const list = document.getElementById("c-task-sidebar-list"); list.innerHTML = "";
  const total = state.tasks.length, done = state.tasks.filter(t => t.status === "completed").length;
  const overdue = state.tasks.filter(t => t.status !== "completed" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)).length;
  const pct = total > 0 ? Math.round(done / total * 100) : 0;
  document.getElementById("c-task-ring").setAttribute("stroke-dasharray", `${pct}, 100`);
  document.getElementById("c-task-pct").textContent = `${pct}%`;
  document.getElementById("c-tasks-done").textContent = done;
  document.getElementById("c-tasks-total").textContent = total;
  if (overdue > 0) { document.getElementById("c-tasks-overdue-label").style.display = ""; document.getElementById("c-tasks-overdue").textContent = overdue; }
  else { document.getElementById("c-tasks-overdue-label").style.display = "none"; }

  if (!state.tasks.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="check-circle"></i></div><p>No tasks yet</p></div>'; refreshIcons(); return; }
  state.tasks.slice(0, 15).forEach(t => {
    const d = document.createElement("div"); d.className = "task-sidebar-item";
    const isDone = t.status === "completed";
    d.innerHTML = `<div class="tsi-check ${isDone ? 'done' : ''}" data-task-id="${t.id}">${isDone ? '✓' : ''}</div><div class="tsi-info"><strong>${esc(t.title)}</strong><span>${t.due_date || 'No date'} · ${t.assigned_to || 'Unassigned'}</span></div><span class="tsi-priority ${t.priority}">${t.priority}</span>`;
    d.querySelector(".tsi-check").onclick = (e) => { e.stopPropagation(); toggleTask(t.id, isDone); };
    list.appendChild(d);
  });
  refreshIcons();
}

let activeTaskFilter = "all";
document.querySelectorAll("#c-task-filters .filter-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("#c-task-filters .filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active"); activeTaskFilter = tab.dataset.filter; renderTaskBoard();
  });
});

function renderTaskBoard() {
  const board = document.getElementById("c-task-board"); board.innerHTML = "";
  let filtered = state.tasks;
  const today = new Date().toISOString().slice(0, 10);
  if (activeTaskFilter === "overdue") filtered = state.tasks.filter(t => t.status !== "completed" && t.due_date && t.due_date < today);
  else if (activeTaskFilter !== "all") filtered = state.tasks.filter(t => t.status === activeTaskFilter);

  if (!filtered.length) { board.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="clipboard-list"></i></div><p>No tasks here</p></div>'; refreshIcons(); return; }

  filtered.forEach(t => {
    const isDone = t.status === "completed";
    const isOverdue = !isDone && t.due_date && t.due_date < today;
    const displayStatus = isOverdue ? "overdue" : t.status;
    const daysOverdue = isOverdue ? Math.ceil((new Date(today) - new Date(t.due_date)) / 86400000) : 0;
    const card = document.createElement("div");
    card.className = `task-card${isOverdue ? ' overdue-glow' : ''}`;
    const aiFlag = isOverdue ? `<span class="ai-flag ai-flag-danger" onclick="event.stopPropagation(); openCopilotForTask(${t.id})"><i data-lucide="alert-circle" class="flag-icon"></i> ${daysOverdue}d overdue — click for action</span>` : (t.priority === 'urgent' && !isDone) ? `<span class="ai-flag ai-flag-warn"><i data-lucide="zap" class="flag-icon"></i> Urgent</span>` : '';
    card.innerHTML = `
      <div class="tc-check ${isDone ? 'done' : ''}" onclick="toggleTask(${t.id}, ${isDone})">${isDone ? '✓' : ''}</div>
      <div class="tc-body">
        <p class="tc-title ${isDone ? 'completed' : ''}">${esc(t.title)}</p>
        ${t.description ? `<p class="tc-desc">${esc(t.description)}</p>` : ''}
        <div class="tc-meta">${aiFlag}<span class="tc-pill ${t.priority}">${t.priority}</span><span class="tc-pill status-${displayStatus}">${displayStatus.replace('_', ' ')}</span>${t.due_date ? `<span class="muted sm">Due: ${t.due_date}</span>` : ''}${t.assigned_to ? `<span class="muted sm">&rarr; ${esc(t.assigned_to)}</span>` : ''}${t.category ? `<span class="pill">${esc(t.category)}</span>` : ''}</div>
      </div>
      <div class="tc-actions"><button onclick="deleteTaskItem(${t.id})" title="Delete"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>`;
    board.appendChild(card);
  });
  refreshIcons();
}

window.toggleTask = async function(id, currentlyDone) {
  const newStatus = currentlyDone ? "pending" : "completed";
  if (backendOnline) { try { await apiPut(`/api/tasks/${id}`, { status: newStatus }); } catch {} }
  else { const tasks = getLocal(`tasks:${getWeddingId()}`); const t = tasks.find(x => x.id === id); if (t) { t.status = newStatus; setLocal(`tasks:${getWeddingId()}`, tasks); } }
  loadTasks();
};

window.deleteTaskItem = async function(id) {
  if (!confirm("Delete this task?")) return;
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/tasks/${id}`, { method: "DELETE" }); } catch {} }
  else { let tasks = getLocal(`tasks:${getWeddingId()}`); tasks = tasks.filter(t => t.id !== id); setLocal(`tasks:${getWeddingId()}`, tasks); }
  loadTasks();
};

document.getElementById("c-add-task-btn").onclick = () => { document.getElementById("c-add-task-form").classList.toggle("hidden"); document.getElementById("c-add-event-form").classList.add("hidden"); };
document.getElementById("c-cancel-task").onclick = () => document.getElementById("c-add-task-form").classList.add("hidden");
document.getElementById("c-save-task").onclick = async () => {
  const title = document.getElementById("c-task-title").value.trim();
  if (!title) { alert("Enter a task title."); return; }
  const taskData = { wedding_id: getWeddingId(), title, description: document.getElementById("c-task-desc").value.trim(), due_date: document.getElementById("c-task-due").value, priority: document.getElementById("c-task-priority").value, assigned_to: document.getElementById("c-task-assigned").value.trim(), category: document.getElementById("c-task-category").value.trim(), status: "pending" };
  if (backendOnline) { try { await apiPost("/api/tasks", taskData); } catch {} }
  else { const tasks = getLocal(`tasks:${getWeddingId()}`); tasks.push({ ...taskData, id: Date.now(), created_at: new Date().toISOString() }); setLocal(`tasks:${getWeddingId()}`, tasks); }
  ["c-task-title","c-task-desc","c-task-due","c-task-assigned","c-task-category"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("c-task-priority").value = "medium";
  document.getElementById("c-add-task-form").classList.add("hidden");
  addNotification("task", "Task Added", `"${title}" added to your timeline`);
  loadTasks();
};

// ═══ EVENTS ═══
async function loadEvents() {
  const wid = getWeddingId();
  if (backendOnline) { try { state.events = await apiGet(`/api/events?wedding_id=${encodeURIComponent(wid)}`); } catch { state.events = getLocal(`events:${wid}`); } }
  else { state.events = getLocal(`events:${wid}`); }
  renderEventsTimeline();
}

function renderEventsTimeline() {
  const container = document.getElementById("c-events-timeline"), heading = document.getElementById("c-events-heading");
  container.innerHTML = "";
  if (!state.events.length) { heading.style.display = "none"; return; }
  heading.style.display = "";
  state.events.forEach(e => {
    const card = document.createElement("div"); card.className = "event-card";
    card.innerHTML = `<p class="ec-time"><i data-lucide="clock" style="width:13px;height:13px"></i> ${e.start_time || '?'} – ${e.end_time || '?'}</p><p class="ec-name">${esc(e.name)}</p><p class="ec-detail">${[e.vendor_name, e.location].filter(Boolean).map(esc).join(" · ") || 'No details'}</p>${e.notes ? `<p class="ec-detail" style="margin-top:3px">${esc(e.notes)}</p>` : ''}<div class="ec-actions"><button onclick="deleteEvent(${e.id})" title="Delete"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></div>`;
    container.appendChild(card);
  });
  refreshIcons();
}

window.deleteEvent = async function(id) {
  if (!confirm("Delete this event?")) return;
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/events/${id}`, { method: "DELETE" }); } catch {} }
  else { let events = getLocal(`events:${getWeddingId()}`); events = events.filter(e => e.id !== id); setLocal(`events:${getWeddingId()}`, events); }
  loadEvents();
};

document.getElementById("c-add-event-btn").onclick = () => { document.getElementById("c-add-event-form").classList.toggle("hidden"); document.getElementById("c-add-task-form").classList.add("hidden"); };
document.getElementById("c-cancel-event").onclick = () => document.getElementById("c-add-event-form").classList.add("hidden");
document.getElementById("c-save-event").onclick = async () => {
  const name = document.getElementById("c-event-name").value.trim();
  if (!name) { alert("Enter event name."); return; }
  const eventData = { wedding_id: getWeddingId(), name, start_time: document.getElementById("c-event-start").value, end_time: document.getElementById("c-event-end").value, vendor_name: document.getElementById("c-event-vendor").value.trim(), location: document.getElementById("c-event-location").value.trim(), notes: document.getElementById("c-event-notes").value.trim() };
  if (backendOnline) { try { await apiPost("/api/events", eventData); } catch {} }
  else { const events = getLocal(`events:${getWeddingId()}`); events.push({ ...eventData, id: Date.now(), created_at: new Date().toISOString() }); setLocal(`events:${getWeddingId()}`, events); }
  ["c-event-name","c-event-start","c-event-end","c-event-vendor","c-event-location","c-event-notes"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("c-add-event-form").classList.add("hidden");
  loadEvents();
};

// ═══ GUEST LIST ═══
async function loadGuests() {
  const wid = getWeddingId();
  if (backendOnline) { try { state.guests = await apiGet(`/api/guests?wedding_id=${encodeURIComponent(wid)}`); } catch { state.guests = getLocal(`guests:${wid}`); } }
  else { state.guests = getLocal(`guests:${wid}`); }
  renderGuestSidebar(); renderGuestTable();
}

function renderGuestSidebar() {
  const attending = state.guests.filter(g => g.rsvp_status === "attending").length;
  const pending = state.guests.filter(g => g.rsvp_status === "pending").length;
  const declined = state.guests.filter(g => g.rsvp_status === "declined").length;
  document.getElementById("c-guests-attending").textContent = attending;
  document.getElementById("c-guests-pending").textContent = pending;
  document.getElementById("c-guests-declined").textContent = declined;
  document.getElementById("c-guests-total").textContent = state.guests.length;

  const list = document.getElementById("c-guest-sidebar-list"); list.innerHTML = "";
  if (!state.guests.length) { list.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="users"></i></div><p>No guests added yet</p></div>'; refreshIcons(); return; }
  state.guests.slice(0, 20).forEach(g => {
    const d = document.createElement("div"); d.className = "guest-sidebar-item";
    d.innerHTML = `<div class="gsi-avatar">${g.name.charAt(0).toUpperCase()}</div><div class="gsi-info"><strong>${esc(g.name)}</strong></div><span class="gsi-rsvp ${g.rsvp_status}">${g.rsvp_status}</span>`;
    list.appendChild(d);
  });
}

let activeGuestFilter = "all";
document.querySelectorAll("#c-guest-filters .filter-tab").forEach(tab => {
  tab.addEventListener("click", () => { document.querySelectorAll("#c-guest-filters .filter-tab").forEach(t => t.classList.remove("active")); tab.classList.add("active"); activeGuestFilter = tab.dataset.filter; renderGuestTable(); });
});

function renderGuestTable() {
  const container = document.getElementById("c-guest-table");
  const attending = state.guests.filter(g => g.rsvp_status === "attending");
  const plusOnes = attending.reduce((s, g) => s + (g.plus_one || 0), 0);
  const pendingCount = state.guests.filter(g => g.rsvp_status === "pending").length;
  const declinedCount = state.guests.filter(g => g.rsvp_status === "declined").length;
  document.getElementById("c-go-attending").textContent = attending.length;
  document.getElementById("c-go-pending").textContent = pendingCount;
  document.getElementById("c-go-declined").textContent = declinedCount;
  document.getElementById("c-go-total-seats").textContent = attending.length + plusOnes;

  const goOverview = document.getElementById("c-guest-overview");
  goOverview.querySelectorAll('.ai-flag').forEach(f => f.remove());
  if (pendingCount >= 5) {
    const flag = document.createElement("div");
    flag.className = "ai-flag ai-flag-warn";
    flag.style.cssText = "grid-column:1/-1;text-align:center;margin-top:4px";
    flag.innerHTML = `<i data-lucide="mail" class="flag-icon"></i> ${pendingCount} RSVPs pending — click to send reminders`;
    flag.onclick = () => openCopilotForRSVP(pendingCount);
    goOverview.appendChild(flag);
  }

  const mealMap = {};
  attending.forEach(g => { if (g.meal_preference) mealMap[g.meal_preference] = (mealMap[g.meal_preference] || 0) + 1; });
  const mealBreakdown = document.getElementById("c-meal-breakdown"), mealList = document.getElementById("c-meal-list");
  if (Object.keys(mealMap).length) { mealBreakdown.classList.remove("hidden"); mealList.innerHTML = Object.entries(mealMap).map(([meal, cnt]) => `<div class="meal-chip"><strong>${cnt}</strong> ${esc(meal)}</div>`).join(""); }
  else { mealBreakdown.classList.add("hidden"); }

  let filtered = state.guests;
  if (activeGuestFilter !== "all") filtered = state.guests.filter(g => g.rsvp_status === activeGuestFilter);
  if (!filtered.length) { container.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="users"></i></div><p>No guests to show</p></div>'; refreshIcons(); return; }

  let html = '<table class="guest-table"><thead><tr><th>Name</th><th>RSVP</th><th>Meal</th><th>Group</th><th>+1</th><th></th></tr></thead><tbody>';
  filtered.forEach(g => {
    html += `<tr><td class="guest-name">${esc(g.name)}</td><td><select class="guest-rsvp-select rsvp-badge ${g.rsvp_status}" onchange="updateGuestRSVP(${g.id}, this.value)"><option value="pending" ${g.rsvp_status === 'pending' ? 'selected' : ''}>Pending</option><option value="attending" ${g.rsvp_status === 'attending' ? 'selected' : ''}>Attending</option><option value="declined" ${g.rsvp_status === 'declined' ? 'selected' : ''}>Declined</option><option value="maybe" ${g.rsvp_status === 'maybe' ? 'selected' : ''}>Maybe</option></select></td><td>${esc(g.meal_preference || '—')}</td><td>${esc(g.group_name || '—')}</td><td>${g.plus_one ? 'Yes' : '—'}</td><td class="guest-actions"><button onclick="deleteGuest(${g.id})"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></td></tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  refreshIcons();
}

window.updateGuestRSVP = async function(id, newStatus) {
  if (backendOnline) { try { await apiPut(`/api/guests/${id}`, { rsvp_status: newStatus }); } catch {} }
  else { const guests = getLocal(`guests:${getWeddingId()}`); const g = guests.find(x => x.id === id); if (g) { g.rsvp_status = newStatus; setLocal(`guests:${getWeddingId()}`, guests); } }
  loadGuests();
};

window.deleteGuest = async function(id) {
  if (!confirm("Remove this guest?")) return;
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/guests/${id}`, { method: "DELETE" }); } catch {} }
  else { let guests = getLocal(`guests:${getWeddingId()}`); guests = guests.filter(g => g.id !== id); setLocal(`guests:${getWeddingId()}`, guests); }
  loadGuests();
};

document.getElementById("c-add-guest-btn").onclick = () => document.getElementById("c-add-guest-form").classList.toggle("hidden");
document.getElementById("c-cancel-guest").onclick = () => document.getElementById("c-add-guest-form").classList.add("hidden");
document.getElementById("c-save-guest").onclick = async () => {
  const name = document.getElementById("c-guest-name").value.trim();
  if (!name) { alert("Enter guest name."); return; }
  const guestData = { wedding_id: getWeddingId(), name, email: document.getElementById("c-guest-email").value.trim(), phone: document.getElementById("c-guest-phone").value.trim(), rsvp_status: document.getElementById("c-guest-rsvp").value, meal_preference: document.getElementById("c-guest-meal").value, plus_one: parseInt(document.getElementById("c-guest-plusone").value) || 0, table_number: parseInt(document.getElementById("c-guest-table-num").value) || null, group_name: document.getElementById("c-guest-group").value.trim() };
  if (backendOnline) { try { await apiPost("/api/guests", guestData); } catch {} }
  else { const guests = getLocal(`guests:${getWeddingId()}`); guests.push({ ...guestData, id: Date.now(), created_at: new Date().toISOString() }); setLocal(`guests:${getWeddingId()}`, guests); }
  ["c-guest-name","c-guest-email","c-guest-phone","c-guest-group","c-guest-table-num"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("c-guest-rsvp").value = "pending"; document.getElementById("c-guest-meal").value = ""; document.getElementById("c-guest-plusone").value = "0";
  document.getElementById("c-add-guest-form").classList.add("hidden");
  loadGuests();
};

// ═══ MARKETPLACE ═══
async function loadMarketplace() {
  if (backendOnline) { try { state.marketplaceVendors = await apiGet("/api/marketplace/vendors"); } catch { state.marketplaceVendors = []; } }
  renderMarketplaceGrid();
}

document.getElementById("c-mp-search").addEventListener("input", debounce(loadMarketplaceFiltered, 300));
document.getElementById("c-mp-cat-filter").addEventListener("change", loadMarketplaceFiltered);
document.getElementById("c-mp-sort").addEventListener("change", loadMarketplaceFiltered);

async function loadMarketplaceFiltered() {
  if (!backendOnline) { renderMarketplaceGrid(); return; }
  const search = document.getElementById("c-mp-search").value.trim(), cat = document.getElementById("c-mp-cat-filter").value, sort = document.getElementById("c-mp-sort").value;
  const params = new URLSearchParams(); if (search) params.set("search", search); if (cat) params.set("category", cat); params.set("sort", sort);
  try { state.marketplaceVendors = await apiGet(`/api/marketplace/vendors?${params}`); } catch {}
  renderMarketplaceGrid();
}

const CAT_COLORS = { photographer: "peach", videographer: "sky", florist: "mint", caterer: "lavender", "dj-music": "sky", planner: "blush", venue: "peach", bakery: "mint", "makeup-hair": "blush", "decor-rentals": "lavender", officiant: "peach" };

function renderMarketplaceGrid() {
  const grid = document.getElementById("c-mp-grid"), sideList = document.getElementById("c-mp-vendor-list");
  grid.innerHTML = ""; sideList.innerHTML = "";
  if (!state.marketplaceVendors.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><i data-lucide="compass"></i></div><p>No vendors found</p><p class="muted sm">Try different search terms or start the backend for marketplace data</p></div>';
    sideList.innerHTML = '<div class="empty-state"><p class="muted sm">Start backend for vendor data</p></div>';
    refreshIcons(); return;
  }
  state.marketplaceVendors.forEach(v => {
    const color = CAT_COLORS[v.category] || "lavender";
    const isCompare = state.compareList.includes(v.id);
    const card = document.createElement("div"); card.className = `mp-card${v.featured ? ' featured' : ''}`;
    card.innerHTML = `${v.featured ? '<span class="mp-featured">Featured</span>' : ''}<div class="mp-compare-check ${isCompare ? 'checked' : ''}" onclick="event.stopPropagation(); toggleCompare(${v.id})">✓</div><div class="mp-avatar m-avatar ${color}">${v.name.charAt(0)}</div><p class="mp-name">${esc(v.name)}</p><p class="mp-cat">${fmtCat(v.category)}</p><p class="mp-desc">${esc(v.description || '')}</p><div class="mp-bottom"><span class="mp-price">$${(v.price_min || 0).toLocaleString()} – $${(v.price_max || 0).toLocaleString()}</span><span class="mp-rating"><span class="star-sm">★</span> ${v.rating} (${v.review_count})</span></div>`;
    card.onclick = () => showVendorDetail(v.id);
    grid.appendChild(card);
    const si = document.createElement("div"); si.className = "m-chat-item"; si.style.cursor = "pointer";
    si.innerHTML = `<div class="m-avatar ${color}">${v.name.charAt(0)}</div><div class="m-chat-info"><strong>${esc(v.name)}</strong><span>★ ${v.rating} · ${fmtCat(v.category)}</span></div>`;
    si.onclick = () => showVendorDetail(v.id);
    sideList.appendChild(si);
  });
  document.getElementById("c-mp-compare-count").textContent = state.compareList.length;
  document.getElementById("c-mp-compare-btn").style.display = state.compareList.length >= 2 ? "" : "none";
  refreshIcons();
}

window.toggleCompare = function(id) {
  const idx = state.compareList.indexOf(id);
  if (idx >= 0) state.compareList.splice(idx, 1);
  else if (state.compareList.length < 4) state.compareList.push(id);
  else { alert("Max 4 vendors."); return; }
  renderMarketplaceGrid();
};

document.getElementById("c-mp-compare-btn").onclick = async () => {
  if (state.compareList.length < 2) return;
  let vendors = [];
  if (backendOnline) { try { vendors = await apiGet(`/api/marketplace/compare?ids=${state.compareList.join(",")}`); } catch {} }
  if (!vendors.length) vendors = state.marketplaceVendors.filter(v => state.compareList.includes(v.id));
  renderCompareTable(vendors);
  document.querySelectorAll("#view-couple .main-panel").forEach(mp => mp.classList.remove("active"));
  document.getElementById("c-main-compare").classList.add("active");
};
document.getElementById("c-compare-back").onclick = () => switchTab("discover");

function renderCompareTable(vendors) {
  const container = document.getElementById("c-compare-table");
  if (!vendors.length) { container.innerHTML = "<p>No vendors to compare.</p>"; return; }
  let html = '<table class="compare-table"><thead><tr><th>Attribute</th>';
  vendors.forEach(v => html += `<th>${esc(v.name)}</th>`);
  html += '</tr></thead><tbody>';
  [["Category", v => fmtCat(v.category)],["Location", v => v.location || "—"],["Price Range", v => `$${(v.price_min || 0).toLocaleString()} – $${(v.price_max || 0).toLocaleString()}`],["Rating", v => `★ ${v.rating}`],["Reviews", v => v.review_count],["Description", v => esc(v.description || '—')]].forEach(([label, fn]) => {
    html += `<tr><td><strong>${label}</strong></td>`; vendors.forEach(v => html += `<td>${fn(v)}</td>`); html += '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

async function showVendorDetail(id) {
  const panel = document.getElementById("c-vendor-detail"), content = document.getElementById("c-vendor-detail-content");
  let vendor, reviews = [];
  if (backendOnline) { try { const data = await apiGet(`/api/marketplace/vendors/${id}`); vendor = data.vendor; reviews = data.reviews || []; } catch { vendor = state.marketplaceVendors.find(v => v.id === id); } }
  else { vendor = state.marketplaceVendors.find(v => v.id === id); }
  if (!vendor) return;
  const color = CAT_COLORS[vendor.category] || "lavender";
  content.innerHTML = `<div class="vd-header"><div class="vd-avatar m-avatar ${color}" style="width:60px;height:60px;font-size:1.5rem">${vendor.name.charAt(0)}</div><div class="vd-info"><h2>${esc(vendor.name)}</h2><p class="mp-cat">${fmtCat(vendor.category)}</p><p class="mp-rating"><span class="star-sm">★</span> ${vendor.rating} · ${vendor.review_count} reviews</p></div></div><div class="vd-stats"><div class="vd-stat"><strong>$${(vendor.price_min || 0).toLocaleString()}</strong><span>Starting at</span></div><div class="vd-stat"><strong>$${(vendor.price_max || 0).toLocaleString()}</strong><span>Up to</span></div><div class="vd-stat"><strong>${vendor.rating}</strong><span>Rating</span></div></div><div class="vd-section"><h3>About</h3><p>${esc(vendor.description || 'No description.')}</p></div><div class="vd-section"><h3>Contact</h3><div class="vd-contact">${vendor.phone ? `<span><i data-lucide="phone" style="width:14px;height:14px"></i> ${esc(vendor.phone)}</span>` : ''}${vendor.website ? `<span><i data-lucide="globe" style="width:14px;height:14px"></i> <a href="${vendor.website}" target="_blank">${esc(vendor.website)}</a></span>` : ''}${vendor.location ? `<span><i data-lucide="map-pin" style="width:14px;height:14px"></i> ${esc(vendor.location)}</span>` : ''}</div></div>`;
  panel.classList.remove("hidden");
  refreshIcons();
}
document.getElementById("c-vendor-detail-close").onclick = () => document.getElementById("c-vendor-detail").classList.add("hidden");

// ═══ NOTIFICATIONS ═══
async function loadNotifications() {
  const wid = getWeddingId();
  if (backendOnline) { try { const data = await apiGet(`/api/notifications?wedding_id=${encodeURIComponent(wid)}`); state.notifications = data.notifications || []; state.unreadNotifs = data.unread || 0; } catch { state.notifications = getLocal(`notifs:${wid}`); state.unreadNotifs = state.notifications.filter(n => !n.read_status).length; } }
  else { state.notifications = getLocal(`notifs:${wid}`); state.unreadNotifs = state.notifications.filter(n => !n.read_status).length; }
  renderNotifications();
}

function renderNotifications() {
  const badge = document.getElementById("c-notif-badge");
  if (state.unreadNotifs > 0) { badge.textContent = state.unreadNotifs; badge.classList.remove("hidden"); } else { badge.classList.add("hidden"); }
  const list = document.getElementById("c-notif-list");
  if (!state.notifications.length) { list.innerHTML = '<p class="muted sm" style="padding:10px">No notifications yet.</p>'; return; }
  list.innerHTML = state.notifications.slice(0, 20).map(n => `<div class="notif-item ${n.read_status ? '' : 'unread'}" onclick="markNotifRead(${n.id})"><p class="notif-title">${esc(n.title)}</p><p class="notif-msg">${esc(n.message || '')}</p><p class="notif-time">${timeAgo(new Date(n.created_at))}</p></div>`).join("");
}

window.markNotifRead = async function(id) {
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, { method: "PUT" }); } catch {} }
  loadNotifications();
};

document.getElementById("c-notif-read-all").onclick = async () => {
  if (backendOnline) { try { await fetch(`${BACKEND_URL}/api/notifications/read-all?wedding_id=${encodeURIComponent(getWeddingId())}`, { method: "PUT" }); } catch {} }
  else { const notifs = getLocal(`notifs:${getWeddingId()}`); notifs.forEach(n => n.read_status = 1); setLocal(`notifs:${getWeddingId()}`, notifs); }
  loadNotifications();
};

async function addNotification(type, title, message) {
  if (backendOnline) { try { await apiPost("/api/notifications", { wedding_id: getWeddingId(), type, title, message }); } catch {} }
  else { const notifs = getLocal(`notifs:${getWeddingId()}`); notifs.unshift({ id: Date.now(), wedding_id: getWeddingId(), type, title, message, read_status: 0, created_at: new Date().toISOString() }); setLocal(`notifs:${getWeddingId()}`, notifs); }
  loadNotifications();
}

// ═══ AI COPILOT SUGGESTIONS ═══
async function fetchAISuggestions() {
  if (backendOnline) { try { const data = await apiPost("/api/ai-suggestions", { wedding_id: getWeddingId() }); if (data.suggestions && data.suggestions.length) { renderSuggestions(data.suggestions); return; } } catch {} }
  const suggestions = [];
  const totalAlloc = state.budgets.reduce((s, b) => s + (b.allocated_amount || 0), 0);
  const totalSpent = state.budgets.reduce((s, b) => s + (b.spent_amount || 0), 0);
  const overBudgets = state.budgets.filter(b => b.spent_amount > b.allocated_amount);
  const today = new Date().toISOString().slice(0, 10);
  const overdueTasks = state.tasks.filter(t => t.status !== "completed" && t.due_date && t.due_date < today);
  const pendingGuests = state.guests.filter(g => g.rsvp_status === "pending");

  if (overBudgets.length) suggestions.push({ type: "warning", title: "Budget Overage", message: `${overBudgets.map(b => b.category).join(", ")} over budget. Click for optimization plan.`, action: "budget_over", data: overBudgets });
  if (overdueTasks.length) suggestions.push({ type: "warning", title: `${overdueTasks.length} Overdue Tasks`, message: `${overdueTasks.map(t => '"' + t.title + '"').slice(0, 3).join(", ")} need attention.`, action: "tasks_overdue", data: overdueTasks });
  if (pendingGuests.length >= 5) suggestions.push({ type: "tip", title: "RSVP Reminders", message: `${pendingGuests.length} guests haven't responded. Click to draft reminders.`, action: "rsvp_remind", data: pendingGuests });
  if (totalAlloc > 0 && totalSpent / totalAlloc > 0.75) suggestions.push({ type: "tip", title: "Budget Progress", message: `${Math.round(totalSpent / totalAlloc * 100)}% used. Click for savings tips.`, action: "budget_progress", data: { totalAlloc, totalSpent } });
  const incompleteTasks = state.tasks.filter(t => t.status !== "completed").length;
  if (state.tasks.length > 0) suggestions.push({ type: "success", title: "Task Progress", message: `${state.tasks.length - incompleteTasks} of ${state.tasks.length} completed (${Math.round((state.tasks.length - incompleteTasks) / state.tasks.length * 100)}%)`, action: null });

  state.copilotSuggestions = suggestions;
  if (suggestions.length) renderSuggestions(suggestions);
}

function renderSuggestions(suggestions) {
  const bar = document.getElementById("c-suggestions-bar"), list = document.getElementById("c-suggestions-list");
  list.innerHTML = "";
  if (!suggestions.length) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const iconMap = { warning: "alert-triangle", tip: "lightbulb", reminder: "bell", success: "check-circle" };
  suggestions.forEach((s, idx) => {
    const chip = document.createElement("div");
    chip.className = `suggestion-chip ${s.type || 'tip'}`;
    const iconName = iconMap[s.type] || "lightbulb";
    chip.innerHTML = `<strong><i data-lucide="${iconName}" class="chip-icon"></i> ${esc(s.title)}</strong><p>${esc(s.message)}</p>${s.action ? '<div class="chip-action"><i data-lucide="arrow-right" style="width:10px;height:10px"></i> Click for solution</div>' : ''}`;
    if (s.action) chip.onclick = () => openCopilotModal(s);
    list.appendChild(chip);
  });
  refreshIcons();
}

document.getElementById("c-suggestions-close").onclick = () => document.getElementById("c-suggestions-bar").classList.add("hidden");

// ═══ AI COPILOT MODAL ═══
function openCopilotModal(suggestion) {
  state.pendingCopilotAction = suggestion;
  const modal = document.getElementById("c-copilot-modal");
  const issueDiv = document.getElementById("copilot-issue");
  const solutionDiv = document.getElementById("copilot-solution-text");
  const actionsDiv = document.getElementById("copilot-action-items");

  let issueText = '', solutionText = '', actions = [];

  switch (suggestion.action) {
    case "budget_over": {
      const cats = suggestion.data;
      issueText = `<strong>Budget Overage Detected</strong><br>${cats.map(b => `${b.category}: $${b.spent_amount.toLocaleString()} spent of $${b.allocated_amount.toLocaleString()} allocated (over by $${(b.spent_amount - b.allocated_amount).toLocaleString()})`).join('<br>')}`;
      const underBudget = state.budgets.filter(b => b.spent_amount < b.allocated_amount * 0.6);
      solutionText = `Reallocate funds from underutilized categories to cover the overage. `;
      if (underBudget.length) solutionText += `Categories with room: ${underBudget.map(b => `${b.category} ($${(b.allocated_amount - b.spent_amount).toLocaleString()} remaining)`).join(', ')}.`;
      actions = cats.map(b => ({ label: `Increase ${b.category} budget by $${(b.spent_amount - b.allocated_amount).toLocaleString()}`, type: "increase_budget", data: b }));
      if (underBudget.length) actions.push({ label: `Redistribute from ${underBudget[0].category}`, type: "redistribute", data: { from: underBudget[0], to: cats[0] } });
      break;
    }
    case "tasks_overdue": {
      const tasks = suggestion.data;
      issueText = `<strong>${tasks.length} Overdue Tasks</strong><br>${tasks.map(t => `"${t.title}" — due ${t.due_date}, assigned to ${t.assigned_to || 'Unassigned'}`).join('<br>')}`;
      solutionText = `Reprioritize overdue tasks. Consider reassigning or extending deadlines for less critical items. Mark completed items to keep your timeline accurate.`;
      actions = tasks.slice(0, 3).map(t => ({ label: `Mark "${t.title}" as in progress`, type: "update_task", data: { id: t.id, status: "in_progress" } }));
      actions.push({ label: "Extend all overdue deadlines by 7 days", type: "extend_deadlines", data: tasks });
      break;
    }
    case "rsvp_remind": {
      const guests = suggestion.data;
      issueText = `<strong>${guests.length} Pending RSVPs</strong><br>Guests who haven't responded: ${guests.slice(0, 5).map(g => g.name).join(', ')}${guests.length > 5 ? ` and ${guests.length - 5} more` : ''}`;
      solutionText = `Send personalized follow-up reminders to pending guests. Consider reaching out via phone to close contacts and email for others. Set a final RSVP deadline 3 weeks before the wedding.`;
      actions = [{ label: "Create task: Send RSVP reminders", type: "create_task", data: { title: "Send RSVP follow-up reminders", description: `Contact ${guests.length} pending guests: ${guests.map(g => g.name).join(', ')}`, priority: "high", category: "Guests" } }];
      break;
    }
    case "budget_progress": {
      const { totalAlloc, totalSpent } = suggestion.data;
      issueText = `<strong>Budget ${Math.round(totalSpent / totalAlloc * 100)}% Used</strong><br>$${totalSpent.toLocaleString()} spent of $${totalAlloc.toLocaleString()} total budget. $${(totalAlloc - totalSpent).toLocaleString()} remaining.`;
      const bigSpenders = state.budgets.filter(b => b.spent_amount / b.allocated_amount > 0.8 && b.spent_amount <= b.allocated_amount).sort((a, b) => b.spent_amount / b.allocated_amount - a.spent_amount / a.allocated_amount);
      solutionText = `Monitor high-spend categories closely. ${bigSpenders.length ? `Watch: ${bigSpenders.map(b => `${b.category} (${Math.round(b.spent_amount / b.allocated_amount * 100)}%)`).join(', ')}` : 'All categories are within healthy ranges.'}`;
      actions = [{ label: "Review budget breakdown", type: "switch_tab", data: "budget" }];
      break;
    }
    default:
      issueText = `<strong>${suggestion.title}</strong><br>${suggestion.message}`;
      solutionText = "Review the details and take appropriate action.";
  }

  issueDiv.innerHTML = issueText;
  solutionDiv.innerHTML = solutionText;
  actionsDiv.innerHTML = actions.map((a, i) => `<div class="copilot-action-item" data-idx="${i}"><div class="action-check checked">✓</div><span>${a.label}</span></div>`).join('');
  document.getElementById("copilot-custom-input").value = "";
  modal.classList.remove("hidden");
  refreshIcons();
}

// Copilot action handlers
window.openCopilotForBudget = function(overCats) { openCopilotModal({ action: "budget_over", title: "Budget Overage", message: "", data: overCats }); };
window.openCopilotForHighSpend = function(totalAlloc, totalSpent) { openCopilotModal({ action: "budget_progress", title: "Budget Progress", message: "", data: { totalAlloc, totalSpent } }); };
window.openCopilotForCategory = function(budgetId) {
  const b = state.budgets.find(x => x.id === budgetId);
  if (b) openCopilotModal({ action: "budget_over", title: "Budget Overage", message: "", data: [b] });
};
window.openCopilotForTask = function(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (t) openCopilotModal({ action: "tasks_overdue", title: "Overdue Task", message: "", data: [t] });
};
window.openCopilotForRSVP = function(count) {
  const pending = state.guests.filter(g => g.rsvp_status === "pending");
  openCopilotModal({ action: "rsvp_remind", title: "RSVP Reminders", message: "", data: pending });
};

document.getElementById("c-copilot-close").onclick = () => document.getElementById("c-copilot-modal").classList.add("hidden");
document.getElementById("copilot-dismiss").onclick = () => document.getElementById("c-copilot-modal").classList.add("hidden");
document.getElementById("c-copilot-modal").onclick = e => { if (e.target.id === "c-copilot-modal") e.target.classList.add("hidden"); };

document.getElementById("copilot-apply-recommended").onclick = async () => {
  const s = state.pendingCopilotAction;
  if (!s) return;
  await applyCopilotAction(s);
  document.getElementById("c-copilot-modal").classList.add("hidden");
};

document.getElementById("copilot-apply-custom").onclick = async () => {
  const customText = document.getElementById("copilot-custom-input").value.trim();
  if (!customText) { alert("Enter your custom solution."); return; }
  const suggestion = state.pendingCopilotAction || null;
  const handled = await maybeHandleAiActions(customText, "main", { forcePlan: true, suggestionContext: suggestion });
  if (!handled.handled) {
    pushAssistantMessage("I couldn't map that custom solution to executable actions. Please be more specific.", "main");
  }
  document.getElementById("c-copilot-modal").classList.add("hidden");
};

async function applyCopilotAction(suggestion) {
  const actions = [];
  switch (suggestion.action) {
    case "budget_over": {
      const cats = suggestion.data;
      const underBudget = state.budgets.filter(b => b.spent_amount < b.allocated_amount * 0.6);
      if (underBudget.length && cats.length) {
        const from = underBudget[0], to = cats[0];
        const overAmt = to.spent_amount - to.allocated_amount;
        if (overAmt > 0) actions.push({ type: "reallocate_budget", from_category: from.category, to_category: to.category, amount: overAmt });
      } else {
        actions.push({ type: "remove_recent_expenses", until_within_budget: true });
      }
      break;
    }
    case "tasks_overdue": {
      actions.push({ type: "extend_overdue_tasks", days: 7, task_ids: (suggestion.data || []).map(t => t.id) });
      break;
    }
    case "rsvp_remind": {
      actions.push({
        type: "create_task",
        title: "Send RSVP follow-up reminders",
        description: `Contact pending guests: ${(suggestion.data || []).map(g => g.name).join(", ")}`,
        due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
        priority: "high",
        assigned_to: state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
        category: "Guests",
      });
      break;
    }
    case "budget_progress":
      actions.push({ type: "switch_tab", tab: "budget" });
      break;
    case "switch_tab":
      actions.push({ type: "switch_tab", tab: suggestion.data });
      break;
  }
  if (!actions.length) return;
  const exec = await executeAiActions(actions, "main");
  let summary = "Applied copilot recommendation.";
  if (exec.completed.length) summary += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
  if (exec.failed.length) summary += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
  pushAssistantMessage(summary, "main");
  fetchAISuggestions();
}

// ═══ VENDOR DASHBOARD ═══
function showVendorDash() {
  showView("vendor");
  const u = state.currentUser;
  document.getElementById("v-dd-avatar").textContent = u.username.charAt(0).toUpperCase();
  document.getElementById("v-dd-name").textContent = u.profile.businessName || u.username;
  document.getElementById("v-dd-cat").textContent = fmtCat(u.profile.category || "Vendor");
  document.getElementById("v-input").disabled = false;
  document.getElementById("v-send").disabled = false;
  state.cohort = "Mia & Ethan Wedding"; state.joined = true;
  document.getElementById("v-chat-title").textContent = state.cohort;
  state.messages = [];
  addMessage("system", "System", `Welcome, ${u.profile.businessName || u.username}! Select a chat.`);
  renderVendorWBReviews();
}

function fmtCat(c) { return c.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()); }

document.querySelectorAll(".v-couple-btn").forEach(item => {
  item.addEventListener("click", async () => {
    if (state.currentUser && state.joined) saveHistory(state.currentUser.id, state.cohort, state.messages);
    document.querySelectorAll(".v-couple-btn").forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    state.cohort = item.dataset.cohort;
    document.getElementById("v-chat-title").textContent = state.cohort;
    const stored = getHistory(state.currentUser.id, state.cohort);
    if (stored.length) { state.messages = stored.map(m => ({ ...m, id: crypto.randomUUID(), time: new Date(m.time) })); renderMessages(); }
    else { state.messages = []; seedMessages(); }
    if (backendOnline) { try { const r = await apiPost("/api/join", { username: state.currentUser.username, cohort: state.cohort }); state.userId = r.user_id; state.cohortId = r.cohort_id; } catch {} }
  });
});

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

// ═══ REVIEWS ═══
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

// ═══ TUTORIAL ═══
const tutSteps = [
  { target: ".m-wedding-label", text: "This is your wedding workspace. All planning happens here." },
  { target: "#c-nav-tabs", text: "Navigate between Chat, Budget, Tasks, Guests, and Vendor Marketplace." },
  { target: "#c-vendor-list", text: "Your vendors are listed here. Click any to open a chat." },
  { target: ".m-composer", text: "Type messages here. Use @ai for AI help or @ai generate doc to create documents." },
  { target: "#c-private-ai-btn", text: "Private AI Chat — for sensitive booking and financial info only you can see." },
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
  if (el) { const r = el.getBoundingClientRect(), pad = 5; hl.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`; tip.style.top = Math.min(r.bottom + 10, innerHeight - 160) + "px"; tip.style.left = Math.max(10, Math.min(r.left, innerWidth - 310)) + "px"; }
}
document.getElementById("tut-next").onclick = () => { tutIdx++; showTutStep(); };
document.querySelector(".tutorial-bg").onclick = () => document.getElementById("tutorial-overlay").classList.add("hidden");

// ═══ MESSAGING (shared) ═══
function getFeed() { return state.currentUser?.role === "vendor" ? document.getElementById("v-chat-feed") : document.getElementById("c-chat-feed"); }
function getInput() { return state.currentUser?.role === "vendor" ? document.getElementById("v-input") : document.getElementById("c-input"); }
function getRetLabel() { return state.currentUser?.role === "vendor" ? document.getElementById("v-retrieval") : document.getElementById("c-retrieval"); }

async function handleSend(dash) {
  if (!state.currentUser || state.aiStreaming) return;
  const input = getInput(), text = input.value.trim(); if (!text) return;
  if (!state.joined) { state.cohort = dash === "couple" ? getCoupleWeddingName() : state.cohort; state.joined = true; }

  // Check for sensitive info
  const sensitiveType = checkSensitiveInfo(text);
  if (sensitiveType && !state.isPrivateChat) {
    document.getElementById("c-sensitive-msg").textContent = `Sensitive information detected (${sensitiveType}). Consider using Private AI Chat instead.`;
    document.getElementById("c-sensitive-banner").classList.remove("hidden");
  }

  addMessage("human", state.currentUser.profile?.partner1 || state.currentUser.username, text);
  input.value = "";
  if (backendOnline && state.cohortId) { apiPost("/api/message", { cohort_id: state.cohortId, user_id: state.userId, content: text, sender_type: "human" }).catch(() => {}); }
  const aiText = text.replace(/^@ai\s*/i, "").trim();
  if (state.pendingAiClarification && !text.toLowerCase().startsWith("@ai")) {
    const handled = await resolvePendingClarification(text, "main");
    if (handled) return;
  }

  if (text.toLowerCase().startsWith("@ai")) {
    if (state.pendingAiClarification) {
      const handled = await resolvePendingClarification(aiText || text, "main");
      if (handled) return;
    }
    const dm = aiText.match(/^(?:generate|create|make|write)\s+doc(?:ument)?\s*(.*)/i);
    if (dm) await handleGenerateDocumentIntent(dm[1].trim() || aiText, "main");
    else await respondToAi(aiText, "main");
  }
}

function addMessage(type, author, text) { state.messages.push({ id: crypto.randomUUID(), type, author, text, time: new Date() }); renderMessages(); persistHistory(); }
function appendSystemMsg(t) { addMessage("system", "System", t); }
function seedMessages() { addMessage("system", "System", `${state.currentUser.username} opened ${state.cohort}.`); addMessage("human", "Lead Planner", "I uploaded the event schedule and vendor checklist."); addMessage("human", "Photographer", "Please confirm ceremony start time."); }

function persistHistory() {
  if (!state.currentUser || !state.joined) return;
  if (state.currentUser.role === "couple") {
    if (state.activeGroupChat) saveHistory(state.currentUser.id, `${state.cohort}::group::${state.activeGroupChat}`, state.messages);
    else if (state.activeVendorChat) saveHistory(state.currentUser.id, `${state.cohort}::${state.activeVendorChat}`, state.messages);
  } else saveHistory(state.currentUser.id, state.cohort, state.messages);
}

function doLogout() {
  if (state.currentUser && state.joined) persistHistory();
  state.currentUser = null; state.joined = false; state.messages = []; state.resources = []; state.chunks = [];
  state.userId = null; state.cohortId = null; state.activeVendorChat = null; state.isPrivateChat = false;
  state.budgets = []; state.tasks = []; state.events = []; state.guests = []; state.notifications = [];
  state.marketplaceVendors = []; state.compareList = []; state.groupChats = []; state.privateMessages = [];
  state.pendingAiClarification = null;
  localStorage.removeItem("wedboard:session"); showView("landing");
}

// Typing indicators
function showTyping() { showTypingIn(getFeed().id); }
function removeTyping() { removeTypingFrom(getFeed().id); }
function showTypingIn(feedId) {
  removeTypingFrom(feedId);
  const feed = document.getElementById(feedId);
  const d = document.createElement("article"); d.className = "msg ai"; d.id = `typing-${feedId}`;
  d.innerHTML = '<div class="msg-av"></div><div class="msg-body"><div class="msg-meta"><strong class="msg-author">AI Assistant</strong></div><div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div></div>';
  feed.appendChild(d); feed.scrollTop = feed.scrollHeight;
}
function removeTypingFrom(feedId) { const e = document.getElementById(`typing-${feedId}`); if (e) e.remove(); }

function renderMessages() {
  const feed = getFeed(); feed.innerHTML = "";
  const tpl = document.getElementById("msg-tpl");
  for (const m of state.messages) {
    const n = tpl.content.firstElementChild.cloneNode(true);
    n.classList.add(m.type);
    n.querySelector(".msg-author").textContent = m.author;
    n.querySelector(".msg-time").textContent = fmtTime(m.time);
    n.querySelector(".msg-text").innerHTML = fmtMsg(m.text, m.type);
    feed.appendChild(n);
  }
  feed.scrollTop = feed.scrollHeight;
  refreshIcons();
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

// ═══ AI ═══
function pushAssistantMessage(text, context = "main") {
  if (context === "private") {
    state.privateMessages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text, time: new Date() });
    renderPrivateMessages();
    if (state.currentUser) saveHistory(state.currentUser.id, `${state.cohort}::__private_ai__`, state.privateMessages);
    return;
  }
  addMessage("ai", "AI Assistant", text);
}

function clearPendingClarification() { state.pendingAiClarification = null; }

function parseRequestedDocFormat(text) {
  const lower = String(text || "").toLowerCase();
  if (/\bdocx\b|\bword\b/.test(lower)) return "docx";
  if (/\bpdf\b/.test(lower)) return "pdf";
  return null;
}

function stripFormatHintsFromPrompt(prompt) {
  return String(prompt || "")
    .replace(/\b(as|in)\s+(a\s+)?(pdf|docx|word)\b/gi, "")
    .replace(/\b(pdf|docx|word)\s+(format|file)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function resolvePendingClarification(answer, context = "main") {
  const pending = state.pendingAiClarification;
  if (!pending || pending.context !== context) return false;

  if (pending.type === "doc_format") {
    const requestedFormat = parseRequestedDocFormat(answer);
    if (!requestedFormat) {
      pushAssistantMessage("Please reply with either `pdf` or `docx`.", context);
      return true;
    }
    clearPendingClarification();
    await generateDocument(pending.prompt, { context, outputFormat: requestedFormat });
    return true;
  }

  if (pending.type === "ai_action") {
    clearPendingClarification();
    const mergedInstruction = `${pending.instruction}\nUser clarification: ${answer}`;
    const retry = await maybeHandleAiActions(mergedInstruction, context, { forcePlan: true, suggestionContext: pending.suggestionContext || null });
    if (!retry.handled) pushAssistantMessage("I still need one concrete instruction I can execute.", context);
    return true;
  }

  return false;
}

async function handleGenerateDocumentIntent(rawPrompt, context = "main") {
  const prompt = String(rawPrompt || "").trim();
  if (!prompt) { pushAssistantMessage("Describe the document after `@ai generate doc`.", context); return; }

  const outputFormat = parseRequestedDocFormat(prompt);
  const cleanedPrompt = stripFormatHintsFromPrompt(prompt) || prompt;
  if (!outputFormat) {
    state.pendingAiClarification = { type: "doc_format", context, prompt: cleanedPrompt, createdAt: Date.now() };
    pushAssistantMessage("Should I generate this as a `pdf` or a `docx` file?", context);
    return;
  }

  clearPendingClarification();
  await generateDocument(cleanedPrompt, { context, outputFormat });
}

function getKnownVendorNames() {
  const names = new Set();
  document.querySelectorAll(".c-vendor-btn").forEach(btn => { if (btn.dataset.vendor) names.add(btn.dataset.vendor); });
  state.groupChats.forEach(gc => (gc.members || []).forEach(m => { if (m && m !== "AI Assistant") names.add(m); }));
  state.budgets.forEach(b => getLocal(`expenses:${b.id}`).forEach(e => { if (e.vendor_name) names.add(e.vendor_name); }));
  return Array.from(names);
}

function extractMentionedVendors(text) {
  const lower = String(text || "").toLowerCase();
  return getKnownVendorNames().filter(name => lower.includes(name.toLowerCase()));
}

function isLikelyActionInstruction(text) {
  const lower = String(text || "").toLowerCase();
  if (!lower) return false;
  if (/^\s*(what|why|when|where|who|which)\b/.test(lower)) return false;
  return /\b(remove|delete|cancel|notify|inform|message|send|create|add|update|mark|reassign|reallocate|move|extend|switch|generate|draft|prepare|book)\b/.test(lower);
}

function localPlanAiActions(instruction, suggestionContext = null) {
  const lower = String(instruction || "").toLowerCase();
  const actions = [];
  const vendors = extractMentionedVendors(instruction);

  if ((/\bremove\b|\bdelete\b|\bcancel\b/.test(lower)) && (/\brecent\b|\blatest\b|\bnewly added\b/.test(lower)) && (/\bexpense\b|\bitem\b|\bcost\b/.test(lower))) actions.push({ type: "remove_recent_expenses", until_within_budget: true });
  if ((/\binform\b|\bnotify\b|\bmessage\b|\btell\b/.test(lower)) && /\bvendor/.test(lower) && /\bgroup\b/.test(lower)) actions.push({ type: "notify_group_chat", vendor_names: vendors, message: "Quick update: I rolled back recent over-budget expenses to stay within plan. Please confirm any impacted deliverables in this thread." });
  if (/\bcreate\b.*\btask\b|\badd\b.*\btask\b/.test(lower)) actions.push({ type: "create_task", title: "AI follow-up task", description: stripFormatHintsFromPrompt(instruction), due_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), priority: "high", assigned_to: state.currentUser?.profile?.partner1 || state.currentUser?.username || "", category: "Planning" });
  if (/\bextend\b.*\boverdue\b/.test(lower)) actions.push({ type: "extend_overdue_tasks", days: 7 });
  if (/\breallocate\b|\bmove\b.*\bbudget\b/.test(lower)) {
    const over = state.budgets.find(b => b.spent_amount > b.allocated_amount);
    const under = state.budgets.find(b => b.allocated_amount - b.spent_amount > 0);
    if (over && under) actions.push({ type: "reallocate_budget", from_category: under.category, to_category: over.category, amount: Math.max(1, Math.ceil(over.spent_amount - over.allocated_amount)) });
  }
  if (suggestionContext?.action === "budget_over" && !actions.length && /\bremove\b|\bcancel\b/.test(lower)) actions.push({ type: "remove_recent_expenses", until_within_budget: true });

  if (actions.length) return { status: "ready", summary: "Planned local actions.", actions };
  if (isLikelyActionInstruction(lower)) return { status: "needs_clarification", summary: "Need one more detail.", question: "I can execute this. Which exact items should I change?" };
  return { status: "not_actionable", summary: "No executable actions detected.", actions: [] };
}

async function getAiActionPlan(instruction, suggestionContext = null) {
  if (backendOnline && state.cohortId) {
    try {
      const result = await apiPost("/api/ai-copilot-plan", {
        cohort_id: state.cohortId,
        user_id: state.userId,
        wedding_id: getWeddingId(),
        instruction,
        suggestion_context: suggestionContext || null,
      });
      if (result && result.status) {
        if (result.status === "not_actionable") return localPlanAiActions(instruction, suggestionContext);
        return result;
      }
    } catch {}
  }
  return localPlanAiActions(instruction, suggestionContext);
}

function appendAiMessageToStoredChat(key, text) {
  if (!state.currentUser) return;
  const msg = { id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text, time: new Date() };
  const history = getHistory(state.currentUser.id, key);
  history.push(msg);
  saveHistory(state.currentUser.id, key, history);
}

function ensureVendorGroupChat(vendorNames = [], preferredName = "") {
  state.groupChats = getLocal(`groupchats:${getWeddingId()}`);
  const preferred = preferredName.trim().toLowerCase();
  let chosen = preferred ? state.groupChats.find(gc => gc.name.toLowerCase() === preferred) : null;
  if (!chosen && vendorNames.length) chosen = state.groupChats.find(gc => vendorNames.some(v => (gc.members || []).some(m => m.toLowerCase() === v.toLowerCase())));
  if (!chosen) {
    chosen = { id: Date.now(), name: preferredName && preferredName.trim() ? preferredName.trim() : "Vendor Coordination", members: Array.from(new Set([...(vendorNames || []), "AI Assistant"].filter(Boolean))), created_at: new Date().toISOString() };
    state.groupChats.push(chosen);
    setLocal(`groupchats:${getWeddingId()}`, state.groupChats);
    renderGroupChats();
  }
  return chosen;
}

function pushAiMessageToGroup(groupId, text) {
  const key = `${state.cohort}::group::${groupId}`;
  appendAiMessageToStoredChat(key, text);
  if (state.activeGroupChat === groupId && state.activeTab === "chat" && !state.isPrivateChat) addMessage("ai", "AI Assistant", text);
}

function pushAiMessageToVendor(vendorName, text) {
  const key = `${state.cohort}::${vendorName}`;
  appendAiMessageToStoredChat(key, text);
  if (state.activeVendorChat === vendorName && state.activeTab === "chat" && !state.isPrivateChat && !state.activeGroupChat) addMessage("ai", "AI Assistant", text);
}

async function getExpensesForBudget(budgetId) {
  if (backendOnline) { try { return await apiGet(`/api/expenses?budget_id=${budgetId}`); } catch {} }
  return getLocal(`expenses:${budgetId}`);
}

async function removeExpenseByIdInternal(expenseId) {
  if (backendOnline) {
    try { await fetch(`${BACKEND_URL}/api/expenses/${expenseId}`, { method: "DELETE" }); return true; } catch {}
  }
  const wid = getWeddingId();
  const budgets = getLocal(`budgets:${wid}`);
  for (const b of budgets) {
    let expenses = getLocal(`expenses:${b.id}`);
    const exp = expenses.find(e => e.id === expenseId);
    if (exp) {
      expenses = expenses.filter(e => e.id !== expenseId);
      setLocal(`expenses:${b.id}`, expenses);
      b.spent_amount = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      setLocal(`budgets:${wid}`, budgets);
      return true;
    }
  }
  return false;
}

async function createTaskInternal(taskPayload) {
  if (backendOnline) {
    try { await apiPost("/api/tasks", taskPayload); return true; } catch {}
  }
  const tasks = getLocal(`tasks:${getWeddingId()}`);
  tasks.push({ ...taskPayload, id: Date.now(), created_at: new Date().toISOString() });
  setLocal(`tasks:${getWeddingId()}`, tasks);
  return true;
}

async function updateTaskInternal(taskId, fields) {
  if (backendOnline) {
    try { await apiPut(`/api/tasks/${taskId}`, fields); return true; } catch {}
  }
  const tasks = getLocal(`tasks:${getWeddingId()}`);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return false;
  Object.assign(task, fields);
  setLocal(`tasks:${getWeddingId()}`, tasks);
  return true;
}

async function executeAiActions(actions, context = "main") {
  const completed = [];
  const failed = [];
  const touched = new Set();
  if (!Array.isArray(actions) || !actions.length) return { completed, failed, touched };

  await loadBudgets();
  await loadTasks();

  for (const action of actions) {
    try {
      const type = String(action.type || "").toLowerCase();
      if (!type) continue;
      if (type === "remove_recent_expenses") {
        const categorySet = new Set((action.budget_categories || []).map(c => String(c).toLowerCase()));
        const targets = state.budgets.filter(b => (!categorySet.size || categorySet.has(String(b.category).toLowerCase())) && b.spent_amount > b.allocated_amount);
        const maxRemovals = Number.isFinite(Number(action.count)) ? Math.max(1, parseInt(action.count, 10)) : null;
        let totalRemoved = 0;
        const removedItems = [];
        for (const budget of targets) {
          let overage = Number(budget.spent_amount || 0) - Number(budget.allocated_amount || 0);
          const expenses = (await getExpensesForBudget(budget.id)).slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
          for (const exp of expenses) {
            if (maxRemovals && totalRemoved >= maxRemovals) break;
            if (action.until_within_budget !== false && overage <= 0) break;
            const ok = await removeExpenseByIdInternal(exp.id);
            if (ok) {
              removedItems.push(exp);
              totalRemoved += 1;
              overage -= Number(exp.amount || 0);
            }
          }
          if (maxRemovals && totalRemoved >= maxRemovals) break;
        }
        if (!removedItems.length) throw new Error("No removable recent expenses found.");
        touched.add("budget");
        completed.push(`Removed ${removedItems.length} recent expense item(s).`);
      } else if (type === "notify_group_chat") {
        const vendors = (action.vendor_names || []).length ? action.vendor_names : extractMentionedVendors(action.message || "");
        const group = ensureVendorGroupChat(vendors, action.group_name || "");
        pushAiMessageToGroup(group.id, action.message || "AI update: requested changes were completed.");
        completed.push(`Posted an AI update to group chat "${group.name}".`);
      } else if (type === "notify_vendor_chat") {
        const vendors = (action.vendor_names || []).length ? action.vendor_names : extractMentionedVendors(action.message || "");
        if (!vendors.length) throw new Error("No vendors identified.");
        vendors.forEach(v => pushAiMessageToVendor(v, action.message || "AI update: requested changes were completed."));
        completed.push(`Notified ${vendors.length} vendor chat(s).`);
      } else if (type === "create_task") {
        const title = String(action.title || "").trim();
        if (!title) throw new Error("Task title missing.");
        await createTaskInternal({
          wedding_id: getWeddingId(),
          title,
          description: action.description || "",
          due_date: action.due_date || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
          priority: action.priority || "medium",
          assigned_to: action.assigned_to || state.currentUser?.profile?.partner1 || state.currentUser?.username || "",
          category: action.category || "Planning",
          status: action.status || "pending",
        });
        touched.add("tasks");
        completed.push(`Created task "${title}".`);
      } else if (type === "update_task") {
        const taskId = Number(action.task_id);
        if (!Number.isFinite(taskId)) throw new Error("Task id missing.");
        const patch = {};
        ["status", "due_date", "assigned_to", "title", "description", "priority", "category"].forEach(field => { if (action[field] !== undefined) patch[field] = action[field]; });
        const ok = await updateTaskInternal(taskId, patch);
        if (!ok) throw new Error(`Task ${taskId} not found.`);
        touched.add("tasks");
        completed.push(`Updated task #${taskId}.`);
      } else if (type === "extend_overdue_tasks") {
        const days = Number.isFinite(Number(action.days)) ? Math.max(1, parseInt(action.days, 10)) : 7;
        const today = new Date().toISOString().slice(0, 10);
        const targetIds = Array.isArray(action.task_ids) ? new Set(action.task_ids.map(Number)) : null;
        const overdue = state.tasks.filter(t => t.status !== "completed" && t.due_date && t.due_date < today && (!targetIds || targetIds.has(Number(t.id))));
        if (!overdue.length) throw new Error("No overdue tasks found.");
        for (const task of overdue) {
          const next = new Date();
          next.setDate(next.getDate() + days);
          await updateTaskInternal(task.id, { due_date: next.toISOString().slice(0, 10), status: "in_progress" });
        }
        touched.add("tasks");
        completed.push(`Extended ${overdue.length} overdue task(s) by ${days} day(s).`);
      } else if (type === "reallocate_budget") {
        const from = state.budgets.find(b => String(b.category).toLowerCase() === String(action.from_category || "").toLowerCase());
        const to = state.budgets.find(b => String(b.category).toLowerCase() === String(action.to_category || "").toLowerCase());
        if (!from || !to) throw new Error("Could not find source/target budget category.");
        const requestedAmount = Number(action.amount);
        const overage = Math.max(0, Number(to.spent_amount || 0) - Number(to.allocated_amount || 0));
        const amount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : overage;
        if (!amount) throw new Error("No valid amount to reallocate.");
        const sourceRemaining = Math.max(0, Number(from.allocated_amount || 0) - Number(from.spent_amount || 0));
        const finalAmount = Math.min(amount, sourceRemaining || amount);
        const newFrom = Number(from.allocated_amount || 0) - finalAmount;
        const newTo = Number(to.allocated_amount || 0) + finalAmount;
        if (backendOnline) {
          await apiPut(`/api/budgets/${from.id}`, { allocated_amount: newFrom });
          await apiPut(`/api/budgets/${to.id}`, { allocated_amount: newTo });
        } else {
          const budgets = getLocal(`budgets:${getWeddingId()}`);
          const fromB = budgets.find(b => b.id === from.id);
          const toB = budgets.find(b => b.id === to.id);
          if (fromB && toB) {
            fromB.allocated_amount = newFrom;
            toB.allocated_amount = newTo;
            setLocal(`budgets:${getWeddingId()}`, budgets);
          }
        }
        touched.add("budget");
        completed.push(`Reallocated $${Math.round(finalAmount).toLocaleString()} from ${from.category} to ${to.category}.`);
      } else if (type === "switch_tab") {
        const tab = String(action.tab || action.data || "").toLowerCase();
        if (["chat", "budget", "tasks", "guests", "discover"].includes(tab)) {
          switchTab(tab);
          completed.push(`Opened the ${tab} tab.`);
        }
      } else if (type === "generate_document") {
        await handleGenerateDocumentIntent(action.prompt || "", context);
        completed.push("Started document generation flow.");
      } else {
        throw new Error(`Unsupported action type: ${type}`);
      }
    } catch (err) {
      failed.push(err?.message || String(err));
    }
  }

  if (touched.has("budget")) await loadBudgets();
  if (touched.has("tasks")) await loadTasks();
  if (completed.length) await addNotification("ai_action", "AI Copilot Actions Completed", completed.join(" "));
  return { completed, failed, touched };
}

async function maybeHandleAiActions(instruction, context = "main", options = {}) {
  const text = String(instruction || "").trim();
  if (!text) return { handled: false };
  if (!options.forcePlan && !isLikelyActionInstruction(text)) return { handled: false };

  const plan = await getAiActionPlan(text, options.suggestionContext || null);
  if (!plan || plan.status === "not_actionable") return { handled: false, plan };

  if (plan.status === "needs_clarification") {
    const localFallback = localPlanAiActions(text, options.suggestionContext || null);
    if (localFallback.status === "ready" && Array.isArray(localFallback.actions) && localFallback.actions.length) {
      clearPendingClarification();
      const exec = await executeAiActions(localFallback.actions, context);
      let response = `${plan.question ? `I inferred defaults to proceed: ${plan.summary || "details were ambiguous."}` : "I inferred defaults and executed the request."}`;
      if (exec.completed.length) response += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
      if (exec.failed.length) response += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
      pushAssistantMessage(response, context);
      return { handled: true, plan: localFallback, exec };
    }
    state.pendingAiClarification = { type: "ai_action", context, instruction: text, suggestionContext: options.suggestionContext || null, createdAt: Date.now() };
    pushAssistantMessage(plan.question || "I need one more detail before I can execute that.", context);
    return { handled: true, plan };
  }

  clearPendingClarification();
  const exec = await executeAiActions(plan.actions || [], context);
  let response = plan.summary || "I executed your requested changes.";
  if (exec.completed.length) response += `\n\nCompleted:\n- ${exec.completed.join("\n- ")}`;
  if (exec.failed.length) response += `\n\nNeeds attention:\n- ${exec.failed.join("\n- ")}`;
  pushAssistantMessage(response, context);
  return { handled: true, plan, exec };
}

async function respondToAi(q, context = "main") {
  if (!q) { pushAssistantMessage("Ask a question after `@ai`.", context); return; }
  const actionResult = await maybeHandleAiActions(q, context);
  if (actionResult.handled) return;

  const rl = getRetLabel();
  rl.textContent = "Querying...";
  rl.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px;animation:spin 1s linear infinite"></i> Querying';
  refreshIcons();

  if (backendOnline && state.cohortId) {
    showTyping();
    state.aiStreaming = true;
    fetch(`${BACKEND_URL}/api/ai-query-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohort_id: state.cohortId, question: q, user_id: state.userId, wedding_id: getWeddingId() }) })
      .then(res => { if (!res.ok) throw new Error(); const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "", full = "", srcs = [], node = null; const feed = getFeed();
        function proc(t) { buf += t; const lines = buf.split("\n"); buf = lines.pop(); for (const l of lines) { if (!l.startsWith("data: ")) continue; try { const e = JSON.parse(l.slice(6)); if (e.type === "sources") srcs = e.sources || []; if (e.type === "chunk") { if (!node) { removeTyping(); const tpl = document.getElementById("msg-tpl"); node = tpl.content.firstElementChild.cloneNode(true); node.classList.add("ai"); node.querySelector(".msg-author").textContent = "AI Assistant"; node.querySelector(".msg-time").textContent = fmtTime(new Date()); feed.appendChild(node); } full += e.content; node.querySelector(".msg-text").innerHTML = renderMd(full); feed.scrollTop = feed.scrollHeight; } if (e.type === "done") { if (srcs.length) { full += `\n\n*Sources: ${srcs.join(", ")}*`; if (node) node.querySelector(".msg-text").innerHTML = renderMd(full); } state.messages.push({ id: crypto.randomUUID(), type: "ai", author: "AI Assistant", text: full, time: new Date() }); persistHistory(); rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> ' + (srcs.length ? "Grounded" : "General"); refreshIcons(); state.aiStreaming = false; } } catch {} } }
        function pump() { return reader.read().then(({ done, value }) => { if (done) { if (buf.trim()) proc("\n"); state.aiStreaming = false; removeTyping(); return; } proc(dec.decode(value, { stream: true })); return pump(); }); }
        return pump();
      }).catch(() => { removeTyping(); state.aiStreaming = false; rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> Error'; refreshIcons(); pushAssistantMessage("Backend error.", context); });
    return;
  }

  showTyping();
  setTimeout(() => {
    removeTyping();
    const res = searchKB(q);
    rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> ' + (res.length ? "Grounded" : "No matches");
    refreshIcons();
    if (!res.length) { pushAssistantMessage("No content found. Upload a doc first.", context); return; }
    pushAssistantMessage(buildAnswer(q, res[0], res[1]), context);
  }, 450);
}

async function generateDocument(prompt, options = {}) {
  const context = options.context || "main";
  const outputFormat = options.outputFormat || "docx";
  if (!prompt) { pushAssistantMessage("Describe the document after `@ai generate doc`.", context); return; }

  const rl = getRetLabel();
  rl.innerHTML = '<i data-lucide="loader" style="width:12px;height:12px"></i> Generating';
  refreshIcons();
  if (context === "private") showTypingIn("c-private-feed");
  else showTyping();
  state.aiStreaming = true;

  if (backendOnline && state.cohortId) {
    try {
      const d = await apiPost("/api/generate-doc", { cohort_id: state.cohortId, user_id: state.userId, prompt, wedding_id: getWeddingId(), output_format: outputFormat });
      if (context === "private") removeTypingFrom("c-private-feed"); else removeTyping();
      state.aiStreaming = false;
      pushAssistantMessage(`**Document generated!**\n\n**File:** ${d.filename}\n**Format:** ${String(d.output_format || outputFormat).toUpperCase()}\n**Sections:** ${d.sections}\n\n[Download](${BACKEND_URL}/api/download-doc/${d.doc_id})`, context);
      rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> Done';
      refreshIcons();
      return;
    } catch (err) {
      if (context === "private") removeTypingFrom("c-private-feed"); else removeTyping();
      state.aiStreaming = false;
      const msg = err?.message?.includes("HTTP 400") ? "I need the format first. Reply with `pdf` or `docx`." : "Generation failed.";
      pushAssistantMessage(msg, context);
      rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> Failed';
      refreshIcons();
      return;
    }
  }

  if (context === "private") removeTypingFrom("c-private-feed"); else removeTyping();
  state.aiStreaming = false;
  pushAssistantMessage("Need backend for doc generation.", context);
  rl.innerHTML = '<i data-lucide="cpu" style="width:12px;height:12px"></i> Offline';
  refreshIcons();
}

// ═══ NLP ═══
function searchKB(q) { const qv = vectorize(q); return state.chunks.map(c => ({ ...c, score: cosine(qv, c.vector) })).filter(c => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3); }
function buildAnswer(q, best, sup) { const lead = best.content.split(/\n+/)[0].trim(), exc = compress(best.content).slice(0, 240); return `Based on uploaded materials for "${q}":\n\n${lead}\n\nExcerpt: "${exc}${exc.length >= 240 ? "..." : ""}"\nSource: ${best.source} (chunk ${best.index})${sup ? "\nAlso: " + compress(sup.content).slice(0, 140) : ""}`; }
function chunkText(text, max) { const paras = text.replace(/\r/g, "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean), chunks = []; let cur = ""; for (const p of paras) { if ((cur + "\n\n" + p).trim().length <= max) cur = cur ? cur + "\n\n" + p : p; else { if (cur) chunks.push(cur); if (p.length <= max) cur = p; else { const sents = p.split(/(?<=[.!?])\s+/); cur = ""; for (const s of sents) { if ((cur + " " + s).trim().length <= max) cur = cur ? cur + " " + s : s; else { if (cur) chunks.push(cur); cur = s; } } } } } if (cur) chunks.push(cur); return chunks; }
function vectorize(t) { const v = {}; tokenize(t).forEach(w => v[w] = (v[w] || 0) + 1); return v; }
function tokenize(t) { return t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.has(w)); }
function cosine(a, b) { const keys = new Set([...Object.keys(a), ...Object.keys(b)]); let dot = 0, ma = 0, mb = 0; keys.forEach(k => { const av = a[k] || 0, bv = b[k] || 0; dot += av * bv; ma += av * av; mb += bv * bv; }); return (!ma || !mb) ? 0 : dot / (Math.sqrt(ma) * Math.sqrt(mb)); }

// ═══ UTILS ═══
function renderMd(t) { if (typeof marked !== "undefined") { marked.setOptions({ breaks: true, gfm: true }); return marked.parse(t); } return fallbackMd(t); }
function fallbackMd(t) { let h = esc(t); h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"); h = h.replace(/\*(.+?)\*/g, "<em>$1</em>"); h = h.replace(/`([^`]+)`/g, "<code>$1</code>"); h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>'); return h.replace(/\n/g, "<br>"); }
function fmtTime(d) { return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(d); }
function fmtMsg(t, type) { return type === "ai" ? renderMd(t) : esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\n/g, "<br>"); }
function esc(t) { return String(t).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"); }
function compress(t) { return t.replace(/\s+/g, " ").trim(); }
function readText(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsText(f); }); }
function readDataUrl(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ═══ BACKEND ═══
async function checkBackend() { try { const r = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(2500) }); if (r.ok) backendOnline = true; } catch { backendOnline = false; } }
async function apiPost(path, body) { const r = await fetch(`${BACKEND_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiGet(path) { const r = await fetch(`${BACKEND_URL}${path}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
async function apiPut(path, body) { const r = await fetch(`${BACKEND_URL}${path}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
