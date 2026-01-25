// Keyboard input handler supporting Latin and Cyrillic characters
export class InputHandler {
    constructor(game) {
        this.game = game;
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.enabled = false;
    }

    // Start listening for keyboard events
    start() {
        if (this.enabled) return;
        document.addEventListener('keydown', this.boundHandleKeyDown);
        this.enabled = true;
    }

    // Stop listening for keyboard events
    stop() {
        if (!this.enabled) return;
        document.removeEventListener('keydown', this.boundHandleKeyDown);
        this.enabled = false;
    }

    // Handle keydown events
    handleKeyDown(event) {
        // Ignore if game is not in playing state
        if (this.game.state !== 'playing') return;

        // Handle Escape for pause
        if (event.key === 'Escape') {
            event.preventDefault();
            this.game.togglePause();
            return;
        }

        // Handle confirmation keys (Space and Enter)
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            this.game.handleKeyPress(event.key);
            return;
        }

        // Ignore modifier keys, function keys, control keys, etc.
        if (this.isControlKey(event)) return;

        // Only process single character keys
        if (event.key.length !== 1) return;

        // Check if it's a valid character
        if (!this.isValidCharacter(event.key)) return;

        // Prevent default behavior (no scrolling, etc.)
        event.preventDefault();

        // Pass the key to the game
        this.game.handleKeyPress(event.key);
    }

    // Check if the event is a control/modifier key
    isControlKey(event) {
        return (
            event.ctrlKey ||
            event.altKey ||
            event.metaKey ||
            event.key === 'Tab' ||
            event.key === 'Backspace' ||
            event.key === 'Delete' ||
            event.key === 'Shift' ||
            event.key === 'Control' ||
            event.key === 'Alt' ||
            event.key === 'Meta' ||
            event.key === 'CapsLock' ||
            event.key.startsWith('Arrow') ||
            event.key.startsWith('F') && event.key.length > 1 // F1-F12
        );
    }

    // Check if the character is valid (letters, numbers, and common punctuation)
    isValidCharacter(char) {
        // Latin letters (a-z, A-Z)
        // Cyrillic letters (Bulgarian alphabet range: \u0400-\u04FF)
        // Numbers and common punctuation (dash, apostrophe)
        const validPattern = /^[a-zA-Z\u0400-\u04FF0-9\-']$/;
        return validPattern.test(char);
    }

    // Destroy the input handler
    destroy() {
        this.stop();
    }
}
