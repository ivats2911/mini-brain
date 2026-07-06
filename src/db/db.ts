import Dexie, { type EntityTable } from 'dexie';
import type { Thought } from '../types';
import { INBOX_ID, seedRules, type CategoryRule } from '../categorization/rules';

export const db = new Dexie('mini-brain') as Dexie & {
  thoughts: EntityTable<Thought, 'id'>;
  rules: EntityTable<CategoryRule, 'id'>;
};

db.version(1).stores({
  thoughts: 'id, createdAt, categoryId',
  rules: 'id',
});

/**
 * Seed categorization rules on first run. rules.ts is only the seed;
 * after that IndexedDB is the source of truth (edited via the Rules panel).
 * Runs inside a transaction so StrictMode double-invocation can't double-seed.
 */
export async function seedRulesIfEmpty(): Promise<void> {
  await db.transaction('rw', db.rules, async () => {
    if ((await db.rules.count()) === 0) {
      await db.rules.bulkAdd(seedRules);
    }
  });
}

/** Delete a category; its thoughts fall back to Inbox. Inbox itself can't be deleted. */
export async function deleteCategory(id: string): Promise<void> {
  if (id === INBOX_ID) return;
  await db.transaction('rw', db.thoughts, db.rules, async () => {
    await db.thoughts.where('categoryId').equals(id).modify({ categoryId: INBOX_ID });
    await db.rules.delete(id);
  });
}
