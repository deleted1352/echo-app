(function () {
  "use strict";

  const STORAGE_KEY = "echo-requests";
  const EXCHANGES_KEY = "echo-exchanges";
  const THEME_KEY = "echo-theme";
  const USERS_KEY = "echo-users";
  const SESSION_KEY = "echo-session";
  const CHATS_KEY = "echo-chats";

  const SUBJECT_LABELS = {
    math: "Math",
    science: "Science",
    writing: "Writing",
    coding: "Coding",
    design: "Design",
    other: "Other",
  };

  const SAMPLE_REQUESTS = [
    {
      id: crypto.randomUUID(),
      title: "Help with Python list comprehensions",
      subject: "coding",
      description: "I'm struggling to rewrite for-loops as list comprehensions for my CS 101 assignment.",
      author: "Alex",
      status: "active",
      createdAt: Date.now() - 1000 * 60 * 45,
    },
    {
      id: crypto.randomUUID(),
      title: "Proofreading my history essay",
      subject: "writing",
      description: "Need someone to review grammar and flow for a 5-page paper on the Industrial Revolution.",
      author: "Jordan",
      status: "active",
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: crypto.randomUUID(),
      title: "Understanding stoichiometry",
      subject: "science",
      description: "Can someone walk me through balancing chemical equations step by step?",
      author: "Sam",
      status: "active",
      createdAt: Date.now() - 1000 * 60 * 60 * 8,
    },
    {
      id: crypto.randomUUID(),
      title: "Logo design feedback",
      subject: "design",
      description: "Looking for quick critique on a club logo I made in Figma before submitting it.",
      author: "Riley",
      status: "active",
      createdAt: Date.now() - 1000 * 60 * 60 * 24,
    },
  ];

  // ── DOM refs ──────────────────────────────────────────────────
  const feedGrid = document.getElementById("feed-grid");
  const feedEmpty = document.getElementById("feed-empty");
  const filterSubject = document.getElementById("filter-subject");
  const postModal = document.getElementById("post-modal");
  const postForm = document.getElementById("post-form");
  const authModal = document.getElementById("auth-modal");
  const authForm = document.getElementById("auth-form");
  const authError = document.getElementById("auth-error");
  const authGuest = document.getElementById("auth-guest");
  const authUser = document.getElementById("auth-user");
  const welcomeText = document.getElementById("welcome-text");
  const mobileAuthGuest = document.getElementById("mobile-auth-guest");
  const mobileAuthUser = document.getElementById("mobile-auth-user");
  const mobileWelcomeText = document.getElementById("mobile-welcome-text");
  const confirmPasswordField = document.getElementById("confirm-password-field");
  const authModalTitle = document.getElementById("auth-modal-title");
  const authSubmit = document.getElementById("auth-submit");
  const exchangeSection = document.getElementById("exchange-section");
  const exchangeForm = document.getElementById("exchange-form");
  const exchangeError = document.getElementById("exchange-error");
  const themeToggle = document.getElementById("theme-toggle");
  const menuToggle = document.getElementById("menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  const yearEl = document.getElementById("year");
  const chatModal = document.getElementById("chat-modal");
  const chatModalTitle = document.getElementById("chat-modal-title");
  const chatModalSubtitle = document.getElementById("chat-modal-subtitle");
  const chatModalBadge = document.getElementById("chat-modal-badge");
  const chatMessagesEl = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const chatClose = document.getElementById("chat-close");
  const inboxBtn = document.getElementById("inbox-btn");
  const mobileInboxBtn = document.getElementById("mobile-inbox");
  const inboxModal = document.getElementById("inbox-modal");
  const inboxClose = document.getElementById("inbox-close");
  const inboxList = document.getElementById("inbox-list");
  const inboxEmpty = document.getElementById("inbox-empty");
  const filterResolved = document.getElementById("filter-resolved");

  // ── State ─────────────────────────────────────────────────────
  let requests = loadRequests();
  let exchanges = loadExchanges();
  let currentUser = loadSession();
  let authMode = "login";
  let activeChatKind = null; // "request" | "exchange"
  let activeChatThreadId = null;
  let activeChatPostId = null;
  let activeChatPostTitle = null;
  let activeChatPostAuthor = null;
  let chatPollTimer = null;
  let lastRenderedChatSignature = null;

  // ── Init ──────────────────────────────────────────────────────
  initTheme();
  yearEl.textContent = new Date().getFullYear();
  updateAuthUI(); // also renders the feed

  // ── Theme ───────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = saved || (prefersDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  }

  // ── Storage ─────────────────────────────────────────────────────
  function loadRequests() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      // `status` backfilled for data saved before the resolved/archive
      // feature existed — anything without one is treated as active.
      if (stored) return JSON.parse(stored).map((r) => ({ status: "active", ...r }));
    } catch {
      /* fall through */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_REQUESTS));
    return SAMPLE_REQUESTS;
  }

  function saveRequests() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }

  function loadExchanges() {
    try {
      const stored = localStorage.getItem(EXCHANGES_KEY);
      if (stored) return JSON.parse(stored).map((x) => ({ status: "active", ...x }));
    } catch {
      /* fall through */
    }
    return [];
  }

  function saveExchanges() {
    localStorage.setItem(EXCHANGES_KEY, JSON.stringify(exchanges));
  }

  function loadChats() {
    try {
      const stored = localStorage.getItem(CHATS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      /* fall through */
    }
    return {};
  }

  function saveChats(chats) {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }

  // One shared thread per post (request or exchange) — anyone logged in,
  // including the post's own author, reads/writes the same thread.
  function getThreadId(kind, postId) {
    return `${kind}:${postId}`;
  }

  function getPostRecord(kind, id) {
    const list = kind === "request" ? requests : exchanges;
    return list.find((entry) => entry.id === id) || null;
  }

  function getPostDisplayTitle(kind, record) {
    if (!record) return "";
    return kind === "request"
      ? record.title
      : `Skill Exchange: ${record.mySkill} ↔ ${record.seekingSkill}`;
  }

  // ── Authentication ──────────────────────────────────────────────
  function loadUsers() {
    try {
      const stored = localStorage.getItem(USERS_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      /* fall through */
    }
    return {};
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function loadSession() {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const session = JSON.parse(stored);
        const users = loadUsers();
        const key = normalizeUsername(session.username || "");
        if (session.username && users[key]) return session;
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* fall through */
    }
    return null;
  }

  function saveSession(username) {
    currentUser = { username };
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  }

  function clearSession() {
    currentUser = null;
    localStorage.removeItem(SESSION_KEY);
  }

  function normalizeUsername(username) {
    return username.trim().toLowerCase();
  }

  function displayUsername(username) {
    return username.trim();
  }

  async function hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(bits))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function generateSalt() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function showAuthError(message) {
    authError.textContent = message;
    authError.hidden = false;
  }

  function clearAuthError() {
    authError.textContent = "";
    authError.hidden = true;
  }

  function setAuthMode(mode) {
    authMode = mode;
    const isSignup = mode === "signup";

    authModalTitle.textContent = isSignup ? "Sign Up" : "Log In";
    authSubmit.textContent = isSignup ? "Create Account" : "Log In";
    confirmPasswordField.hidden = !isSignup;
    document.getElementById("auth-password").autocomplete = isSignup
      ? "new-password"
      : "current-password";

    document.querySelectorAll(".auth-tab").forEach((tab) => {
      const active = tab.dataset.authMode === mode;
      tab.classList.toggle("auth-tab--active", active);
      tab.setAttribute("aria-selected", String(active));
    });

    clearAuthError();
  }

  function updateAuthUI() {
    const loggedIn = isLoggedIn();
    const name = loggedIn ? displayUsername(currentUser.username) : "";

    authGuest.hidden = loggedIn;
    authUser.hidden = !loggedIn;
    mobileAuthGuest.hidden = loggedIn;
    mobileAuthUser.hidden = !loggedIn;
    exchangeSection.hidden = !loggedIn;

    if (loggedIn) {
      welcomeText.innerHTML = `Welcome, <strong>${escapeHtml(name)}</strong>`;
      mobileWelcomeText.innerHTML = `Welcome, <strong>${escapeHtml(name)}</strong>`;
    } else {
      welcomeText.textContent = "";
      mobileWelcomeText.textContent = "";
      exchangeForm.reset();
      clearExchangeError();
    }

    // Re-render so "Mark Resolved" buttons (owner-only) and the Inbox
    // link reflect the current login state immediately, no refresh needed.
    renderFeed();
  }

  async function signUp(username, password, confirmPassword) {
    const normalized = normalizeUsername(username);
    const displayName = displayUsername(username);

    if (normalized.length < 3) {
      showAuthError("Username must be at least 3 characters.");
      return false;
    }

    if (password.length < 6) {
      showAuthError("Password must be at least 6 characters.");
      return false;
    }

    if (password !== confirmPassword) {
      showAuthError("Passwords do not match.");
      return false;
    }

    const users = loadUsers();
    if (users[normalized]) {
      showAuthError("That username is already taken.");
      return false;
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    users[normalized] = {
      username: displayName,
      salt,
      passwordHash,
      createdAt: Date.now(),
    };

    saveUsers(users);
    saveSession(displayName);
    updateAuthUI();
    return true;
  }

  async function logIn(username, password) {
    const normalized = normalizeUsername(username);
    const users = loadUsers();
    const user = users[normalized];

    if (!user) {
      showAuthError("Invalid username or password.");
      return false;
    }

    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) {
      showAuthError("Invalid username or password.");
      return false;
    }

    saveSession(user.username);
    updateAuthUI();
    return true;
  }

  function logOut() {
    clearSession();
    updateAuthUI();
    closeMobileNav();
  }

  function isLoggedIn() {
    return Boolean(currentUser?.username);
  }

  function showExchangeError(message) {
    exchangeError.textContent = message;
    exchangeError.hidden = false;
  }

  function clearExchangeError() {
    exchangeError.textContent = "";
    exchangeError.hidden = true;
  }

  function validateExchangeInput(mySkill, seekingSkill, description) {
    if (!mySkill) {
      return "Please enter the skill you can teach.";
    }

    if (mySkill.length < 2) {
      return "My Skill must be at least 2 characters.";
    }

    if (!seekingSkill) {
      return "Please enter the skill you are seeking.";
    }

    if (seekingSkill.length < 2) {
      return "Seeking Skill must be at least 2 characters.";
    }

    if (!description) {
      return "Please add a description for your exchange.";
    }

    if (description.length < 10) {
      return "Description must be at least 10 characters.";
    }

    return "";
  }

  function submitExchange(mySkill, seekingSkill, description) {
    const validationError = validateExchangeInput(mySkill, seekingSkill, description);
    if (validationError) {
      showExchangeError(validationError);
      return false;
    }

    const exchange = {
      id: crypto.randomUUID(),
      mySkill,
      seekingSkill,
      description,
      author: currentUser.username,
      status: "active",
      createdAt: Date.now(),
    };

    exchanges.unshift(exchange);
    saveExchanges();
    exchangeForm.reset();
    clearExchangeError();
    renderFeed();
    return true;
  }

  // ── Feed rendering ──────────────────────────────────────────────
  function isResolved(item) {
    return (item.status || "active") === "resolved";
  }

  function canResolve(item) {
    return (
      isLoggedIn() &&
      normalizeUsername(currentUser.username) === normalizeUsername(item.author) &&
      !isResolved(item)
    );
  }

  function renderFeed() {
    const filter = filterSubject.value;
    const showResolved = filterResolved.checked;

    const filteredRequests = requests.filter((r) => {
      const matchesSubject = filter === "all" || r.subject === filter;
      const matchesStatus = showResolved || !isResolved(r);
      return matchesSubject && matchesStatus;
    });

    const filteredExchanges =
      filter === "all" ? exchanges.filter((x) => showResolved || !isResolved(x)) : [];

    feedGrid.innerHTML = "";

    const items = [
      ...filteredExchanges.map((item) => ({ kind: "exchange", item })),
      ...filteredRequests.map((item) => ({ kind: "request", item })),
    ].sort((a, b) => b.item.createdAt - a.item.createdAt);

    if (items.length === 0) {
      feedEmpty.hidden = false;
      return;
    }

    feedEmpty.hidden = true;

    items.forEach(({ kind, item }) => {
      feedGrid.appendChild(kind === "exchange" ? createExchangeCard(item) : createCard(item));
    });
  }

  function createExchangeCard(exchange) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("role", "listitem");

    const initial = exchange.author.charAt(0).toUpperCase();
    const resolved = isResolved(exchange);
    const showResolveBtn = canResolve(exchange);

    card.innerHTML = `
      <div class="card__header">
        <h3 class="card__title">Skill Exchange</h3>
        <div class="card__badges">
          ${resolved ? '<span class="badge--resolved">Resolved</span>' : ""}
          <span class="card__badge badge--other">Exchange</span>
        </div>
      </div>
      <div class="card__skills">
        <span class="card__skill card__skill--offer">Teach: ${escapeHtml(exchange.mySkill)}</span>
        <span class="card__skill card__skill--seek">Learn: ${escapeHtml(exchange.seekingSkill)}</span>
      </div>
      <p class="card__description">${escapeHtml(exchange.description)}</p>
      <div class="card__footer">
        <div class="card__author">
          <span class="card__avatar" aria-hidden="true">${initial}</span>
          <span>${escapeHtml(exchange.author)}</span>
        </div>
        <div class="card__footer-right">
          <span class="card__time">${timeAgo(exchange.createdAt)}</span>
          ${showResolveBtn ? `<button type="button" class="card__resolve" data-id="${exchange.id}">Mark Resolved</button>` : ""}
          <button type="button" class="card__respond" data-id="${exchange.id}">${resolved ? "View Discussion" : "Join Discussion"}</button>
        </div>
      </div>
    `;

    card.querySelector(".card__respond").addEventListener("click", () => {
      openChatModal("exchange", exchange.id, getPostDisplayTitle("exchange", exchange), exchange.author);
    });

    const resolveBtn = card.querySelector(".card__resolve");
    if (resolveBtn) {
      resolveBtn.addEventListener("click", () => {
        if (confirm("Mark this exchange as resolved? It will be archived from the active feed.")) {
          markResolved("exchange", exchange.id);
        }
      });
    }

    return card;
  }

  function createCard(req) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("role", "listitem");

    const label = SUBJECT_LABELS[req.subject] || "Other";
    const initial = req.author.charAt(0).toUpperCase();
    const resolved = isResolved(req);
    const showResolveBtn = canResolve(req);

    card.innerHTML = `
      <div class="card__header">
        <h3 class="card__title">${escapeHtml(req.title)}</h3>
        <div class="card__badges">
          ${resolved ? '<span class="badge--resolved">Resolved</span>' : ""}
          <span class="card__badge badge--${req.subject}">${label}</span>
        </div>
      </div>
      <p class="card__description">${escapeHtml(req.description)}</p>
      <div class="card__footer">
        <div class="card__author">
          <span class="card__avatar" aria-hidden="true">${initial}</span>
          <span>${escapeHtml(req.author)}</span>
        </div>
        <div class="card__footer-right">
          <span class="card__time">${timeAgo(req.createdAt)}</span>
          ${showResolveBtn ? `<button type="button" class="card__resolve" data-id="${req.id}">Mark Resolved</button>` : ""}
          <button type="button" class="card__respond" data-id="${req.id}">${resolved ? "View Discussion" : "Join Discussion"}</button>
        </div>
      </div>
    `;

    card.querySelector(".card__respond").addEventListener("click", () => {
      openChatModal("request", req.id, getPostDisplayTitle("request", req), req.author);
    });

    const resolveBtn = card.querySelector(".card__resolve");
    if (resolveBtn) {
      resolveBtn.addEventListener("click", () => {
        if (confirm("Mark this request as resolved? It will be archived from the active feed.")) {
          markResolved("request", req.id);
        }
      });
    }

    return card;
  }

  // ── Resolve / archive ────────────────────────────────────────────
  function markResolved(kind, id) {
    const record = getPostRecord(kind, id);
    if (!record) return;

    // Defense-in-depth: the button is only rendered for the owner, but
    // enforce the same rule here in case this is ever called another way.
    if (normalizeUsername(record.author) !== normalizeUsername(currentUser?.username || "")) {
      return;
    }

    record.status = "resolved";
    record.resolvedAt = Date.now();
    if (kind === "request") saveRequests();
    else saveExchanges();

    renderFeed();

    if (activeChatThreadId === getThreadId(kind, id)) {
      updateChatModalHeader();
    }
  }

  // ── Modals ──────────────────────────────────────────────────────
  function openPostModal() {
    postForm.reset();
    if (isLoggedIn()) {
      document.getElementById("post-author").value = currentUser.username;
    }
    postModal.showModal();
  }

  function closePostModal() {
    postModal.close();
  }

  function openAuthModal(mode = "login", message) {
    authForm.reset();
    setAuthMode(mode);
    if (message) showAuthError(message);
    else clearAuthError();
    authModal.showModal();
    document.getElementById("auth-username").focus();
  }

  function closeAuthModal() {
    authModal.close();
    authForm.reset();
    setAuthMode("login");
    clearAuthError();
  }

  // ── Chat (shared group thread per post) ───────────────────────────
  function openChatModal(kind, id, title, author) {
    if (!isLoggedIn()) {
      openAuthModal("login", "Please log in to join the discussion.");
      return;
    }

    activeChatKind = kind;
    activeChatPostId = id;
    activeChatPostTitle = title;
    activeChatPostAuthor = author;
    activeChatThreadId = getThreadId(kind, id);
    lastRenderedChatSignature = null; // force a fresh render for the new thread

    updateChatModalHeader();
    renderChatThread({ force: true });
    chatModal.showModal();
    chatInput.value = "";
    chatInput.focus();
    startChatPolling();
  }

  // Keeps the modal's title/subtitle/resolved badge in sync with the live
  // request/exchange record (e.g. if it gets marked resolved while open).
  function updateChatModalHeader() {
    const record = getPostRecord(activeChatKind, activeChatPostId);
    const title = record ? getPostDisplayTitle(activeChatKind, record) : activeChatPostTitle;
    const author = record ? record.author : activeChatPostAuthor;
    const resolved = record ? isResolved(record) : false;

    chatModalTitle.textContent = title;
    chatModalSubtitle.textContent = `Started by ${author} · open to anyone`;
    chatModalBadge.hidden = !resolved;
  }

  function closeChatModal() {
    chatModal.close(); // triggers the 'close' listener below, which does cleanup
  }

  // Always re-reads localStorage — never trusts an in-memory copy of the
  // thread — so two tabs/accounts converge on the same message array.
  function getActiveThreadMessages() {
    if (!activeChatThreadId) return [];
    const chats = loadChats();
    const thread = chats[activeChatThreadId];
    return thread ? thread.messages : [];
  }

  // Cheap fingerprint of the thread so we can skip re-rendering (and
  // stealing scroll position / input focus) when nothing has changed.
  function getChatSignature(messages) {
    if (messages.length === 0) return "0";
    const last = messages[messages.length - 1];
    return `${messages.length}:${last.timestamp}`;
  }

  function renderChatThread({ force = false } = {}) {
    if (!activeChatThreadId) return;

    const messages = getActiveThreadMessages();
    const signature = getChatSignature(messages);

    if (!force && signature === lastRenderedChatSignature) return;
    lastRenderedChatSignature = signature;

    chatMessagesEl.innerHTML = "";

    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "No messages yet. Say hello!";
      chatMessagesEl.appendChild(empty);
      return;
    }

    messages.forEach((msg) => {
      const mine = normalizeUsername(msg.sender) === normalizeUsername(currentUser.username);
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${mine ? "chat-bubble--mine" : "chat-bubble--theirs"}`;
      // Group thread can have more than 2 participants, so label who sent
      // each non-mine message (own messages are already on the right).
      bubble.innerHTML = `
        ${mine ? "" : `<span class="chat-bubble__sender">${escapeHtml(msg.sender)}</span>`}
        <span class="chat-bubble__text">${escapeHtml(msg.text)}</span>
        <span class="chat-bubble__time">${formatChatTime(msg.timestamp)}</span>
      `;
      chatMessagesEl.appendChild(bubble);
    });

    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function sendChatMessage(text) {
    if (!activeChatThreadId || !isLoggedIn()) return;

    // Re-load right before writing (not the stale copy from the last
    // render) so a message that arrived from the other tab a moment ago
    // doesn't get clobbered by this write.
    const chats = loadChats();
    if (!chats[activeChatThreadId]) {
      chats[activeChatThreadId] = {
        postKind: activeChatKind,
        postId: activeChatPostId,
        postTitle: activeChatPostTitle,
        postAuthor: activeChatPostAuthor,
        messages: [],
      };
    }

    chats[activeChatThreadId].messages.push({
      sender: currentUser.username,
      text,
      timestamp: Date.now(),
    });

    saveChats(chats);
    renderChatThread();
  }

  // ── Inbox ──────────────────────────────────────────────────────
  // A thread counts as "yours" if you started the post it's attached to,
  // or you've sent at least one message in it. Threads with zero messages
  // aren't real conversations yet, so they're left out of the Inbox.
  function getInboxConversations() {
    if (!isLoggedIn()) return [];

    const chats = loadChats();
    const me = normalizeUsername(currentUser.username);

    return Object.entries(chats)
      .map(([threadId, thread]) => {
        if (!thread.messages || thread.messages.length === 0) return null;

        const record = getPostRecord(thread.postKind, thread.postId);
        const title = record ? getPostDisplayTitle(thread.postKind, record) : thread.postTitle;
        const author = record ? record.author : thread.postAuthor;
        const resolved = record ? isResolved(record) : false;

        const participates =
          normalizeUsername(author) === me ||
          thread.messages.some((m) => normalizeUsername(m.sender) === me);

        if (!participates) return null;

        const lastMessage = thread.messages[thread.messages.length - 1];

        return {
          threadId,
          kind: thread.postKind,
          postId: thread.postId,
          title,
          author,
          resolved,
          lastMessage,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
  }

  function renderInbox() {
    const conversations = getInboxConversations();
    inboxList.innerHTML = "";

    if (conversations.length === 0) {
      inboxEmpty.hidden = false;
      return;
    }

    inboxEmpty.hidden = true;

    conversations.forEach((convo) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "inbox-item";

      const rawPreview = `${convo.lastMessage.sender}: ${convo.lastMessage.text}`;
      const preview = rawPreview.length > 90 ? `${rawPreview.slice(0, 90)}…` : rawPreview;

      item.innerHTML = `
        <div class="inbox-item__top">
          <span class="inbox-item__title">${escapeHtml(convo.title)}</span>
          ${convo.resolved ? '<span class="inbox-item__badge">Resolved</span>' : ""}
        </div>
        <p class="inbox-item__preview">${escapeHtml(preview)}</p>
        <span class="inbox-item__time">${timeAgo(convo.lastMessage.timestamp)}</span>
      `;

      item.addEventListener("click", () => {
        closeInboxModal();
        openChatModal(convo.kind, convo.postId, convo.title, convo.author);
      });

      inboxList.appendChild(item);
    });
  }

  function openInboxModal() {
    if (!isLoggedIn()) return;
    renderInbox();
    inboxModal.showModal();
  }

  function closeInboxModal() {
    inboxModal.close();
  }

  function formatChatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // The `storage` event is the fast path, but it only fires in *other*
  // tabs, isn't guaranteed on every browser/setup (notably flaky for
  // file:// origins), and never fires in the tab that made the write. A
  // short poll while the modal is open is a reliable fallback/backstop for
  // all of those cases; renderChatThread() no-ops if nothing changed.
  function startChatPolling() {
    stopChatPolling();
    chatPollTimer = window.setInterval(() => {
      if (!activeChatThreadId || !chatModal.open) {
        stopChatPolling();
        return;
      }
      renderChatThread();
    }, 1200);
  }

  function stopChatPolling() {
    if (chatPollTimer) {
      window.clearInterval(chatPollTimer);
      chatPollTimer = null;
    }
  }

  // ── Form submit ─────────────────────────────────────────────────
  postForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const newRequest = {
      id: crypto.randomUUID(),
      title: document.getElementById("post-title").value.trim(),
      subject: document.getElementById("post-subject").value,
      description: document.getElementById("post-description").value.trim(),
      author: document.getElementById("post-author").value.trim(),
      status: "active",
      createdAt: Date.now(),
    };

    requests.unshift(newRequest);
    saveRequests();
    renderFeed();
    closePostModal();
  });

  // ── Event listeners ─────────────────────────────────────────────
  themeToggle.addEventListener("click", toggleTheme);

  filterSubject.addEventListener("change", renderFeed);

  document.getElementById("modal-close").addEventListener("click", closePostModal);
  document.getElementById("modal-cancel").addEventListener("click", closePostModal);

  exchangeForm.addEventListener("submit", (e) => {
    e.preventDefault();

    if (!isLoggedIn()) {
      showExchangeError("You must be logged in to submit an exchange.");
      return;
    }

    const mySkill = document.getElementById("my-skill").value.trim();
    const seekingSkill = document.getElementById("seeking-skill").value.trim();
    const description = document.getElementById("exchange-description").value.trim();

    submitExchange(mySkill, seekingSkill, description);
  });

  document.getElementById("hero-post-btn").addEventListener("click", () => {
    if (isLoggedIn()) {
      exchangeSection.scrollIntoView({ behavior: "smooth" });
      document.getElementById("my-skill").focus();
      return;
    }
    openAuthModal("login");
  });

  document.querySelectorAll("[data-nav='post']").forEach((el) => {
    el.addEventListener("click", () => {
      closeMobileNav();
      if (isLoggedIn()) {
        exchangeSection.scrollIntoView({ behavior: "smooth" });
        document.getElementById("my-skill").focus();
        return;
      }
      openPostModal();
    });
  });

  document.getElementById("login-btn").addEventListener("click", () => openAuthModal("login"));
  document.getElementById("signup-btn").addEventListener("click", () => openAuthModal("signup"));
  document.getElementById("mobile-login").addEventListener("click", () => {
    closeMobileNav();
    openAuthModal("login");
  });
  document.getElementById("mobile-signup").addEventListener("click", () => {
    closeMobileNav();
    openAuthModal("signup");
  });

  document.getElementById("logout-btn").addEventListener("click", logOut);
  document.getElementById("mobile-logout").addEventListener("click", logOut);

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
  });

  document.getElementById("auth-close").addEventListener("click", closeAuthModal);
  document.getElementById("auth-cancel").addEventListener("click", closeAuthModal);

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("auth-username").value;
    const password = document.getElementById("auth-password").value;
    const confirmPassword = document.getElementById("auth-password-confirm").value;

    clearAuthError();
    authSubmit.disabled = true;

    let success = false;
    if (authMode === "signup") {
      success = await signUp(username, password, confirmPassword);
    } else {
      success = await logIn(username, password);
    }

    authSubmit.disabled = false;

    if (success) closeAuthModal();
  });

  menuToggle.addEventListener("click", () => {
    const isOpen = !mobileNav.hidden;
    mobileNav.hidden = isOpen;
    menuToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  function closeMobileNav() {
    mobileNav.hidden = true;
    menuToggle.setAttribute("aria-expanded", "false");
  }

  chatClose.addEventListener("click", closeChatModal);

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    sendChatMessage(text);
    chatInput.value = "";
    chatInput.focus();
  });

  // Live-sync messages across open tabs/windows (e.g. two students chatting
  // in separate tabs) by listening for localStorage changes to the chat store.
  // This fires only in *other* tabs than the one that wrote the data, which
  // is exactly the case we need (the sender's own tab already re-rendered
  // synchronously inside sendChatMessage()).
  window.addEventListener("storage", (e) => {
    if (e.key === CHATS_KEY && activeChatThreadId && chatModal.open) {
      renderChatThread();
    }
  });

  // Catch same-machine edge cases the storage event can miss (e.g. the tab
  // was backgrounded/throttled) by refreshing whenever this tab regains focus.
  window.addEventListener("focus", () => {
    if (activeChatThreadId && chatModal.open) renderChatThread();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && activeChatThreadId && chatModal.open) {
      renderChatThread();
    }
  });

  // Close modals on backdrop click
  postModal.addEventListener("click", (e) => {
    if (e.target === postModal) closePostModal();
  });
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) closeAuthModal();
  });
  chatModal.addEventListener("click", (e) => {
    if (e.target === chatModal) closeChatModal();
  });

  // Safety net: however the <dialog> closes (Escape key, backdrop click,
  // our own closeChatModal, etc.) make sure the poll timer always stops.
  chatModal.addEventListener("close", () => {
    stopChatPolling();
    activeChatKind = null;
    activeChatThreadId = null;
    activeChatPostId = null;
    activeChatPostTitle = null;
    activeChatPostAuthor = null;
    lastRenderedChatSignature = null;
  });

  // ── Inbox event listeners ─────────────────────────────────────────
  inboxBtn.addEventListener("click", openInboxModal);
  mobileInboxBtn.addEventListener("click", () => {
    closeMobileNav();
    openInboxModal();
  });
  inboxClose.addEventListener("click", closeInboxModal);
  inboxModal.addEventListener("click", (e) => {
    if (e.target === inboxModal) closeInboxModal();
  });

  filterResolved.addEventListener("change", renderFeed);

  // ── Utilities ───────────────────────────────────────────────────
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
})();