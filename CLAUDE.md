# Mini Brain

Local-first, single-page thought-capture app. Type or dictate a passing thought; an offline
keyword-rule engine sorts it into a category; everything persists in the browser's IndexedDB.
No backend, no API keys, no cloud.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — Vitest run (categorization engine unit tests)
- `npm run build` — `tsc --noEmit` typecheck + production build

## Stack

React 18 + TypeScript (strict, no `any`), Vite, Tailwind CSS v4 (dark-only UI), Dexie.js over
IndexedDB, Web Speech API (`webkitSpeechRecognition`) for voice, Vitest for tests. No router —
a single `view` state toggles between three views: **brain** (default), **feed**, and **rules**.

### Brain view (`components/BrainView.tsx`)

One drifting bubble per category, sized by thought count, colored by category. Physics
(gentle drift, wall bounce, soft pairwise repulsion) runs outside React: positions live in a
`Map` ref and are written as `translate3d` transforms each animation frame, so React never
re-renders at 60 fps. Positions are also applied synchronously when bodies are (re)built,
because rAF never fires in hidden tabs. Drift pauses while a panel is open and under
`prefers-reduced-motion`. Click a bubble → panel with that category's thoughts → click a
thought → focused card with Copy / Delete.

## Architecture

```
src/
  types.ts                 Thought data model
  categorization/
    rules.ts               CategoryRule type + seed categories (first-run seed ONLY)
    engine.ts              pure scoring/categorization functions (unit-tested)
    engine.test.ts         Vitest cases
  db/
    db.ts                  Dexie schema (thoughts, rules), seeding, deleteCategory
    backup.ts              JSON export / merge-import with runtime validation
  voice/
    speech.d.ts            Web Speech API type declarations (not in TS DOM lib)
    useVoiceCapture.ts     continuous hands-free dictation hook
  components/
    BrainView                floating category bubbles (default view, see below)
    CaptureBox, CategoryTabs, Feed, ThoughtCard, RulesEditor, Toast
  utils/time.ts            relative timestamps
  App.tsx                  state owner: live queries, shortcuts, toasts, view toggle
```

### Data model

```ts
type Thought = {
  id: string;            // nanoid
  text: string;
  categoryId: string;
  categorySource: 'auto' | 'manual';
  createdAt: number;
  source: 'typed' | 'voice';
};
```

Dexie DB `mini-brain`, v1: `thoughts: 'id, createdAt, categoryId'`, `rules: 'id'`.

### Categorization scoring algorithm (`categorization/engine.ts`)

1. Lowercase the thought text.
2. For every category, test each keyword:
   - single word → word-boundary regex (`\bmodel\b`; "modeling" does NOT match),
   - multi-word phrase → plain substring (`"print on demand"`).
3. A matched keyword adds its weight (1–3) once, regardless of repetitions. Sum per category.
4. Highest total wins. If the top score is **below the threshold (default 2)** or **tied**
   between categories, the thought goes to **Inbox** (`INBOX_ID = 'inbox'`).

Manual reassignment sets `categorySource: 'manual'`; editing a thought re-runs the engine only
when the category is still `'auto'` (manual picks are sticky).

### Rules persistence

`rules.ts` seeds IndexedDB **on first run only** (`seedRulesIfEmpty`, transactional so React
StrictMode can't double-seed). After that the `rules` table is the source of truth, edited via
the ⚙ Rules panel (add/remove categories & keywords, cycle weights, colors). Inbox cannot be
deleted; deleting a category moves its thoughts to Inbox.

### Voice capture (`voice/useVoiceCapture.ts`)

- `webkitSpeechRecognition`, `lang: en-IN`, continuous + interim results.
- Interim text renders greyed inside the capture box; finalized text renders normal.
- ~2.5 s of silence flushes the buffered transcript as one thought and keeps listening,
  so multiple thoughts can be dumped in one session.
- Chrome kills continuous recognition after silence → `onend` auto-restarts (250 ms delay)
  while the user still intends to listen (`activeRef`).
- Unsupported browsers get a visible message and a disabled mic button.

### Keyboard

Ctrl+Enter save (capture + card edit), Ctrl+K refocus capture from anywhere, Ctrl+M toggle
voice, Esc cancels a card edit.

### Export / import (`db/backup.ts`)

Export downloads `{ version, exportedAt, thoughts, rules }` as JSON. Import validates every
record with type guards and merges: **existing ids always win**, nothing is overwritten.

## Build phases (all complete)

1. Scaffold + data model + categorization engine with tests ✅
2. Capture box, feed, category filter tabs, search (typed input) ✅
3. Voice mode ✅
4. Rules editor + export/import ✅

## Conventions

- TypeScript strict; no `any` (use `unknown` + type guards, see `backup.ts`).
- Engine stays pure (no DB/DOM imports) so it's trivially unit-testable.
- Components stay small; App.tsx owns cross-cutting state.
