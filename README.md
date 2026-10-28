# Intro to Bioengineering Pursuit

An offline classroom game for first-year UC3M students. Open index.html in
Chrome or Edge: no server, account, internet connection, or installation needed.

## Course and teams

Teams start as Alpha, Beta, Gamma, Delta, Epsilon, and Zeta. Names remain editable.
Only the active team's star is shown on the board; the other teams keep their
saved positions until their turns. Questions fill the browser window, with
larger answer choices for projection. Use Full screen to hide browser chrome.
The six categories are:

| ID | Board category |
| --- | --- |
| light | Light & Everyday Physics |
| biooptics | Light Meets Biology |
| microscopy | Lenses & Microscopes |
| images | Pixels & Image Quality |
| bodyimaging | Seeing Inside the Body |
| assays | Detecting Molecules & Sorting Cells |

The bank contains 240 original questions: 40 per category, comprising 24
introductory, 12 application, and 4 challenge questions. It follows the lecture
topics and uses the exam export as guidance on scope rather than copying exam
questions. See docs/question-bank-notes.md for the topic mapping.

## A 60-minute class

Classroom mode is the default. A typical schedule is 5 minutes for rules,
45-50 minutes of play, and 5-10 minutes for explanations and results.

- Press Start clock when the class is ready. Pause for longer explanations.
- Roll and click a highlighted destination.
- A correct answer on any colored space earns that category wedge if missing.
- Each team gets one question per turn, whether correct or incorrect.
- Roll-again spaces still allow another roll before a question.
- At the hub, choose a category before seeing a question.
- Each displayed question starts a 30-second countdown. Change Seconds/question
  in the question header (5-300 seconds); the setting carries into later turns.
- At zero the choices lock, the answer is revealed, and Continue awards no credit.
  Retry same question restarts the timer; a new question starts a fresh timer.
- Six wedges unlock a final challenge on that team's next move, anywhere.
- A correct final answer wins immediately. A wrong answer passes the turn;
  the final can be attempted again on a later move.
- At 60 minutes the clock displays 00:00. It does not interrupt a question.
  Finish the question, then press End class & rank.
- Class results rank teams by wedges, then total correct answers.
  Exact ties share a place, including first place.

Aim for about 20-30 seconds of team discussion, followed by a brief explanation.
Allow roughly 45-60 seconds per complete question turn. This supports around
45-65 question turns in the playing window; the 240-question pool gives headroom.
A natural six-wedge victory cannot be guaranteed within one hour: movement,
accuracy, and discussion vary. End class & rank provides a planned finish.

Classic mode is still available from the Rules selector between turns.
It awards wedges only at category headquarters, retains the turn after a correct
answer, and requires a final correct answer at the hub after collecting six wedges.

## Questions and teacher controls

Each question displays four shuffled answer choices. Click the team's choice
to lock it, highlight the correct answer, and show the explanation. Continue
scores that choice automatically and advances the game. Reveal correct answer
without choosing an option, then Continue, awards no credit.
Retry same question clears the selected answer so the team can answer it again.
New unused question draws a fresh question from the same category, and Change
question opens the category chooser. A question is marked used when it appears,
and cannot reappear anywhere in the same game, even after Undo, refresh, or a
new import. Only an explicit Retry same question shows the same question again.
When a category runs out, choose another unused category or skip
the turn. Reset starts a new game and clears the question history.

Manual movement, manual wedge adjustments, undo, reset, full screen, and
automatic browser saving remain available. Game progress uses a new course-specific
save key so the old generic game's categories cannot contaminate this version.
Correct-answer totals include a successful final challenge.
Rolling the die turns off Move anywhere, so only spaces at the rolled distance
can be selected. A six from the center reaches the six category headquarters.

Keyboard controls: Space = roll, A = reveal, N = next team, U = undo, F = full screen.

## Edit or import a question bank

questions.json is the editable bank. Each entry has this structure:

```json
{
  "id": "light-new-01",
  "category": "light",
  "difficulty": "introductory",
  "question": "Which visible light has the longer wavelength?",
  "options": ["Red", "Blue", "Violet", "They are all equal"],
  "correctOption": 0,
  "explanation": "Red has a longer wavelength than blue or violet."
}
```

correctOption is zero-based: 0 means the first option. Choices are shuffled for
display while preserving the correct answer. Two to six options are supported.
id, difficulty, and explanation are optional when importing. Difficulty is
metadata, not a visible clue or a guarantee about the next question.

Use Import questions to select an edited JSON file. The replacement must cover
all six category IDs and is saved in this browser across refreshes.
Reset clears the game and question history but keeps the imported question bank.
If this browser imported the previous bundled 120-question bank, the game
automatically upgrades it to the 240-question default. Custom imports remain
unchanged.

To make edits the default in a copied folder without importing, run:

```sh
node scripts/build-question-bank.cjs
```

This rebuilds questions-data.js, the offline browser copy of questions.json.
Commit both files to keep the default bank synchronized. Students using the game
do not need Node. The script scripts/create-course-bank.cjs records the original
authored bank; rerunning it replaces questions.json with the full 240-question bank.

## Verification

```sh
node --check game.js
node scripts/check-course.cjs
node scripts/check-browser.cjs
```

The browser check requires Playwright and a browser. Set BROWSER_EXECUTABLE to an
installed Chrome executable if the default Playwright browser is unavailable.
The course check expects the distributed 240-question bank and its difficulty mix.

This project uses original visual styling and includes no official Trivial
Pursuit artwork or logos. Teaching files in docs are reference material, not
browser dependencies.
