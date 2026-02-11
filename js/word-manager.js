import { CONFIG } from "./config.js";
import { Dictionary } from "./dictionary.js";

// Manages word spawning, tracking, and input matching
export class WordManager {
  constructor(language) {
    this.language = language;
    this.dictionary = new Dictionary();

    // Active words on screen
    this.activeWords = [];

    // Track recently used words to avoid repetition
    this.recentWords = [];
    this.maxRecentWords = 30;

    // Spawning timer
    this.spawnTimer = 0;
    this.initialDelay = 1; // Delay before first word

    // Statistics
    this.totalSpawned = 0;
    this.totalCompleted = 0;
    this.totalScore = 0;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;

    // Current input buffer (prefix matching system)
    this.currentInput = "";
  }

  // Initialize the dictionary
  async initialize() {
    await this.dictionary.load(this.language);
    this.spawnTimer = this.initialDelay;
  }

  // Update word positions and spawn new words
  update(deltaTime, speed) {
    // Move existing words down
    this.activeWords.forEach((word) => {
      word.y += speed * deltaTime;
    });

    // Update spawn timer
    this.spawnTimer -= deltaTime;

    // Spawn new word if timer expired and room available
    if (
      this.spawnTimer <= 0 &&
      this.activeWords.length < CONFIG.game.maxActiveWords
    ) {
      // Don't spawn if we've spawned all words for the game
      if (this.totalSpawned < CONFIG.game.totalWords) {
        this.spawnWord();
      }
      this.spawnTimer = this.getSpawnDelay();
    }
  }

  // Calculate spawn delay based on difficulty
  getSpawnDelay() {
    const { minSpawnDelay, maxSpawnDelay } = CONFIG.words;
    // Random delay between min and max
    return minSpawnDelay + Math.random() * (maxSpawnDelay - minSpawnDelay);
  }

  // Spawn a new word
  spawnWord() {
    const excludeList = [
      ...this.recentWords,
      ...this.activeWords.map((w) => w.text),
    ];
    const shouldLimitLength = this.totalSpawned < 100;
    const lengthFilter = shouldLimitLength
      ? (word) => {
          const letters = word.match(/[a-zA-Z\u0400-\u04FF]/g);
          const length = letters ? letters.length : 0;
          return length >= 3 && length <= 5;
        }
      : null;

    const text = this.dictionary.getRandomWordExcluding(
      this.language,
      excludeList,
      lengthFilter,
    );

    // Calculate random X position with padding
    const padding = CONFIG.words.padding;
    const minX = padding;
    const maxX = CONFIG.canvas.width - padding;
    const x = minX + Math.random() * (maxX - minX);

    const word = {
      text: text,
      typedIndex: 0,
      x: x,
      y: CONFIG.words.startY,
      treeType: Math.floor(Math.random() * CONFIG.trees.emojis.length),
      id: Date.now() + Math.random(), // Unique identifier
    };

    this.activeWords.push(word);
    this.totalSpawned++;

    // Track recent words
    this.recentWords.push(text);
    if (this.recentWords.length > this.maxRecentWords) {
      this.recentWords.shift();
    }
  }

  // Handle a key press, returns result type
  handleKeyPress(key) {
    if (this.activeWords.length === 0) {
      return { type: "none" };
    }

    this.totalKeystrokes++;

    // Handle confirmation keys (Space or Enter)
    if (key === " " || key === "Enter") {
      return this.confirmWord();
    }

    // Add character to input buffer
    const newInput = this.currentInput + key.toLowerCase();

    // Find all words that match this prefix
    const matchingWords = this.activeWords.filter((word) =>
      word.text.toLowerCase().startsWith(newInput),
    );

    if (matchingWords.length === 0) {
      // No matches - reset and count as incorrect
      this.resetInput();
      return { type: "incorrect", word: null };
    }

    // Update input buffer
    this.currentInput = newInput;
    this.correctKeystrokes++;

    // Update typedIndex for all matching words
    this.updateMatchingWords();

    // Return the most urgent matching word for feedback
    const urgentWord = this.getMostUrgentMatchingWord();
    return { type: "correct", word: urgentWord };
  }

  // Confirm the shortest complete match with Space/Enter
  confirmWord() {
    if (this.currentInput.length === 0) {
      return { type: "none" };
    }

    // Find words that exactly match the current input
    const exactMatches = this.activeWords.filter(
      (word) => word.text.toLowerCase() === this.currentInput,
    );

    if (exactMatches.length > 0) {
      // Complete the most urgent (closest to bottom) exact match
      const wordToComplete = exactMatches.reduce((closest, word) => {
        if (!closest || word.y > closest.y) return word;
        return closest;
      }, null);

      this.resetInput();
      return this.completeWord(wordToComplete);
    }

    // No exact match - just a beep, don't reset (let them keep typing)
    return { type: "incorrect", word: null };
  }

  // Update typedIndex for all words matching current input
  updateMatchingWords() {
    const inputLower = this.currentInput.toLowerCase();

    this.activeWords.forEach((word) => {
      if (word.text.toLowerCase().startsWith(inputLower)) {
        word.typedIndex = this.currentInput.length;
      } else {
        word.typedIndex = 0;
      }
    });
  }

  // Get the most urgent word that matches current input
  getMostUrgentMatchingWord() {
    const inputLower = this.currentInput.toLowerCase();

    const matching = this.activeWords.filter((word) =>
      word.text.toLowerCase().startsWith(inputLower),
    );

    if (matching.length === 0) return null;

    return matching.reduce((closest, word) => {
      if (!closest || word.y > closest.y) return word;
      return closest;
    }, null);
  }

  // Reset input buffer and all word progress
  resetInput() {
    this.currentInput = "";
    this.activeWords.forEach((word) => {
      word.typedIndex = 0;
    });
  }

  // Get the current input string (for display)
  getCurrentInput() {
    return this.currentInput;
  }

  // Get the current word being typed (most urgent matching word)
  getCurrentWord() {
    if (this.activeWords.length === 0) return null;

    if (this.currentInput.length > 0) {
      return this.getMostUrgentMatchingWord();
    }

    // No input - return the one closest to bottom (most urgent)
    return this.activeWords.reduce((closest, word) => {
      if (!closest || word.y > closest.y) return word;
      return closest;
    }, null);
  }

  // Mark a word as completed and remove it
  completeWord(word) {
    const index = this.activeWords.indexOf(word);
    if (index > -1) {
      this.activeWords.splice(index, 1);
      this.totalCompleted++;
      const points = word.text.length * 10;
      this.totalScore += points;

      return {
        type: "completed",
        word: word,
        totalCompleted: this.totalCompleted,
        points: points,
      };
    }
    return { type: "none" };
  }

  // Get total score
  getScore() {
    return this.totalScore;
  }

  // Check if any word has passed the fail line (reached the leaf)
  checkForFailedWord() {
    const failLine = CONFIG.canvas.height - 80; // Above leaf

    for (const word of this.activeWords) {
      // Word fails if it reaches the fail line AND hasn't been started
      if (word.y > failLine && word.typedIndex === 0) {
        return word;
      }
    }

    return null;
  }

  // Check for and remove any escaped word (returns the word if found)
  checkAndRemoveEscapedWord() {
    const failLine = CONFIG.canvas.height - 80; // Above leaf

    for (let i = 0; i < this.activeWords.length; i++) {
      const word = this.activeWords[i];
      // Word escapes if it passes the fail line
      if (word.y > failLine) {
        // Remove the word from active words
        this.activeWords.splice(i, 1);
        return word;
      }
    }

    return null;
  }

  // Get all active words for rendering
  getActiveWords() {
    return this.activeWords;
  }

  // Get accuracy percentage
  getAccuracy() {
    if (this.totalKeystrokes === 0) return 100;
    return Math.round((this.correctKeystrokes / this.totalKeystrokes) * 100);
  }

  // Check if all words have been completed
  isGameComplete() {
    return this.totalCompleted >= CONFIG.game.totalWords;
  }

  // Reset for a new game
  reset() {
    this.activeWords = [];
    this.recentWords = [];
    this.spawnTimer = this.initialDelay;
    this.totalSpawned = 0;
    this.totalCompleted = 0;
    this.totalScore = 0;
    this.totalKeystrokes = 0;
    this.correctKeystrokes = 0;
    this.currentInput = "";
  }
}
