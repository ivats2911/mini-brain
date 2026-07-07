import { useState, type KeyboardEvent } from 'react';
import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';
import { formatRelative } from '../utils/time';

type Props = {
  thought: Thought;
  rule: CategoryRule | undefined;
  rules: CategoryRule[];
  onDelete: (thought: Thought) => void;
  onEdit: (thought: Thought, text: string) => void;
  onReassign: (id: string, categoryId: string) => void;
};

export function ThoughtCard({ thought, rule, rules, onDelete, onEdit, onReassign }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought.text);
  const [pickerOpen, setPickerOpen] = useState(false);

  const color = rule?.color ?? '#9ca3af';

  const commitEdit = () => {
    const t = draft.trim();
    if (t && t !== thought.text) onEdit(thought, t);
    setEditing(false);
  };

  const onEditKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === 'Escape') {
      setDraft(thought.text);
      setEditing(false);
    }
  };

  return (
    <li className="group rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur transition-colors hover:bg-white/[0.05]">
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onEditKeyDown}
            rows={2}
            className="mb-2 block w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-zinc-500"
          />
          <div className="flex gap-2 text-xs">
            <button onClick={commitEdit} className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-900">
              Save
            </button>
            <button
              onClick={() => {
                setDraft(thought.text);
                setEditing(false);
              }}
              className="rounded px-2 py-1 text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{thought.text}</p>
      )}
      <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
        <span className="relative">
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="rounded-full px-2 py-0.5 font-medium"
            style={{ backgroundColor: `${color}22`, color }}
            title="Change category"
          >
            {rule?.name ?? thought.categoryId}
          </button>
          {pickerOpen && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setPickerOpen(false)}
                aria-label="Close category picker"
              />
              <span className="brain-panel absolute left-0 top-6 z-20 flex w-44 flex-col rounded-lg border border-white/10 bg-[#12121c]/95 py-1 shadow-xl backdrop-blur-xl">
                {rules
                  .filter((r) => r.id !== thought.categoryId)
                  .map((r) => (
                    <button
                      key={r.id}
                      onClick={() => {
                        onReassign(thought.id, r.id);
                        setPickerOpen(false);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
                      {r.name}
                    </button>
                  ))}
              </span>
            </>
          )}
        </span>
        <span title={new Date(thought.createdAt).toLocaleString()}>{formatRelative(thought.createdAt)}</span>
        {thought.source === 'voice' && <span title="Captured by voice">🎤</span>}
        <span className="ml-auto flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            onClick={() => {
              setDraft(thought.text);
              setEditing(true);
            }}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-zinc-200"
            title="Edit"
          >
            ✎
          </button>
          <button
            onClick={() => onDelete(thought)}
            className="rounded px-1.5 py-0.5 hover:bg-zinc-800 hover:text-red-400"
            title="Delete"
          >
            ✕
          </button>
        </span>
      </div>
    </li>
  );
}
