const CATEGORIES = [
  { id: "light", name: "Light & Everyday Physics", color: "#008CFF" },
  { id: "biooptics", name: "Light Meets Biology", color: "#FF168F" },
  { id: "microscopy", name: "Lenses & Microscopes", color: "#FFD000" },
  { id: "images", name: "Pixels & Image Quality", color: "#9D35FF" },
  { id: "bodyimaging", name: "Seeing Inside the Body", color: "#00D46A" },
  { id: "assays", name: "Detecting Molecules & Sorting Cells", color: "#FF541C" }
];

const TEAM_COLORS = ["#FFFFFF", "#FF304F", "#00E5FF", "#FFE600", "#C05CFF", "#7CFF36"];
const TEAM_NAMES = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];
const STORAGE_KEY = "intro-bioeng-pursuit-state-v2";
const BANK_KEY = "intro-bioeng-question-bank-v2";
const RING_COUNT = 42;
const SPOKE_DEPTH = 5;
const HQ_INDICES = [0, 7, 14, 21, 28, 35];
const ROLL_AGAIN_INDICES = [3, 10, 17, 24, 31, 38];


const board = document.querySelector("#board");
const boardNodes = document.querySelector("#board-nodes");
const boardLines = document.querySelector("#board-lines");
const teamsList = document.querySelector("#teams-list");
const statusText = document.querySelector("#status-text");
const dieResult = document.querySelector("#die-result");
const questionDialog = document.querySelector("#question-dialog");
const answerPanel = document.querySelector("#answer-panel");
const resetDialog = document.querySelector("#reset-dialog");
const winnerDialog = document.querySelector("#winner-dialog");

let questions = [...DEFAULT_QUESTIONS];
try {
  const savedBank = JSON.parse(localStorage.getItem(BANK_KEY));
  if (Array.isArray(savedBank) && savedBank.length && savedBank.every(isValidQuestion)) {
    const oldBundledBank = savedBank.length === 120 && savedBank.every((item, index) => {
      const bundled = DEFAULT_QUESTIONS.find(question => question.id === item.id);
      return bundled && item.category === bundled.category && item.question === bundled.question &&
        item.correctOption === bundled.correctOption &&
        JSON.stringify(item.options) === JSON.stringify(bundled.options);
    });
    if (oldBundledBank) localStorage.removeItem(BANK_KEY);
    else questions = savedBank;
  }
} catch (error) { console.warn("Could not restore imported questions", error); }
let nodeMap = new Map();
let adjacency = new Map();
let reachable = new Set();
let manualMove = false;
let currentQuestion = null;
let currentCategoryIndex = null;
let selectedOption = null;
let answerRevealed = false;
let questionDeadline = null;
let questionExpired = false;
let finalChallenge = false;
let undoStack = [];
let toastTimer;

function initialState() {
  return {
    activeTeam: 0,
    winner: null,
    rolled: null,
    phase: "roll",
    mode: "classroom",
    questionSeconds: 30,
    finishReason: null,
    clock: { elapsed: 0, startedAt: null },
    seenQuestionKeys: [],
    teams: Array.from({ length: 6 }, (_, index) => ({
      name: TEAM_NAMES[index],
      color: TEAM_COLORS[index],
      position: "hub",
      wedges: [],
      correctAnswers: 0
    }))
  };
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored?.teams?.length === 6) {
      stored.teams.forEach((team, index) => {
        team.color = TEAM_COLORS[index];
        team.correctAnswers = Number.isFinite(team.correctAnswers) ? team.correctAnswers : 0;
      });
      const seenQuestionKeys = new Set(Array.isArray(stored.seenQuestionKeys) ? stored.seenQuestionKeys : []);
      for (const [categoryId, indices] of Object.entries(stored.usedQuestions || {})) {
        const categoryQuestions = questions.filter(item => item.category === categoryId);
        for (const index of indices) {
          if (categoryQuestions[index]) seenQuestionKeys.add(questionKey(categoryQuestions[index]));
        }
      }
      const restored = { ...initialState(), ...stored, seenQuestionKeys: [...seenQuestionKeys],
        rolled: null, phase: stored.winner === null || stored.winner === undefined ? "roll" : "won" };
      restored.questionSeconds = Number.isInteger(stored.questionSeconds) && stored.questionSeconds >= 5 && stored.questionSeconds <= 300
        ? stored.questionSeconds : 30;
      delete restored.usedQuestions;
      return restored;
    }
  } catch (error) {
    console.warn("Could not load saved game", error);
  }
  return initialState();
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function snapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 30) undoStack.shift();
}

function addNode(id, x, y, categoryIndex, type = "normal") {
  const node = { id, x, y, categoryIndex, type };
  nodeMap.set(id, node);
  adjacency.set(id, new Set());
  return node;
}

function connect(a, b) {
  adjacency.get(a).add(b);
  adjacency.get(b).add(a);
  const na = nodeMap.get(a);
  const nb = nodeMap.get(b);
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", na.x * 10);
  line.setAttribute("y1", na.y * 10);
  line.setAttribute("x2", nb.x * 10);
  line.setAttribute("y2", nb.y * 10);
  boardLines.append(line);
}

function polar(radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return { x: 50 + radius * Math.cos(radians), y: 50 + radius * Math.sin(radians) };
}

function buildBoard() {
  nodeMap.clear();
  adjacency.clear();
  boardNodes.replaceChildren();
  boardLines.replaceChildren();

  const ringCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  ringCircle.setAttribute("cx", "500");
  ringCircle.setAttribute("cy", "500");
  ringCircle.setAttribute("r", "440");
  boardLines.append(ringCircle);

  for (let i = 0; i < RING_COUNT; i += 1) {
    const position = polar(44, i * 360 / RING_COUNT);
    const sector = Math.floor(((i + 3) % RING_COUNT) / 7) % 6;
    const categoryIndex = i % 6;
    const type = HQ_INDICES.includes(i) ? "hq" : ROLL_AGAIN_INDICES.includes(i) ? "roll-again" : "normal";
    addNode(`r${i}`, position.x, position.y, type === "hq" ? HQ_INDICES.indexOf(i) : categoryIndex, type);
  }

  addNode("hub", 50, 50, 0, "hub");
  for (let spoke = 0; spoke < 6; spoke += 1) {
    for (let depth = 1; depth <= SPOKE_DEPTH; depth += 1) {
      const radius = 44 - depth * (35 / (SPOKE_DEPTH + 1));
      const position = polar(radius, spoke * 60);
      addNode(`s${spoke}-${depth}`, position.x, position.y, (spoke + depth) % 6);
    }
  }

  for (let i = 0; i < RING_COUNT; i += 1) connect(`r${i}`, `r${(i + 1) % RING_COUNT}`);
  for (let spoke = 0; spoke < 6; spoke += 1) {
    const hq = `r${HQ_INDICES[spoke]}`;
    connect(hq, `s${spoke}-1`);
    for (let depth = 1; depth < SPOKE_DEPTH; depth += 1) connect(`s${spoke}-${depth}`, `s${spoke}-${depth + 1}`);
    connect(`s${spoke}-${SPOKE_DEPTH}`, "hub");
  }

  nodeMap.forEach(renderNode);
  renderLegend();
}

function renderNode(node) {
  const category = CATEGORIES[node.categoryIndex];
  const element = document.createElement("button");
  element.type = "button";
  element.className = `space ${node.type}`;
  element.dataset.node = node.id;
  element.style.left = `${node.x}%`;
  element.style.top = `${node.y}%`;
  element.style.setProperty("--space-color", category.color);
  element.title = node.type === "hq" ? `${category.name} headquarters` : node.type === "hub" ? "Central hub" : category.name;
  element.setAttribute("aria-label", element.title);
  element.addEventListener("click", () => selectDestination(node.id));
  const tokens = document.createElement("span");
  tokens.className = "tokens";
  element.append(tokens);
  boardNodes.append(element);
}

function renderLegend() {
  const legend = document.querySelector("#board-legend");
  const cornerGroups = [[0, 1, 2], [3, 4, 5]];
  const cornerNames = ["top-left", "top-right"];
  legend.replaceChildren(...cornerGroups.map((indices, cornerIndex) => {
    const corner = document.createElement("div");
    corner.className = `legend-corner ${cornerNames[cornerIndex]}`;
    corner.replaceChildren(...indices.map(index => {
      const category = CATEGORIES[index];
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-dot" style="--legend-color:${category.color}"></span><span>${category.name}</span>`;
      return item;
    }));
    return corner;
  }));
}

function endpoints(start, steps) {
  const found = new Set();
  function walk(current, remaining, previous) {
    if (remaining === 0) {
      found.add(current);
      return;
    }
    adjacency.get(current).forEach(next => {
      if (next !== previous) walk(next, remaining - 1, current);
    });
  }
  walk(start, steps, null);
  return found;
}

function render() {
  const team = state.teams[state.activeTeam];
  document.querySelector("#active-team-name").textContent = team.name;
  document.querySelector("#active-team-dot").style.setProperty("--team-color", team.color);
  dieResult.value = state.rolled ?? "–";
  document.querySelector("#roll-die").disabled = state.phase !== "roll";
  document.querySelector("#undo-button").disabled = undoStack.length === 0;
  document.querySelector("#game-mode").value = state.mode;
  document.querySelector("#question-seconds").value = state.questionSeconds;
  document.querySelector("#game-mode").disabled = state.phase !== "roll" || state.winner !== null;
  document.querySelector("#next-turn").disabled = state.winner !== null;
  document.querySelector("#manual-move").disabled = state.winner !== null;
  document.querySelector("#finish-class").disabled = state.winner !== null || state.phase === "question";
  document.querySelector("#session-hint").textContent = state.mode === "classroom"
    ? "Any color earns its wedge. One question per turn. Six wedges unlock a final question on your next move."
    : "Headquarters earn wedges. Correct answers keep the turn. Return to the hub for the final.";
  updateClock();

  if (state.winner !== null) statusText.textContent = "Game complete. Reset to start a new class game.";
  else if (manualMove) statusText.textContent = "Manual move: select any board space.";
  else if (state.phase === "move") statusText.textContent = `Move exactly ${state.rolled} spaces. Highlighted destinations are valid.`;
  else statusText.textContent = "Roll the die to begin this group's turn.";

  document.querySelectorAll(".space").forEach(element => {
    const id = element.dataset.node;
    element.classList.toggle("reachable", reachable.has(id) && !manualMove);
    element.classList.toggle("manual-target", manualMove);
    const tokenLayer = element.querySelector(".tokens");
    tokenLayer.replaceChildren();
    const occupants = state.teams.map((entry, index) => ({ entry, index })).filter(item => item.entry.position === id);
    occupants.forEach(({ entry, index }, occupantIndex) => {
      const token = document.createElement("span");
      const angle = occupants.length === 1 ? 0 : occupantIndex * 360 / occupants.length;
      const radius = occupants.length === 1 ? 0 : 28;
      token.className = "token";
      token.style.setProperty("--team-color", entry.color);
      token.style.setProperty("--spin-delay", `${-index * 0.7}s`);
      token.style.left = `${50 + radius * Math.cos(angle * Math.PI / 180)}%`;
      token.style.top = `${50 + radius * Math.sin(angle * Math.PI / 180)}%`;
      token.title = entry.name;
      tokenLayer.append(token);
    });
  });

  renderTeams();
  saveState();
  if (state.winner !== null && state.winner !== undefined && !winnerDialog.open) showWinner();
}

function renderTeams() {
  teamsList.replaceChildren(...state.teams.map((team, teamIndex) => {
    const row = document.createElement("div");
    row.className = `team-row${teamIndex === state.activeTeam ? " active" : ""}`;
    row.style.setProperty("--team-color", team.color);
    const marker = document.createElement("span");
    marker.className = "team-marker";
    const name = document.createElement("input");
    name.className = "team-name";
    name.value = team.name;
    name.maxLength = 24;
    name.setAttribute("aria-label", `Name for group ${teamIndex + 1}`);
    name.addEventListener("change", () => {
      snapshot();
      team.name = name.value.trim() || TEAM_NAMES[teamIndex];
      render();
    });
    const wedges = document.createElement("div");
    wedges.className = "wedges";
    CATEGORIES.forEach(category => {
      const wedge = document.createElement("button");
      wedge.type = "button";
      wedge.className = `wedge${team.wedges.includes(category.id) ? " collected" : ""}`;
      wedge.style.setProperty("--wedge-color", category.color);
      wedge.title = `${category.name}: click to adjust`;
      wedge.disabled = state.winner !== null;
      wedge.addEventListener("click", () => toggleWedge(teamIndex, category.id));
      wedges.append(wedge);
    });
    row.append(marker, name, wedges);
    return row;
  }));
}

function rollDie() {
  if (state.phase !== "roll") return;
  snapshot();
  manualMove = false;
  state.rolled = Math.floor(Math.random() * 6) + 1;
  state.phase = "move";
  reachable = endpoints(state.teams[state.activeTeam].position, state.rolled);
  render();
}

function selectDestination(nodeId) {
  if (state.winner !== null) return;
  if (!manualMove && !reachable.has(nodeId)) return;
  snapshot();
  state.teams[state.activeTeam].position = nodeId;
  state.phase = "question";
  state.rolled = null;
  reachable.clear();
  manualMove = false;
  render();
  const node = nodeMap.get(nodeId);
  finalChallenge = state.teams[state.activeTeam].wedges.length === CATEGORIES.length &&
    (state.mode === "classroom" || node.type === "hub");
  if (node.type === "roll-again" && !finalChallenge) {
    state.phase = "roll";
    showToast("Roll again space: no question needed.");
    render();
    return;
  }
  if (node.type === "hub" || finalChallenge) openHubCategoryChoice();
  else showQuestion(node.categoryIndex);
}

function questionFor(categoryId) {
  const available = questions.filter(item => item.category === categoryId && !state.seenQuestionKeys.includes(questionKey(item)));
  if (!available.length) return null;
  const selected = available[Math.floor(Math.random() * available.length)];
  state.seenQuestionKeys.push(questionKey(selected));
  saveState();
  return selected;
}

function questionKey(item) {
  return item.question.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function hasAvailableQuestion(categoryId) {
  return questions.some(item => item.category === categoryId && !state.seenQuestionKeys.includes(questionKey(item)));
}

function showQuestion(categoryIndex) {
  const category = CATEGORIES[categoryIndex];
  const drawn = questionFor(category.id);
  if (!drawn) {
    openHubCategoryChoice(`No unused questions remain in ${category.name}. Choose another category or skip this turn.`);
    return;
  }
  currentCategoryIndex = categoryIndex;
  const shuffled = drawn.options.map((text, index) => ({ text, correct: index === drawn.correctOption }));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  currentQuestion = { ...drawn, options: shuffled.map(option => option.text), correctOption: shuffled.findIndex(option => option.correct) };
  selectedOption = null;
  answerRevealed = false;
  questionExpired = false;
  document.querySelector("#question-team").textContent = state.teams[state.activeTeam].name + (finalChallenge ? " - Final challenge" : "");
  document.querySelector("#question-category").textContent = category.name;
  document.querySelector("#question-text").textContent = currentQuestion.question;
  document.querySelector("#question-text").hidden = false;
  document.querySelector("#answer-text").textContent = currentQuestion.explanation || `Correct answer: ${currentQuestion.options[currentQuestion.correctOption]}`;
  document.querySelector("#question-badge").style.setProperty("--category-color", category.color);
  document.querySelector("#question-badge").hidden = false;
  document.querySelector(".question-card").style.setProperty("--category-color", category.color);
  document.querySelector("#category-choice").hidden = true;
  renderAnswerChoices();
  setQuestionControlsEnabled(false);
  document.querySelector("#ask-again").disabled = !hasAvailableQuestion(category.id);
  document.querySelector("#change-question").disabled = !questions.some(item => !state.seenQuestionKeys.includes(questionKey(item)));
  document.querySelector("#reveal-answer").disabled = false;
  document.querySelector("#skip-question").hidden = true;
  answerPanel.hidden = true;
  document.querySelector("#question-timer-status").hidden = true;
  if (!questionDialog.open) questionDialog.showModal();
  startQuestionTimer();
  saveState();
}

function openHubCategoryChoice(message = null) {
  stopQuestionTimer();
  currentQuestion = null;
  currentCategoryIndex = null;
  selectedOption = null;
  document.querySelector("#question-team").textContent = state.teams[state.activeTeam].name;
  document.querySelector("#question-category").textContent = message || (finalChallenge ? "Choose the final category" : "Choose a category");
  document.querySelector("#category-choice-label").textContent = questions.some(item => !state.seenQuestionKeys.includes(questionKey(item)))
    ? "Choose an unused category" : "All questions have been used. Skip this turn or finish class.";
  document.querySelector("#question-badge").hidden = true;
  document.querySelector("#category-choice").hidden = false;
  document.querySelectorAll(".category-choice-button").forEach((button, index) => {
    button.disabled = !hasAvailableQuestion(CATEGORIES[index].id);
  });
  document.querySelector("#skip-question").hidden = false;
  document.querySelector("#question-text").textContent = "";
  document.querySelector("#question-text").hidden = true;
  document.querySelector("#question-timer").value = "--:--";
  document.querySelector("#question-timer").classList.remove("time-up");
  document.querySelector("#answer-choices").replaceChildren();
  answerPanel.hidden = true;
  document.querySelector("#question-timer-status").hidden = true;
  setQuestionControlsEnabled(false);
  if (!questionDialog.open) questionDialog.showModal();
}

function renderAnswerChoices() {
  const container = document.querySelector("#answer-choices");
  container.replaceChildren(...currentQuestion.options.map((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-choice";
    button.innerHTML = `<span class="answer-choice-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span>`;
    button.addEventListener("click", () => selectAnswer(index));
    return button;
  }));
}

function selectAnswer(index) {
  updateQuestionTimer();
  if (!currentQuestion || selectedOption !== null || answerRevealed) return;
  selectedOption = index;
  revealCorrectAnswer();
}

function retryQuestion() {
  if (!currentQuestion) return;
  selectedOption = null;
  answerRevealed = false;
  questionExpired = false;
  answerPanel.hidden = true;
  document.querySelector("#question-timer-status").hidden = true;
  renderAnswerChoices();
  setQuestionControlsEnabled(false);
  document.querySelector("#reveal-answer").disabled = false;
  startQuestionTimer();
}

function revealCorrectAnswer() {
  if (!currentQuestion) return;
  stopQuestionTimer();
  answerRevealed = true;
  const choices = [...document.querySelectorAll(".answer-choice")];
  choices.forEach((choice, index) => {
    choice.disabled = true;
    choice.classList.toggle("selected", index === selectedOption);
    choice.classList.toggle("correct", index === currentQuestion.correctOption);
    choice.classList.toggle("incorrect", selectedOption === index && index !== currentQuestion.correctOption);
  });
  answerPanel.hidden = false;
  setQuestionControlsEnabled(true);
  document.querySelector("#reveal-answer").disabled = true;
}

function setQuestionControlsEnabled(enabled) {
  document.querySelector("#retry-question").disabled = currentQuestion === null;
  document.querySelector("#ask-again").disabled = currentCategoryIndex === null ||
    !hasAvailableQuestion(CATEGORIES[currentCategoryIndex].id);
  document.querySelector("#change-question").disabled = currentCategoryIndex === null ||
    !questions.some(item => !state.seenQuestionKeys.includes(questionKey(item)));
  document.querySelector("#reveal-answer").disabled = !enabled;
  document.querySelector("#continue-answer").disabled = !enabled;
}

function buildCategoryChoice() {
  const container = document.querySelector("#category-choice-buttons");
  CATEGORIES.forEach((category, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button category-choice-button";
    button.style.setProperty("--choice-color", category.color);
    button.textContent = category.name;
    button.addEventListener("click", () => {
      if (currentCategoryIndex === null) showQuestion(index);
    });
    container.append(button);
  });
}

function resolveAnswer() {
  if (!questionDialog.open || !currentQuestion || !answerRevealed || state.winner !== null) return;
  const correct = !questionExpired && selectedOption !== null && selectedOption === currentQuestion.correctOption;
  const team = state.teams[state.activeTeam];
  const node = nodeMap.get(team.position);
  const category = CATEGORIES[currentCategoryIndex];
  snapshot();
  stopQuestionTimer();
  questionDialog.close();

  if (correct) {
    team.correctAnswers += 1;
    if (finalChallenge) {
      state.winner = state.activeTeam;
      state.finishReason = "final";
      state.phase = "won";
      state.rolled = null;
      pauseClock();
      render();
      return;
    }
    if ((state.mode === "classroom" || (node.type === "hq" && node.categoryIndex === currentCategoryIndex)) &&
        !team.wedges.includes(category.id)) {
      team.wedges.push(category.id);
      showToast(`${team.name} earned the ${category.name} wedge!`);
    } else {
      showToast(state.mode === "classroom" ? "Correct. Next team!" : "Correct: the group rolls again.");
    }
    if (state.mode === "classroom") advanceTurn();
    else { state.phase = "roll"; state.rolled = null; }
  } else {
    advanceTurn();
  }
  render();
}

function rankedTeams() {
  return state.teams
    .map((team, index) => ({ ...team, index }))
    .sort((a, b) => {
      if (a.index === state.winner) return -1;
      if (b.index === state.winner) return 1;
      return b.wedges.length - a.wedges.length || b.correctAnswers - a.correctAnswers || a.index - b.index;
    });
}

function showWinner() {
  const winner = state.teams[state.winner];
  const leaders = state.finishReason === "class" ? classLeaders() : [winner];
  document.querySelector("#winner-name").textContent = `${leaders.map(team => team.name).join(" & ")} ${leaders.length > 1 ? "share first place!" : "wins!"}`;
  document.querySelector("#winner-summary").textContent = state.finishReason === "class"
    ? `Class results: ${winner.wedges.length} wedges and ${winner.correctAnswers} correct answers. Ranked by wedges, then correct answers.`
    : `All six wedges, a successful final challenge, and ${winner.correctAnswers} correct answers.`;
  document.querySelector("#winner-star").style.setProperty("--winner-color", winner.color);
  const standings = document.querySelector("#standings");
  let previous = null;
  let place = 1;
  standings.replaceChildren(...rankedTeams().map((team, position) => {
    const tied = previous && team.wedges.length === previous.wedges.length && team.correctAnswers === previous.correctAnswers &&
      (state.finishReason === "class" || previous.index !== state.winner);
    if (!tied) place = position + 1;
    previous = team;
    const row = document.createElement("div");
    row.className = `standing-row${leaders.includes(state.teams[team.index]) ? " champion" : ""}`;
    row.style.setProperty("--standing-color", team.color);
    row.innerHTML = `
      <span class="standing-place">${place}</span>
      <span class="standing-star"></span>
      <span class="standing-name">${escapeHtml(team.name)}</span>
      <span class="standing-score">${team.wedges.length} wedge${team.wedges.length === 1 ? "" : "s"}</span>
      <span class="standing-score">${team.correctAnswers} correct</span>
    `;
    return row;
  }));
  winnerDialog.showModal();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" }[character]));
}

function advanceTurn() {
  stopQuestionTimer();
  state.activeTeam = (state.activeTeam + 1) % state.teams.length;
  state.phase = "roll";
  state.rolled = null;
  currentQuestion = null;
  currentCategoryIndex = null;
  selectedOption = null;
  reachable.clear();
  manualMove = false;
}

function nextTurn() {
  if (state.winner !== null) return;
  snapshot();
  if (questionDialog.open) questionDialog.close();
  advanceTurn();
  render();
}

function toggleWedge(teamIndex, categoryId) {
  if (state.winner !== null) return;
  snapshot();
  const wedges = state.teams[teamIndex].wedges;
  const index = wedges.indexOf(categoryId);
  if (index >= 0) wedges.splice(index, 1);
  else wedges.push(categoryId);
  render();
}

function undo() {
  if (!undoStack.length) return;
  stopQuestionTimer();
  const seenQuestionKeys = state.seenQuestionKeys;
  state = JSON.parse(undoStack.pop());
  state.seenQuestionKeys = [...new Set([...(state.seenQuestionKeys || []), ...seenQuestionKeys])];
  reachable.clear();
  manualMove = false;
  if (questionDialog.open) questionDialog.close();
  if (winnerDialog.open) winnerDialog.close();
  if (state.phase === "move") reachable = endpoints(state.teams[state.activeTeam].position, state.rolled);
  if (state.phase === "question") { state.phase = "roll"; state.rolled = null; }
  render();
  showToast("Last action undone.");
}

function resetGame() {
  stopQuestionTimer();
  if (winnerDialog.open) winnerDialog.close();
  const questionSeconds = state.questionSeconds;
  state = initialState();
  state.questionSeconds = questionSeconds;
  undoStack = [];
  reachable.clear();
  manualMove = false;
  localStorage.removeItem(STORAGE_KEY);
  render();
  showToast("New game ready.");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function importQuestions(file) {
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported) || !imported.every(isValidQuestion)) throw new Error("Invalid format");
      const validIds = new Set(CATEGORIES.map(category => category.id));
      if (!imported.length || imported.some(item => !validIds.has(item.category)) ||
          CATEGORIES.some(category => !imported.some(item => item.category === category.id))) throw new Error("Include all six course categories");
      localStorage.setItem(BANK_KEY, JSON.stringify(imported));
      questions = imported;
      // Importing a bank does not make already shown question text available again.
      saveState();
      showToast(`${questions.length} questions imported.`);
    } catch (error) {
      showToast("Import failed: use valid multiple-choice questions covering all six course categories.");
    }
  });
  reader.readAsText(file);
}

function isValidQuestion(item) {
  return item &&
    typeof item.category === "string" &&
    typeof item.question === "string" &&
    item.question.trim() &&
    (item.explanation === undefined || typeof item.explanation === "string") &&
    Array.isArray(item.options) &&
    item.options.length >= 2 &&
    item.options.length <= 6 &&
    item.options.every(option => typeof option === "string" && option.trim()) &&
    Number.isInteger(item.correctOption) &&
    item.correctOption >= 0 &&
    item.correctOption < item.options.length;
}

function stopQuestionTimer() {
  questionDeadline = null;
}

function startQuestionTimer() {
  questionDeadline = Date.now() + state.questionSeconds * 1000;
  document.querySelector("#question-timer").classList.remove("time-up");
  updateQuestionTimer();
}

function updateQuestionTimer() {
  if (questionDeadline === null || !currentQuestion || answerRevealed) return;
  const remaining = Math.max(0, Math.ceil((questionDeadline - Date.now()) / 1000));
  const display = document.querySelector("#question-timer");
  display.value = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  if (remaining === 0) {
    questionExpired = true;
    display.classList.add("time-up");
    document.querySelector("#question-timer-status").hidden = false;
    revealCorrectAnswer();
  }
}

function elapsedTime() {
  return state.clock.elapsed + (state.clock.startedAt === null ? 0 : Date.now() - state.clock.startedAt);
}

function pauseClock() {
  state.clock.elapsed = elapsedTime();
  state.clock.startedAt = null;
}

function updateClock() {
  const remaining = Math.max(0, Math.ceil((60 * 60 * 1000 - elapsedTime()) / 1000));
  const display = document.querySelector("#session-clock");
  display.value = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  display.classList.toggle("time-up", remaining === 0);
  document.querySelector("#clock-toggle").textContent = state.clock.startedAt === null ? "Start clock" : "Pause clock";
  document.querySelector("#clock-toggle").disabled = state.winner !== null;
  if (remaining === 0 && state.winner === null) {
    document.querySelector("#session-hint").textContent = "60 minutes reached. Finish the current question, then use End class & rank.";
  }
}

function classLeaders() {
  const sorted = [...state.teams].sort((a, b) => b.wedges.length - a.wedges.length || b.correctAnswers - a.correctAnswers);
  return sorted.filter(team => team.wedges.length === sorted[0].wedges.length && team.correctAnswers === sorted[0].correctAnswers);
}

function finishClass() {
  if (state.winner !== null || state.phase === "question") return;
  snapshot();
  state.winner = state.teams.indexOf(classLeaders()[0]);
  state.finishReason = "class";
  state.phase = "won";
  state.rolled = null;
  reachable.clear();
  manualMove = false;
  pauseClock();
  render();
}

document.querySelector("#clock-toggle").addEventListener("click", () => {
  if (state.winner !== null) return;
  if (state.clock.startedAt === null) state.clock.startedAt = Date.now();
  else pauseClock();
  saveState();
  updateClock();
});
document.querySelector("#game-mode").addEventListener("change", event => {
  if (state.phase !== "roll" || state.winner !== null) return;
  snapshot();
  state.mode = event.target.value;
  render();
});
document.querySelector("#finish-class").addEventListener("click", () => document.querySelector("#finish-dialog").showModal());
document.querySelector("#confirm-finish").addEventListener("click", () => {
  document.querySelector("#finish-dialog").close();
  finishClass();
});
questionDialog.addEventListener("cancel", event => event.preventDefault());
setInterval(updateClock, 1000);
setInterval(updateQuestionTimer, 200);

document.querySelector("#question-seconds").addEventListener("change", event => {
  const seconds = Number(event.target.value);
  state.questionSeconds = Number.isInteger(seconds) ? Math.min(300, Math.max(5, seconds)) : state.questionSeconds;
  event.target.value = state.questionSeconds;
  saveState();
  if (currentQuestion && !answerRevealed) startQuestionTimer();
});

document.querySelector("#roll-die").addEventListener("click", rollDie);
document.querySelector("#next-turn").addEventListener("click", nextTurn);
document.querySelector("#undo-button").addEventListener("click", undo);
document.querySelector("#manual-move").addEventListener("click", () => { manualMove = !manualMove; reachable.clear(); render(); });
document.querySelector("#reset-button").addEventListener("click", () => resetDialog.showModal());
document.querySelector("#confirm-reset").addEventListener("click", resetGame);
document.querySelector("#review-board").addEventListener("click", () => winnerDialog.close());
document.querySelector("#winner-new-game").addEventListener("click", resetGame);
document.querySelector("#reveal-answer").addEventListener("click", revealCorrectAnswer);
document.querySelector("#continue-answer").addEventListener("click", resolveAnswer);
document.querySelector("#retry-question").addEventListener("click", retryQuestion);
document.querySelector("#ask-again").addEventListener("click", () => {
  if (currentCategoryIndex !== null) showQuestion(currentCategoryIndex);
});
document.querySelector("#change-question").addEventListener("click", () => {
  if (currentCategoryIndex !== null) openHubCategoryChoice("Choose a new question category");
});
document.querySelector("#skip-question").addEventListener("click", () => {
  if (questionDialog.open && currentQuestion === null) nextTurn();
});
document.querySelector("#fullscreen-button").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});
document.querySelector("#import-button").addEventListener("click", () => document.querySelector("#question-file").click());
document.querySelector("#question-file").addEventListener("change", event => {
  if (event.target.files[0]) importQuestions(event.target.files[0]);
  event.target.value = "";
});

document.addEventListener("keydown", event => {
  if (event.target.matches("input")) return;
  if (event.code === "Space" && !questionDialog.open) { event.preventDefault(); rollDie(); }
  if (event.key.toLowerCase() === "n" && !questionDialog.open) nextTurn();
  if (event.key.toLowerCase() === "u" && !questionDialog.open) undo();
  if (event.key.toLowerCase() === "a" && questionDialog.open && currentQuestion) revealCorrectAnswer();
  if (event.key.toLowerCase() === "f") document.querySelector("#fullscreen-button").click();
});

buildBoard();
buildCategoryChoice();
render();
