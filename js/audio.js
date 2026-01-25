import { CONFIG } from './config.js';

// Audio manager using Web Audio API for sound effects
export class AudioManager {
    constructor() {
        this.context = null;
        this.enabled = CONFIG.audio.enabled;
        this.volume = CONFIG.audio.volume;
        this.initialized = false;
    }

    // Initialize audio context (must be called after user interaction)
    init() {
        if (this.initialized) return;

        try {
            this.context = new (window.AudioContext || window.webkitAudioContext)();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported:', e);
            this.enabled = false;
        }
    }

    // Resume audio context if suspended (browser autoplay policy)
    async resume() {
        if (this.context && this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    // Play a generated tone/sound
    playSound(type) {
        if (!this.enabled || !this.context) return;

        switch (type) {
            case 'type':
                this.playTypeSound();
                break;
            case 'complete':
                this.playCompleteSound();
                break;
            case 'error':
                this.playErrorSound();
                break;
            case 'gameOver':
                this.playGameOverSound();
                break;
            case 'victory':
                this.playVictorySound();
                break;
            case 'warning':
                this.playWarningSound();
                break;
            case 'celebration':
                this.playCelebrationSound();
                break;
        }
    }

    // Soft click sound for typing
    playTypeSound() {
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, this.context.currentTime);

        gainNode.gain.setValueAtTime(this.volume * 0.3, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.05);

        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + 0.05);
    }

    // Cheerful ding for completing a word
    playCompleteSound() {
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523, this.context.currentTime); // C5
        oscillator.frequency.setValueAtTime(659, this.context.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(784, this.context.currentTime + 0.2); // G5

        gainNode.gain.setValueAtTime(this.volume * 0.4, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.3);

        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + 0.3);
    }

    // Subtle error sound for wrong key
    playErrorSound() {
        const oscillator = this.context.createOscillator();
        const gainNode = this.context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.context.destination);

        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, this.context.currentTime);

        gainNode.gain.setValueAtTime(this.volume * 0.2, this.context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.1);

        oscillator.start(this.context.currentTime);
        oscillator.stop(this.context.currentTime + 0.1);
    }

    // Sad tone sequence for game over
    playGameOverSound() {
        const notes = [392, 349, 330, 262]; // G4, F4, E4, C4 (descending)
        const duration = 0.25;

        notes.forEach((freq, index) => {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.type = 'sine';
            const startTime = this.context.currentTime + (index * duration);
            oscillator.frequency.setValueAtTime(freq, startTime);

            gainNode.gain.setValueAtTime(this.volume * 0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        });
    }

    // Celebratory jingle for victory
    playVictorySound() {
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6 (ascending)
        const duration = 0.15;

        notes.forEach((freq, index) => {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.type = 'sine';
            const startTime = this.context.currentTime + (index * duration);
            oscillator.frequency.setValueAtTime(freq, startTime);

            gainNode.gain.setValueAtTime(this.volume * 0.4, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration * 2);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration * 2);
        });

        // Final chord
        setTimeout(() => {
            [523, 659, 784].forEach(freq => {
                const oscillator = this.context.createOscillator();
                const gainNode = this.context.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(this.context.destination);

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, this.context.currentTime);

                gainNode.gain.setValueAtTime(this.volume * 0.3, this.context.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + 0.5);

                oscillator.start(this.context.currentTime);
                oscillator.stop(this.context.currentTime + 0.5);
            });
        }, notes.length * duration * 1000);
    }

    // Celebration sound for milestone (every 50 words)
    playCelebrationSound() {
        // Play a triumphant fanfare
        const notes = [523, 659, 784, 1047, 784, 1047]; // C5, E5, G5, C6, G5, C6
        const durations = [0.1, 0.1, 0.1, 0.2, 0.1, 0.3];

        let startOffset = 0;
        notes.forEach((freq, index) => {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.type = 'sine';
            const startTime = this.context.currentTime + startOffset;
            oscillator.frequency.setValueAtTime(freq, startTime);

            gainNode.gain.setValueAtTime(this.volume * 0.5, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durations[index]);

            oscillator.start(startTime);
            oscillator.stop(startTime + durations[index]);

            startOffset += durations[index];
        });
    }

    // Warning sound when a word escapes (critical alert)
    playWarningSound() {
        // Play two quick descending tones
        const frequencies = [440, 330]; // A4 to E4

        frequencies.forEach((freq, index) => {
            const oscillator = this.context.createOscillator();
            const gainNode = this.context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.context.destination);

            oscillator.type = 'square';
            const startTime = this.context.currentTime + (index * 0.15);
            oscillator.frequency.setValueAtTime(freq, startTime);

            gainNode.gain.setValueAtTime(this.volume * 0.5, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.15);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.15);
        });
    }

    // Toggle sound on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Set volume (0-1)
    setVolume(level) {
        this.volume = Math.max(0, Math.min(1, level));
    }
}
