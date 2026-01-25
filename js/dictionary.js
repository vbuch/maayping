// Dictionary module for loading and managing word lists
export class Dictionary {
  constructor() {
    this.words = {
      en: [],
      bg: [],
    };
    this.loaded = {
      en: false,
      bg: false,
    };
  }

  // Load a dictionary for a specific language
  async load(language) {
    if (this.loaded[language]) {
      return this;
    }

    try {
      const response = await fetch(`./data/words-${language}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load dictionary: ${response.status}`);
      }
      const data = await response.json();
      this.words[language] = data.words;
      this.loaded[language] = true;
    } catch (error) {
      console.error(`Error loading ${language} dictionary:`, error);
      // Fall back to a small default word list
      this.words[language] = this.getDefaultWords(language);
      this.loaded[language] = true;
    }

    return this;
  }

  // Get a random word from the dictionary
  getRandomWord(language) {
    const wordList = this.words[language];
    if (!wordList || wordList.length === 0) {
      return "error";
    }
    const index = Math.floor(Math.random() * wordList.length);
    return wordList[index];
  }

  // Get a random word excluding recently used words, with optional filter
  getRandomWordExcluding(language, excludeList, filterFn = null) {
    const wordList = this.words[language];
    if (!wordList || wordList.length === 0) {
      return "error";
    }

    const eligibleList = filterFn ? wordList.filter(filterFn) : wordList;
    if (eligibleList.length === 0) {
      return this.getRandomWord(language);
    }

    // Try to find a word not in the exclude list
    let word;
    let attempts = 0;
    const maxAttempts = 50;

    do {
      const index = Math.floor(Math.random() * eligibleList.length);
      word = eligibleList[index];
      attempts++;
    } while (excludeList.includes(word) && attempts < maxAttempts);

    return word;
  }

  // Get total word count for a language
  getWordCount(language) {
    return this.words[language]?.length || 0;
  }

  // Default fallback words if JSON fails to load
  getDefaultWords(language) {
    if (language === "bg") {
      return [
        "котка",
        "куче",
        "къща",
        "книга",
        "маса",
        "стол",
        "врата",
        "слънце",
        "луна",
        "звезда",
        "дърво",
        "цвете",
        "вода",
        "небе",
        "земя",
      ];
    }
    return [
      "cat",
      "dog",
      "house",
      "book",
      "table",
      "chair",
      "door",
      "sun",
      "moon",
      "star",
      "tree",
      "flower",
      "water",
      "sky",
      "earth",
    ];
  }
}
