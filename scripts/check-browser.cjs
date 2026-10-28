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
    assert.equal(await page.locator(".board .token").count(), 1);
    assert.equal(await page.locator(".board .token").getAttribute("title"), "Alpha");
    assert.equal(await page.evaluate(() => {
      const star = document.querySelector(".board .token").getBoundingClientRect();
      const label = document.querySelector(".board-center-label").getBoundingClientRect();
      return star.top >= label.bottom;
    }), true, "The active hub star must remain visible below the center label");
    // The first six rolled by Alpha from the hub must not expose ring neighbors.
    for (const reload of [false, true]) {
      if (reload) await page.reload();
      await page.evaluate(() => {
        const originalRandom = Math.random;
        Math.random = () => 0.999;
        rollDie();
        Math.random = originalRandom;
      });
      assert.equal(await page.evaluate(() => state.activeTeam), 0);
      assert.equal(await page.evaluate(() => state.rolled), 6);
      assert.deepEqual(await page.evaluate(() => [...reachable].sort()),
        ["r0", "r7", "r14", "r21", "r28", "r35"].sort());
      assert.equal(await page.locator(".space.reachable").count(), 6);
      await page.evaluate(() => resetGame());
    }
    assert.equal(await page.evaluate(() => questions.length), 240);
    // The exact previous bundled bank upgrades without overriding custom banks.
    await page.evaluate(() => {
      localStorage.setItem(BANK_KEY, JSON.stringify(DEFAULT_QUESTIONS.filter(q => Number(q.id.split("-").at(-1)) <= 20)));
    });
    await page.reload();
    assert.equal(await page.evaluate(() => questions.length), 240);
    assert.equal(await page.evaluate(() => localStorage.getItem(BANK_KEY)), null);
    await page.evaluate(() => {
      const custom = DEFAULT_QUESTIONS.map(q => ({ ...q }));
      custom[0].question = "A custom introductory question?";
      localStorage.setItem(BANK_KEY, JSON.stringify(custom));
    });
    await page.reload();
    assert.equal(await page.evaluate(() => questions[0].question), "A custom introductory question?");
    await page.evaluate(() => localStorage.removeItem(BANK_KEY));
    await page.reload();

    // Hub does not draw a question until a category is chosen.
    await page.locator("#manual-move").click();
    await page.locator('[data-node="hub"]').click();
    assert.equal(await page.locator(".answer-choice").count(), 0);
    assert.equal(await page.locator("#question-text").isVisible(), false);
    assert.equal(await page.locator("#continue-answer").isDisabled(), true);
    await page.locator("#category-choice").getByRole("button", { name: "Light Meets Biology", exact: true }).click();
    assert.equal(await page.locator("#category-choice").isVisible(), false);
    assert.equal(await page.locator(".answer-choice").count(), 4);
    assert.deepEqual(await page.locator("#question-dialog").evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      return [rect.width, rect.height];
    }), [1280, 720]);
    assert.ok(await page.locator(".answer-choice").first().evaluate(choice => parseFloat(getComputedStyle(choice).fontSize)) >= 24);
    assert.match(await page.locator("#question-timer").textContent(), /^00:(29|30)$/);
    await page.locator("#question-seconds").fill("45");
    await page.locator("#question-seconds").dispatchEvent("change");
    assert.match(await page.locator("#question-timer").textContent(), /^00:(44|45)$/);
    await page.locator("#question-seconds").fill("30");
    await page.locator("#question-seconds").dispatchEvent("change");
    const firstQuestion = await page.locator("#question-text").textContent();
    const correct = await page.evaluate(() => currentQuestion.correctOption);
    await page.locator(".answer-choice").nth(correct).click();
    assert.equal(await page.locator(".answer-choice:disabled").count(), 4);
    assert.equal(await page.locator(".answer-choice.correct").count(), 1);
    assert.equal(await page.locator("#question-text").textContent(), firstQuestion);
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(() => state.activeTeam), 1);
    assert.deepEqual(await page.evaluate(() => state.teams[0].wedges), ["biooptics"]);
    assert.equal(await page.locator(".board .token").count(), 1);
    assert.equal(await page.locator(".board .token").getAttribute("title"), "Beta");

    // Every question is spent on display; exhaustion never recycles one.
    assert.deepEqual(await page.evaluate(() => {
      const draws = Array.from({ length: 40 }, () => questionFor("assays").id);
      return [new Set(draws).size, questionFor("assays"), hasAvailableQuestion("assays")];
    }), [40, null, false]);
    await page.reload();
    assert.equal(await page.evaluate(() => questionFor("assays")), null);
    assert.equal(await page.evaluate(() => state.seenQuestionKeys.length), 41);
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

    // A new question stays in the category, while an explicit retry reuses only the displayed question.
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    const originalKey = await page.evaluate(() => questionKey(currentQuestion));
    await page.locator("#ask-again").click();
    assert.equal(await page.evaluate(() => currentQuestion.category), "biooptics");
    assert.equal(await page.evaluate(() => selectedOption), null);
    const replacementKey = await page.evaluate(() => questionKey(currentQuestion));
    assert.notEqual(replacementKey, originalKey);
    const wrong = await page.evaluate(() => (currentQuestion.correctOption + 1) % 4);
    await page.locator(".answer-choice").nth(wrong).click();
    assert.equal(await page.locator(".answer-choice.incorrect").count(), 1);
    await page.locator("#retry-question").click();
    assert.equal(await page.evaluate(() => questionKey(currentQuestion)), replacementKey);
    assert.equal(await page.evaluate(() => selectedOption), null);
    assert.equal(await page.locator(".answer-choice:disabled").count(), 0);
    assert.equal(await page.locator("#continue-answer").isDisabled(), true);
    await page.locator(".answer-choice").nth(wrong).click();
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(() => state.activeTeam), 2);
    assert.equal(await page.evaluate(() => state.teams[1].correctAnswers), 0);
    await page.locator("#undo-button").click();
    assert.equal(await page.evaluate(key => state.seenQuestionKeys.includes(key), replacementKey), true);
    await page.locator("#next-turn").click();

    // Change question opens the category chooser; revealing without a team choice earns no credit.
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.locator("#change-question").click();
    assert.equal(await page.locator("#question-text").isVisible(), false);
    await page.locator("#category-choice").getByRole("button", { name: "Light & Everyday Physics", exact: true }).click();
    assert.equal(await page.evaluate(() => currentQuestion.category), "light");
    const teamBeforeReveal = await page.evaluate(() => state.activeTeam);
    await page.locator("#reveal-answer").click();
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(index => state.teams[index].correctAnswers, teamBeforeReveal), 0);
    assert.equal(await page.evaluate(() => state.activeTeam), (teamBeforeReveal + 1) % 6);

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
    assert.equal(await page.evaluate(() => state.activeTeam), 4);

    // Six wedges unlock the classroom final on any subsequent move.
    await page.evaluate(() => { state.activeTeam = 0; state.teams[0].wedges = CATEGORIES.map(c => c.id); render(); });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r2"]').click();
    assert.equal(await page.locator("#question-category").textContent(), "Choose the final category");
    await page.locator("#category-choice").getByRole("button", { name: "Pixels & Image Quality", exact: true }).click();
    await page.locator(".answer-choice").nth(await page.evaluate(() => currentQuestion.correctOption)).click();
    await page.locator("#continue-answer").click();
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
    await page.locator(".answer-choice").nth(await page.evaluate(() => currentQuestion.correctOption)).click();
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(() => state.teams[0].wedges.length), 0);
    assert.equal(await page.evaluate(() => state.activeTeam), 0);
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r0"]').click();
    await page.locator(".answer-choice").nth(await page.evaluate(() => currentQuestion.correctOption)).click();
    await page.locator("#continue-answer").click();
    assert.deepEqual(await page.evaluate(() => state.teams[0].wedges), ["light"]);

    // Timeout blocks credit, and an explicit retry restarts the same question's clock.
    await page.evaluate(() => resetGame());
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.evaluate(() => { questionDeadline = Date.now() - 1; updateQuestionTimer(); });
    assert.equal(await page.locator("#question-timer").textContent(), "00:00");
    assert.equal(await page.locator("#question-timer-status").isVisible(), true);
    assert.equal(await page.locator(".answer-choice:disabled").count(), 4);
    await page.locator("#retry-question").click();
    assert.match(await page.locator("#question-timer").textContent(), /^00:(29|30)$/);
    assert.equal(await page.locator(".answer-choice:disabled").count(), 0);
    await page.locator(".answer-choice").nth(await page.evaluate(() => currentQuestion.correctOption)).click();
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(() => state.teams[0].correctAnswers), 1);
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.evaluate(() => { questionDeadline = Date.now() - 1; updateQuestionTimer(); });
    await page.locator("#continue-answer").click();
    assert.equal(await page.evaluate(() => state.teams[1].correctAnswers), 0);

    // Clock survives reload and imported questions remain available offline.
    await page.evaluate(() => { resetGame(); });
    await page.locator("#clock-toggle").click();
    await page.reload();
    assert.equal(await page.locator("#clock-toggle").textContent(), "Pause clock");
    await page.locator("#clock-toggle").click();
    await page.locator("#question-file").setInputFiles(path.resolve(__dirname, "../questions.json"));
    await page.reload();
    assert.equal(await page.evaluate(() => questions.length), 240);
    await page.evaluate(() => resetGame());
    // Six from the center reaches only the six headquarters, even after manual movement.
    await page.evaluate(() => {
      manualMove = true;
      const originalRandom = Math.random;
      Math.random = () => 0.999;
      rollDie();
      Math.random = originalRandom;
    });
    assert.equal(await page.evaluate(() => state.rolled), 6);
    assert.equal(await page.evaluate(() => manualMove), false);
    assert.deepEqual(await page.evaluate(() => [...reachable].sort()),
      ["r0", "r7", "r14", "r21", "r28", "r35"].sort());
    assert.equal(await page.locator(".space.manual-target").count(), 0);
    assert.equal(await page.locator(".space.reachable").count(), 6);
    await page.evaluate(() => selectDestination("r1"));
    assert.equal(await page.evaluate(() => state.phase), "move");
    assert.equal(await page.evaluate(() => state.teams[0].position), "hub");
    await page.evaluate(() => resetGame());
    assert.equal(await page.evaluate(() => {
      const panel = document.querySelector(".teams-card").getBoundingClientRect();
      return [...document.querySelectorAll(".team-row")].every(row => row.getBoundingClientRect().bottom <= panel.bottom);
    }), true, "All six teams must fit on a 1280 x 720 projector");
    assert.equal(await page.locator(".legend-corner").count(), 2);
    assert.deepEqual(await page.locator(".legend-corner").evaluateAll(nodes => nodes.map(node => node.children.length)), [3, 3]);
    assert.deepEqual(await page.locator(".legend-item").allTextContents(),
      await page.evaluate(() => CATEGORIES.map(category => category.name)));
    const legendClearsSpaces = () => page.evaluate(() => {
      const corners = [...document.querySelectorAll(".legend-corner")].map(item => item.getBoundingClientRect());
      const spaces = [...document.querySelectorAll(".space")].map(item => item.getBoundingClientRect());
      return corners.every(corner => spaces.every(space =>
        corner.right <= space.left || corner.left >= space.right ||
        corner.bottom <= space.top || corner.top >= space.bottom));
    });
    assert.equal(await legendClearsSpaces(), true, "Corner labels must not cover board spaces at 1280 x 720");
    await page.setViewportSize({ width: 1080, height: 720 });
    assert.equal(await legendClearsSpaces(), true, "Corner labels must not cover board spaces at 1080 x 720");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: "/tmp/intro-bioeng-board.png" });
    await page.locator("#manual-move").click();
    await page.locator('[data-node="r1"]').click();
    await page.screenshot({ path: "/tmp/intro-bioeng-question.png" });
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: center-six movement, automatic scoring, adjustable question timer and timeout, no repeats after retry, exhaustion, import, refresh, or Undo; category fallback, finals, class clock; no page errors.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
