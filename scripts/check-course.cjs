const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const bank = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
assert.equal(bank.length, 120);
assert.equal(new Set(bank.map(q => q.id)).size, 120);
assert.equal(new Set(bank.map(q => q.question.toLowerCase())).size, 120);
for (const category of ["light", "biooptics", "microscopy", "images", "bodyimaging", "assays"]) {
  const subset = bank.filter(q => q.category === category);
  assert.equal(subset.length, 20);
  for (const [difficulty, count] of [["introductory", 12], ["application", 6], ["challenge", 2]]) {
    assert.equal(subset.filter(q => q.difficulty === difficulty).length, count);
  }
  for (const q of subset) {
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.every(option => typeof option === "string" && option.trim()));
    assert.ok(Number.isInteger(q.correctOption) && q.correctOption >= 0 && q.correctOption < 4);
    assert.ok(q.explanation && q.question);
  }
}
const bundled = vm.runInNewContext(fs.readFileSync(path.join(root, "questions-data.js"), "utf8") + "\nJSON.stringify(DEFAULT_QUESTIONS)");
assert.deepEqual(JSON.parse(bundled), bank);
console.log("120 unique questions validated; all categories, difficulty counts, choices, and offline bundle match.");
