const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
fs.writeFileSync(path.join(root, "questions-data.js"),
  "// Generated from questions.json. Run node scripts/build-question-bank.cjs after editing.\n" +
  "const DEFAULT_QUESTIONS = " + JSON.stringify(questions, null, 2) + ";\n");
console.log(`Bundled ${questions.length} questions for offline use.`);
