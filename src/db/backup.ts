import { db } from './db';
import type { Thought } from '../types';
import type { CategoryRule } from '../categorization/rules';

export type BackupFile = {
  version: 1;
  exportedAt: number;
  thoughts: Thought[];
  rules: CategoryRule[];
};

export async function exportAll(): Promise<void> {
  const [thoughts, rules] = await Promise.all([db.thoughts.toArray(), db.rules.toArray()]);
  const backup: BackupFile = { version: 1, exportedAt: Date.now(), thoughts, rules };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mini-brain-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isThought(v: unknown): v is Thought {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.text === 'string' &&
    typeof v.categoryId === 'string' &&
    (v.categorySource === 'auto' || v.categorySource === 'manual') &&
    typeof v.createdAt === 'number' &&
    (v.source === 'typed' || v.source === 'voice')
  );
}

function isRule(v: unknown): v is CategoryRule {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.color === 'string' &&
    Array.isArray(v.keywords) &&
    v.keywords.every((k) => isRecord(k) && typeof k.term === 'string' && typeof k.weight === 'number')
  );
}

/** Merge an exported file back in. Existing ids win — nothing is overwritten. */
export async function importBackup(file: File): Promise<{ thoughtsAdded: number; rulesAdded: number }> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isRecord(parsed) || !Array.isArray(parsed.thoughts) || !Array.isArray(parsed.rules)) {
    throw new Error('Not a Mini Brain export file');
  }
  const thoughts = parsed.thoughts.filter(isThought);
  const rules = parsed.rules.filter(isRule);

  return db.transaction('rw', db.thoughts, db.rules, async () => {
    const existingThoughtIds = new Set(await db.thoughts.toCollection().primaryKeys());
    const existingRuleIds = new Set(await db.rules.toCollection().primaryKeys());
    const newThoughts = thoughts.filter((t) => !existingThoughtIds.has(t.id));
    const newRules = rules.filter((r) => !existingRuleIds.has(r.id));
    await db.thoughts.bulkAdd(newThoughts);
    await db.rules.bulkAdd(newRules);
    return { thoughtsAdded: newThoughts.length, rulesAdded: newRules.length };
  });
}
