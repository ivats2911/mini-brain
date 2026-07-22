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
a single `view` state toggles between four views: **brain** (default), **map**, **feed**, and **rules**.

### Map view (`components/MapView.tsx` + `graph/buildGraph.ts`)

Every individual thought is a glowing synaptic node in a force graph (`force-graph` npm
package, bundled — no CDN, offline preserved). `buildGraph` (pure, unit-tested) assigns each
node a **numeric id equal to its index in the nodes array** (downstream features rely on index
lookup), a 6-word label, `born` order for recency sizing/brightness, and extracts `#tags`.
Links, in dedupe priority: `[[wikilink]]` refs → shared `#tags` (chained) → same-category
chains → shared significant words (≥5 chars, non-stopword, max 3 word-links per node).
Rendering: custom canvas draw with additive `lighter` blending for bloom, recency-based
size/alpha, labels above zoom 1.4× or when highlighted. Simulation never settles
(`d3AlphaDecay(0)` + a custom wander force). Hover lights the neighborhood; click flies the
camera (`centerAt` + `zoom`), dims non-neighbors (depth of field), and opens a right-side
panel (text, tags, copy/delete). Node positions persist across data rebuilds by reusing node
objects keyed by thought id. Capped at the 200 most recent thoughts.

### Brain view (`components/BrainView.tsx`)

**Fullscreen**: the field is `fixed inset-0` behind everything; in brain view App renders the
header + capture box as a floating `pointer-events-none` column (`pointer-events-auto` on the
interactive children) so clicks pass through to bubbles. The field jumps to `z-20` while a
panel is open so the backdrop dims the whole screen. The fly-in projectile launches from the
real capture box position via `originRef`.

**Whispers**: each non-empty bubble shows one recent thought as a faint italic snippet below
the orb, rotating through the 8 most recent on an 8s cycle (per-bubble phase offset so they
don't switch in sync; driven by a 1s `nowSec` state tick, re-keyed for the fade-in). Hidden
while a panel is open.

One drifting bubble per category, sized by thought count, colored by category. Physics
(organic wandering heading, wall bounce, soft pairwise repulsion) runs outside React: positions
live in a `Map` ref and are written as `translate3d` transforms each animation frame, so React
never re-renders at 60 fps. Positions are also applied synchronously when bodies are (re)built,
because rAF never fires in hidden tabs. Drift pauses while a panel is open and under
`prefers-reduced-motion`. Click a bubble → panel with that category's thoughts → click a
thought → focused card with Copy / Delete. Esc closes the panel.

**Design language** (neural/synaptic, not generic dark mode): deep near-black radial backdrop
(`#12121c → #0a0a0f`) with a slow drifting ambient glow (`body::before`) and a ~4% film-grain
overlay (`body::after`, SVG feTurbulence data-URI). Typography is Inter Variable, bundled
locally via `@fontsource-variable/inter` (imported in main.tsx — no CDN, app stays offline).
Surfaces are glass: `bg-white/[0.03..0.05]` + `border-white/10` + `backdrop-blur`. Orbs are
frosted (backdrop-blur over the canvas), with an inner top-left light, colored rim-glow, and
**recency-based brightness/size** — categories touched within the hour glow full, fading over
a week (`freshnessOf`). Bubbles repel the cursor (pointer tracked in a ref, force applied in
the physics tick with speed clamping) and tilt toward it on hover (perspective rotate on a
dedicated `[data-tilt]` layer). Opening a bubble applies depth-of-field: other orbs
scale/blur/dim and the canvas dims, while the panel springs in over a glass backdrop.

**Animation system** (no dependencies — deliberate: a custom rAF loop owns every bubble
transform, so Framer Motion would fight it; springs come from WAAPI + custom cubic-beziers):

- A `<canvas>` layer under the bubbles, drawn in the same rAF tick: synapse lines between
  nearby bubbles (gradient-tinted by both categories), ~36 twinkling dust particles, fly-in
  projectiles, and expanding ripple rings.
- On save, App passes `lastSaved` to BrainView; a glowing dot arcs (quadratic bezier, eased)
  from the capture box into the target bubble, which ripples and spring-pulses (WAAPI on the
  scaler span — CSS transforms on the wrapper are owned by the physics loop, so never animate
  the wrapper).
- CSS keyframes in `index.css`: `bubble-pop` (staggered spring entrance), `orb-breathe`,
  `halo-pulse` (blurred glow behind each orb), `panel-in`/`backdrop-in`/`item-in` (staggered
  list), `toast-in`. All use `fill-mode: backwards` — NOT `both`/`forwards`, which would pin
  the transform and block hover transitions and WAAPI pulses. All disabled under
  `prefers-reduced-motion` via a media query.
- Bubble DOM layering: wrapper button (physics transform) → scaler span (pop-in, hover scale,
  WAAPI pulse) → halo span + orb span (infinite breathe). Each layer owns its own transform.

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
  assistant/
    assistant.ts           offline rule-based reply engine (intent + advice, unit-tested)
    llm.ts                 opt-in LLM replies (OpenAI/Anthropic via browser fetch, unit-tested prompts)
  voice/
    speech.d.ts            Web Speech API type declarations (not in TS DOM lib)
    useVoiceCapture.ts     continuous hands-free dictation hook (pause/resume for echo guard)
    useSpeaker.ts          speechSynthesis TTS: en-GB voice, gesture unlock, mute pref
  components/
    BrainView                floating category bubbles (default view, see below)
    CaptureBox, CategoryTabs, Feed, ThoughtCard, RulesEditor, Toast
  utils/time.ts            relative timestamps
server/capture.mjs         capture bridge (Telegram bot + generic POST /capture; no deps)
docs/phone-capture.md      Telegram + OpenClaw setup for phone capture
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
   - single word → word-boundary regex with simple plurals (`\bmodel(?:s|es)?\b`;
     "models" matches, "modeling" does NOT),
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
deleted; deleting a category moves its thoughts to Inbox. Because existing installs never
re-seed, seed improvements reach live DBs via the "⟳ Merge seed keywords" button in Rules
(`mergeSeedKeywords`: adds missing seed terms, never removes or re-weights user edits).
The assistant explains every Inbox outcome (tie / under threshold / no match, naming the
closest category) so rule tuning is never guesswork.

### Voice assistant (`assistant/assistant.ts`, `voice/useSpeaker.ts`, `components/AssistantBar.tsx`)

Every captured thought (typed or dictated) gets a short actionable reply, shown in the
AssistantBar under the capture box and spoken aloud via `speechSynthesis` — **offline and
rule-based, no LLM/network**.

**AI mode (opt-in)** (`assistant/llm.ts`): the ⚙ Rules panel has an "AI voice replies" section —
provider (OpenAI default `gpt-4o-mini`, or Anthropic default `claude-opus-4-8`), model id, and
API key (localStorage only, never leaves the browser except to the provider). When enabled with
a key, each captured thought + up to 15 recent thoughts (category-labelled, truncated) goes to
the provider with the persona as system prompt; the reply is spoken by the same browser voice.
This is the ONE feature that breaks the app's offline/no-cloud rule, deliberately opt-in.
Anthropic calls are raw fetch with the `anthropic-dangerous-direct-browser-access: true` header
(required for browser CORS); no sampling params (removed on Opus 4.8). Any failure or missing
key falls back to the offline rule-based reply with a diagnosed "(AI failed: …)" note — errors
are mapped to human causes (401 invalid key, 429 no credit, 404 bad model, abort → timeout,
TypeError → network). A "⚡ Test key" button in the panel fires one tiny round-trip and shows
the diagnosis inline. **On the dev server, calls go through a same-origin Vite proxy**
(`/ai-proxy/*` in vite.config.ts) because a cross-origin `authorization` header is blocked in
some environments (observed: embedded preview browsers; also some corporate proxies);
production builds call the providers directly. 20s timeout via AbortController.

**Onboarding & daily welcome** (`src/profile.ts`, `components/Onboarding.tsx`): first run shows a
modal asking what to call the user (name stored in localStorage, sanitized, editable in ⚙ Rules
via the NameCard). `shouldWelcomeToday`/`markWelcomedToday` track a per-local-day stamp so the
first visit each calendar day gets a warm `dailyWelcome(name, count, firstEver)` line; later
visits the same day get the dry `bootGreeting`. The name drives the persona (`buildSystemPrompt`)
and greetings — no longer hardcoded.

**Voice hero** (`components/VoicePanel.tsx`): the mic moved out of the CaptureBox footer into a
prominent standalone panel above the (now typing-only) capture box — big tappable mic orb with
radiating rings while listening, personalized invite copy, status chip (listening/thinking/
speaking), live transcript, and the assistant reply shown inline as a conversation. Replaces the
old AssistantBar (still exports the `AssistantStatus` type). Accessible: aria-pressed mic,
aria-live regions, focus-visible ring, reduced-motion honored.

**Persona**: the assistant speaks as the brain itself — a dry, deadpan, technically-literate
version of the user (Sahil). Short sentences, zero filler openers, ribbing not gushing. All
wit is templated in `assistant.ts`, so edits to tone happen there and must keep lines short
(they're spoken). A `bootGreeting(count, name?, rand?)` fires once on load with the real
thought count (text-only — audio is gesture-gated); `rand` is injectable for deterministic
tests. The name appears in some greeting variants only, per the "occasionally, not every
line" rule. `composeReply` = category line + count, intent-matched advice
(`detectIntent`: idea → question → task → note, in that order — "what if" is an idea before
the question heuristic fires), and a quote from the most recent earlier thought sharing a
significant word (≥5 chars). Inbox saves get a "teach me in Rules" message instead of advice.
`useSpeaker` defaults to the most natural **female** English voice the browser exposes and lets
the user pick another. Voice selection is a pure, unit-tested scorer (`voice/pickVoice.ts`):
English-only, female name fragments +6 (checked before the male list so "male" inside "female"
never counts against it), network/non-local +4, natural-engine names (google/natural/neural/…)
+3, en-GB +2. So on real Chrome it auto-selects "Google UK English Female"; on a bare Windows
box it picks "Microsoft Zira" over David/Mark. The VoicePanel shows a voice `<select>` (best-first)
+ a "▶ Hear" preview; the choice persists in localStorage (`mini-brain:voice`). Rate 0.97 /
pitch 1.06 for a warmer, less clipped cadence. Primes audio with a silent utterance on the first
pointer/key gesture (browser autoplay gate); 🔊/🔇 preference persists too. Status line shows ● listening / thinking / speaking (thinking is a
600 ms staged delay — replies are actually instant). The AssistantBar's 💬 talk / ⚡ brief
toggle (persisted, default chatty) decides how much of the reply is *spoken* after a dictated
thought: chatty talks the full reply through (filing + advice + connection + question); brief
speaks only the filing line so rapid brain-dumps aren't interrupted. Typed thoughts always
get the full reply spoken. The bar always shows the full text either way. **Echo guard**: while the app speaks,
`useVoiceCapture.pause()` aborts recognition and drops the buffer so the mic never transcribes
the app's own voice; `resume()` restarts it when speech ends.

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

### Phone capture bridge (`server/capture.mjs`, `npm run bridge`)

Thoughts can arrive from outside the browser: a dependency-free Node server on
`127.0.0.1:4820` queues them to `server/inbox.json` (`POST /capture` / `GET /pending` /
`POST /ack`). Optional Telegram bot via long polling (`TELEGRAM_BOT_TOKEN`, lock with
`TELEGRAM_CHAT_ID`); OpenClaw or anything else can POST to the same endpoint (docs in
`docs/phone-capture.md`). The app polls `/ingest/pending` (Vite proxy → 4820) every 15 s and
on focus, categorizes, imports with dedupe by bridge id, `source: 'remote'` (📨 badge), and
toasts arrivals. Bridge offline = silent no-op. `ThoughtSource` is `typed | voice | remote`.

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
