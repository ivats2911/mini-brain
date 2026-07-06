import { useState } from 'react';
import { nanoid } from 'nanoid';
import { db, deleteCategory } from '../db/db';
import { INBOX_ID, type CategoryRule } from '../categorization/rules';

const WEIGHTS = [1, 2, 3] as const;

export function RulesEditor({ rules }: { rules: CategoryRule[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">
        Categories and keywords drive auto-sorting. A thought needs a score of at least 2 to leave Inbox;
        ties also land in Inbox. Click a keyword to cycle its weight (×1 → ×2 → ×3). Changes save instantly.
      </p>
      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} />
      ))}
      <AddCategory />
    </div>
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
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
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
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-800 p-4">
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
