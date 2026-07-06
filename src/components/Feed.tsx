import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';
import { ThoughtCard } from './ThoughtCard';

type Props = {
  thoughts: Thought[];
  rules: CategoryRule[];
  ruleById: Map<string, CategoryRule>;
  onDelete: (thought: Thought) => void;
  onEdit: (thought: Thought, text: string) => void;
  onReassign: (id: string, categoryId: string) => void;
};

export function Feed({ thoughts, rules, ruleById, onDelete, onEdit, onReassign }: Props) {
  if (thoughts.length === 0) {
    return <p className="py-16 text-center text-sm text-zinc-600">No thoughts here yet. Dump one above.</p>;
  }
  return (
    <ul className="space-y-2">
      {thoughts.map((t) => (
        <ThoughtCard
          key={t.id}
          thought={t}
          rule={ruleById.get(t.categoryId)}
          rules={rules}
          onDelete={onDelete}
          onEdit={onEdit}
          onReassign={onReassign}
        />
      ))}
    </ul>
  );
}
