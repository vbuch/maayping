// Game configuration constants
export const CONFIG = {
    canvas: {
        width: 800,
        height: 600
    },

    game: {
        totalWords: 200,            // Words to complete for victory
        wordsPerSpeedIncrease: 15,  // Speed increases every N words
        wordsPerCelebration: 50,    // Capybara celebrates every N words
        baseSpeed: 50,              // Base scroll speed (pixels/second)
        speedMultiplier: 1.15,      // Speed multiplier per tier (15% faster)
        maxActiveWords: 5,          // Maximum words on screen at once
        maxEscapedWords: 5          // Words that can escape before game over
    },

    words: {
        minSpawnDelay: 1.5,         // Minimum seconds between word spawns
        maxSpawnDelay: 3.0,         // Maximum seconds between word spawns
        startY: -30,                // Spawn position (above visible area)
        fontSize: 28,               // Word font size
        padding: 60                 // Horizontal padding from edges
    },

    colors: {
        untyped: '#4A3728',         // Dark brown - letters not yet typed
        typed: '#2ECC71',           // Green - correctly typed letters
        current: '#F39C12',         // Orange - current letter to type
        background: '#228B22',      // Forest green background
        backgroundDark: '#1A5A1A'   // Darker green for gradient
    },

    capybara: {
        emoji: '🦫',
        size: 60,                   // Font size for capybara emoji
        bobSpeed: 2,                // Walking bob animation speed
        bobAmount: 3                // Pixels to bob up/down
    },

    trees: {
        emojis: ['🌳', '🌲', '🌴'],
        size: 40                    // Font size for tree emojis
    },

    audio: {
        enabled: true,
        volume: 0.3                 // Master volume (0-1)
    }
};
