import { Game } from './game.js';

console.log('Maayping: main.js loaded');

// Main application controller
class App {
    constructor() {
        console.log('Maayping: App constructor called');
        this.game = null;
        this.currentLanguage = null;

        // DOM elements
        this.menuScreen = document.getElementById('menu-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.pauseModal = document.getElementById('pause-modal');
        this.gameOverModal = document.getElementById('game-over-modal');
        this.canvas = document.getElementById('game-canvas');

        this.setupEventListeners();
    }

    // Set up all UI event listeners
    setupEventListeners() {
        // Language selection buttons
        const langButtons = document.querySelectorAll('.lang-btn');
        console.log('Maayping: Found', langButtons.length, 'language buttons');

        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const language = btn.dataset.lang;
                console.log('Maayping: Language selected:', language);
                this.startGame(language);
            });
        });

        // Pause button
        document.getElementById('pause-btn').addEventListener('click', () => {
            if (this.game) {
                this.game.togglePause();
            }
        });

        // Resume button (in pause modal)
        document.getElementById('resume-btn').addEventListener('click', () => {
            if (this.game) {
                this.game.resume();
            }
        });

        // Quit button (in pause modal)
        document.getElementById('quit-btn').addEventListener('click', () => {
            this.showMenu();
        });

        // Play again button
        document.getElementById('play-again-btn').addEventListener('click', () => {
            this.restartGame();
        });

        // Main menu button
        document.getElementById('menu-btn').addEventListener('click', () => {
            this.showMenu();
        });

        // Handle window focus/blur for auto-pause
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.game && this.game.state === 'playing') {
                this.game.pause();
            }
        });
    }

    // Start a new game with selected language
    async startGame(language) {
        this.currentLanguage = language;

        // Hide menu, show game
        this.menuScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.gameOverModal.classList.add('hidden');
        this.pauseModal.classList.add('hidden');

        // Clean up existing game if any
        if (this.game) {
            this.game.destroy();
        }

        // Create and initialize new game
        this.game = new Game(this.canvas, language);

        // Set up game end callback
        this.game.onGameEnd = (result) => this.showGameOver(result);

        try {
            await this.game.initialize();
            this.game.start();
        } catch (error) {
            console.error('Failed to start game:', error);
            alert('Failed to load the game. Please refresh and try again.');
            this.showMenu();
        }
    }

    // Restart the current game
    async restartGame() {
        if (!this.currentLanguage) {
            this.showMenu();
            return;
        }

        this.gameOverModal.classList.add('hidden');

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
        const modalContent = modal.querySelector('.modal-content');
        const title = document.getElementById('result-title');
        const message = document.getElementById('result-message');
        const wordsTyped = document.getElementById('words-typed');
        const accuracy = document.getElementById('accuracy');

        // Update modal styling based on result
        modalContent.classList.remove('victory', 'game-over');

        if (result.victory) {
            modalContent.classList.add('victory');
            title.textContent = 'Congratulations!';
            message.textContent = 'You completed all the words!';
        } else {
            modalContent.classList.add('game-over');
            title.textContent = 'Game Over';
            message.textContent = 'A word escaped! Try again?';
        }

        // Update stats
        wordsTyped.textContent = result.wordsCompleted;
        accuracy.textContent = result.accuracy;

        // Show modal
        modal.classList.remove('hidden');
    }

    // Return to main menu
    showMenu() {
        // Clean up game
        if (this.game) {
            this.game.destroy();
            this.game = null;
        }

        // Hide all screens/modals except menu
        this.gameScreen.classList.add('hidden');
        this.pauseModal.classList.add('hidden');
        this.gameOverModal.classList.add('hidden');
        this.menuScreen.classList.remove('hidden');

        this.currentLanguage = null;
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new App();
});
