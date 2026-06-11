# Bioengineering Trivia

An offline, projector-friendly classroom board game for UC3M bioengineering
courses. Six student groups move around a six-category board, answer questions,
and collect category wedges.

## Planned first milestone

- Six-group turn management
- Digital die and board movement
- Six question categories loaded from JSON
- Question and answer presentation mode
- Category-wedge tracking
- Undo, reset, and automatic browser saving
- Full-screen, 16:9 projector layout

## Run locally

Open `index.html` in a modern browser. The initial scaffold has no build step or
external dependencies.

## Project structure

```text
index.html          Page structure
styles.css          Projector-friendly presentation styles
game.js             Game state and interaction logic
questions.json      Editable question bank
docs/game-rules.md  Classroom rules and design decisions
```

## Question format

Questions are stored in `questions.json`:

```json
{
  "category": "Transport Phenomena",
  "question": "What does Fick's first law describe?",
  "answer": "Diffusive flux caused by a concentration gradient.",
  "difficulty": 1
}
```

This project uses original visual styling and does not include official Trivial
Pursuit artwork, logos, or question content.
