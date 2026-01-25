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
    this.authAvatarMenu = document.getElementById("auth-avatar-menu");
    this.authUserName = document.getElementById("auth-user-name");
    this.authEditBtn = document.getElementById("auth-edit-btn");
    this.authLogoutBtn = document.getElementById("auth-logout-btn");

    this.authUser = null;
    this.syncIndicator = null;
    this.syncIndicatorTimeout = null;
    this.lastSyncAt = 0;
    this.syncTimerId = null;
    this.syncThrottleMs = 1000;
    this.isManualSignOut = false;

    this.renderEmojiGrid();
    this.applyProfileDifficulty();

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
        this.toggleAvatarMenu();
      });
    }

    if (this.authEditBtn) {
      this.authEditBtn.addEventListener("click", async () => {
        this.closeAvatarMenu();
        await this.openProfileModal("edit");
      });
    }

    if (this.authLogoutBtn) {
      this.authLogoutBtn.addEventListener("click", () => {
        this.handleLogout();
      });
    }

    document.addEventListener("click", (event) => {
      if (!this.authAvatar) return;
      if (this.authAvatar.contains(event.target)) return;
      this.closeAvatarMenu();
    });
  }

  // Start a new game with selected language
  async startGame(language) {
    if (!this.authUser) {
      this.showLoginRequiredMessage();
      return;
    }

    if (!this.profileLoaded) {
      await this.loadUserProfile();
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
      name: this.authUser?.displayName || "Player",
      emoji: "🦫",
      lastDifficulty: 1,
      stats: [],
      maxSummary: {},
    };
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
      if (!this.authUser) {
        this.showLoginRequiredMessage();
        return;
      }
      if (!this.profileLoaded) {
        await this.loadUserProfile();
      }
      const fallbackName = this.authUser.displayName || "";
      this.profileNameInput.value = this.profile?.name ?? fallbackName;
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
      await this.handleLogin();
      return;
    }
    await this.handleSaveProfile();
  }

  async handleSaveProfile() {
    const name = this.profileNameInput.value.trim();
    if (!name || !this.selectedEmoji) return;
    if (!this.authUser) {
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
    this.syncStatEntry(profile, entry);
    this.syncMaxSummary(profile);
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
        this.profile = null;
        this.updateAuthAvatar();
        this.updatePlayAvailability();
        this.closeAvatarMenu();
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
    } catch (error) {
      console.warn("Failed to load remote profile:", error);
      this.profileLoaded = false;
    }
  }

  showLoginRequiredMessage() {
    this.openProfileModal(
      "message",
      "Please log in using the avatar button to start playing.",
    );
  }

  updatePlayAvailability() {
    const enabled = Boolean(this.authUser);
    const langButtons = document.querySelectorAll(".lang-btn");
    langButtons.forEach((btn) => {
      btn.classList.toggle("is-disabled", !enabled);
      btn.setAttribute("aria-disabled", String(!enabled));
    });
  }

  updateAuthAvatar() {
    if (!this.authAvatar) return;

    if (!this.authUser) {
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
