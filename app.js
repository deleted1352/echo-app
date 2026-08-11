(function () {
  "use strict";

  // ── Supabase client ───────────────────────────────────────────────
  // (Your project URL + anon key go here — already set up, per your note.)
  const supabase = window.supabase.createClient(
    "https://bewvbsntbflxytugackd.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3Zic250YmZseHl0dWdhY2tkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzkxOTAsImV4cCI6MjEwMjA1NTE5MH0.Me3BSLFYiVz4ppx4jR_UlfP1Bn8yUqFUz7vj6PNPgK8"
  );

  const THEME_KEY = "echo-theme"; // theme preference stays local — no need for a round trip

  const SUBJECT_LABELS = {
    math: "Math",
    science: "Science",
    writing: "Writing",
    coding: "Coding",
    design: "Design",
    other: "Other",
  };

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
  let requests = [];
  let exchanges = [];
  let currentUser = null;
  let authMode = "login";
  let activeChatKind = null; // "request" | "exchange"
  let activeChatPostId = null;
  let activeChatPostTitle = null;
  let activeChatPostAuthor = null;
  let chatChannel = null;

  // ── Init ──────────────────────────────────────────────────────
  init();

  async function init() {
    initTheme();
    yearEl.textContent = new Date().getFullYear();

    currentUser = await loadSession();
    await refreshFeed();
    updateAuthUI();
    subscribeToFeed();
    watchAuthState();
  }

  // Keeps currentUser correct on its own — a token refresh, a session
  // expiring, or logging in/out in another tab all fire this, not just
  // this tab's own signUp()/logIn()/logOut() calls.
  function watchAuthState() {
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .single();
        currentUser = profile ? { username: profile.username, id: session.user.id } : null;
      } else {
        currentUser = null;
      }
      updateAuthUI();
    });
  }

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

  // ── Posts (shared, server-side) ────────────────────────────────────
  function normalizePost(row) {
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      subject: row.subject,
      description: row.description,
      mySkill: row.my_skill,
      seekingSkill: row.seeking_skill,
      author: row.author_name,
      authorId: row.author_id,
      status: row.status,
      createdAt: new Date(row.created_at).getTime(),
    };
  }

  async function refreshFeed() {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    const posts = data.map(normalizePost);
    requests = posts.filter((p) => p.kind === "request");
    exchanges = posts.filter((p) => p.kind === "exchange");
    renderFeed();
  }

  // fields uses DB column names directly (title/subject/description or
  // my_skill/seeking_skill) — author/status are always set server-side here.
  async function createPost(kind, fields) {
    const { error } = await supabase.from("posts").insert({
      kind,
      ...fields,
      author_id: currentUser.id,
      author_name: currentUser.username,
      status: "active",
    });
    if (error) {
      console.error(error);
      return false;
    }
    return true;
  }

  // No client-side ownership check needed — the "only the author can
  // update their post" RLS policy rejects this at the database level for
  // anyone else, so the button being hidden is a UX nicety, not the guard.
  async function markResolved(id) {
    const { error } = await supabase
      .from("posts")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      console.error(error);
      return;
    }

    await refreshFeed();
    if (activeChatPostId === id) updateChatModalHeader();
  }

  function subscribeToFeed() {
    supabase
      .channel("posts-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        refreshFeed();
      })
      .subscribe();
  }

  function getPostKind(id) {
    if (requests.some((r) => r.id === id)) return "request";
    if (exchanges.some((x) => x.id === id)) return "exchange";
    return null;
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
  function usernameToEmail(username) {
    return `${normalizeUsername(username)}@echo.local`;
  }

  function normalizeUsername(username) {
    return username.trim().toLowerCase();
  }

  function displayUsername(username) {
    return username.trim();
  }

  async function loadSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", data.session.user.id)
      .single();

    return profile ? { username: profile.username, id: data.session.user.id } : null;
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

    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      showAuthError(error.message);
      return false;
    }

    // Public username row, separate from the private auth.users record.
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: data.user.id, username: displayUsername(username) });
    if (profileError) {
      showAuthError(profileError.message);
      return false;
    }

    currentUser = { username: displayUsername(username), id: data.user.id };
    updateAuthUI();
    return true;
  }

  async function logIn(username, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(username),
      password,
    });
    if (error) {
      showAuthError("Invalid username or password.");
      return false;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", data.user.id)
      .single();

    currentUser = { username: profile.username, id: data.user.id };
    updateAuthUI();
    return true;
  }

  async function logOut() {
    await supabase.auth.signOut();
    currentUser = null;
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
    if (!mySkill) return "Please enter the skill you can teach.";
    if (mySkill.length < 2) return "My Skill must be at least 2 characters.";
    if (!seekingSkill) return "Please enter the skill you are seeking.";
    if (seekingSkill.length < 2) return "Seeking Skill must be at least 2 characters.";
    if (!description) return "Please add a description for your exchange.";
    if (description.length < 10) return "Description must be at least 10 characters.";
    return "";
  }

  async function submitExchange(mySkill, seekingSkill, description) {
    const validationError = validateExchangeInput(mySkill, seekingSkill, description);
    if (validationError) {
      showExchangeError(validationError);
      return false;
    }

    const ok = await createPost("exchange", {
      my_skill: mySkill,
      seeking_skill: seekingSkill,
      description,
    });

    if (!ok) {
      showExchangeError("Something went wrong submitting your exchange. Please try again.");
      return false;
    }

    exchangeForm.reset();
    clearExchangeError();
    await refreshFeed();
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
      resolveBtn.addEventListener("click", async () => {
        if (confirm("Mark this exchange as resolved? It will be archived from the active feed.")) {
          await markResolved(exchange.id);
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
      resolveBtn.addEventListener("click", async () => {
        if (confirm("Mark this request as resolved? It will be archived from the active feed.")) {
          await markResolved(req.id);
        }
      });
    }

    return card;
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

  // ── Chat (shared group thread per post, backed by Supabase Realtime) ──
  async function openChatModal(kind, id, title, author) {
    if (!isLoggedIn()) {
      openAuthModal("login", "Please log in to join the discussion.");
      return;
    }

    activeChatKind = kind;
    activeChatPostId = id;
    activeChatPostTitle = title;
    activeChatPostAuthor = author;

    updateChatModalHeader();
    chatModal.showModal();
    chatInput.value = "";
    chatInput.focus();

    await renderChatThread();
    subscribeToThread(id);
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

  function buildChatBubble(msg) {
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
    return bubble;
  }

  async function loadThreadMessages(postId) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      return [];
    }

    return data.map((row) => ({
      sender: row.sender_name,
      text: row.text,
      timestamp: new Date(row.created_at).getTime(),
    }));
  }

  async function renderChatThread() {
    if (!activeChatPostId) return;

    const messages = await loadThreadMessages(activeChatPostId);
    chatMessagesEl.innerHTML = "";

    if (messages.length === 0) {
      const empty = document.createElement("p");
      empty.className = "chat-empty";
      empty.textContent = "No messages yet. Say hello!";
      chatMessagesEl.appendChild(empty);
      return;
    }

    messages.forEach((msg) => chatMessagesEl.appendChild(buildChatBubble(msg)));
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  async function sendChatMessage(text) {
    if (!activeChatPostId || !isLoggedIn()) return;

    const { error } = await supabase.from("messages").insert({
      post_id: activeChatPostId,
      sender_id: currentUser.id,
      sender_name: currentUser.username,
      text,
    });

    if (error) console.error(error);
    // No manual re-render here — the realtime subscription below appends
    // the new message (for this tab and every other open tab/account).
  }

  // Live-updates the open chat modal the instant anyone (including this
  // user, in another tab) inserts a message for this post — no polling,
  // no localStorage `storage` event, just a Postgres change subscription.
  function subscribeToThread(postId) {
    unsubscribeFromThread();

    chatChannel = supabase
      .channel(`messages:${postId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `post_id=eq.${postId}` },
        (payload) => {
          const row = payload.new;
          const msg = {
            sender: row.sender_name,
            text: row.text,
            timestamp: new Date(row.created_at).getTime(),
          };

          const emptyState = chatMessagesEl.querySelector(".chat-empty");
          if (emptyState) emptyState.remove();

          chatMessagesEl.appendChild(buildChatBubble(msg));
          chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
        }
      )
      .subscribe();
  }

  function unsubscribeFromThread() {
    if (chatChannel) {
      supabase.removeChannel(chatChannel);
      chatChannel = null;
    }
  }

  function formatChatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── Inbox ──────────────────────────────────────────────────────
  // A conversation counts as "yours" if you started the post it's attached
  // to, or you've sent at least one message in it. One bulk query for the
  // relevant posts' messages, newest first, deduped client-side to the
  // latest message per post.
  async function getInboxConversations() {
    if (!isLoggedIn()) return [];

    const [{ data: ownPosts, error: ownError }, { data: myMessages, error: msgError }] =
      await Promise.all([
        supabase.from("posts").select("id").eq("author_id", currentUser.id),
        supabase.from("messages").select("post_id").eq("sender_id", currentUser.id),
      ]);

    if (ownError) console.error(ownError);
    if (msgError) console.error(msgError);

    const postIds = Array.from(
      new Set([...(ownPosts || []).map((p) => p.id), ...(myMessages || []).map((m) => m.post_id)])
    );
    if (postIds.length === 0) return [];

    const { data: threadMessages, error } = await supabase
      .from("messages")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }

    const seen = new Set();
    const conversations = [];

    for (const row of threadMessages) {
      if (seen.has(row.post_id)) continue; // rows are newest-first, so first hit = latest
      seen.add(row.post_id);

      const kind = getPostKind(row.post_id);
      const record = kind ? getPostRecord(kind, row.post_id) : null;
      if (!kind || !record) continue; // post no longer in our local cache

      conversations.push({
        kind,
        postId: row.post_id,
        title: getPostDisplayTitle(kind, record),
        author: record.author,
        resolved: isResolved(record),
        lastMessage: {
          sender: row.sender_name,
          text: row.text,
          timestamp: new Date(row.created_at).getTime(),
        },
      });
    }

    return conversations; // already newest-first
  }

  async function renderInbox() {
    const conversations = await getInboxConversations();
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

  async function openInboxModal() {
    if (!isLoggedIn()) return;
    await renderInbox();
    inboxModal.showModal();
  }

  function closeInboxModal() {
    inboxModal.close();
  }

  // ── Form submit ─────────────────────────────────────────────────
  postForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const ok = await createPost("request", {
      title: document.getElementById("post-title").value.trim(),
      subject: document.getElementById("post-subject").value,
      description: document.getElementById("post-description").value.trim(),
    });

    if (ok) {
      await refreshFeed();
      closePostModal();
    }
  });

  // ── Event listeners ─────────────────────────────────────────────
  themeToggle.addEventListener("click", toggleTheme);

  filterSubject.addEventListener("change", renderFeed);
  filterResolved.addEventListener("change", renderFeed);

  document.getElementById("modal-close").addEventListener("click", closePostModal);
  document.getElementById("modal-cancel").addEventListener("click", closePostModal);

  exchangeForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isLoggedIn()) {
      showExchangeError("You must be logged in to submit an exchange.");
      return;
    }

    const mySkill = document.getElementById("my-skill").value.trim();
    const seekingSkill = document.getElementById("seeking-skill").value.trim();
    const description = document.getElementById("exchange-description").value.trim();

    await submitExchange(mySkill, seekingSkill, description);
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

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    await sendChatMessage(text);
    chatInput.focus();
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
  inboxModal.addEventListener("click", (e) => {
    if (e.target === inboxModal) closeInboxModal();
  });

  // Safety net: however the <dialog> closes (Escape key, backdrop click,
  // our own closeChatModal, etc.) make sure the realtime channel is torn down.
  chatModal.addEventListener("close", () => {
    unsubscribeFromThread();
    activeChatKind = null;
    activeChatPostId = null;
    activeChatPostTitle = null;
    activeChatPostAuthor = null;
  });

  // ── Inbox event listeners ─────────────────────────────────────────
  inboxBtn.addEventListener("click", openInboxModal);
  mobileInboxBtn.addEventListener("click", () => {
    closeMobileNav();
    openInboxModal();
  });
  inboxClose.addEventListener("click", closeInboxModal);

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