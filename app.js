(function () {
  "use strict";

  const STORAGE_KEY = "echo-requests";
  const THEME_KEY = "echo-theme";

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
      createdAt: Date.now() - 1000 * 60 * 45,
    },
    {
      id: crypto.randomUUID(),
      title: "Proofreading my history essay",
      subject: "writing",
      description: "Need someone to review grammar and flow for a 5-page paper on the Industrial Revolution.",
      author: "Jordan",
      createdAt: Date.now() - 1000 * 60 * 60 * 3,
    },
    {
      id: crypto.randomUUID(),
      title: "Understanding stoichiometry",
      subject: "science",
      description: "Can someone walk me through balancing chemical equations step by step?",
      author: "Sam",
      createdAt: Date.now() - 1000 * 60 * 60 * 8,
    },
    {
      id: crypto.randomUUID(),
      title: "Logo design feedback",
      subject: "design",
      description: "Looking for quick critique on a club logo I made in Figma before submitting it.",
      author: "Riley",
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
  const themeToggle = document.getElementById("theme-toggle");
  const menuToggle = document.getElementById("menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  const yearEl = document.getElementById("year");

  // ── State ─────────────────────────────────────────────────────
  let requests = loadRequests();

  // ── Init ──────────────────────────────────────────────────────
  initTheme();
  yearEl.textContent = new Date().getFullYear();
  renderFeed();

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
      if (stored) return JSON.parse(stored);
    } catch {
      /* fall through */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SAMPLE_REQUESTS));
    return SAMPLE_REQUESTS;
  }

  function saveRequests() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(requests));
  }

  // ── Feed rendering ──────────────────────────────────────────────
  function renderFeed() {
    const filter = filterSubject.value;
    const filtered =
      filter === "all" ? requests : requests.filter((r) => r.subject === filter);

    feedGrid.innerHTML = "";

    if (filtered.length === 0) {
      feedEmpty.hidden = false;
      return;
    }

    feedEmpty.hidden = true;

    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);

    sorted.forEach((req) => {
      feedGrid.appendChild(createCard(req));
    });
  }

  function createCard(req) {
    const card = document.createElement("article");
    card.className = "card";
    card.setAttribute("role", "listitem");

    const label = SUBJECT_LABELS[req.subject] || "Other";
    const initial = req.author.charAt(0).toUpperCase();

    card.innerHTML = `
      <div class="card__header">
        <h3 class="card__title">${escapeHtml(req.title)}</h3>
        <span class="card__badge badge--${req.subject}">${label}</span>
      </div>
      <p class="card__description">${escapeHtml(req.description)}</p>
      <div class="card__footer">
        <div class="card__author">
          <span class="card__avatar" aria-hidden="true">${initial}</span>
          <span>${escapeHtml(req.author)}</span>
        </div>
        <div class="card__footer-right">
          <span class="card__time">${timeAgo(req.createdAt)}</span>
          <button type="button" class="card__respond" data-id="${req.id}">Respond</button>
        </div>
      </div>
    `;

    card.querySelector(".card__respond").addEventListener("click", () => {
      openAuthModal("Sign in to respond to this request.");
    });

    return card;
  }

  // ── Modals ──────────────────────────────────────────────────────
  function openPostModal() {
    postForm.reset();
    postModal.showModal();
  }

  function closePostModal() {
    postModal.close();
  }

  function openAuthModal(message) {
    const text = authModal.querySelector(".modal__text");
    if (message) text.textContent = message;
    authModal.showModal();
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

  document.getElementById("hero-post-btn").addEventListener("click", openPostModal);

  document.querySelectorAll("[data-nav='post']").forEach((el) => {
    el.addEventListener("click", () => {
      closeMobileNav();
      openPostModal();
    });
  });

  document.getElementById("login-btn").addEventListener("click", () => openAuthModal());
  document.getElementById("signup-btn").addEventListener("click", () => openAuthModal());
  document.getElementById("mobile-login").addEventListener("click", () => {
    closeMobileNav();
    openAuthModal();
  });
  document.getElementById("mobile-signup").addEventListener("click", () => {
    closeMobileNav();
    openAuthModal();
  });

  document.getElementById("auth-close").addEventListener("click", () => authModal.close());
  document.getElementById("auth-cancel").addEventListener("click", () => authModal.close());

  authModal.addEventListener("submit", (e) => {
    e.preventDefault();
    authModal.close();
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

  // Close modals on backdrop click
  postModal.addEventListener("click", (e) => {
    if (e.target === postModal) closePostModal();
  });
  authModal.addEventListener("click", (e) => {
    if (e.target === authModal) authModal.close();
  });

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
