import { useState } from 'react';
import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';

export type ToastState =
  | { kind: 'saved'; thought: Thought }
  | { kind: 'deleted'; thought: Thought }
  | { kind: 'info'; message: string };

type Props = {
  toast: ToastState;
  rules: CategoryRule[];
  onDismiss: () => void;
  onUndoSave: (id: string) => void;
  onUndoDelete: (thought: Thought) => void;
  onChangeCategory: (id: string, categoryId: string) => void;
};

const wrapper =
  'fixed bottom-4 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm shadow-2xl';

export function Toast({ toast, rules, onDismiss, onUndoSave, onUndoDelete, onChangeCategory }: Props) {
  const [changing, setChanging] = useState(false);

  if (toast.kind === 'info') {
    return (
      <div className={wrapper}>
        <div className="flex items-center gap-3">
          <span className="text-zinc-300">{toast.message}</span>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
      </div>
    );
  }

  if (toast.kind === 'deleted') {
    return (
      <div className={wrapper}>
        <div className="flex items-center gap-3">
          <span className="text-zinc-300">Thought deleted</span>
          <button
            onClick={() => onUndoDelete(toast.thought)}
            className="font-medium text-zinc-100 underline underline-offset-2"
          >
            Undo
          </button>
          <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-200">✕</button>
        </div>
      </div>
    );
  }

  const rule = rules.find((r) => r.id === toast.thought.categoryId);
  const color = rule?.color ?? '#9ca3af';

  if (changing) {
    return (
      <div className={wrapper}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-zinc-400">Move to:</span>
          {rules
            .filter((r) => r.id !== toast.thought.categoryId)
            .map((r) => (
              <button
                key={r.id}
                onClick={() => onChangeCategory(toast.thought.id, r.id)}
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: `${r.color}22`, color: r.color }}
              >
                {r.name}
              </button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <div className="flex items-center gap-3">
        <span className="text-zinc-300">
          Saved to{' '}
          <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${color}22`, color }}>
            {rule?.name ?? 'Inbox'}
          </span>
        </span>
        <button onClick={() => setChanging(true)} className="font-medium text-zinc-100 underline underline-offset-2">
          Change
        </button>
        <button onClick={() => onUndoSave(toast.thought.id)} className="text-zinc-400 hover:text-zinc-100">
          Undo
        </button>
        <button onClick={onDismiss} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>
    </div>
  );
}
