import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { db, seedRulesIfEmpty } from './db/db';
import { exportAll, importBackup } from './db/backup';
import { categorize } from './categorization/engine';
import { INBOX_ID } from './categorization/rules';
import type { Thought } from './types';
import { useVoiceCapture } from './voice/useVoiceCapture';
import { useSpeaker } from './voice/useSpeaker';
import { bootGreeting, composeReply, dailyWelcome } from './assistant/assistant';
import { buildSystemPrompt, buildUserPrompt, describeError, generateReply, loadAISettings } from './assistant/llm';
import { hasName, loadName, markWelcomedToday, saveName, shouldWelcomeToday } from './profile';
import { type AssistantStatus } from './components/AssistantBar';
import { VoicePanel } from './components/VoicePanel';
import { Onboarding } from './components/Onboarding';
import { BrainView } from './components/BrainView';
import { MapView } from './components/MapView';
import { CaptureBox } from './components/CaptureBox';
import { CategoryTabs } from './components/CategoryTabs';
import { Feed } from './components/Feed';
import { RulesEditor } from './components/RulesEditor';
import { Toast, type ToastState } from './components/Toast';

const headerBtn = 'rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100';

export default function App() {
  const thoughts = useLiveQuery(() => db.thoughts.orderBy('createdAt').reverse().toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'brain' | 'map' | 'feed' | 'settings'>('brain');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [lastSaved, setLastSaved] = useState<{ thought: Thought; at: number } | null>(null);
  const [assistantReply, setAssistantReply] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const thinkTimerRef = useRef<number | null>(null);
  const greetedRef = useRef(false);
  const [name, setNameState] = useState<string>(() => loadName());
  const [needsName, setNeedsName] = useState<boolean>(() => !hasName());
  // 'chatty' speaks the full reply after a dictated thought; 'brief' just the filing line.
  const [replyStyle, setReplyStyle] = useState<'chatty' | 'brief'>(() => {
    try {
      return localStorage.getItem('mini-brain:reply-style') === 'brief' ? 'brief' : 'chatty';
    } catch {
      return 'chatty';
    }
  });

  const captureRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void seedRulesIfEmpty();
    captureRef.current?.focus();
  }, []);

  const orderedRules = useMemo(() => {
    const list = (rules ?? []).slice();
    list.sort((a, b) => (a.id === INBOX_ID ? 1 : b.id === INBOX_ID ? -1 : a.name.localeCompare(b.name)));
    return list;
  }, [rules]);

  const ruleById = useMemo(() => new Map(orderedRules.map((r) => [r.id, r])), [orderedRules]);

  const speaker = useSpeaker();

  const saveThought = useCallback(
    (text: string, source: Thought['source']) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const result = categorize(trimmed, rules ?? []);
      const thought: Thought = {
        id: nanoid(),
        text: trimmed,
        categoryId: result.categoryId,
        categorySource: 'auto',
        createdAt: Date.now(),
        source,
      };
      void db.thoughts.add(thought);
      setToast({ kind: 'saved', thought });
      setLastSaved({ thought, at: Date.now() });

      // Assistant: compose an actionable reply, show it, and speak it.
      // In brief style, dictated thoughts get a one-sentence confirmation —
      // the mic is muted while the app talks, so long speeches would swallow
      // a rapid brain-dump. Chatty style talks the whole reply through.
      const ctx = { rules: rules ?? [], thoughts: thoughts ?? [] };
      const reply = composeReply(thought, ctx, { result });
      const spoken =
        source === 'voice' && replyStyle === 'brief' ? composeReply(thought, ctx, { result, brief: true }) : reply;
      setThinking(true);
      if (thinkTimerRef.current !== null) window.clearTimeout(thinkTimerRef.current);

      // AI mode (opt-in, Rules panel): send the thought + recent context to the
      // configured LLM for a genuinely conversational reply, spoken by the same
      // browser voice. Falls back to the offline rule-based reply on any error.
      const ai = loadAISettings();
      if (ai.enabled && ai.apiKey.trim()) {
        generateReply(ai, buildSystemPrompt(name || 'friend'), buildUserPrompt(thought, ctx))
          .then((aiText) => {
            setThinking(false);
            setAssistantReply(aiText);
            if (speaker.enabled) speaker.speak(aiText);
          })
          .catch((err: unknown) => {
            setThinking(false);
            setAssistantReply(`${reply} (AI failed: ${describeError(err)} — offline brain speaking.)`);
            if (speaker.enabled) speaker.speak(spoken);
          });
        return;
      }

      thinkTimerRef.current = window.setTimeout(() => {
        thinkTimerRef.current = null;
        setThinking(false);
        setAssistantReply(reply);
        if (speaker.enabled) speaker.speak(spoken);
      }, 600);
    },
    [rules, thoughts, speaker, replyStyle, name],
  );

  const voice = useVoiceCapture({
    lang: 'en-IN',
    silenceMs: 2500,
    onThought: (text) => saveThought(text, 'voice'),
  });

  // Global shortcuts: Ctrl+K refocus capture, Ctrl+M toggle voice.
  const voiceToggle = voice.toggle;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        captureRef.current?.focus();
      } else if (key === 'm') {
        e.preventDefault();
        voiceToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voiceToggle]);

  // Capture bridge: pull thoughts queued by server/capture.mjs (Telegram,
  // OpenClaw, curl — anything that POSTs to it), categorize, and import with
  // dedupe by bridge id. Silent when the bridge isn't running.
  useEffect(() => {
    if (rules === undefined) return;
    const base = import.meta.env.DEV ? '/ingest' : 'http://127.0.0.1:4820';
    let busy = false;
    const pull = async () => {
      if (busy) return;
      busy = true;
      try {
        const res = await fetch(`${base}/pending`);
        if (!res.ok) return;
        const items = (await res.json()) as { id?: string; text?: string; via?: string; receivedAt?: number }[];
        if (!Array.isArray(items) || items.length === 0) return;
        const existing = new Set<string>(await db.thoughts.toCollection().primaryKeys());
        const fresh = items.filter(
          (i): i is { id: string; text: string; via?: string; receivedAt?: number } =>
            typeof i.id === 'string' && typeof i.text === 'string' && i.text.trim() !== '' && !existing.has(i.id),
        );
        const added: Thought[] = fresh.map((i) => ({
          id: i.id,
          text: i.text.trim(),
          categoryId: categorize(i.text, rules).categoryId,
          categorySource: 'auto',
          createdAt: typeof i.receivedAt === 'number' ? i.receivedAt : Date.now(),
          source: 'remote',
        }));
        if (added.length > 0) await db.thoughts.bulkAdd(added);
        await fetch(`${base}/ack`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: items.map((i) => i.id) }),
        });
        if (added.length > 0) {
          setToast({ kind: 'info', message: `📨 ${added.length} thought${added.length === 1 ? '' : 's'} arrived from your phone` });
        }
      } catch {
        // bridge not running — that's fine
      } finally {
        busy = false;
      }
    };
    void pull();
    const iv = window.setInterval(() => void pull(), 15_000);
    const onFocus = () => void pull();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [rules]);

  // Greeting: a warm welcome on the first visit each calendar day, otherwise a
  // dry boot line. Held until the name is set (onboarding greets instead).
  // Text only — the browser blocks audio before the first user gesture anyway.
  useEffect(() => {
    if (greetedRef.current || thoughts === undefined || needsName) return;
    greetedRef.current = true;
    if (shouldWelcomeToday()) {
      markWelcomedToday();
      setAssistantReply(dailyWelcome(name, thoughts.length, false));
    } else {
      setAssistantReply(bootGreeting(thoughts.length, name));
    }
  }, [thoughts, needsName, name]);

  const finishOnboarding = useCallback(
    (chosen: string) => {
      const clean = saveName(chosen);
      setNameState(clean);
      markWelcomedToday();
      greetedRef.current = true;
      setNeedsName(false);
      setAssistantReply(dailyWelcome(clean, thoughts?.length ?? 0, true));
      requestAnimationFrame(() => captureRef.current?.focus());
    },
    [thoughts],
  );

  // Mute the mic while the app speaks so it never transcribes its own voice.
  const voicePause = voice.pause;
  const voiceResume = voice.resume;
  useEffect(() => {
    if (speaker.speaking) voicePause();
    else voiceResume();
  }, [speaker.speaking, voicePause, voiceResume]);

  useEffect(
    () => () => {
      if (thinkTimerRef.current !== null) window.clearTimeout(thinkTimerRef.current);
    },
    [],
  );

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // If the selected category was deleted, fall back to All.
  useEffect(() => {
    if (selectedCategory !== 'all' && rules && !rules.some((r) => r.id === selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [rules, selectedCategory]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of thoughts ?? []) c[t.categoryId] = (c[t.categoryId] ?? 0) + 1;
    return c;
  }, [thoughts]);

  const filteredThoughts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (thoughts ?? []).filter(
      (t) =>
        (selectedCategory === 'all' || t.categoryId === selectedCategory) &&
        (!q || t.text.toLowerCase().includes(q)),
    );
  }, [thoughts, selectedCategory, search]);

  const handleDelete = useCallback((thought: Thought) => {
    void db.thoughts.delete(thought.id);
    setToast({ kind: 'deleted', thought });
  }, []);

  const handleReassign = useCallback((id: string, categoryId: string) => {
    void db.thoughts.update(id, { categoryId, categorySource: 'manual' });
  }, []);

  const handleEdit = useCallback(
    (thought: Thought, text: string) => {
      const changes: { text: string; categoryId?: string } = { text };
      // Manually-assigned categories are sticky; auto ones re-run the engine.
      if (thought.categorySource === 'auto') changes.categoryId = categorize(text, rules ?? []).categoryId;
      void db.thoughts.update(thought.id, changes);
    },
    [rules],
  );

  const handleImportFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    importBackup(file)
      .then(({ thoughtsAdded, rulesAdded }) =>
        setToast({ kind: 'info', message: `Imported ${thoughtsAdded} thoughts and ${rulesAdded} rules` }),
      )
      .catch(() => setToast({ kind: 'info', message: 'Import failed — not a valid Mini Brain export' }));
  };

  const totalCount = thoughts?.length ?? 0;

  const assistantStatus: AssistantStatus = thinking
    ? 'thinking'
    : speaker.speaking
      ? 'speaking'
      : voice.listening
        ? 'listening'
        : 'idle';

  return (
    <>
      {view === 'brain' && (
        <BrainView
          rules={orderedRules}
          thoughts={thoughts ?? []}
          onDelete={handleDelete}
          lastSaved={lastSaved}
          originRef={captureRef}
        />
      )}

      {view === 'map' && (
        <MapView rules={orderedRules} thoughts={thoughts ?? []} onDelete={handleDelete} lastSaved={lastSaved} />
      )}

      <div
        className={`mx-auto max-w-2xl px-4 pt-6 ${
          view === 'brain' || view === 'map' ? 'pointer-events-none relative z-10' : 'pb-24'
        }`}
      >
        <header className="pointer-events-auto mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-[0.01em]">
          <span>🧠</span> Mini Brain
          <span
            className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-normal tracking-wide text-zinc-400"
            title="Total thoughts"
          >
            {totalCount}
          </span>
        </h1>
        <div className="flex items-center gap-1 text-xs">
          <button
            onClick={() => void exportAll().catch(() => setToast({ kind: 'info', message: 'Export failed' }))}
            className={headerBtn}
            title="Download all thoughts + rules as JSON"
          >
            Export
          </button>
          <button onClick={() => fileInputRef.current?.click()} className={headerBtn} title="Import a Mini Brain JSON export">
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
          <span className="ml-1 flex overflow-hidden rounded-md border border-white/10">
            {(
              [
                ['brain', '🫧 Brain'],
                ['map', '🕸 Map'],
                ['feed', '☰ Feed'],
                ['settings', '⚙ Rules'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-1 transition-colors ${
                  view === v ? 'bg-white/10 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {label}
              </button>
            ))}
          </span>
        </div>
      </header>

      <VoicePanel
        name={name}
        voice={voice}
        status={assistantStatus}
        reply={assistantReply}
        speechSupported={speaker.supported}
        speechEnabled={speaker.enabled}
        replyStyle={replyStyle}
        onToggleSpeech={() => speaker.setEnabled(!speaker.enabled)}
        onToggleStyle={() => {
          const next = replyStyle === 'chatty' ? 'brief' : 'chatty';
          setReplyStyle(next);
          try {
            localStorage.setItem('mini-brain:reply-style', next);
          } catch {
            // preference just won't persist
          }
        }}
        onDismiss={() => {
          setAssistantReply(null);
          speaker.cancel();
        }}
      />

      <div className="pointer-events-auto">
        <CaptureBox onSave={(text) => saveThought(text, 'typed')} inputRef={captureRef} />
      </div>

      {view === 'feed' && (
        <>
          <CategoryTabs
            rules={orderedRules}
            counts={counts}
            total={totalCount}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search thoughts…"
            className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none backdrop-blur transition-colors placeholder:text-zinc-600 focus:border-cyan-400/30"
          />
          <Feed
            thoughts={filteredThoughts}
            rules={orderedRules}
            ruleById={ruleById}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onReassign={handleReassign}
          />
        </>
      )}

      {view === 'settings' && (
        <RulesEditor
          rules={orderedRules}
          name={name}
          onRename={(next) => {
            const clean = saveName(next);
            setNameState(clean);
            setToast({ kind: 'info', message: `Got it — I'll call you ${clean}.` });
          }}
        />
      )}
      </div>

      {toast && (
        <Toast
          key={`${toast.kind}-${'thought' in toast ? toast.thought.id : toast.message}`}
          toast={toast}
          rules={orderedRules}
          onDismiss={() => setToast(null)}
          onUndoSave={(id) => {
            void db.thoughts.delete(id);
            setToast(null);
          }}
          onUndoDelete={(thought) => {
            void db.thoughts.add(thought);
            setToast(null);
          }}
          onChangeCategory={(id, categoryId) => {
            void db.thoughts.update(id, { categoryId, categorySource: 'manual' });
            setToast(null);
          }}
        />
      )}

      {needsName && <Onboarding onDone={finishOnboarding} />}
    </>
  );
}
