# Contributing to Mini Brain

Thanks for taking a look — contributions are genuinely welcome, whether that's a
bug report, an idea, or a pull request. Mini Brain is a small, dependency-light
codebase, so it's a friendly place to make your first open-source contribution.

## Ground rules

- **Everything is local-first and offline by default.** The core app must never
  require a backend, an account, or an API key. Features that reach the network
  (AI replies, the phone bridge) are always opt-in and clearly labelled.
- **TypeScript strict, no `any`.** Use `unknown` + type guards where needed.
- **Keep the pure logic pure.** The categorization engine, the assistant, the
  graph builder, and the voice picker have no DOM/DB imports so they stay
  unit-testable. New logic there should come with a Vitest test.

## Getting set up

Prerequisites: [Node.js](https://nodejs.org) 18+ and Chrome or Edge (the voice
features use the Web Speech API).

```bash
git clone https://github.com/ivats2911/mini-brain.git
cd mini-brain
npm install
npm run dev      # http://localhost:5173
```

Useful scripts:

```bash
npm test         # run the unit tests (Vitest)
npm run build    # typecheck (strict) + production build
```

## Making a change

1. Fork the repo and create a branch: `git checkout -b my-change`.
2. Make your change. If you touched pure logic, add or update a test.
3. Run `npm test` and `npm run build` — both must pass.
4. Open a pull request describing **what** changed and **why**. Screenshots are
   very welcome for UI changes.

## Where things live

```
src/categorization/   keyword scoring engine (+ tests)
src/assistant/        offline reply persona + optional LLM (+ tests)
src/graph/            thought-graph builder for the Map (+ tests)
src/voice/            speech recognition, synthesis, voice picking (+ tests)
src/components/        UI — CaptureCard, BrainView, MapView, Feed, RulesEditor …
src/db/               Dexie schema + JSON export/import
server/capture.mjs    dependency-free phone-capture bridge
```

`CLAUDE.md` at the repo root has a deeper architecture tour.

## Good first issues

Look for issues labelled [`good first issue`](https://github.com/ivats2911/mini-brain/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
They're scoped to be small, isolated, and low-risk — a great way in. Feel free
to comment on one to claim it before you start.

## Questions

Not sure about something? Open an issue and ask — no question is too small.
