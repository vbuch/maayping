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
    this.selectedProfileId = null;
    this.profiles = [];
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
    this.profileButtons = document.getElementById("profile-buttons");
    this.profileStats = document.getElementById("profile-stats");
    this.profileModal = document.getElementById("profile-modal");
    this.profileNameInput = document.getElementById("profile-name");
    this.emojiGrid = document.getElementById("emoji-grid");
    this.createProfileBtn = document.getElementById("create-profile-btn");
    this.cancelProfileBtn = document.getElementById("cancel-profile-btn");
    this.selectedEmoji = null;
    this.authAvatar = document.getElementById("auth-avatar");
    this.authAvatarBtn = document.getElementById("auth-avatar-btn");
    this.authAvatarImg = document.getElementById("auth-avatar-img");
    this.authAvatarFallback = document.getElementById("auth-avatar-fallback");
    this.authAvatarMenu = document.getElementById("auth-avatar-menu");
    this.authLogoutBtn = document.getElementById("auth-logout-btn");

    this.authUser = null;
    this.syncIndicator = null;
    this.syncIndicatorTimeout = null;
    this.lastSyncAt = 0;
    this.syncTimerId = null;
    this.syncThrottleMs = 1000;
    this.isManualSignOut = false;
    this.isSwitchingProfileLogin = false;
    this.logoutUid = null;

    this.loadProfiles();
    this.normalizeProfiles();
    this.renderProfiles();
    this.renderEmojiGrid();
    this.applyProfileDifficulty();

    this.initializeFirebase();

    this.setupEventListeners();
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

    // Profile create/cancel buttons
    this.createProfileBtn.addEventListener("click", () =>
      this.handleCreateProfile(),
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
      this.authAvatarBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleAvatarMenu();
      });
    }

    if (this.authLogoutBtn) {
      this.authLogoutBtn.addEventListener("click", () => {
        this.handleLogout();
      });
    }

    document.addEventListener("click", (event) => {
      if (!this.authAvatar || this.authAvatar.classList.contains("hidden")) {
        return;
      }
      if (this.authAvatar.contains(event.target)) return;
      this.closeAvatarMenu();
    });
  }

  // Start a new game with selected language
  async startGame(language) {
    if (this.selectedProfileId) {
      const ok = await this.ensureProfileLogin(this.selectedProfileId, false);
      if (!ok) return;
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
    const playerEmoji = this.getSelectedProfileEmoji();
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

  loadProfiles() {
    const raw = localStorage.getItem("maaypingProfiles");
    const selected = localStorage.getItem("maaypingSelectedProfile");
    this.profiles = raw ? JSON.parse(raw) : [];
    this.selectedProfileId = selected || (this.profiles[0]?.id ?? null);
  }

  saveProfiles() {
    localStorage.setItem("maaypingProfiles", JSON.stringify(this.profiles));
    if (this.selectedProfileId) {
      localStorage.setItem("maaypingSelectedProfile", this.selectedProfileId);
    } else {
      localStorage.removeItem("maaypingSelectedProfile");
    }
  }

  normalizeProfiles() {
    this.profiles = (this.profiles ?? []).map((profile) =>
      this.normalizeProfile(profile),
    );
  }

  normalizeProfile(profile) {
    const normalized = { ...profile };
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
    normalized.authUid = profile.authUid ?? null;
    return normalized;
  }

  generateId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  renderProfiles() {
    if (!this.profileButtons) return;
    this.profileButtons.innerHTML = "";

    this.profiles.forEach((profile) => {
      const button = document.createElement("button");
      button.className = "profile-btn";
      if (profile.id === this.selectedProfileId) {
        button.classList.add("selected");
      }
      button.title = profile.name;
      button.textContent = profile.emoji;
      button.addEventListener("click", () =>
        this.handleProfileClick(profile.id),
      );
      this.profileButtons.appendChild(button);
    });

    const addButton = document.createElement("button");
    addButton.className = "profile-btn add";
    addButton.textContent = "+";
    addButton.addEventListener("click", () => this.openProfileModal());
    this.profileButtons.appendChild(addButton);
  }

  async handleProfileClick(profileId) {
    const isSame = profileId === this.selectedProfileId;
    const ok = await this.ensureProfileLogin(profileId, true);
    if (!ok) return;
    if (isSame) {
      this.toggleProfileStats();
      return;
    }
    this.selectProfile(profileId);
  }

  selectProfile(profileId) {
    this.selectedProfileId = profileId;
    this.saveProfiles();
    this.renderProfiles();
    this.applyProfileDifficulty();
    if (this.profileStats) {
      this.profileStats.classList.add("hidden");
    }
    this.queueProfileSync(profileId);
  }

  toggleProfileStats() {
    if (!this.profileStats) return;
    const isHidden = this.profileStats.classList.contains("hidden");
    if (isHidden) {
      this.showProfileStats(this.selectedProfileId, true);
    } else {
      this.profileStats.classList.add("hidden");
    }
  }

  showProfileStats(profileId, forceShow = false) {
    if (!this.profileStats || !profileId) return;
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const stats = profile.stats ?? [];
    const recent = this.getRecentStats(stats, 20);
    const maxWords = stats.reduce(
      (max, entry) => Math.max(max, entry.wordsTyped ?? 0),
      0,
    );
    const maxAccuracy = stats.reduce(
      (max, entry) => Math.max(max, entry.accuracy ?? 0),
      0,
    );
    const maxSummary =
      profile.maxSummary ?? this.buildMaxSummaryFromStats(stats);
    const maxEntries = this.flattenMaxSummary(maxSummary);

    const listItems = recent
      .map((entry) => {
        const isMaxScore = entry.wordsTyped === maxWords && maxWords > 0;
        const isMaxAcc = entry.accuracy === maxAccuracy && maxAccuracy > 0;
        const timeLabel = entry.time || "⏳";
        const langLabel = this.formatLanguageLabel(entry.language);
        const difficultyLabel = this.formatDifficultyLabel(entry.difficulty);
        const metaLabel = `${langLabel} • ${difficultyLabel}`.trim();
        return `
          <li>
            <div class="stat-line">
              <span>${timeLabel}</span>
              <span>${metaLabel}</span>
              <span class="stat-score${isMaxScore ? " stat-highlight" : ""}">Words: ${entry.wordsTyped}</span>
            </div>
            <span class="stat-accuracy${isMaxAcc ? " stat-highlight" : ""}">${entry.accuracy}%</span>
          </li>
        `;
      })
      .join("");

    const maxListItems = maxEntries
      .map((entry) => {
        const langLabel = this.formatLanguageLabel(entry.language);
        const difficultyLabel = this.formatDifficultyLabel(entry.difficulty);
        const metaLabel = `${langLabel} • ${difficultyLabel}`.trim();
        return `
          <li>
            <div class="stat-line">
              <span>${metaLabel}</span>
              <span class="stat-score stat-highlight">Words: ${entry.wordsTyped}</span>
            </div>
            <span class="stat-accuracy">${entry.accuracy}%</span>
          </li>
        `;
      })
      .join("");

    const title = `Stats for ${profile.name}`;
    this.profileStats.innerHTML = `
      <h4>${title}</h4>
      ${recent.length ? `<ul>${listItems}</ul>` : `<div>No games yet.</div>`}
      ${maxEntries.length ? `<h4>Max records</h4><ul>${maxListItems}</ul>` : ""}
    `;

    if (forceShow) {
      this.profileStats.classList.remove("hidden");
    }
  }

  applyProfileDifficulty() {
    const profile = this.profiles.find((p) => p.id === this.selectedProfileId);
    const multiplier = profile?.lastDifficulty ?? 1;
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
    const profile = this.profiles.find((p) => p.id === this.selectedProfileId);
    if (!profile) return;
    profile.lastDifficulty = this.currentSpeedMultiplier;
    this.saveProfiles();
    this.queueProfileSync(profile.id);
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

  openProfileModal() {
    this.profileNameInput.value = "";
    this.profileModal.classList.remove("hidden");
  }

  closeProfileModal() {
    this.profileModal.classList.add("hidden");
  }

  async handleCreateProfile() {
    const name = this.profileNameInput.value.trim();
    if (!name || !this.selectedEmoji) return;

    const user = await this.promptFreshLogin();
    if (!user) return;

    const profile = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      emoji: this.selectedEmoji,
      lastDifficulty: this.currentSpeedMultiplier,
      stats: [],
      maxSummary: {},
      authUid: user.uid,
    };

    this.profiles.push(profile);
    this.selectedProfileId = profile.id;
    this.saveProfiles();
    this.renderProfiles();
    this.closeProfileModal();
    this.queueProfileSync(profile.id);
  }

  saveProfileStats(result) {
    const profile = this.profiles.find((p) => p.id === this.selectedProfileId);
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
    this.saveProfiles();
    this.showProfileStats(profile.id, true);
    this.syncStatEntry(profile, entry);
    this.syncMaxSummary(profile);
  }

  getSelectedProfileEmoji() {
    const profile = this.profiles.find((p) => p.id === this.selectedProfileId);
    return profile?.emoji ?? "🦫";
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
    onAuthStateChanged(auth, (user) => {
      this.authUser = user;
      this.updateAuthAvatar(user);
      if (!user) {
        if (this.isManualSignOut) {
          this.clearLocalProfiles(this.logoutUid);
          this.logoutUid = null;
        } else if (!this.isSwitchingProfileLogin) {
          this.attemptAutoSignIn();
        }
        return;
      }
      this.isManualSignOut = false;
      this.isSwitchingProfileLogin = false;
      this.queueProfileSync(this.selectedProfileId);
    });
  }

  attemptAutoSignIn() {
    signInWithPopup(auth, provider).catch((error) => {
      console.warn("Firebase popup sign-in failed:", error);
    });
  }

  async promptFreshLogin() {
    this.isSwitchingProfileLogin = true;
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      this.authUser = result.user;
      this.updateAuthAvatar(result.user);
      return result.user;
    } catch (error) {
      console.warn("Firebase popup sign-in failed:", error);
      return null;
    } finally {
      this.isSwitchingProfileLogin = false;
    }
  }

  async ensureProfileLogin(profileId, forceFreshLogin) {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return false;

    if (
      !forceFreshLogin &&
      this.authUser &&
      (!profile.authUid || profile.authUid === this.authUser.uid)
    ) {
      if (!profile.authUid) {
        profile.authUid = this.authUser.uid;
        this.saveProfiles();
      }
      return true;
    }

    const user = await this.promptFreshLogin();
    if (!user) return false;

    if (profile.authUid && profile.authUid !== user.uid) {
      alert("This profile is linked to a different Google account.");
      return false;
    }

    profile.authUid = user.uid;
    this.saveProfiles();
    return true;
  }

  updateAuthAvatar(user) {
    if (!this.authAvatar) return;
    if (!user) {
      this.authAvatar.classList.add("hidden");
      this.closeAvatarMenu();
      if (this.authAvatarImg) {
        this.authAvatarImg.removeAttribute("src");
      }
      if (this.authAvatarFallback) {
        this.authAvatarFallback.classList.remove("hidden");
      }
      return;
    }

    this.authAvatar.classList.remove("hidden");
    if (this.authAvatarImg && user.photoURL) {
      this.authAvatarImg.src = user.photoURL;
      this.authAvatarImg.alt = user.displayName || "Avatar";
      if (this.authAvatarFallback) {
        this.authAvatarFallback.classList.add("hidden");
      }
    } else if (this.authAvatarFallback) {
      this.authAvatarFallback.classList.remove("hidden");
    }
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
    this.logoutUid = this.authUser?.uid ?? null;
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
      for (const profile of this.profiles) {
        if (profile.authUid && profile.authUid !== this.authUser.uid) {
          continue;
        }
        await this.syncProfileMetadata(profile);
        await this.syncMaxSummary(profile);
      }
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

  queueProfileSync(profileId) {
    if (!this.authUser || !profileId) return;
    const now = Date.now();
    const elapsed = now - this.lastSyncAt;
    if (elapsed >= this.syncThrottleMs) {
      this.lastSyncAt = now;
      this.syncProfile(profileId);
      return;
    }

    if (this.syncTimerId) {
      clearTimeout(this.syncTimerId);
    }

    this.syncTimerId = setTimeout(() => {
      this.lastSyncAt = Date.now();
      this.syncProfile(profileId);
    }, this.syncThrottleMs - elapsed);
  }

  syncProfile(profileId) {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!this.authUser || !profile) return;
    if (profile.authUid && profile.authUid !== this.authUser.uid) return;
    if (!profile.authUid) {
      profile.authUid = this.authUser.uid;
    }
    this.runSyncTask(async () => {
      await this.syncProfileMetadata(profile);
      await this.fetchProfileRemoteData(profileId);
      this.saveProfiles();
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
    if (profile.authUid && profile.authUid !== this.authUser.uid) return;
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
    if (profile.authUid && profile.authUid !== this.authUser.uid) return;
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

  async fetchProfileRemoteData(profileId) {
    if (!this.authUser) return;
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) return;

    const profileRef = doc(
      db,
      "users",
      this.authUser.uid,
      "profiles",
      profileId,
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
      profileId,
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
        profileId,
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

  clearLocalProfiles(uid) {
    if (uid) {
      this.profiles = this.profiles.filter(
        (profile) => profile.authUid && profile.authUid !== uid,
      );
    } else {
      this.profiles = [];
    }

    const selectedStillExists = this.profiles.some(
      (profile) => profile.id === this.selectedProfileId,
    );
    if (!selectedStillExists) {
      this.selectedProfileId = this.profiles[0]?.id ?? null;
    }

    this.saveProfiles();
    this.renderProfiles();
    this.applyProfileDifficulty();
    if (this.profileStats) {
      this.profileStats.classList.add("hidden");
    }
  }
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
