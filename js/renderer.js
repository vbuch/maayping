import { CONFIG } from "./config.js";

// Polyfill for roundRect if not available
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x,
    y,
    width,
    height,
    radius,
  ) {
    if (typeof radius === "number") {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    const r = radius;
    this.moveTo(x + r.tl, y);
    this.lineTo(x + width - r.tr, y);
    this.quadraticCurveTo(x + width, y, x + width, y + r.tr);
    this.lineTo(x + width, y + height - r.br);
    this.quadraticCurveTo(x + width, y + height, x + width - r.br, y + height);
    this.lineTo(x + r.bl, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - r.bl);
    this.lineTo(x, y + r.tl);
    this.quadraticCurveTo(x, y, x + r.tl, y);
    this.closePath();
  };
}

// Canvas renderer with CSS/emoji style graphics
export class Renderer {
  constructor(ctx) {
    this.ctx = ctx;
    this.width = CONFIG.canvas.width;
    this.height = CONFIG.canvas.height;

    // Animation state
    this.scrollOffset = 0;
    this.parallaxOffset = 0;
    this.characterTimer = 0;
    this.time = 0;

    // Pre-create gradient for performance
    this.forestGradient = this.createForestGradient();

    // Ambient decoration layout
    this.ambientElements = this.createAmbientElements();
  }

  // Generate ambient decorative elements (deterministic layout)
  createAmbientElements() {
    const backgroundTrees = [];
    const groundFlowers = [];
    const sideAnimals = [];
    const passingAnimals = [];

    const treeEmojis = ["🌲", "🌳", "🌴"];
    for (let i = 0; i < 12; i++) {
      const seed = i * 91 + 17;
      const depth = this.seededRange(seed + 3, 0.15, 1);
      const x = this.seededRange(seed, 40, this.width - 40);
      const baseY = this.seededRange(seed + 5, -40, this.height - 120);
      const size = 40 + depth * 70;
      const alpha = 0.25 + depth * 0.6;
      const parallax = 0.35 + depth * 0.95;
      backgroundTrees.push({
        x,
        baseY,
        size,
        alpha,
        parallax,
        depth,
        emoji: treeEmojis[i % treeEmojis.length],
      });
    }

    const flowerEmojis = ["🌸", "🌼", "🌺", "🌻", "🌷", "🪻"];
    for (let i = 0; i < 18; i++) {
      const seed = i * 57 + 31;
      const x = this.seededRange(seed, 20, this.width - 20);
      const y = this.seededRange(seed + 7, this.height - 90, this.height - 15);
      const size = this.seededRange(seed + 13, 18, 28);
      groundFlowers.push({
        x,
        y,
        size,
        emoji: flowerEmojis[i % flowerEmojis.length],
        swayOffset: this.seededRange(seed + 29, 0, Math.PI * 2),
      });
    }

    const sideAnimalEmojis = ["🦊", "🦝", "🐰", "🦉"];
    for (let i = 0; i < 6; i++) {
      const seed = i * 41 + 9;
      const y = this.seededRange(seed, 120, this.height - 160);
      const size = this.seededRange(seed + 3, 26, 36);
      const side = i % 2 === 0 ? "left" : "right";
      sideAnimals.push({
        y,
        size,
        side,
        emoji: sideAnimalEmojis[i % sideAnimalEmojis.length],
        bobOffset: this.seededRange(seed + 17, 0, Math.PI * 2),
      });
    }

    const passingEmojis = ["🦌", "🦫", "🐿️", "🦔"];
    for (let i = 0; i < 4; i++) {
      const seed = i * 73 + 5;
      const y = this.seededRange(seed, this.height - 190, this.height - 120);
      const size = this.seededRange(seed + 9, 24, 32);
      const speed = this.seededRange(seed + 21, 12, 24);
      const direction = i % 2 === 0 ? 1 : -1;
      const offset = this.seededRange(seed + 33, 0, this.width + 200);
      passingAnimals.push({
        y,
        size,
        speed,
        direction,
        offset,
        emoji: passingEmojis[i % passingEmojis.length],
      });
    }

    return { backgroundTrees, groundFlowers, sideAnimals, passingAnimals };
  }

  // Simple deterministic random helper
  seededRange(seed, min, max) {
    const x = Math.sin(seed) * 10000;
    const rand = x - Math.floor(x);
    return min + rand * (max - min);
  }

  // Create forest background gradient
  createForestGradient() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#1a4d1a");
    gradient.addColorStop(0.3, "#228B22");
    gradient.addColorStop(0.6, "#2d7d2d");
    gradient.addColorStop(1, "#1a3d1a");
    return gradient;
  }

  // Update scroll position for forest movement illusion
  updateScroll(deltaTime, speed) {
    this.scrollOffset += speed * deltaTime;
    this.parallaxOffset += speed * deltaTime;
    // Reset offset to prevent huge numbers
    if (this.scrollOffset >= 100) {
      this.scrollOffset -= 100;
    }
  }

  // Update animation timers
  updateAnimations(deltaTime) {
    this.time += deltaTime;
    this.characterTimer += deltaTime;
  }

  // Clear the canvas
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  // Draw the forest background with subtle movement
  drawForest() {
    // Base gradient
    this.ctx.fillStyle = this.forestGradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw grass texture pattern (scrolling dots)
    this.ctx.fillStyle = "rgba(34, 139, 34, 0.3)";
    for (let y = 0; y < this.height + 50; y += 50) {
      for (let x = 0; x < this.width + 50; x += 50) {
        const offsetY = (y + this.scrollOffset) % (this.height + 50);
        // Slight wobble for organic feel
        const wobble = Math.sin(x * 0.1 + this.time) * 2;
        this.ctx.beginPath();
        this.ctx.arc(x + wobble, offsetY, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Background trees and ambient distractions
    this.drawBackgroundTrees();
    this.drawSideAnimals();
    this.drawPassingAnimals();
    this.drawGroundFlowers();

    // Draw some decorative elements (small plants/bushes)
    this.drawDecorations();
  }

  // Draw distant background trees
  drawBackgroundTrees() {
    const { backgroundTrees } = this.ambientElements;
    const sortedTrees = [...backgroundTrees].sort((a, b) => a.depth - b.depth);
    sortedTrees.forEach((tree) => {
      this.ctx.globalAlpha = tree.alpha;
      this.ctx.font = `${tree.size}px Arial`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      const sway = Math.sin(this.time * 0.6 + tree.x * 0.02) * 2;
      const scrolledY = tree.baseY + this.parallaxOffset * tree.parallax;
      if (scrolledY < -80 || scrolledY > this.height + 80) {
        return;
      }
      this.ctx.fillText(tree.emoji, tree.x + sway, scrolledY);
    });
    this.ctx.globalAlpha = 1;
  }

  // Draw flowers near the ground
  drawGroundFlowers() {
    const { groundFlowers } = this.ambientElements;
    groundFlowers.forEach((flower) => {
      const sway = Math.sin(this.time * 1.5 + flower.swayOffset) * 2;
      const bob = Math.sin(this.time * 2 + flower.swayOffset) * 1.5;
      this.ctx.font = `${flower.size}px Arial`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.globalAlpha = 0.92;
      this.ctx.fillText(flower.emoji, flower.x + sway, flower.y + bob);
    });
    this.ctx.globalAlpha = 1;
  }

  // Draw animals peeking from the sides
  drawSideAnimals() {
    const { sideAnimals } = this.ambientElements;
    sideAnimals.forEach((animal) => {
      const bob = Math.sin(this.time * 1.2 + animal.bobOffset) * 3;
      const x = animal.side === "left" ? -10 : this.width + 10;
      const offset = animal.side === "left" ? 18 : -18;
      this.ctx.font = `${animal.size}px Arial`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.globalAlpha = 0.85;
      this.ctx.fillText(animal.emoji, x + offset, animal.y + bob);
    });
    this.ctx.globalAlpha = 1;
  }

  // Draw animals passing by across the scene
  drawPassingAnimals() {
    const { passingAnimals } = this.ambientElements;
    passingAnimals.forEach((animal) => {
      const travelWidth = this.width + 200;
      const travel = (this.time * animal.speed + animal.offset) % travelWidth;
      const x =
        animal.direction === 1 ? travel - 100 : this.width + 100 - travel;
      const bob = Math.sin(this.time * 3 + animal.offset) * 2;
      this.ctx.font = `${animal.size}px Arial`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.globalAlpha = 0.8;
      this.ctx.fillText(animal.emoji, x, animal.y + bob);
    });
    this.ctx.globalAlpha = 1;
  }

  // Draw decorative forest elements
  drawDecorations() {
    const decorations = ["🌿", "🍃", "☘️", "🌱"];
    this.ctx.font = "24px Arial";
    this.ctx.textAlign = "center";
    this.ctx.globalAlpha = 0.6;

    // Fixed positions for decorations (seeded based on position)
    for (let i = 0; i < 15; i++) {
      const x = (i * 137 + 50) % this.width;
      const baseY = (i * 89 + 30) % this.height;
      const scrolledY = (baseY + this.scrollOffset * 0.5) % this.height;
      const decoration = decorations[i % decorations.length];
      this.ctx.fillText(decoration, x, scrolledY);
    }

    this.ctx.globalAlpha = 1;
  }

  // Draw words with their tree backgrounds
  drawWords(words) {
    words.forEach((word) => {
      this.drawTree(word.x, word.y, word.treeType);
      this.drawWordText(word);
    });
  }

  // Draw a tree emoji at position
  drawTree(x, y, treeType) {
    const treeEmojis = CONFIG.trees.emojis;
    const emoji = treeEmojis[treeType % treeEmojis.length];

    this.ctx.font = `${CONFIG.trees.size}px Arial`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // Draw tree shadow
    this.ctx.globalAlpha = 0.3;
    this.ctx.fillText(emoji, x + 3, y + 3);
    this.ctx.globalAlpha = 1;

    // Draw tree
    this.ctx.fillText(emoji, x, y);
  }

  // Draw word text with letter coloring
  drawWordText(word) {
    const text = word.text;
    const fontSize = this.getWordFontSize();

    this.ctx.font = `bold ${fontSize}px Arial`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";

    // Calculate total width to center the word
    const totalWidth = this.ctx.measureText(text).width;
    let currentX = word.x - totalWidth / 2;
    const y = word.y + 35; // Below the tree

    // Draw background pill for better readability
    this.drawWordBackground(word.x, y, totalWidth, fontSize);

    // Draw each letter with appropriate color
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      let color;

      if (i < word.typedIndex) {
        // Already typed correctly - green
        color = CONFIG.colors.typed;
      } else if (i === word.typedIndex) {
        // Current letter to type - orange/highlighted
        color = CONFIG.colors.current;
      } else {
        // Not yet typed - dark brown
        color = CONFIG.colors.untyped;
      }

      // Draw letter shadow
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      this.ctx.fillText(char, currentX + 1, y + 1);

      // Draw letter
      this.ctx.fillStyle = color;
      this.ctx.fillText(char, currentX, y);

      currentX += this.ctx.measureText(char).width;
    }
  }

  // Increase word font size on small screens (mobile)
  getWordFontSize() {
    if (typeof window === "undefined") {
      return CONFIG.words.fontSize;
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isSmall = width <= 600 || height <= 600;
    const scale = isSmall ? 1.25 : 1;
    return Math.round(CONFIG.words.fontSize * scale);
  }

  // Draw semi-transparent background behind word for readability
  drawWordBackground(x, y, width, height) {
    const padding = 8;
    const radius = 10;

    this.ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    this.ctx.beginPath();
    this.ctx.roundRect(
      x - width / 2 - padding,
      y - height / 2 - padding / 2,
      width + padding * 2,
      height + padding,
      radius,
    );
    this.ctx.fill();

    // Subtle border
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }

  // Draw the player character at the bottom center
  drawPlayer(
    livesRemaining = 5,
    maxLives = 5,
    isCelebrating = false,
    playerEmoji = "🦫",
  ) {
    const emoji = playerEmoji || CONFIG.character.emoji;
    const size = CONFIG.character.size;
    const x = this.width / 2;
    const baseY = this.height - 50;

    // Walking bob animation (faster and bigger when celebrating)
    const bobAmount = isCelebrating
      ? CONFIG.character.bobAmount * 3
      : CONFIG.character.bobAmount;
    const bobSpeed = isCelebrating
      ? CONFIG.character.bobSpeed * 3
      : CONFIG.character.bobSpeed;
    const bob =
      Math.sin(this.characterTimer * bobSpeed * Math.PI * 2) * bobAmount;

    // Draw the leaf platform first (behind player)
    this.drawLeafPlatform(x, baseY + 25, livesRemaining, maxLives);

    // Celebration effects
    if (isCelebrating) {
      this.drawCelebrationEffects(x, baseY);
    }

    this.ctx.font = `${size}px Arial`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    // Draw shadow
    this.ctx.globalAlpha = 0.3;
    this.ctx.fillText(emoji, x + 3, baseY + bob + 3);
    this.ctx.globalAlpha = 1;

    // Draw player character
    this.ctx.fillText(emoji, x, baseY + bob);

    // Draw happy face overlay when celebrating
    if (isCelebrating) {
      this.ctx.font = "30px Arial";
      this.ctx.fillText("🎉", x - 40, baseY - 20 + bob);
      this.ctx.fillText("🎉", x + 40, baseY - 20 + bob);
      this.ctx.font = "16px Arial";
      this.ctx.fillStyle = "#FFD700";
      this.ctx.fillText("Great job!", x, baseY - 45);
    }
  }

  // Draw celebration sparkles/effects
  drawCelebrationEffects(x, y) {
    const sparkles = ["✨", "⭐", "🌟", "💫"];
    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "center";

    for (let i = 0; i < 6; i++) {
      const angle = ((this.time * 2 + i * 60) * Math.PI) / 180;
      const radius = 60 + Math.sin(this.time * 5 + i) * 10;
      const sparkleX = x + Math.cos(angle * 3) * radius;
      const sparkleY = y - 30 + Math.sin(angle * 2) * 30;

      this.ctx.globalAlpha = 0.7 + Math.sin(this.time * 10 + i) * 0.3;
      this.ctx.fillText(sparkles[i % sparkles.length], sparkleX, sparkleY);
    }
    this.ctx.globalAlpha = 1;
  }

  // Draw the leaf platform that shrinks as lives are lost
  drawLeafPlatform(x, y, livesRemaining, maxLives) {
    // Calculate leaf size based on lives (shrinks as lives are lost)
    const maxWidth = 120;
    const maxHeight = 40;
    const minWidth = 30;
    const minHeight = 10;

    const lifeRatio = livesRemaining / maxLives;
    const leafWidth = minWidth + (maxWidth - minWidth) * lifeRatio;
    const leafHeight = minHeight + (maxHeight - minHeight) * lifeRatio;

    // Leaf color gets more red/warning as lives decrease
    const green = Math.floor(180 * lifeRatio + 50);
    const red = Math.floor(150 * (1 - lifeRatio) + 50);
    const leafColor = `rgb(${red}, ${green}, 80)`;

    // Draw leaf shadow
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    this.ctx.beginPath();
    this.ctx.ellipse(
      x + 3,
      y + 3,
      leafWidth / 2,
      leafHeight / 2,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fill();

    // Draw leaf
    this.ctx.fillStyle = leafColor;
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, leafWidth / 2, leafHeight / 2, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw leaf vein
    this.ctx.strokeStyle = "rgba(0, 100, 0, 0.3)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x - leafWidth / 3, y);
    this.ctx.lineTo(x + leafWidth / 3, y);
    this.ctx.stroke();

    // Draw leaf emoji on top for extra visual
    this.ctx.font = `${Math.floor(20 * lifeRatio + 10)}px Arial`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("🍃", x, y);
  }

  // Draw the HUD (progress, score, lives)
  drawHUD(
    completed,
    total,
    currentSpeed,
    livesRemaining = 5,
    maxLives = 5,
    syncIndicator = null,
    score = 0,
  ) {
    // Progress bar background
    const barX = 20;
    const barY = 20;
    const barWidth = 200;
    const barHeight = 25;
    const radius = 12;

    // Background
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.beginPath();
    this.ctx.roundRect(barX, barY, barWidth, barHeight, radius);
    this.ctx.fill();

    // Progress fill
    const progress = completed / total;
    if (progress > 0) {
      this.ctx.fillStyle = CONFIG.colors.typed;
      this.ctx.beginPath();
      this.ctx.roundRect(
        barX + 2,
        barY + 2,
        (barWidth - 4) * progress,
        barHeight - 4,
        radius - 2,
      );
      this.ctx.fill();
    }

    // Progress text
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "bold 14px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      `${completed} / ${total}`,
      barX + barWidth / 2,
      barY + barHeight / 2,
    );

    if (syncIndicator) {
      this.ctx.font = "18px Arial";
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(
        syncIndicator,
        barX + barWidth + 12,
        barY + barHeight / 2,
      );
    }

    // Score display (top center)
    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "bold 16px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(
      `${score.toLocaleString()} pts`,
      this.width / 2,
      barY + barHeight / 2,
    );

    // Speed indicator (small text)
    const speedTier = Math.floor(completed / CONFIG.game.wordsPerSpeedIncrease);
    if (speedTier > 0) {
      this.ctx.font = "12px Arial";
      this.ctx.textAlign = "left";
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      this.ctx.fillText(
        `Speed: ${speedTier + 1}x`,
        barX,
        barY + barHeight + 18,
      );
    }

    // Draw lives indicator (top right)
    this.drawLivesIndicator(livesRemaining, maxLives);
  }

  // Draw lives indicator with leaf icons
  drawLivesIndicator(livesRemaining, maxLives) {
    const pauseButtonOffset = 45;
    const startX = this.width - 30 - pauseButtonOffset;
    const y = 30;
    const spacing = 25;

    this.ctx.font = "20px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    for (let i = 0; i < maxLives; i++) {
      const x = startX - i * spacing;
      if (i < livesRemaining) {
        // Full life - green leaf
        this.ctx.globalAlpha = 1;
        this.ctx.fillText("🍃", x, y);
      } else {
        // Lost life - faded/gray
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillText("🍂", x, y);
      }
    }
    this.ctx.globalAlpha = 1;
  }

  // Draw "current word" indicator showing which word to type
  drawCurrentWordIndicator(word) {
    if (!word) return;

    // Draw subtle arrow or highlight pointing to the current word
    const arrowY = word.y + 60;

    this.ctx.fillStyle = CONFIG.colors.current;
    this.ctx.font = "16px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText("▲", word.x, arrowY);
  }

  // Draw the current input text at the bottom
  drawCurrentInput(input) {
    if (!input || input.length === 0) return;

    const x = this.width / 2;
    const y = this.height - 100;

    // Background pill
    this.ctx.font = "bold 24px Arial";
    const textWidth = this.ctx.measureText(input).width;
    const padding = 15;
    const pillWidth = textWidth + padding * 2;
    const pillHeight = 36;

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.beginPath();
    this.ctx.roundRect(
      x - pillWidth / 2,
      y - pillHeight / 2,
      pillWidth,
      pillHeight,
      10,
    );
    this.ctx.fill();

    // Text
    this.ctx.fillStyle = CONFIG.colors.current;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(input, x, y);

    // Hint text
    this.ctx.font = "12px Arial";
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    this.ctx.fillText("Press SPACE or ENTER to confirm", x, y + 25);
  }

  // Draw paused overlay
  drawPausedOverlay() {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = "#FFFFFF";
    this.ctx.font = "bold 48px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("PAUSED", this.width / 2, this.height / 2);
  }

  // Flash effect when word is completed
  drawCompletionFlash(x, y) {
    this.ctx.fillStyle = "rgba(46, 204, 113, 0.5)";
    this.ctx.beginPath();
    this.ctx.arc(x, y, 50, 0, Math.PI * 2);
    this.ctx.fill();
  }
}
