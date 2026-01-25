import { CONFIG } from "./config.js";
import { Renderer } from "./renderer.js";
import { WordManager } from "./word-manager.js";
import { InputHandler } from "./input.js";
import { AudioManager } from "./audio.js";

// Main game class - handles game loop, state, and coordination
export class Game {
  constructor(canvas, language, speedMultiplier = 1) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.language = language;
    this.speedMultiplier = speedMultiplier;

    // Game state: 'loading', 'playing', 'paused', 'gameOver', 'victory'
    this.state = "loading";

    // Initialize systems
    this.renderer = new Renderer(this.ctx);
    this.wordManager = new WordManager(language);
    this.inputHandler = new InputHandler(this);
    this.audio = new AudioManager();

    // Game stats
    this.currentSpeed = CONFIG.game.baseSpeed * this.speedMultiplier;
    this.lastSpeedTier = 0;
    this.escapedWords = 0;
    this.maxEscapedWords = CONFIG.game.maxEscapedWords;
    this.lastCelebrationMilestone = 0;

    // Timing
    this.lastTime = 0;
    this.animationFrameId = null;

    // Callbacks for game events
    this.onGameEnd = null;

    // Completion flash effects
    this.flashEffects = [];

    // Celebration state (happy beaver)
    this.celebrationTimer = 0;
    this.isCelebrating = false;
  }

  // Initialize the game (load assets, dictionaries)
  async initialize() {
    try {
      await this.wordManager.initialize();
      this.audio.init();
      this.state = "ready";
    } catch (error) {
      console.error("Failed to initialize game:", error);
      throw error;
    }
  }

  // Start the game
  start() {
    if (this.state !== "ready" && this.state !== "paused") return;

    this.state = "playing";
    this.inputHandler.start();
    this.audio.resume();
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  // Main game loop
  gameLoop(currentTime) {
    if (this.state !== "playing") return;

    const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap delta
    this.lastTime = currentTime;

    this.update(deltaTime);
    this.render();

    this.animationFrameId = requestAnimationFrame((t) => this.gameLoop(t));
  }

  // Update game state
  update(deltaTime) {
    // Update animations
    this.renderer.updateAnimations(deltaTime);
    this.renderer.updateScroll(deltaTime, this.currentSpeed);

    // Update word positions
    this.wordManager.update(deltaTime, this.currentSpeed);

    // Update flash effects
    this.updateFlashEffects(deltaTime);

    // Update celebration timer
    if (this.isCelebrating) {
      this.celebrationTimer -= deltaTime;
      if (this.celebrationTimer <= 0) {
        this.isCelebrating = false;
      }
    }

    // Check for celebration milestone (every 50 words)
    const completed = this.wordManager.totalCompleted;
    const celebrationInterval = CONFIG.game.wordsPerCelebration;
    const currentMilestone = Math.floor(completed / celebrationInterval);
    if (currentMilestone > this.lastCelebrationMilestone && completed > 0) {
      this.lastCelebrationMilestone = currentMilestone;
      this.triggerCelebration();
    }

    // Check for escaped words
    const escapedWord = this.wordManager.checkAndRemoveEscapedWord();
    if (escapedWord) {
      this.escapedWords++;
      this.audio.playSound("warning");

      // Check if all lives are lost
      if (this.escapedWords >= this.maxEscapedWords) {
        this.gameOver(false);
        return;
      }
    }

    // Check for victory
    if (this.wordManager.isGameComplete()) {
      this.gameOver(true);
      return;
    }

    // Update difficulty
    this.updateDifficulty();
  }

  // Update game difficulty based on progress
  updateDifficulty() {
    const completed = this.wordManager.totalCompleted;
    const tier = Math.floor(completed / CONFIG.game.wordsPerSpeedIncrease);

    if (tier > this.lastSpeedTier) {
      this.lastSpeedTier = tier;
      this.currentSpeed =
        CONFIG.game.baseSpeed *
        this.speedMultiplier *
        Math.pow(CONFIG.game.speedMultiplier, tier);
    }
  }

  // Render the game
  render() {
    this.renderer.clear();
    this.renderer.drawForest();
    this.renderer.drawWords(this.wordManager.getActiveWords());

    // Draw flash effects
    this.flashEffects.forEach((effect) => {
      this.renderer.drawCompletionFlash(effect.x, effect.y);
    });

    // Draw beaver with remaining lives (affects leaf size)
    const livesRemaining = this.maxEscapedWords - this.escapedWords;
    this.renderer.drawBeaver(
      livesRemaining,
      this.maxEscapedWords,
      this.isCelebrating,
    );

    // Draw current word indicator
    const currentWord = this.wordManager.getCurrentWord();
    this.renderer.drawCurrentWordIndicator(currentWord);

    // Draw current input text
    this.renderer.drawCurrentInput(this.wordManager.getCurrentInput());

    // Draw HUD with lives
    this.renderer.drawHUD(
      this.wordManager.totalCompleted,
      CONFIG.game.totalWords,
      this.currentSpeed,
      livesRemaining,
      this.maxEscapedWords,
    );

    // Draw pause overlay if paused
    if (this.state === "paused") {
      this.renderer.drawPausedOverlay();
    }
  }

  // Handle key press from input handler
  handleKeyPress(key) {
    const result = this.wordManager.handleKeyPress(key);

    switch (result.type) {
      case "correct":
        this.audio.playSound("type");
        break;

      case "completed":
        this.audio.playSound("complete");
        // Add completion flash effect
        if (result.word) {
          this.flashEffects.push({
            x: result.word.x,
            y: result.word.y,
            timer: 0.3,
          });
        }
        break;

      case "incorrect":
        this.audio.playSound("error");
        break;
    }
  }

  // Update flash effects
  updateFlashEffects(deltaTime) {
    for (let i = this.flashEffects.length - 1; i >= 0; i--) {
      this.flashEffects[i].timer -= deltaTime;
      if (this.flashEffects[i].timer <= 0) {
        this.flashEffects.splice(i, 1);
      }
    }
  }

  // Trigger celebration (happy beaver)
  triggerCelebration() {
    this.isCelebrating = true;
    this.celebrationTimer = 2.0; // Celebrate for 2 seconds
    this.audio.playSound("celebration"); // Play celebration fanfare
  }

  // Toggle pause state
  togglePause() {
    if (this.state === "playing") {
      this.pause();
    } else if (this.state === "paused") {
      this.resume();
    }
  }

  // Pause the game
  pause() {
    if (this.state !== "playing") return;

    this.state = "paused";
    this.inputHandler.stop();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Render paused state
    this.render();

    // Show pause modal
    document.getElementById("pause-modal").classList.remove("hidden");
  }

  // Resume the game
  resume() {
    if (this.state !== "paused") return;

    document.getElementById("pause-modal").classList.add("hidden");
    this.state = "playing";
    this.inputHandler.start();
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
  }

  // End the game
  gameOver(victory) {
    this.state = victory ? "victory" : "gameOver";
    this.inputHandler.stop();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Play appropriate sound
    if (victory) {
      this.audio.playSound("victory");
    } else {
      this.audio.playSound("gameOver");
    }

    // Notify callback
    if (this.onGameEnd) {
      this.onGameEnd({
        victory: victory,
        wordsCompleted: this.wordManager.totalCompleted,
        accuracy: this.wordManager.getAccuracy(),
      });
    }
  }

  // Reset the game for replay
  reset() {
    this.wordManager.reset();
    this.currentSpeed = CONFIG.game.baseSpeed * this.speedMultiplier;
    this.lastSpeedTier = 0;
    this.escapedWords = 0;
    this.flashEffects = [];
    this.lastCelebrationMilestone = 0;
    this.celebrationTimer = 0;
    this.isCelebrating = false;
    this.state = "ready";
  }

  // Clean up resources
  destroy() {
    this.inputHandler.destroy();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
}
