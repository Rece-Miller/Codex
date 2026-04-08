const boardCanvas = document.querySelector('#board');
const nextCanvas = document.querySelector('#next');
const scoreEl = document.querySelector('#score');
const linesEl = document.querySelector('#lines');
const levelEl = document.querySelector('#level');
const messageEl = document.querySelector('#message');
const restartButton = document.querySelector('#restart');

const boardCtx = boardCanvas.getContext('2d');
const nextCtx = nextCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;
const PREVIEW_BLOCK = 32;
const BASE_DROP_MS = 700;

const COLORS = {
  I: '#52e0ff',
  J: '#5b8cff',
  L: '#ff9f52',
  O: '#ffe066',
  S: '#64f3a4',
  T: '#c587ff',
  Z: '#ff6f91'
};

const SHAPES = {
  I: [[1, 1, 1, 1]],
  J: [[1, 0, 0], [1, 1, 1]],
  L: [[0, 0, 1], [1, 1, 1]],
  O: [[1, 1], [1, 1]],
  S: [[0, 1, 1], [1, 1, 0]],
  T: [[0, 1, 0], [1, 1, 1]],
  Z: [[1, 1, 0], [0, 1, 1]]
};

const LINE_SCORES = [0, 100, 300, 500, 800];

let board;
let currentPiece;
let nextPiece;
let score;
let clearedLines;
let level;
let lastDropTime;
let lastFrameTime;
let gameRunning;
let paused;

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function createRandomPiece() {
  const keys = Object.keys(SHAPES);
  const type = keys[Math.floor(Math.random() * keys.length)];
  const shape = cloneMatrix(SHAPES[type]);
  return {
    type,
    color: COLORS[type],
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: -1
  };
}

function resetGame() {
  board = createEmptyBoard();
  score = 0;
  clearedLines = 0;
  level = 1;
  gameRunning = true;
  paused = false;
  nextPiece = createRandomPiece();
  spawnPiece();
  lastDropTime = performance.now();
  lastFrameTime = performance.now();
  setMessage('Press arrow keys or space to play.');
  updateUi();
}

function spawnPiece() {
  currentPiece = nextPiece || createRandomPiece();
  currentPiece.x = Math.floor((COLS - currentPiece.shape[0].length) / 2);
  currentPiece.y = -getTopPadding(currentPiece.shape);
  nextPiece = createRandomPiece();

  if (collides(currentPiece.shape, currentPiece.x, currentPiece.y)) {
    gameRunning = false;
    setMessage('Game over. Press Restart to try again.');
  }
}

function getTopPadding(shape) {
  let padding = 0;
  for (const row of shape) {
    if (row.some(Boolean)) {
      break;
    }
    padding += 1;
  }
  return padding;
}

function setMessage(text) {
  messageEl.textContent = text;
}

function updateUi() {
  scoreEl.textContent = score;
  linesEl.textContent = clearedLines;
  levelEl.textContent = level;
}

function getDropInterval() {
  return Math.max(120, BASE_DROP_MS - (level - 1) * 55);
}

function rotate(shape) {
  return shape[0].map((_, index) => shape.map((row) => row[index]).reverse());
}

function collides(shape, offsetX, offsetY) {
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const boardX = offsetX + x;
      const boardY = offsetY + y;

      if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
        return true;
      }

      if (boardY >= 0 && board[boardY][boardX]) {
        return true;
      }
    }
  }
  return false;
}

function mergePiece() {
  currentPiece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const boardY = currentPiece.y + y;
      if (boardY >= 0) {
        board[boardY][currentPiece.x + x] = currentPiece.color;
      }
    });
  });
}

function clearLines() {
  let linesThisTurn = 0;

  for (let y = ROWS - 1; y >= 0; y -= 1) {
    if (board[y].every(Boolean)) {
      board.splice(y, 1);
      board.unshift(Array(COLS).fill(null));
      linesThisTurn += 1;
      y += 1;
    }
  }

  if (linesThisTurn > 0) {
    clearedLines += linesThisTurn;
    level = Math.floor(clearedLines / 10) + 1;
    score += LINE_SCORES[linesThisTurn] * level;
    setMessage(linesThisTurn >= 4 ? 'Tetris!' : `${linesThisTurn} line${linesThisTurn > 1 ? 's' : ''} cleared.`);
    updateUi();
  }
}

function lockPiece() {
  mergePiece();
  clearLines();
  spawnPiece();
}

function movePiece(direction) {
  if (!gameRunning || paused) return;
  const nextX = currentPiece.x + direction;
  if (!collides(currentPiece.shape, nextX, currentPiece.y)) {
    currentPiece.x = nextX;
  }
}

function softDrop() {
  if (!gameRunning || paused) return;
  if (!collides(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    score += 1;
    updateUi();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (!gameRunning || paused) return;
  let dropDistance = 0;
  while (!collides(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    dropDistance += 1;
  }
  score += dropDistance * 2;
  updateUi();
  lockPiece();
}

function rotatePiece() {
  if (!gameRunning || paused) return;
  const rotated = rotate(currentPiece.shape);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    const nextX = currentPiece.x + kick;
    if (!collides(rotated, nextX, currentPiece.y)) {
      currentPiece.shape = rotated;
      currentPiece.x = nextX;
      return;
    }
  }
}

function togglePause() {
  if (!gameRunning) return;
  paused = !paused;
  setMessage(paused ? 'Paused.' : 'Back in play.');
}

function updateGame(now) {
  if (!gameRunning || paused) return;
  const dropInterval = getDropInterval();
  if (now - lastDropTime >= dropInterval) {
    if (!collides(currentPiece.shape, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y += 1;
    } else {
      lockPiece();
    }
    lastDropTime = now;
  }
}

function drawCell(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
  ctx.strokeStyle = 'rgba(8, 17, 31, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);

  boardCtx.strokeStyle = 'rgba(163, 230, 255, 0.08)';
  boardCtx.lineWidth = 1;
  for (let x = 0; x <= COLS; x += 1) {
    boardCtx.beginPath();
    boardCtx.moveTo(x * BLOCK, 0);
    boardCtx.lineTo(x * BLOCK, ROWS * BLOCK);
    boardCtx.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, y * BLOCK);
    boardCtx.lineTo(COLS * BLOCK, y * BLOCK);
    boardCtx.stroke();
  }

  board.forEach((row, y) => {
    row.forEach((color, x) => {
      if (color) {
        drawCell(boardCtx, x, y, BLOCK, color);
      }
    });
  });

  if (!currentPiece) return;

  const ghostY = getGhostY();
  currentPiece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawX = currentPiece.x + x;
      const drawY = ghostY + y;
      if (drawY >= 0) {
        boardCtx.fillStyle = 'rgba(235, 247, 255, 0.14)';
        boardCtx.fillRect(drawX * BLOCK + 4, drawY * BLOCK + 4, BLOCK - 8, BLOCK - 8);
      }
    });
  });

  currentPiece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const drawY = currentPiece.y + y;
      if (drawY >= 0) {
        drawCell(boardCtx, currentPiece.x + x, drawY, BLOCK, currentPiece.color);
      }
    });
  });
}

function getGhostY() {
  let ghostY = currentPiece.y;
  while (!collides(currentPiece.shape, currentPiece.x, ghostY + 1)) {
    ghostY += 1;
  }
  return ghostY;
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;

  const shape = nextPiece.shape;
  const width = shape[0].length;
  const height = shape.length;
  const offsetX = Math.floor((nextCanvas.width - width * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK);
  const offsetY = Math.floor((nextCanvas.height - height * PREVIEW_BLOCK) / 2 / PREVIEW_BLOCK);

  shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        drawCell(nextCtx, offsetX + x, offsetY + y, PREVIEW_BLOCK, nextPiece.color);
      }
    });
  });
}

function loop(now) {
  if (!lastFrameTime) {
    lastFrameTime = now;
  }

  updateGame(now);
  drawBoard();
  drawNext();
  lastFrameTime = now;
  requestAnimationFrame(loop);
}

document.addEventListener('keydown', (event) => {
  if (!gameRunning && event.code !== 'KeyR') return;

  if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
    movePiece(-1);
  } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
    movePiece(1);
  } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
    softDrop();
    lastDropTime = performance.now();
  } else if (event.code === 'ArrowUp' || event.code === 'KeyW') {
    rotatePiece();
  } else if (event.code === 'Space') {
    event.preventDefault();
    hardDrop();
    lastDropTime = performance.now();
  } else if (event.code === 'KeyP') {
    togglePause();
  } else if (event.code === 'KeyR') {
    resetGame();
  }
});

restartButton.addEventListener('click', resetGame);

resetGame();
requestAnimationFrame(loop);
