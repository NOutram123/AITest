(function attachSnakeLogic(globalScope) {
  const GRID_SIZE = 16;
  const INITIAL_DIRECTION = "right";
  const TICK_MS = 140;

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

  function createInitialState(random) {
    const rng = random || Math.random;
    const midpoint = Math.floor(GRID_SIZE / 2);
    const snake = [
      { x: midpoint, y: midpoint },
      { x: midpoint - 1, y: midpoint },
      { x: midpoint - 2, y: midpoint },
    ];

    return {
      snake,
      direction: INITIAL_DIRECTION,
      pendingDirection: INITIAL_DIRECTION,
      food: placeFood(snake, rng),
      score: 0,
      bestScore: 0,
      isRunning: false,
      isPaused: false,
      isGameOver: false,
    };
  }

  function queueDirection(state, nextDirection) {
    if (!DIRECTION_VECTORS[nextDirection]) {
      return state;
    }

    const blockedDirection = state.isRunning ? state.pendingDirection : state.direction;
    if (OPPOSITES[blockedDirection] === nextDirection) {
      return state;
    }

    return {
      ...state,
      pendingDirection: nextDirection,
    };
  }

  function startGame(state) {
    if (state.isGameOver) {
      return state;
    }

    return {
      ...state,
      isRunning: true,
      isPaused: false,
    };
  }

  function togglePause(state) {
    if (!state.isRunning || state.isGameOver) {
      return state;
    }

    return {
      ...state,
      isPaused: !state.isPaused,
    };
  }

  function restartGame(bestScore, random) {
    const next = createInitialState(random || Math.random);
    next.bestScore = bestScore || 0;
    return next;
  }

  function stepGame(state, random) {
    const rng = random || Math.random;
    if (!state.isRunning || state.isPaused || state.isGameOver) {
      return state;
    }

    const direction = state.pendingDirection;
    const vector = DIRECTION_VECTORS[direction];
    const currentHead = state.snake[0];
    const nextHead = {
      x: currentHead.x + vector.x,
      y: currentHead.y + vector.y,
    };

    if (isOutOfBounds(nextHead)) {
      return finishGame(state, direction);
    }

    const willEat = positionsEqual(nextHead, state.food);
    const bodyToCheck = willEat ? state.snake : state.snake.slice(0, -1);
    const hitSelf = bodyToCheck.some((segment) => positionsEqual(segment, nextHead));

    if (hitSelf) {
      return finishGame(state, direction);
    }

    const snake = [nextHead].concat(state.snake);
    if (!willEat) {
      snake.pop();
    }

    const score = willEat ? state.score + 1 : state.score;
    return {
      ...state,
      snake,
      direction,
      pendingDirection: direction,
      food: willEat ? placeFood(snake, rng) : state.food,
      score,
      bestScore: Math.max(state.bestScore, score),
    };
  }

  function placeFood(snake, random) {
    const rng = random || Math.random;
    const occupied = new Set(snake.map(toKey));
    const openCells = [];

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const cell = { x, y };
        if (!occupied.has(toKey(cell))) {
          openCells.push(cell);
        }
      }
    }

    if (openCells.length === 0) {
      return null;
    }

    return openCells[Math.floor(rng() * openCells.length)];
  }

  function getDirectionFromKey(key) {
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

  function finishGame(state, direction) {
    return {
      ...state,
      direction,
      pendingDirection: direction,
      isRunning: false,
      isGameOver: true,
      bestScore: Math.max(state.bestScore, state.score),
    };
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

  function toKey(position) {
    return `${position.x},${position.y}`;
  }

  globalScope.SnakeLogic = {
    GRID_SIZE,
    TICK_MS,
    createInitialState,
    getDirectionFromKey,
    queueDirection,
    restartGame,
    startGame,
    stepGame,
    togglePause,
  };
}(window));
