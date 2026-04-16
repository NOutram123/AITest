const {
  GRID_SIZE,
  TICK_MS,
  createInitialState,
  getDirectionFromKey,
  queueDirection,
  restartGame,
  startGame,
  stepGame,
  togglePause,
} = window.SnakeLogic;

const board = document.querySelector("#board");
const scoreValue = document.querySelector("#score");
const bestScoreValue = document.querySelector("#best-score");
const statusText = document.querySelector("#status");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");
const touchButtons = document.querySelectorAll("[data-direction]");

let state = createInitialState();
let timerId = null;
const cells = [];

buildBoard();
render();

document.addEventListener("keydown", handleKeydown);
pauseButton.addEventListener("click", () => {
  state = togglePause(state);
  syncTimer();
  render();
});
restartButton.addEventListener("click", () => {
  state = restartGame(state.bestScore);
  syncTimer();
  render();
});

touchButtons.forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    changeDirection(button.dataset.direction);
  });
});

function buildBoard() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < GRID_SIZE * GRID_SIZE; index += 1) {
    const cell = document.createElement("div");
    cell.className = "cell";
    fragment.appendChild(cell);
    cells.push(cell);
  }
  board.appendChild(fragment);
}

function handleKeydown(event) {
  const direction = getDirectionFromKey(event.key);

  if (event.code === "Space") {
    event.preventDefault();
    state = togglePause(state);
    syncTimer();
    render();
    return;
  }

  if (!direction) {
    return;
  }

  event.preventDefault();
  changeDirection(direction);
}

function changeDirection(direction) {
  if (!state.isRunning && !state.isGameOver) {
    state = queueDirection(state, direction);
    state = startGame(state);
    syncTimer();
    render();
    return;
  }

  state = queueDirection(state, direction);
  syncTimer();
  render();
}

function syncTimer() {
  if (timerId) {
    window.clearInterval(timerId);
    timerId = null;
  }

  if (state.isRunning && !state.isPaused && !state.isGameOver) {
    timerId = window.setInterval(() => {
      state = stepGame(state);
      syncTimer();
      render();
    }, TICK_MS);
  }
}

function render() {
  const snakeBodyLookup = new Set(
    state.snake.slice(1).map((segment) => `${segment.x},${segment.y}`),
  );
  const head = state.snake[0];
  const foodKey = state.food ? `${state.food.x},${state.food.y}` : null;

  cells.forEach((cell, index) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const key = `${x},${y}`;

    cell.className = "cell";
    if (key === foodKey) {
      cell.classList.add("cell--food");
    }
    if (snakeBodyLookup.has(key)) {
      cell.classList.add("cell--snake");
    }
    if (head.x === x && head.y === y) {
      cell.classList.add("cell--head");
    }
  });

  scoreValue.textContent = String(state.score);
  bestScoreValue.textContent = String(state.bestScore);
  pauseButton.textContent = state.isPaused ? "Resume" : "Pause";
  pauseButton.disabled = !state.isRunning || state.isGameOver;

  if (state.isGameOver) {
    statusText.textContent = "Game over. Press Restart to play again.";
    return;
  }

  if (!state.isRunning) {
    statusText.textContent = "Press any arrow key or WASD to start.";
    return;
  }

  if (state.isPaused) {
    statusText.textContent = "Paused. Press Space or Resume to continue.";
    return;
  }

  statusText.textContent = "Collect the food and avoid the walls or yourself.";
}
