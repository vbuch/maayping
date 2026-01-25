import { Game } from "./game.js";

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
      "🐶",
      "🐱",
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
    this.profileButtons = document.getElementById("profile-buttons");
    this.profileStats = document.getElementById("profile-stats");
    this.profileModal = document.getElementById("profile-modal");
    this.profileNameInput = document.getElementById("profile-name");
    this.emojiGrid = document.getElementById("emoji-grid");
    this.createProfileBtn = document.getElementById("create-profile-btn");
    this.cancelProfileBtn = document.getElementById("cancel-profile-btn");
    this.selectedEmoji = null;

    this.loadProfiles();
    this.renderProfiles();
    this.renderEmojiGrid();
    this.applyProfileDifficulty();

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

    // Tap/click game screen to re-open keyboard on mobile
    this.gameScreen.addEventListener("click", () => this.ensureKeyboard());
    this.gameScreen.addEventListener("touchstart", () => this.ensureKeyboard());

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
  }

  // Start a new game with selected language
  async startGame(language) {
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
    this.mobileKeyboardInput.focus({ preventScroll: true });
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

  selectProfile(profileId) {
    this.selectedProfileId = profileId;
    this.saveProfiles();
    this.renderProfiles();
    this.applyProfileDifficulty();
    if (this.profileStats) {
      this.profileStats.classList.add("hidden");
    }
  }

  handleProfileClick(profileId) {
    if (profileId === this.selectedProfileId) {
      this.toggleProfileStats();
      return;
    }
    this.selectProfile(profileId);
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
    const recent = stats.slice(0, 5);
    const maxWords = stats.reduce(
      (max, entry) => Math.max(max, entry.wordsTyped ?? 0),
      0,
    );
    const maxAccuracy = stats.reduce(
      (max, entry) => Math.max(max, entry.accuracy ?? 0),
      0,
    );

    const listItems = recent
      .map((entry) => {
        const isMaxScore = entry.wordsTyped === maxWords && maxWords > 0;
        const isMaxAcc = entry.accuracy === maxAccuracy && maxAccuracy > 0;
        return `
          <li>
            <div class="stat-line">
              <span>${entry.time}</span>
              <span class="stat-score${isMaxScore ? " stat-highlight" : ""}">Words: ${entry.wordsTyped}</span>
            </div>
            <span class="stat-accuracy${isMaxAcc ? " stat-highlight" : ""}">${entry.accuracy}%</span>
          </li>
        `;
      })
      .join("");

    const title = `Stats for ${profile.name}`;
    this.profileStats.innerHTML = `
      <h4>${title}</h4>
      ${recent.length ? `<ul>${listItems}</ul>` : `<div>No games yet.</div>`}
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

  handleCreateProfile() {
    const name = this.profileNameInput.value.trim();
    if (!name || !this.selectedEmoji) return;

    const profile = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      emoji: this.selectedEmoji,
      lastDifficulty: this.currentSpeedMultiplier,
      stats: [],
    };

    this.profiles.push(profile);
    this.selectedProfileId = profile.id;
    this.saveProfiles();
    this.renderProfiles();
    this.closeProfileModal();
  }

  saveProfileStats(result) {
    const profile = this.profiles.find((p) => p.id === this.selectedProfileId);
    if (!profile) return;
    const now = new Date();
    const stamp = this.formatTimestamp(now);
    const entry = {
      time: stamp,
      wordsTyped: result.wordsCompleted,
      accuracy: result.accuracy,
      difficulty: this.currentSpeedMultiplier,
    };
    profile.stats = profile.stats ?? [];
    profile.stats.unshift(entry);
    profile.stats = profile.stats.slice(0, 50);
    this.saveProfiles();
    this.showProfileStats(profile.id, true);
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
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  new App();
});
