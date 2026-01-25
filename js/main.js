import { Game } from "./game.js";
import {
  auth,
  db,
  provider,
  serverTimestamp,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from "./firebase.js";

console.log("Maayping: main.js loaded");

// Main application controller
class App {
  constructor() {
    console.log("Maayping: App constructor called");
    this.game = null;
    this.currentLanguage = null;
    this.currentSpeedMultiplier = 1;
    this.profile = null;
    this.profileId = "default";
    this.profileLoaded = false;
    this.emojiChoices = [
      "🦫",
      "🐻",
      "🦊",
      "🐼",
      "🐸",
      "🐕",
      "🐈",
      "🐰",
      "🦁",
      "🐨",
      "🐯",
      "🦄",
      "🐙",
      "🐧",
      "🐥",
      "🐢",
      "🦉",
      "🦋",
      "🐿️",
      "🦔",
    ];

    // DOM elements
    this.menuScreen = document.getElementById("menu-screen");
    this.gameScreen = document.getElementById("game-screen");
    this.pauseModal = document.getElementById("pause-modal");
    this.gameOverModal = document.getElementById("game-over-modal");
    this.canvas = document.getElementById("game-canvas");
    this.mobileKeyboardInput = document.getElementById("mobile-keyboard");
    this.mobileLastValue = "";
    this.profileModal = document.getElementById("profile-modal");
    this.profileModalContent = document.getElementById("profile-modal-content");
    this.profileModalTitle = document.getElementById("profile-modal-title");
    this.profileModalMessage = document.getElementById("profile-modal-message");
    this.profileNameInput = document.getElementById("profile-name");
    this.emojiGrid = document.getElementById("emoji-grid");
    this.createProfileBtn = document.getElementById("create-profile-btn");
    this.cancelProfileBtn = document.getElementById("cancel-profile-btn");
    this.selectedEmoji = null;
    this.profileModalMode = "edit";
    this.profileModalAction = "save";
    this.authAvatar = document.getElementById("auth-avatar");
    this.authAvatarBtn = document.getElementById("auth-avatar-btn");
    this.authAvatarImg = document.getElementById("auth-avatar-img");
    this.authAvatarFallback = document.getElementById("auth-avatar-fallback");
    this.titleEmoji = document.getElementById("title-emoji");
    this.accountFooter = document.getElementById("account-footer");
    this.footerProfileBtn = document.getElementById("footer-profile-btn");
    this.footerLoginBtn = document.getElementById("footer-login-btn");
    this.footerStatsBtn = document.getElementById("footer-stats-btn");
    this.footerEditBtn = document.getElementById("footer-edit-btn");
    this.footerLogoutBtn = document.getElementById("footer-logout-btn");
    this.statsModal = document.getElementById("stats-modal");
    this.statsSummaryList = document.getElementById("stats-summary-list");
    this.statsRecentList = document.getElementById("stats-recent-list");
    this.statsEmptyState = document.getElementById("stats-empty");
    this.statsGrid = document.getElementById("stats-grid");
    this.statsCloseBtn = document.getElementById("stats-close-btn");

    this.authUser = null;
    this.allowAnonymous = this.isLocalEnvironment();
    this.localProfileKey = "maayping-local-profile";
    this.syncIndicator = null;
    this.syncIndicatorTimeout = null;
    this.lastSyncAt = 0;
    this.syncTimerId = null;
    this.syncThrottleMs = 1000;
    this.isManualSignOut = false;

    this.renderEmojiGrid();
    this.applyProfileDifficulty();
    this.updateTitleEmoji();

    this.ensureFooterLoginButton();
    this.footerLoginBtn = document.getElementById("footer-login-btn");

    if (this.allowAnonymous) {
      this.ensureLocalProfile();
    }

    this.initializeFirebase();

    this.setupEventListeners();
    this.updatePlayAvailability();
  }

  // Set up all UI event listeners
  setupEventListeners() {
    // Language selection buttons
    const langButtons = document.querySelectorAll(".lang-btn");
    console.log("Maayping: Found", langButtons.length, "language buttons");

    langButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const language = btn.dataset.lang;
        console.log("Maayping: Language selected:", language);
        this.startGame(language);
      });
    });

    // Difficulty selection buttons
    const difficultyButtons = document.querySelectorAll(".difficulty-btn");
    difficultyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        difficultyButtons.forEach((other) =>
          other.classList.remove("selected"),
        );
        btn.classList.add("selected");
        const speedMultiplier = parseFloat(btn.dataset.speed);
        this.currentSpeedMultiplier = Number.isFinite(speedMultiplier)
          ? speedMultiplier
          : 1;
        this.persistProfileDifficulty();
      });
    });

    // Profile modal buttons
    this.createProfileBtn.addEventListener("click", () =>
      this.handleProfileModalPrimaryAction(),
    );
    this.cancelProfileBtn.addEventListener("click", () =>
      this.closeProfileModal(),
    );

    // Pause button
    document.getElementById("pause-btn").addEventListener("click", () => {
      if (this.game) {
        this.game.togglePause();
      }
    });

    // Tap game screen to re-open keyboard on touch devices
    this.gameScreen.addEventListener("touchstart", () => this.ensureKeyboard());

    if (this.mobileKeyboardInput) {
      this.mobileKeyboardInput.addEventListener("input", (event) =>
        this.handleMobileInput(event),
      );
      this.mobileKeyboardInput.addEventListener("compositionend", (event) =>
        this.handleMobileCompositionEnd(event),
      );
      this.mobileKeyboardInput.addEventListener("keydown", (event) =>
        this.handleMobileKeydown(event),
      );
      this.mobileKeyboardInput.addEventListener("keyup", (event) =>
        this.handleMobileKeyup(event),
      );
    }

    // Resume button (in pause modal)
    document.getElementById("resume-btn").addEventListener("click", () => {
      if (this.game) {
        this.game.resume();
      }
    });

    // Quit button (in pause modal)
    document.getElementById("quit-btn").addEventListener("click", () => {
      this.showMenu();
    });

    // Play again button
    document.getElementById("play-again-btn").addEventListener("click", () => {
      this.restartGame();
    });

    // Main menu button
    document.getElementById("menu-btn").addEventListener("click", () => {
      this.showMenu();
    });

    // Handle window focus/blur for auto-pause
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.game && this.game.state === "playing") {
        this.game.pause();
      }
    });

    if (this.authAvatarBtn) {
      this.authAvatarBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!this.authUser) {
          await this.handleLogin();
          return;
        }
        await this.openProfileModal("edit");
      });
    }

    if (this.footerProfileBtn) {
      this.footerProfileBtn.addEventListener("click", async () => {
        await this.openProfileModal("edit");
      });
    }

    if (this.footerLoginBtn) {
      this.footerLoginBtn.addEventListener("click", async () => {
        await this.handleLogin();
      });
    }

    if (this.footerStatsBtn) {
      this.footerStatsBtn.addEventListener("click", async () => {
        await this.openStatsModal();
      });
    }

    if (this.footerEditBtn) {
      this.footerEditBtn.addEventListener("click", async () => {
        await this.openProfileModal("edit");
      });
    }

    if (this.footerLogoutBtn) {
      this.footerLogoutBtn.addEventListener("click", () => {
        this.handleLogout();
      });
    }

    if (this.statsCloseBtn) {
      this.statsCloseBtn.addEventListener("click", () => {
        this.closeStatsModal();
      });
    }

    if (this.statsModal) {
      this.statsModal.addEventListener("click", (event) => {
        if (event.target === this.statsModal) {
          this.closeStatsModal();
        }
      });
    }
  }

  // Start a new game with selected language
  async startGame(language) {
    if (!this.authUser && !this.allowAnonymous) {
      this.showLoginRequiredMessage();
      return;
    }

    if (!this.profileLoaded) {
      if (this.allowAnonymous && !this.authUser) {
        this.ensureLocalProfile();
      } else {
        await this.loadUserProfile();
      }
      if (!this.profileLoaded) {
        this.showLoginRequiredMessage();
        return;
      }
    }

    this.currentLanguage = language;

    // Hide menu, show game
    this.menuScreen.classList.add("hidden");
    this.gameScreen.classList.remove("hidden");
    this.gameOverModal.classList.add("hidden");
    this.pauseModal.classList.add("hidden");

    // Clean up existing game if any
    if (this.game) {
      this.game.destroy();
    }

    // Create and initialize new game
    const playerEmoji = this.getProfileEmoji();
    this.game = new Game(
      this.canvas,
      language,
      this.currentSpeedMultiplier,
      playerEmoji,
    );
    this.applySyncIndicatorToGame();

    // Set up game end callback
    this.game.onGameEnd = (result) => this.showGameOver(result);

    try {
      await this.game.initialize();
      this.game.start();
      this.ensureKeyboard();
    } catch (error) {
      console.error("Failed to start game:", error);
      alert("Failed to load the game. Please refresh and try again.");
      this.showMenu();
    }
  }

  // Restart the current game
  async restartGame() {
    if (!this.currentLanguage) {
      this.showMenu();
      return;
    }

    this.gameOverModal.classList.add("hidden");

    // Reset and restart
    if (this.game) {
      this.game.reset();
      this.game.start();
    } else {
      await this.startGame(this.currentLanguage);
    }
  }

  // Show game over modal
  showGameOver(result) {
    const modal = this.gameOverModal;
    const modalContent = modal.querySelector(".modal-content");
    const title = document.getElementById("result-title");
    const message = document.getElementById("result-message");
    const wordsTyped = document.getElementById("words-typed");
    const accuracy = document.getElementById("accuracy");

    // Update modal styling based on result
    modalContent.classList.remove("victory", "game-over");

    if (result.victory) {
      modalContent.classList.add("victory");
      title.textContent = "Congratulations!";
      message.textContent = "You completed all the words!";
    } else {
      modalContent.classList.add("game-over");
      title.textContent = "Game Over";
      message.textContent = "A word escaped! Try again?";
    }

    // Update stats
    wordsTyped.textContent = result.wordsCompleted;
    accuracy.textContent = result.accuracy;

    this.saveProfileStats(result);
    this.renderStatsModal();

    // Show modal
    modal.classList.remove("hidden");
  }

  // Return to main menu
  showMenu() {
    // Clean up game
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }

    // Hide all screens/modals except menu
    this.gameScreen.classList.add("hidden");
    this.pauseModal.classList.add("hidden");
    this.gameOverModal.classList.add("hidden");
    this.menuScreen.classList.remove("hidden");

    this.currentLanguage = null;
  }

  ensureKeyboard() {
    if (!this.mobileKeyboardInput || !this.gameScreen) return;
    if (this.gameScreen.classList.contains("hidden")) return;
    if (!this.isTouchDevice()) return;
    this.mobileKeyboardInput.value = "";
    this.mobileLastValue = "";
    this.mobileKeyboardInput.focus({ preventScroll: true });
  }

  handleMobileInput(event) {
    if (!this.isTouchDevice()) return;
    if (!this.game || this.game.state !== "playing") return;
    const value = event.target.value || "";
    const data = event.data;
    const chars = data || value;
    if (!chars) {
      this.mobileLastValue = value;
      return;
    }
    for (const char of chars) {
      this.game.handleKeyPress(char);
    }
    event.target.value = "";
    this.mobileLastValue = "";
  }

  handleMobileCompositionEnd(event) {
    if (!this.isTouchDevice()) return;
    if (!this.game || this.game.state !== "playing") return;
    const data = event.data;
    if (!data) return;
    for (const char of data) {
      this.game.handleKeyPress(char);
    }
    if (this.mobileKeyboardInput) {
      this.mobileKeyboardInput.value = "";
      this.mobileLastValue = "";
    }
  }

  handleMobileKeyup(event) {
    if (!this.isTouchDevice()) return;
    if (!this.game || this.game.state !== "playing") return;
    if (event.key && event.key.length === 1) {
      this.game.handleKeyPress(event.key);
    }
  }

  isTouchDevice() {
    return (
      "ontouchstart" in window || window.matchMedia("(pointer: coarse)").matches
    );
  }

  handleMobileKeydown(event) {
    if (!this.game || this.game.state !== "playing") return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.game.handleKeyPress(event.key);
    }
  }

  createDefaultProfile() {
    return {
      id: this.profileId,
      name: this.authUser?.displayName || this.profile?.name || "Player",
      emoji: "🦫",
      lastDifficulty: 1,
      stats: [],
      maxSummary: {},
    };
  }

  isLocalEnvironment() {
    const hostname = window.location.hostname;
    return (
      window.location.protocol === "file:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0"
    );
  }

  ensureLocalProfile() {
    if (this.profileLoaded && this.profile) return;
    const stored = this.loadLocalProfile();
    if (stored) {
      this.profile = stored;
      this.profileLoaded = true;
      this.applyProfileDifficulty();
      return;
    }
    const profile = this.normalizeProfile(this.createDefaultProfile());
    this.profile = profile;
    this.profileLoaded = true;
    this.applyProfileDifficulty();
  }

  loadLocalProfile() {
    if (!this.allowAnonymous) return null;
    try {
      const raw = localStorage.getItem(this.localProfileKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return this.normalizeProfile(data ?? {});
    } catch (error) {
      console.warn("Failed to load local profile:", error);
      return null;
    }
  }

  saveLocalProfile() {
    if (!this.allowAnonymous || !this.profile) return;
    try {
      localStorage.setItem(
        this.localProfileKey,
        JSON.stringify({
          id: this.profile.id,
          name: this.profile.name,
          emoji: this.profile.emoji,
          lastDifficulty: this.profile.lastDifficulty ?? 1,
          stats: this.profile.stats ?? [],
          maxSummary: this.profile.maxSummary ?? {},
        }),
      );
    } catch (error) {
      console.warn("Failed to save local profile:", error);
    }
  }

  normalizeProfile(profile) {
    const normalized = { ...this.createDefaultProfile(), ...profile };
    normalized.stats = Array.isArray(profile.stats) ? profile.stats : [];
    normalized.stats = normalized.stats.map((entry) => ({
      id: entry.id || this.generateId(),
      time: entry.time ?? null,
      wordsTyped: entry.wordsTyped ?? 0,
      accuracy: entry.accuracy ?? 0,
      difficulty: entry.difficulty ?? 1,
      language: entry.language ?? null,
      localOrder: entry.localOrder ?? Date.now(),
      createdAt: entry.createdAt ?? null,
    }));
    normalized.maxSummary =
      profile.maxSummary ?? this.buildMaxSummaryFromStats(normalized.stats);
    normalized.lastDifficulty = profile.lastDifficulty ?? 1;
    return normalized;
  }

  generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  renderProfiles() {}

  applyProfileDifficulty() {
    const multiplier = this.profile?.lastDifficulty ?? 1;
    this.currentSpeedMultiplier = multiplier;
    this.setDifficultySelection(multiplier);
  }

  setDifficultySelection(multiplier) {
    const difficultyButtons = document.querySelectorAll(".difficulty-btn");
    difficultyButtons.forEach((btn) => {
      const speedMultiplier = parseFloat(btn.dataset.speed);
      btn.classList.toggle(
        "selected",
        Number.isFinite(speedMultiplier) && speedMultiplier === multiplier,
      );
    });
  }

  persistProfileDifficulty() {
    if (!this.profile) return;
    this.profile.lastDifficulty = this.currentSpeedMultiplier;
    if (this.allowAnonymous && !this.authUser) {
      this.saveLocalProfile();
      return;
    }
    this.queueProfileSync();
  }

  renderEmojiGrid() {
    if (!this.emojiGrid) return;
    this.emojiGrid.innerHTML = "";
    this.emojiChoices.forEach((emoji, index) => {
      const option = document.createElement("button");
      option.className = "emoji-option";
      option.textContent = emoji;
      option.addEventListener("click", () => this.selectEmoji(index));
      this.emojiGrid.appendChild(option);
    });
    this.selectEmoji(0);
  }

  selectEmoji(index) {
    const options = this.emojiGrid.querySelectorAll(".emoji-option");
    options.forEach((option, i) => {
      option.classList.toggle("selected", i === index);
    });
    this.selectedEmoji = this.emojiChoices[index] ?? null;
  }

  selectEmojiByValue(value) {
    const index = this.emojiChoices.findIndex((emoji) => emoji === value);
    if (index >= 0) {
      this.selectEmoji(index);
    }
  }

  async openProfileModal(mode = "edit", message = "") {
    if (!this.profileModal) return;
    this.profileModalMode = mode;
    this.profileModalAction = mode === "message" ? "login" : "save";

    if (this.profileModalContent) {
      this.profileModalContent.classList.toggle(
        "message-mode",
        mode === "message",
      );
    }

    if (this.profileModalTitle) {
      this.profileModalTitle.textContent =
        mode === "message" ? "Login required" : "Edit Profile";
    }

    if (this.profileModalMessage) {
      if (mode === "message") {
        this.profileModalMessage.textContent = message;
        this.profileModalMessage.classList.remove("hidden");
      } else {
        this.profileModalMessage.textContent = "";
        this.profileModalMessage.classList.add("hidden");
      }
    }

    if (mode === "edit") {
      if (!this.authUser && !this.allowAnonymous) {
        this.showLoginRequiredMessage();
        return;
      }
      if (!this.profileLoaded) {
        if (this.allowAnonymous && !this.authUser) {
          this.ensureLocalProfile();
        } else {
          await this.loadUserProfile();
        }
      }
      const fallbackName = this.authUser?.displayName || "";
      this.profileNameInput.value =
        this.profile?.name ?? fallbackName ?? "Player";
      const emoji = this.profile?.emoji ?? this.selectedEmoji;
      if (emoji) {
        this.selectEmojiByValue(emoji);
      }
      this.createProfileBtn.textContent = "Save";
      this.cancelProfileBtn.classList.remove("hidden");
    } else {
      this.createProfileBtn.textContent = "Login";
      this.cancelProfileBtn.textContent = "Cancel";
      this.cancelProfileBtn.classList.remove("hidden");
    }

    this.profileModal.classList.remove("hidden");
  }

  closeProfileModal() {
    this.profileModal.classList.add("hidden");
    if (this.profileModalContent) {
      this.profileModalContent.classList.remove("message-mode");
    }
    if (this.cancelProfileBtn) {
      this.cancelProfileBtn.classList.remove("hidden");
    }
  }

  async handleProfileModalPrimaryAction() {
    if (this.profileModalMode === "message") {
      this.closeProfileModal();
      if (this.allowAnonymous) {
        return;
      }
      await this.handleLogin();
      return;
    }
    await this.handleSaveProfile();
  }

  async handleSaveProfile() {
    const name = this.profileNameInput.value.trim();
    if (!name || !this.selectedEmoji) return;
    if (!this.authUser && !this.allowAnonymous) {
      this.showLoginRequiredMessage();
      return;
    }

    const profile = this.profile ?? {
      id: this.profileId,
      name,
      emoji: this.selectedEmoji,
      lastDifficulty: this.currentSpeedMultiplier,
      stats: [],
      maxSummary: {},
    };

    profile.name = name;
    profile.emoji = this.selectedEmoji;
    profile.lastDifficulty = this.currentSpeedMultiplier;
    this.profile = profile;

    this.closeProfileModal();
    this.updateAuthAvatar();
    this.updatePlayAvailability();
    if (this.allowAnonymous && !this.authUser) {
      this.saveLocalProfile();
      return;
    }
    await this.syncProfileMetadata(profile);
  }

  saveProfileStats(result) {
    const profile = this.profile;
    if (!profile) return;
    const entry = {
      id: this.generateId(),
      time: null,
      wordsTyped: result.wordsCompleted,
      accuracy: result.accuracy,
      difficulty: this.currentSpeedMultiplier,
      language: this.currentLanguage,
      localOrder: Date.now(),
    };
    profile.stats = profile.stats ?? [];
    profile.stats.unshift(entry);
    profile.maxSummary = profile.maxSummary ?? {};
    this.updateMaxSummary(profile, entry);
    this.profile = profile;
    if (this.allowAnonymous && !this.authUser) {
      this.saveLocalProfile();
      this.renderStatsModal();
      return;
    }
    this.syncStatEntry(profile, entry);
    this.syncMaxSummary(profile);
    this.renderStatsModal();
  }

  getProfileEmoji() {
    return this.profile?.emoji ?? "🦫";
  }

  formatTimestamp(date) {
    const pad = (value) => String(value).padStart(2, "0");
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  }

  initializeFirebase() {
    onAuthStateChanged(auth, async (user) => {
      this.authUser = user;
      this.profileLoaded = false;
      if (!user) {
        if (this.allowAnonymous) {
          this.ensureLocalProfile();
        } else {
          this.profile = null;
        }
        this.updateAuthAvatar();
        this.updatePlayAvailability();
        return;
      }
      this.isManualSignOut = false;
      await this.loadUserProfile();
      this.updateAuthAvatar();
      this.updatePlayAvailability();
    });
  }

  async handleLogin() {
    try {
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.warn("Firebase popup sign-in failed:", error);
    }
  }

  async loadUserProfile() {
    if (!this.authUser) return;
    try {
      const profile = this.normalizeProfile(this.createDefaultProfile());
      await this.fetchProfileRemoteData(profile);
      this.profile = profile;
      this.profileLoaded = true;
      this.applyProfileDifficulty();
      this.renderStatsModal();
    } catch (error) {
      console.warn("Failed to load remote profile:", error);
      this.profileLoaded = false;
    }
  }

  showLoginRequiredMessage() {
    if (this.allowAnonymous) return;
    this.openProfileModal(
      "message",
      "Please log in using the avatar button to start playing.",
    );
  }

  updatePlayAvailability() {
    const enabled = Boolean(this.authUser) || this.allowAnonymous;
    const langButtons = document.querySelectorAll(".lang-btn");
    langButtons.forEach((btn) => {
      btn.classList.toggle("is-disabled", !enabled);
      btn.setAttribute("aria-disabled", String(!enabled));
    });
    this.updateFooterAvailability();
  }

  updateFooterAvailability() {
    const statsEnabled = Boolean(this.authUser) || this.allowAnonymous;
    const logoutEnabled = Boolean(this.authUser);
    const buttons = [this.footerStatsBtn, this.footerEditBtn];
    buttons.forEach((btn) => {
      if (!btn) return;
      btn.disabled = !statsEnabled;
      btn.setAttribute("aria-disabled", String(!statsEnabled));
    });
    if (this.footerLogoutBtn) {
      this.footerLogoutBtn.disabled = !logoutEnabled;
      this.footerLogoutBtn.setAttribute(
        "aria-disabled",
        String(!logoutEnabled),
      );
    }
    if (this.footerLoginBtn) {
      this.footerLoginBtn.disabled = Boolean(this.authUser);
      this.footerLoginBtn.setAttribute(
        "aria-disabled",
        String(Boolean(this.authUser)),
      );
      this.footerLoginBtn.title = this.authUser ? "You're logged in" : "Log in";
    }
    if (this.footerProfileBtn) {
      this.footerProfileBtn.disabled = !statsEnabled;
      this.footerProfileBtn.setAttribute(
        "aria-disabled",
        String(!statsEnabled),
      );
      this.footerProfileBtn.title = statsEnabled
        ? "Edit profile"
        : "Log in to edit profile";
    }
    if (this.footerStatsBtn) {
      this.footerStatsBtn.title = statsEnabled
        ? "View stats"
        : "Log in to view stats";
    }
    if (this.footerEditBtn) {
      this.footerEditBtn.title = statsEnabled
        ? "Edit profile"
        : "Log in to edit profile";
    }
    if (this.footerLogoutBtn) {
      this.footerLogoutBtn.title = logoutEnabled ? "Log out" : "Log in first";
    }
  }

  ensureFooterLoginButton() {
    if (this.footerLoginBtn || !this.accountFooter) return;
    const button = document.createElement("button");
    button.id = "footer-login-btn";
    button.type = "button";
    button.textContent = "Log in";
    if (this.footerProfileBtn && this.footerProfileBtn.parentNode) {
      this.footerProfileBtn.insertAdjacentElement("afterend", button);
    } else {
      this.accountFooter.appendChild(button);
    }
  }

  async openStatsModal() {
    if (!this.statsModal) return;
    if (!this.authUser && !this.allowAnonymous) {
      this.showLoginRequiredMessage();
      return;
    }
    if (!this.profileLoaded) {
      if (this.allowAnonymous && !this.authUser) {
        this.ensureLocalProfile();
      } else {
        await this.loadUserProfile();
      }
    }
    this.renderStatsModal();
    this.statsModal.classList.remove("hidden");
  }

  closeStatsModal() {
    if (!this.statsModal) return;
    this.statsModal.classList.add("hidden");
  }

  renderStatsModal() {
    if (!this.statsModal || !this.statsSummaryList || !this.statsRecentList) {
      return;
    }
    const summaryEntries = this.flattenMaxSummary(
      this.profile?.maxSummary ?? {},
    );
    const recentEntries = this.getRecentStats(this.profile?.stats ?? [], 6);

    this.statsSummaryList.innerHTML = "";
    this.statsRecentList.innerHTML = "";

    summaryEntries.forEach((entry) => {
      const li = document.createElement("li");
      const meta = document.createElement("div");
      meta.className = "stats-meta";
      meta.innerHTML = `<span>${this.formatLanguageLabel(
        entry.language,
      )} · ${this.formatDifficultyLabel(entry.difficulty)}</span>`;
      const value = document.createElement("div");
      value.className = "stats-value";
      value.textContent = `${entry.wordsTyped} words · ${entry.accuracy}%`;
      li.appendChild(meta);
      li.appendChild(value);
      this.statsSummaryList.appendChild(li);
    });

    recentEntries.forEach((entry) => {
      const li = document.createElement("li");
      const meta = document.createElement("div");
      meta.className = "stats-meta";
      const timeLabel = this.getStatTimeLabel(entry);
      meta.innerHTML = `<span>${this.formatLanguageLabel(
        entry.language,
      )} · ${this.formatDifficultyLabel(entry.difficulty)}</span><span>${timeLabel}</span>`;
      const value = document.createElement("div");
      value.className = "stats-value";
      value.textContent = `${entry.wordsTyped} words · ${entry.accuracy}%`;
      li.appendChild(meta);
      li.appendChild(value);
      this.statsRecentList.appendChild(li);
    });

    const hasStats = summaryEntries.length > 0 || recentEntries.length > 0;
    if (this.statsEmptyState) {
      this.statsEmptyState.classList.toggle("hidden", hasStats);
    }
    if (this.statsGrid) {
      this.statsGrid.classList.toggle("hidden", !hasStats);
    }
  }

  getStatTimeLabel(entry) {
    if (entry.time) return entry.time;
    if (entry.createdAt) return this.formatTimestamp(new Date(entry.createdAt));
    if (entry.localOrder)
      return this.formatTimestamp(new Date(entry.localOrder));
    return "—";
  }

  updateAuthAvatar() {
    if (!this.authAvatar) return;

    if (!this.authUser) {
      if (this.allowAnonymous) {
        const displayName = this.profile?.name || "Guest";
        if (this.authAvatarBtn) {
          this.authAvatarBtn.title = displayName;
        }
        if (this.authAvatarImg) {
          this.authAvatarImg.removeAttribute("src");
          this.authAvatarImg.classList.add("hidden");
        }
        if (this.authAvatarFallback) {
          this.authAvatarFallback.textContent = this.getProfileEmoji();
          this.authAvatarFallback.classList.remove("hidden");
        }
        if (this.authUserName) {
          this.authUserName.textContent = displayName;
        }
        return;
      }
      if (this.authAvatarBtn) {
        this.authAvatarBtn.title = "Log in";
      }
      if (this.authAvatarImg) {
        this.authAvatarImg.removeAttribute("src");
        this.authAvatarImg.classList.add("hidden");
      }
      if (this.authAvatarFallback) {
        this.authAvatarFallback.textContent = "👤";
        this.authAvatarFallback.classList.remove("hidden");
      }
      if (this.authUserName) {
        this.authUserName.textContent = "Not signed in";
      }
      return;
    }

    const displayName =
      this.profile?.name || this.authUser.displayName || "Player";
    if (this.authAvatarBtn) {
      this.authAvatarBtn.title = displayName;
    }
    if (this.authAvatarImg && this.authUser.photoURL) {
      this.authAvatarImg.src = this.authUser.photoURL;
      this.authAvatarImg.alt = displayName;
      this.authAvatarImg.classList.remove("hidden");
      if (this.authAvatarFallback) {
        this.authAvatarFallback.classList.add("hidden");
      }
    } else {
      if (this.authAvatarImg) {
        this.authAvatarImg.removeAttribute("src");
        this.authAvatarImg.classList.add("hidden");
      }
      if (this.authAvatarFallback) {
        this.authAvatarFallback.textContent = this.getProfileEmoji();
        this.authAvatarFallback.classList.remove("hidden");
      }
    }
    if (this.authUserName) {
      this.authUserName.textContent = displayName;
    }
    this.updateTitleEmoji();
  }

  updateTitleEmoji() {
    if (!this.titleEmoji) return;
    const emoji = this.getProfileEmoji();
    this.titleEmoji.textContent = emoji || "🦫";
  }

  toggleAvatarMenu() {
    if (!this.authAvatarMenu) return;
    this.authAvatarMenu.classList.toggle("hidden");
  }

  closeAvatarMenu() {
    if (!this.authAvatarMenu) return;
    this.authAvatarMenu.classList.add("hidden");
  }

  async handleLogout() {
    this.closeAvatarMenu();
    this.isManualSignOut = true;
    await this.syncBeforeLogout();
    try {
      await signOut(auth);
    } catch (error) {
      console.warn("Firebase sign-out failed:", error);
    }
  }

  async syncBeforeLogout() {
    if (!this.authUser) return;
    await this.runSyncTask(async () => {
      if (!this.profile) return;
      await this.syncProfileMetadata(this.profile);
      await this.syncMaxSummary(this.profile);
    });
  }

  applySyncIndicatorToGame() {
    if (this.game) {
      this.game.setSyncIndicator(this.syncIndicator);
    }
  }

  setSyncIndicator(emoji, clearAfterMs = null) {
    this.syncIndicator = emoji;
    this.applySyncIndicatorToGame();
    if (this.syncIndicatorTimeout) {
      clearTimeout(this.syncIndicatorTimeout);
      this.syncIndicatorTimeout = null;
    }
    if (clearAfterMs) {
      this.syncIndicatorTimeout = setTimeout(() => {
        this.syncIndicator = null;
        this.applySyncIndicatorToGame();
      }, clearAfterMs);
    }
  }

  async runSyncTask(task) {
    if (!this.authUser) return;
    this.setSyncIndicator("🌀");
    try {
      await task();
      this.setSyncIndicator("✅", 1500);
    } catch (error) {
      console.warn("Firebase sync failed:", error);
      this.setSyncIndicator("⚠️", 1500);
    }
  }

  queueProfileSync() {
    if (!this.authUser || !this.profile) return;
    const now = Date.now();
    const elapsed = now - this.lastSyncAt;
    if (elapsed >= this.syncThrottleMs) {
      this.lastSyncAt = now;
      this.syncProfile();
      return;
    }

    if (this.syncTimerId) {
      clearTimeout(this.syncTimerId);
    }

    this.syncTimerId = setTimeout(() => {
      this.lastSyncAt = Date.now();
      this.syncProfile();
    }, this.syncThrottleMs - elapsed);
  }

  syncProfile() {
    const profile = this.profile;
    if (!this.authUser || !profile) return;
    this.runSyncTask(async () => {
      await this.syncProfileMetadata(profile);
      await this.fetchProfileRemoteData(profile);
    });
  }

  async syncProfileMetadata(profile) {
    const profileRef = doc(
      db,
      "users",
      this.authUser.uid,
      "profiles",
      profile.id,
    );
    await setDoc(
      profileRef,
      {
        name: profile.name,
        emoji: profile.emoji,
        lastDifficulty: profile.lastDifficulty ?? 1,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async syncStatEntry(profile, entry) {
    if (!this.authUser) return;
    this.runSyncTask(async () => {
      const statRef = doc(
        db,
        "users",
        this.authUser.uid,
        "profiles",
        profile.id,
        "stats",
        entry.id,
      );
      await setDoc(
        statRef,
        {
          wordsTyped: entry.wordsTyped,
          accuracy: entry.accuracy,
          difficulty: entry.difficulty,
          language: entry.language,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
  }

  async syncMaxSummary(profile) {
    if (!this.authUser) return;
    this.runSyncTask(async () => {
      const summaryRef = doc(
        db,
        "users",
        this.authUser.uid,
        "profiles",
        profile.id,
        "summary",
        "max",
      );
      await setDoc(
        summaryRef,
        {
          maxByLanguage: profile.maxSummary ?? {},
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
  }

  async fetchProfileRemoteData(profile) {
    if (!this.authUser || !profile) return;

    const profileRef = doc(
      db,
      "users",
      this.authUser.uid,
      "profiles",
      profile.id,
    );
    const profileSnap = await getDoc(profileRef);
    if (profileSnap.exists()) {
      const data = profileSnap.data();
      if (data?.name) profile.name = data.name;
      if (data?.emoji) profile.emoji = data.emoji;
      if (data?.lastDifficulty) profile.lastDifficulty = data.lastDifficulty;
    }

    const summaryRef = doc(
      db,
      "users",
      this.authUser.uid,
      "profiles",
      profile.id,
      "summary",
      "max",
    );
    const summarySnap = await getDoc(summaryRef);
    if (summarySnap.exists()) {
      const data = summarySnap.data();
      if (data?.maxByLanguage) {
        profile.maxSummary = data.maxByLanguage;
      }
    }

    const statsQuery = query(
      collection(
        db,
        "users",
        this.authUser.uid,
        "profiles",
        profile.id,
        "stats",
      ),
      orderBy("createdAt", "desc"),
      limit(20),
    );
    const statsSnap = await getDocs(statsQuery);
    const remoteStats = statsSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;
      return {
        id: docSnap.id,
        time: createdAt ? this.formatTimestamp(createdAt) : null,
        wordsTyped: data.wordsTyped ?? 0,
        accuracy: data.accuracy ?? 0,
        difficulty: data.difficulty ?? 1,
        language: data.language ?? null,
        createdAt: createdAt ? createdAt.getTime() : null,
        localOrder: null,
      };
    });

    profile.stats = this.mergeStats(profile.stats ?? [], remoteStats);
  }

  mergeStats(localStats, remoteStats) {
    const byId = new Map();
    localStats.forEach((entry) => {
      byId.set(entry.id, entry);
    });
    remoteStats.forEach((entry) => {
      const existing = byId.get(entry.id) ?? {};
      byId.set(entry.id, { ...existing, ...entry });
    });

    return Array.from(byId.values()).sort((a, b) => {
      const aSort = a.createdAt ?? a.localOrder ?? 0;
      const bSort = b.createdAt ?? b.localOrder ?? 0;
      return bSort - aSort;
    });
  }

  getRecentStats(stats, limitCount) {
    const sorted = [...stats].sort((a, b) => {
      const aSort = a.createdAt ?? a.localOrder ?? 0;
      const bSort = b.createdAt ?? b.localOrder ?? 0;
      return bSort - aSort;
    });
    return sorted.slice(0, limitCount);
  }

  buildMaxSummaryFromStats(stats) {
    const summary = {};
    stats.forEach((entry) => {
      const language = entry.language ?? "unknown";
      const difficulty = this.formatDifficultyKey(entry.difficulty ?? 1);
      if (!summary[language]) summary[language] = {};
      const current = summary[language][difficulty];
      if (!current || entry.wordsTyped > current.wordsTyped) {
        summary[language][difficulty] = {
          language,
          difficulty: entry.difficulty ?? 1,
          wordsTyped: entry.wordsTyped ?? 0,
          accuracy: entry.accuracy ?? 0,
        };
      }
    });
    return summary;
  }

  updateMaxSummary(profile, entry) {
    const summary = profile.maxSummary ?? {};
    const language = entry.language ?? "unknown";
    const difficultyKey = this.formatDifficultyKey(entry.difficulty ?? 1);
    if (!summary[language]) summary[language] = {};
    const current = summary[language][difficultyKey];
    if (!current || entry.wordsTyped > current.wordsTyped) {
      summary[language][difficultyKey] = {
        language,
        difficulty: entry.difficulty ?? 1,
        wordsTyped: entry.wordsTyped ?? 0,
        accuracy: entry.accuracy ?? 0,
      };
    }
    profile.maxSummary = summary;
  }

  flattenMaxSummary(summary) {
    const entries = [];
    Object.entries(summary ?? {}).forEach(([language, difficulties]) => {
      Object.entries(difficulties ?? {}).forEach(([, value]) => {
        if (!value) return;
        entries.push({
          language,
          difficulty: value.difficulty ?? 1,
          wordsTyped: value.wordsTyped ?? 0,
          accuracy: value.accuracy ?? 0,
        });
      });
    });
    return entries.sort((a, b) => b.wordsTyped - a.wordsTyped);
  }

  formatLanguageLabel(language) {
    if (!language) return "—";
    const labels = {
      en: "🇬🇧",
      bg: "🇧🇬",
    };
    return labels[language] ?? language;
  }

  formatDifficultyKey(value) {
    return String(value ?? 1);
  }

  formatDifficultyLabel(value) {
    if (!value) return "1x";
    return `${value}x`;
  }
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
