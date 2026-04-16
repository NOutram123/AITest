export const GRID_SIZE = 16;
export const INITIAL_DIRECTION = "right";
export const TICK_MS = 140;

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITES = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function createInitialState(random = Math.random) {
  const midpoint = Math.floor(GRID_SIZE / 2);
  const snake = [
    { x: midpoint, y: midpoint },
    { x: midpoint - 1, y: midpoint },
    { x: midpoint - 2, y: midpoint },
  ];

  return {
    snake,
    direction: INITIAL_DIRECTION,
    queuedDirection: INITIAL_DIRECTION,
    food: placeFood(snake, random),
    score: 0,
    bestScore: 0,
    isRunning: false,
    isPaused: false,
    isGameOver: false,
  };
}

export function queueDirection(state, nextDirection) {
  if (!DIRECTION_VECTORS[nextDirection]) {
    return state;
  }

  if (!state.isRunning) {
    return {
      ...state,
      queuedDirection: nextDirection,
    };
  }

  const current = state.direction;
  if (state.snake.length > 1 && OPPOSITES[current] === nextDirection) {
    return state;
  }

  return {
    ...state,
    queuedDirection: nextDirection,
  };
}

export function togglePause(state) {
  if (state.isGameOver || !state.isRunning) {
    return state;
  }

  return {
    ...state,
    isPaused: !state.isPaused,
  };
}

export function restartGame(bestScore = 0, random = Math.random) {
  const next = createInitialState(random);
  next.bestScore = bestScore;
  return next;
}

export function stepGame(state, random = Math.random) {
  if (!state.isRunning || state.isPaused || state.isGameOver) {
    return state;
  }

  const direction = state.queuedDirection;
  const vector = DIRECTION_VECTORS[direction];
  const currentHead = state.snake[0];
  const nextHead = {
    x: currentHead.x + vector.x,
    y: currentHead.y + vector.y,
  };

  const willEat = positionsEqual(nextHead, state.food);
  const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);

  if (isOutOfBounds(nextHead) || bodyToCheck.some((segment) => positionsEqual(segment, nextHead))) {
    return {
      ...state,
      direction,
      isRunning: false,
      isGameOver: true,
      bestScore: Math.max(state.bestScore, state.score),
    };
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!willEat) {
    nextSnake.pop();
  }

  const nextScore = willEat ? state.score + 1 : state.score;
  return {
    ...state,
    snake: nextSnake,
    direction,
    food: willEat ? placeFood(nextSnake, random) : state.food,
    score: nextScore,
    bestScore: Math.max(state.bestScore, nextScore),
  };
}

export function startGame(state) {
  if (state.isGameOver) {
    return state;
  }

  return {
    ...state,
    isRunning: true,
    isPaused: false,
  };
}

export function placeFood(snake, random = Math.random) {
  const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
  const openCells = [];

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        openCells.push({ x, y });
      }
    }
  }

  if (openCells.length === 0) {
    return null;
  }

  const index = Math.floor(random() * openCells.length);
  return openCells[index];
}

export function getDirectionFromKey(key) {
  const normalized = key.toLowerCase();
  switch (normalized) {
    case "arrowup":
    case "w":
      return "up";
    case "arrowdown":
    case "s":
      return "down";
    case "arrowleft":
    case "a":
      return "left";
    case "arrowright":
    case "d":
      return "right";
    default:
      return null;
  }
}

function isOutOfBounds(position) {
  return (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= GRID_SIZE ||
    position.y >= GRID_SIZE
  );
}

function positionsEqual(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}
