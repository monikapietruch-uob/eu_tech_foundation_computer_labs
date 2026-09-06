const robot = document.getElementById("robot");
const target = document.getElementById("target");
const grid = document.getElementById("grid");
const codeInput = document.getElementById("codeInput");
const runButton = document.getElementById("runButton");
const resetButton = document.getElementById("resetButton");
const hintButton = document.getElementById("hintButton");
const hintBox = document.getElementById("hintBox");
const message = document.getElementById("message");

const gridSize = 4;

const diamondCol = 2;
const diamondRow = 1;

const startCol = 0;
const startRow = 0;
const startDirection = "right";

let robotCol = startCol;
let robotRow = startRow;
let robotDirection = startDirection;
let diamondPicked = false;
let isRunning = false;

const directionEmojis = {
  up: "🤖⬆️",
  right: "🤖➡️",
  down: "🤖⬇️",
  left: "🤖⬅️"
};

const leftTurns = {
  up: "left",
  left: "down",
  down: "right",
  right: "up"
};

function getCellSize() {
  return grid.clientWidth / gridSize;
}

function updateRobotPosition() {
  const cellSize = getCellSize();

  robot.style.left = robotCol * cellSize + "px";
  robot.style.top = robotRow * cellSize + "px";
  robot.style.width = cellSize + "px";
  robot.style.height = cellSize + "px";
  robot.textContent = directionEmojis[robotDirection];
}

function updateDiamondPosition() {
  const cellSize = getCellSize();

  target.style.left = diamondCol * cellSize + "px";
  target.style.top = diamondRow * cellSize + "px";
  target.style.width = cellSize + "px";
  target.style.height = cellSize + "px";
  target.style.opacity = diamondPicked ? "0" : "1";
}

function updateBoard() {
  updateRobotPosition();
  updateDiamondPosition();
}

function resetGame() {
  robotCol = startCol;
  robotRow = startRow;
  robotDirection = startDirection;
  diamondPicked = false;
  isRunning = false;

  runButton.disabled = false;
  resetButton.disabled = false;
  hintButton.disabled = false;

  message.textContent = "";
  message.className = "message";

  hintBox.style.display = "none";

  updateBoard();
}

function showSuccess(text) {
  message.textContent = text;
  message.className = "message success";
}

function showError(text) {
  message.textContent = text;
  message.className = "message error";
}

function wait(milliseconds) {
  return new Promise(function(resolve) {
    setTimeout(resolve, milliseconds);
  });
}

/*
  This game accepts a small beginner-friendly subset of Python-style code.

  Students can write:
    move()
    turn_left()
    pick_diamond()

  They can also create simple functions:
    def turn_right():
        turn_left()
        turn_left()
        turn_left()

  The browser still runs JavaScript, so this file reads the student's
  Python-style text and safely interprets only the allowed commands.
*/
function parseStudentCode(code) {
  const rawLines = code.replace(/\t/g, "    ").split("\n");

  const functions = {};
  const mainProgram = [];

  let lineIndex = 0;

  while (lineIndex < rawLines.length) {
    const originalLine = rawLines[lineIndex];
    const trimmedLine = originalLine.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) {
      lineIndex++;
      continue;
    }

    const functionMatch = trimmedLine.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*:\s*$/);

    if (functionMatch) {
      const functionName = functionMatch[1];
      const functionBody = [];

      lineIndex++;

      while (lineIndex < rawLines.length) {
        const bodyLine = rawLines[lineIndex];
        const bodyTrimmed = bodyLine.trim();

        if (bodyTrimmed === "" || bodyTrimmed.startsWith("#")) {
          lineIndex++;
          continue;
        }

        const isIndented = bodyLine.startsWith(" ") || bodyLine.startsWith("    ");

        if (!isIndented) {
          break;
        }

        functionBody.push(bodyTrimmed);
        lineIndex++;
      }

      if (functionBody.length === 0) {
        throw new Error("Your function needs at least one indented command.");
      }

      functions[functionName] = functionBody;
      continue;
    }

    if (originalLine.startsWith(" ") || originalLine.startsWith("    ")) {
      throw new Error("Only commands inside a function should be indented.");
    }

    mainProgram.push(trimmedLine);
    lineIndex++;
  }

  return {
    functions: functions,
    mainProgram: mainProgram
  };
}

function getCommandName(line) {
  const commandMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)$/);

  if (!commandMatch) {
    throw new Error("Use commands like move(), turn_left(), or pick_diamond().");
  }

  return commandMatch[1];
}

function moveRobotForward() {
  if (robotDirection === "right" && robotCol < gridSize - 1) {
    robotCol++;
  } else if (robotDirection === "left" && robotCol > 0) {
    robotCol--;
  } else if (robotDirection === "down" && robotRow < gridSize - 1) {
    robotRow++;
  } else if (robotDirection === "up" && robotRow > 0) {
    robotRow--;
  } else {
    throw new Error("The robot cannot move outside the grid.");
  }
}

function turnRobotLeft() {
  robotDirection = leftTurns[robotDirection];
}

function pickDiamond() {
  if (robotCol === diamondCol && robotRow === diamondRow) {
    diamondPicked = true;
  } else {
    throw new Error("The robot is not on the diamond yet.");
  }
}

async function runCommand(commandName, functions, callDepth) {
  if (callDepth > 10) {
    throw new Error("Too many function calls. Check your function.");
  }

  if (commandName === "move") {
    moveRobotForward();
    updateBoard();
    await wait(350);
    return;
  }

  if (commandName === "turn_left") {
    turnRobotLeft();
    updateBoard();
    await wait(350);
    return;
  }

  if (commandName === "pick_diamond") {
    pickDiamond();
    updateBoard();
    await wait(250);
    return;
  }

  if (functions[commandName]) {
    const functionBody = functions[commandName];

    for (let i = 0; i < functionBody.length; i++) {
      const nestedCommandName = getCommandName(functionBody[i]);
      await runCommand(nestedCommandName, functions, callDepth + 1);
    }

    return;
  }

  throw new Error("Unknown command: " + commandName + "()");
}

async function runStudentCode() {
  if (isRunning) {
    return;
  }

  resetGame();

  isRunning = true;
  runButton.disabled = true;
  resetButton.disabled = true;
  hintButton.disabled = true;

  try {
    const parsedCode = parseStudentCode(codeInput.value);

    if (parsedCode.mainProgram.length === 0) {
      throw new Error("Do not remove the commands below the comment line.");
    }

    for (let i = 0; i < parsedCode.mainProgram.length; i++) {
      const commandName = getCommandName(parsedCode.mainProgram[i]);
      await runCommand(commandName, parsedCode.functions, 0);
    }

    if (diamondPicked) {
      showSuccess("Success! The robot picked up the diamond.");
    } else {
      showError("The robot moved, but it has not picked up the diamond yet.");
    }
  } catch (error) {
    showError(error.message);
  }

  isRunning = false;
  runButton.disabled = false;
  resetButton.disabled = false;
  hintButton.disabled = false;
}

hintButton.addEventListener("click", function() {
  hintBox.style.display = "block";
});

runButton.addEventListener("click", runStudentCode);
resetButton.addEventListener("click", resetGame);

window.addEventListener("resize", updateBoard);

resetGame();