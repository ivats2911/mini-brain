import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { nanoid } from 'nanoid';
import { db, seedRulesIfEmpty } from './db/db';
import { exportAll, importBackup } from './db/backup';
import { categorize } from './categorization/engine';
import { INBOX_ID } from './categorization/rules';
import type { Thought } from './types';
import { useVoiceCapture } from './voice/useVoiceCapture';
import { CaptureBox } from './components/CaptureBox';
import { CategoryTabs } from './components/CategoryTabs';
import { Feed } from './components/Feed';
import { RulesEditor } from './components/RulesEditor';
import { Toast, type ToastState } from './components/Toast';

const headerBtn = 'rounded-md px-2 py-1 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100';

export default function App() {
  const thoughts = useLiveQuery(() => db.thoughts.orderBy('createdAt').reverse().toArray(), []);
  const rules = useLiveQuery(() => db.rules.toArray(), []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'feed' | 'settings'>('feed');
  const [toast, setToast] = useState<ToastState | null>(null);

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
    },
    [rules],
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
        setView('feed');
        requestAnimationFrame(() => captureRef.current?.focus());
      } else if (key === 'm') {
        e.preventDefault();
        voiceToggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [voiceToggle]);

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

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span>🧠</span> Mini Brain
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs font-normal text-zinc-400" title="Total thoughts">
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
          <button onClick={() => setView(view === 'settings' ? 'feed' : 'settings')} className={headerBtn}>
            {view === 'settings' ? '← Feed' : '⚙ Rules'}
          </button>
        </div>
      </header>

      <CaptureBox onSave={(text) => saveThought(text, 'typed')} voice={voice} inputRef={captureRef} />

      {view === 'feed' ? (
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
            className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-zinc-600"
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
      ) : (
        <RulesEditor rules={orderedRules} />
      )}

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
    </div>
  );
}
