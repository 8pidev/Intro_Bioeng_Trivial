const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, "../index.html")).href);
    await page.evaluate(() => { resetGame(); });
    assert.deepEqual(await page.locator(".team-name").evaluateAll(nodes => nodes.map(n => n.value)), ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"]);
    assert.equal(await page.evaluate(() => questions.length), 120);

    // Hub does not draw a question until a category is chosen.
    await page.locator("#manual-move").click();
    await page.locator('[data-node="hub"]').click();
    assert.equal(await page.locator(".answer-choice").count(), 0);
    assert.equal(await page.locator("#question-text").isVisible(), false);
    assert.equal(await page.locator("#correct-answer").isDisabled(), true);
    await page.locator("#category-choice").getByRole("button", { name: "Light Meets Biology", exact: true }).click();
    assert.equal(await page.locator("#category-choice").isVisible(), false);
    assert.equal(await page.locator(".answer-choice").count(), 4);
    const firstQuestion = await page.locator("#question-text").textContent();
    const correct = await page.evaluate(() => currentQuestion.correctOption);
    await page.locator(".answer-choice").nth(correct).click();
    assert.equal(await page.locator(".answer-choice:disabled").count(), 4);
    assert.equal(await page.locator(".answer-choice.correct").count(), 1);
    assert.equal(await page.locator("#question-text").textContent(), firstQuestion);
    await page.locator("#correct-answer").click();
    assert.equal(await page.evaluate(() => state.activeTeam), 1);
    assert.deepEqual(await page.evaluate(() => state.teams[0].wedges), ["biooptics"]);

    // Every question is spent on display; exhaustion never recycles one.
    assert.deepEqual(await page.evaluate(() => {
      const draws = Array.from({ length: 20 }, () => questionFor("assays").id);
      return [new Set(draws).size, questionFor("assays"), hasAvailableQuestion("assays")];
    }), [20, null, false]);
    await page.reload();
    assert.equal(await page.evaluate(() => questionFor("assays")), null);
    assert.equal(await page.evaluate(() => state.seenQuestionKeys.length), 21);
    await page.locator("#question-file").setInputFiles(path.resolve(__dirname, "../questions.json"));
    await page.reload();
    assert.equal(await page.evaluate(() => questionFor("assays")), null);

    // Re-importing or placing the same wording in another category cannot repeat it.
    assert.equal(await page.evaluate(() => {
      const original = questions;
      questions = [{ ...original.find(q => q.category === "biooptics" &&
        questionKey(q) === state.seenQuestionKeys[0]), category: "light" }];
      const repeated = questionFor("light");
      questions = original;
      return repeated;
    }), null);

    // A replacement stays in the chosen category and resets answer locking.
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.locator("#change-question").click();
    assert.equal(await page.evaluate(() => currentQuestion.category), "biooptics");
    assert.equal(await page.evaluate(() => selectedOption), null);
    const replacementKey = await page.evaluate(() => questionKey(currentQuestion));
    const wrong = await page.evaluate(() => (currentQuestion.correctOption + 1) % 4);
    await page.locator(".answer-choice").nth(wrong).click();
    assert.equal(await page.locator(".answer-choice.incorrect").count(), 1);
    await page.locator("#incorrect-answer").click();
    assert.equal(await page.evaluate(() => state.activeTeam), 2);
    assert.equal(await page.evaluate(() => state.teams[1].correctAnswers), 0);
    await page.locator("#undo-button").click();
    assert.equal(await page.evaluate(key => state.seenQuestionKeys.includes(key), replacementKey), true);
    await page.locator("#next-turn").click();

    // Landing in an exhausted category offers an unused category or a skip.
    await page.evaluate(() => {
      state.seenQuestionKeys = [...new Set([...state.seenQuestionKeys,
        ...questions.filter(q => q.category === "biooptics").map(questionKey)])];
      render();
    });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    assert.equal(await page.locator("#question-text").isVisible(), false);
    assert.equal(await page.locator("#category-choice-buttons").getByRole("button", { name: "Light Meets Biology" }).isDisabled(), true);
    await page.locator("#skip-question").click();
    assert.equal(await page.evaluate(() => state.activeTeam), 3);

    // Six wedges unlock the classroom final on any subsequent move.
    await page.evaluate(() => { state.activeTeam = 0; state.teams[0].wedges = CATEGORIES.map(c => c.id); render(); });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r2"]').click();
    assert.equal(await page.locator("#question-category").textContent(), "Choose the final category");
    await page.locator("#category-choice").getByRole("button", { name: "Pixels & Image Quality", exact: true }).click();
    await page.locator("#reveal-answer").click();
    await page.locator("#correct-answer").click();
    assert.equal(await page.locator("#winner-name").textContent(), "Alpha wins!");
    await page.reload();
    assert.equal(await page.locator("#winner-dialog").isVisible(), true);

    // Timed class results respect wedges, correct answers, and exact ties.
    await page.evaluate(() => {
      resetGame();
      state.teams[1].wedges = ["light", "images"];
      state.teams[1].correctAnswers = 4;
      state.teams[2].wedges = ["light", "images"];
      state.teams[2].correctAnswers = 5;
      state.teams[3].wedges = ["biooptics", "assays"];
      state.teams[3].correctAnswers = 5;
      finishClass();
    });
    assert.equal(await page.locator("#winner-name").textContent(), "Gamma & Delta share first place!");
    assert.deepEqual(await page.locator(".standing-place").evaluateAll(nodes => nodes.slice(0, 3).map(n => n.textContent)), ["1", "1", "3"]);

    // Classic mode still requires headquarters for normal wedge awards.
    await page.evaluate(() => { resetGame(); state.mode = "classic"; render(); });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.locator("#reveal-answer").click();
    await page.locator("#correct-answer").click();
    assert.equal(await page.evaluate(() => state.teams[0].wedges.length), 0);
    assert.equal(await page.evaluate(() => state.activeTeam), 0);
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r0"]').click();
    await page.locator("#reveal-answer").click();
    await page.locator("#correct-answer").click();
    assert.deepEqual(await page.evaluate(() => state.teams[0].wedges), ["light"]);

    // Clock survives reload and imported questions remain available offline.
    await page.evaluate(() => { resetGame(); });
    await page.locator("#clock-toggle").click();
    await page.reload();
    assert.equal(await page.locator("#clock-toggle").textContent(), "Pause clock");
    await page.locator("#clock-toggle").click();
    await page.locator("#question-file").setInputFiles(path.resolve(__dirname, "../questions.json"));
    await page.reload();
    assert.equal(await page.evaluate(() => questions.length), 120);
    await page.evaluate(() => resetGame());
    assert.equal(await page.evaluate(() => {
      const panel = document.querySelector(".teams-card").getBoundingClientRect();
      return [...document.querySelectorAll(".team-row")].every(row => row.getBoundingClientRect().bottom <= panel.bottom);
    }), true, "All six teams must fit on a 1280 x 720 projector");
    await page.screenshot({ path: "/tmp/intro-bioeng-board.png" });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.screenshot({ path: "/tmp/intro-bioeng-question.png" });
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: no repeats after exhaustion, import, refresh, or Undo; category fallback, scoring, finals, clock; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
