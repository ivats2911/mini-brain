import { useState } from 'react';
import { nanoid } from 'nanoid';
import { db, deleteCategory, mergeSeedKeywords } from '../db/db';
import { INBOX_ID, type CategoryRule } from '../categorization/rules';
import { sanitizeName } from '../profile';
import {
  DEFAULT_MODELS,
  describeError,
  loadAISettings,
  saveAISettings,
  testAIConnection,
  type AIProvider,
  type AISettings,
} from '../assistant/llm';

const WEIGHTS = [1, 2, 3] as const;

type RulesEditorProps = {
  rules: CategoryRule[];
  name: string;
  onRename: (name: string) => void;
};

export function RulesEditor({ rules, name, onRename }: RulesEditorProps) {
  const [mergeMsg, setMergeMsg] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <NameCard name={name} onRename={onRename} />
      <p className="text-sm text-zinc-500">
        Categories and keywords drive auto-sorting. A thought needs a score of at least 2 to leave Inbox;
        ties also land in Inbox. Single-word keywords also match simple plurals (interview → interviews).
        Click a keyword to cycle its weight (×1 → ×2 → ×3). Changes save instantly.
      </p>
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() =>
            void mergeSeedKeywords().then((n) =>
              setMergeMsg(n > 0 ? `Added ${n} keyword${n === 1 ? '' : 's'} from the seed set.` : 'Already up to date.'),
            )
          }
          className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300 transition-colors hover:bg-white/5"
          title="Add any seed keywords your categories are missing — never removes or re-weights your own"
        >
          ⟳ Merge seed keywords
        </button>
        {mergeMsg && <span className="text-zinc-500">{mergeMsg}</span>}
      </div>
      <AISettingsPanel />
      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} />
      ))}
      <AddCategory />
    </div>
  );
}

function NameCard({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [value, setValue] = useState(name);
  const clean = sanitizeName(value);
  const dirty = clean !== name && clean.length > 0;
  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur">
      <div className="mb-2 text-sm font-medium tracking-wide">👋 What I call you</div>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) onRename(clean);
          }}
          maxLength={24}
          aria-label="Your name"
          placeholder="A short name…"
          className="min-w-40 flex-1 rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm outline-none transition-colors focus:border-cyan-400/30"
        />
        <button
          onClick={() => onRename(clean)}
          disabled={!dirty}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </section>
  );
}

function AISettingsPanel() {
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [testState, setTestState] = useState<{ kind: 'idle' | 'testing' | 'ok' | 'error'; message?: string }>({
    kind: 'idle',
  });

  const update = (patch: Partial<AISettings>) => {
    const next = { ...settings, ...patch };
    if (patch.provider && patch.provider !== settings.provider) {
      next.model = DEFAULT_MODELS[patch.provider];
    }
    if (typeof next.apiKey === 'string') next.apiKey = next.apiKey.trim();
    setSettings(next);
    saveAISettings(next);
    setTestState({ kind: 'idle' });
  };

  const runTest = () => {
    setTestState({ kind: 'testing' });
    testAIConnection(settings)
      .then((text) => setTestState({ kind: 'ok', message: `Key works — model said “${text.slice(0, 40)}”.` }))
      .catch((err: unknown) => setTestState({ kind: 'error', message: describeError(err) }));
  };

  const inputCls =
    'rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs outline-none transition-colors focus:border-cyan-400/30';

  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium tracking-wide">🧠 AI voice replies</span>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-cyan-400"
          />
          {settings.enabled ? 'on' : 'off'}
        </label>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-zinc-500">
        When on, each captured thought (plus recent thoughts for context) is sent from this browser straight to the
        provider, and the reply is spoken by the same voice. Costs per use on your key. The key is stored only in this
        browser. When off — or if a call fails — the offline assistant answers instead.
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={settings.provider}
          onChange={(e) => update({ provider: e.target.value as AIProvider })}
          className={inputCls}
          title="Provider"
        >
          <option value="openai">OpenAI (ChatGPT)</option>
          <option value="anthropic">Anthropic (Claude)</option>
        </select>
        <input
          value={settings.model}
          onChange={(e) => update({ model: e.target.value })}
          placeholder={DEFAULT_MODELS[settings.provider]}
          className={`${inputCls} w-44`}
          title="Model id"
        />
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => update({ apiKey: e.target.value })}
          placeholder={settings.provider === 'openai' ? 'sk-… API key' : 'sk-ant-… API key'}
          autoComplete="off"
          className={`${inputCls} min-w-52 flex-1`}
          title="API key (stored only in this browser)"
        />
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <button
          onClick={runTest}
          disabled={!settings.apiKey.trim() || testState.kind === 'testing'}
          className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          title="Send one tiny request to verify key + model"
        >
          {testState.kind === 'testing' ? 'Testing…' : '⚡ Test key'}
        </button>
        {testState.kind === 'ok' && <span className="text-emerald-400/90">✓ {testState.message}</span>}
        {testState.kind === 'error' && <span className="text-red-400/90">✗ {testState.message}</span>}
      </div>
      {settings.enabled && !settings.apiKey.trim() && (
        <p className="mt-2 text-xs text-amber-400/80">No API key yet — the offline assistant will keep answering.</p>
      )}
    </section>
  );
}

function RuleCard({ rule }: { rule: CategoryRule }) {
  const [term, setTerm] = useState('');
  const [weight, setWeight] = useState<number>(2);
  const isInbox = rule.id === INBOX_ID;

  const addKeyword = () => {
    const t = term.trim().toLowerCase();
    setTerm('');
    if (!t || rule.keywords.some((k) => k.term === t)) return;
    void db.rules.update(rule.id, { keywords: [...rule.keywords, { term: t, weight }] });
  };

  return (
    <section className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <input
          type="color"
          value={rule.color}
          onChange={(e) => void db.rules.update(rule.id, { color: e.target.value })}
          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          title="Category color"
        />
        <input
          defaultValue={rule.name}
          onBlur={(e) => {
            const n = e.target.value.trim();
            if (n && n !== rule.name) void db.rules.update(rule.id, { name: n });
          }}
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium outline-none hover:border-zinc-700 focus:border-zinc-600"
        />
        {!isInbox && (
          <button
            onClick={() => void deleteCategory(rule.id)}
            className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
            title="Delete category (its thoughts move to Inbox)"
          >
            Delete
          </button>
        )}
      </div>
      {isInbox ? (
        <p className="text-xs text-zinc-600">Fallback category — thoughts land here on ties or low scores. No keywords.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {rule.keywords.length === 0 && <span className="text-xs text-zinc-600">No keywords yet.</span>}
            {rule.keywords.map((k) => (
              <span key={k.term} className="flex items-center overflow-hidden rounded-full border border-zinc-700 text-xs">
                <button
                  onClick={() =>
                    void db.rules.update(rule.id, {
                      keywords: rule.keywords.map((kw) =>
                        kw.term === k.term ? { ...kw, weight: kw.weight >= 3 ? 1 : kw.weight + 1 } : kw,
                      ),
                    })
                  }
                  className="px-2 py-0.5 text-zinc-300 hover:bg-zinc-800"
                  title="Click to cycle weight (1 → 2 → 3)"
                >
                  {k.term} <span className="text-zinc-500">×{k.weight}</span>
                </button>
                <button
                  onClick={() =>
                    void db.rules.update(rule.id, { keywords: rule.keywords.filter((kw) => kw.term !== k.term) })
                  }
                  className="px-1.5 py-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
                  title="Remove keyword"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addKeyword();
              }}
              placeholder="Add keyword or phrase…"
              className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-zinc-600"
            />
            <select
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-1 py-1 text-xs outline-none"
              title="Weight of the new keyword"
            >
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>
                  ×{w}
                </option>
              ))}
            </select>
            <button onClick={addKeyword} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
              Add
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function AddCategory() {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b5cf6');

  const add = () => {
    const n = name.trim();
    if (!n) return;
    void db.rules.add({ id: nanoid(8), name: n, color, keywords: [] });
    setName('');
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 p-4">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
        title="New category color"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
        placeholder="New category name…"
        className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-zinc-600"
      />
      <button onClick={add} className="rounded-md border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-800">
        Add category
      </button>
    </div>
  );
}
