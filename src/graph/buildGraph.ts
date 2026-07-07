import type { Thought } from '../types';

/**
 * Graph model for the Map view: every thought is a node; links connect
 * related thoughts. Pure module — no DB or DOM imports, unit-tested.
 */

export type BrainNode = {
  /** Numeric id equal to the node's index in the nodes array — features rely on index lookup. */
  id: number;
  /** The underlying Thought.id (nanoid). */
  tid: string;
  /** First ~6 words of the thought. */
  label: string;
  text: string;
  /** categoryId of the thought. */
  group: string;
  /** Order of capture: 0 = oldest. Recent thoughts render brighter/larger. */
  born: number;
  createdAt: number;
  /** Explicit #tags found in the text. */
  tags: string[];
};

export type LinkKind = 'ref' | 'tag' | 'cat' | 'word';

export type BrainLink = { source: number; target: number; kind: LinkKind };

const WORD_LINK_BUDGET = 3;

const STOPWORDS = new Set([
  'about', 'above', 'after', 'again', 'along', 'around', 'because', 'been', 'before', 'being',
  'below', 'between', 'could', 'doing', 'down', 'during', 'every', 'first', 'from', 'going',
  'have', 'having', 'idea', 'ideas', 'into', 'just', 'like', 'made', 'make', 'maybe', 'more',
  'need', 'other', 'over', 'really', 'should', 'some', 'something', 'still', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think', 'this',
  'those', 'today', 'tomorrow', 'under', 'until', 'want', 'what', 'when', 'where', 'which',
  'while', 'will', 'with', 'would', 'your',
]);

export function extractTags(text: string): string[] {
  return [...new Set([...text.matchAll(/#([\p{L}\d_-]+)/gu)].map((m) => m[1].toLowerCase()))];
}

export function extractRefs(text: string): string[] {
  return [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim().toLowerCase()).filter((r) => r.length > 0);
}

export function makeLabel(text: string): string {
  const clean = text.replace(/\[\[|\]\]/g, ' ').replace(/#/g, '').replace(/\s+/g, ' ').trim();
  const words = clean.split(' ');
  return words.length <= 6 ? clean : `${words.slice(0, 6).join(' ')}…`;
}

function significantWords(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().replace(/\[\[|\]\]/g, ' ').split(/[^\p{L}\d]+/u)) {
    if (w.length >= 5 && !STOPWORDS.has(w) && !/^\d+$/.test(w)) out.add(w);
  }
  return out;
}

/**
 * Link rules, in priority order (first kind wins on duplicate pairs):
 * 1. `ref`  — one thought wikilinks a phrase the other contains.
 * 2. `tag`  — both carry the same explicit #tag (chained, not a clique).
 * 3. `cat`  — same category, chained by capture order so clusters stay
 *             connected without turning into hairballs.
 * 4. `word` — share a significant word (≥5 chars, non-stopword), capped at
 *             3 word-links per node.
 */
export function buildGraph(thoughts: Thought[]): { nodes: BrainNode[]; links: BrainLink[] } {
  const sorted = [...thoughts].sort((a, b) => a.createdAt - b.createdAt);
  const nodes: BrainNode[] = sorted.map((t, i) => ({
    id: i,
    tid: t.id,
    label: makeLabel(t.text),
    text: t.text,
    group: t.categoryId,
    born: i,
    createdAt: t.createdAt,
    tags: extractTags(t.text),
  }));

  const linkMap = new Map<string, BrainLink>();
  const add = (a: number, b: number, kind: LinkKind): boolean => {
    if (a === b) return false;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (linkMap.has(key)) return false;
    linkMap.set(key, { source: a, target: b, kind });
    return true;
  };

  // 1. wikilink references
  const lowerTexts = nodes.map((n) => n.text.toLowerCase());
  for (const n of nodes) {
    for (const ref of extractRefs(n.text)) {
      for (const m of nodes) {
        if (m.id !== n.id && lowerTexts[m.id].includes(ref)) add(n.id, m.id, 'ref');
      }
    }
  }

  // 2. shared explicit #tags
  const byTag = new Map<string, number[]>();
  for (const n of nodes) {
    for (const tag of n.tags) {
      const arr = byTag.get(tag) ?? [];
      arr.push(n.id);
      byTag.set(tag, arr);
    }
  }
  for (const ids of byTag.values()) {
    for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i], 'tag');
  }

  // 3. same-category chains
  const byCat = new Map<string, number[]>();
  for (const n of nodes) {
    const arr = byCat.get(n.group) ?? [];
    arr.push(n.id);
    byCat.set(n.group, arr);
  }
  for (const ids of byCat.values()) {
    for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i], 'cat');
  }

  // 4. shared significant words, budgeted per node
  const words = nodes.map((n) => significantWords(n.text));
  const budget = nodes.map(() => 0);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (budget[i] >= WORD_LINK_BUDGET) break;
      if (budget[j] >= WORD_LINK_BUDGET) continue;
      let shared = false;
      for (const w of words[i]) {
        if (words[j].has(w)) {
          shared = true;
          break;
        }
      }
      if (shared && add(i, j, 'word')) {
        budget[i]++;
        budget[j]++;
      }
    }
  }

  return { nodes, links: [...linkMap.values()] };
}
