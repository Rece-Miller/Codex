const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const restartButton = document.getElementById("restart-button");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");

const gridSize = 20;
const tileCount = canvas.width / gridSize;
const tickMs = 120;
const storageKey = "classic-snake-best-score";

let snake;
let food;
let direction;
let queuedDirection;
let score;
let bestScore = Number.parseInt(localStorage.getItem(storageKey) ?? "0", 10) || 0;
let gameStarted = false;
let isPaused = false;
let isGameOver = false;
let gameLoopId;

bestScoreElement.textContent = String(bestScore);

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];
  food = spawnFood();
  direction = { x: 1, y: 0 };
  queuedDirection = direction;
  score = 0;
  gameStarted = false;
  isPaused = false;
  isGameOver = false;
  scoreElement.textContent = "0";
  showOverlay("Press Any Arrow Key", "Guide the snake, eat the food, and avoid the walls or yourself.");
  draw();
}

function spawnFood() {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount)
    };

    if (!snake || snake.every((segment) => segment.x !== candidate.x || segment.y !== candidate.y)) {
      return candidate;
    }
  }
}

function setDirection(nextDirection) {
  const reversingX = nextDirection.x !== 0 && nextDirection.x === -direction.x;
  const reversingY = nextDirection.y !== 0 && nextDirection.y === -direction.y;

  if ((reversingX || reversingY) && gameStarted) {
    return;
  }

  queuedDirection = nextDirection;

  if (!gameStarted && !isGameOver) {
    gameStarted = true;
    hideOverlay();
  }
}

function update() {
  if (!gameStarted || isPaused || isGameOver) {
    return;
  }

  direction = queuedDirection;
  const head = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  const hitWall =
    head.x < 0 ||
    head.y < 0 ||
    head.x >= tileCount ||
    head.y >= tileCount;

  const hitSelf = snake.some((segment) => segment.x === head.x && segment.y === head.y);

  if (hitWall || hitSelf) {
    isGameOver = true;
    showOverlay("Game Over", "Press Enter or use the restart button to play again.");
    return;
  }

  snake.unshift(head);

  if (head.x === food.x && head.y === food.y) {
    score += 1;
    scoreElement.textContent = String(score);

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(storageKey, String(bestScore));
      bestScoreElement.textContent = String(bestScore);
    }

    food = spawnFood();
  } else {
    snake.pop();
  }
}

function drawBoard() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#101612";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.strokeStyle = "rgba(255, 255, 255, 0.03)";
  context.lineWidth = 1;

  for (let position = 0; position <= canvas.width; position += gridSize) {
    const offset = position + 0.5;

    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset, canvas.height);
    context.stroke();

    context.beginPath();
    context.moveTo(0, offset);
    context.lineTo(canvas.width, offset);
    context.stroke();
  }
}

function drawFood() {
  context.fillStyle = "#ff7a7a";
  context.beginPath();
  context.roundRect(food.x * gridSize + 3, food.y * gridSize + 3, gridSize - 6, gridSize - 6, 6);
  context.fill();
}

function drawSnake() {
  snake.forEach((segment, index) => {
    context.fillStyle = index === 0 ? "#9af37f" : "#68d84e";
    context.beginPath();
    context.roundRect(segment.x * gridSize + 2, segment.y * gridSize + 2, gridSize - 4, gridSize - 4, 6);
    context.fill();
  });
}

function draw() {
  drawBoard();
  drawFood();
  drawSnake();
}

function tick() {
  update();
  draw();
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function togglePause() {
  if (!gameStarted || isGameOver) {
    return;
  }

  isPaused = !isPaused;

  if (isPaused) {
    showOverlay("Paused", "Press space to jump back in.");
  } else {
    hideOverlay();
  }
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const directions = {
    arrowup: { x: 0, y: -1 },
    w: { x: 0, y: -1 },
    arrowdown: { x: 0, y: 1 },
    s: { x: 0, y: 1 },
    arrowleft: { x: -1, y: 0 },
    a: { x: -1, y: 0 },
    arrowright: { x: 1, y: 0 },
    d: { x: 1, y: 0 }
  };

  if (key in directions) {
    event.preventDefault();
    setDirection(directions[key]);
    return;
  }

  if (key === " " || key === "spacebar") {
    event.preventDefault();
    togglePause();
    return;
  }

  if (key === "enter" && isGameOver) {
    resetGame();
  }
});

restartButton.addEventListener("click", resetGame);

resetGame();
gameLoopId = window.setInterval(tick, tickMs);

