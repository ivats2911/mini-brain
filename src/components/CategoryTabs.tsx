import type { CategoryRule } from '../categorization/rules';

type Props = {
  rules: CategoryRule[];
  counts: Record<string, number>;
  total: number;
  selected: string; // 'all' or a category id
  onSelect: (id: string) => void;
};

export function CategoryTabs({ rules, counts, total, selected, onSelect }: Props) {
  const base = 'shrink-0 rounded-full border px-3 py-1 text-xs transition-colors';
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      <button
        onClick={() => onSelect('all')}
        className={`${base} ${
          selected === 'all'
            ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
            : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
        }`}
      >
        All <span className="opacity-60">{total}</span>
      </button>
      {rules.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className={`${base} ${selected === r.id ? '' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
          style={
            selected === r.id
              ? { backgroundColor: `${r.color}26`, borderColor: r.color, color: r.color }
              : undefined
          }
        >
          {r.name} <span className="opacity-60">{counts[r.id] ?? 0}</span>
        </button>
      ))}
    </div>
  );
}
