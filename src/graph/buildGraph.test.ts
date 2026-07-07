import { describe, expect, it } from 'vitest';
import { buildGraph, extractRefs, extractTags, makeLabel } from './buildGraph';
import type { Thought } from '../types';

let seq = 0;
const mk = (text: string, categoryId = 'inbox', createdAt?: number): Thought => ({
  id: `t${seq++}`,
  text,
  categoryId,
  categorySource: 'auto',
  createdAt: createdAt ?? 1000 + seq,
  source: 'typed',
});

describe('extractTags', () => {
  it('finds #tags, lowercased and deduped', () => {
    expect(extractTags('try #LoRA on the #yt-shorts pipeline #lora')).toEqual(['lora', 'yt-shorts']);
  });
});

describe('extractRefs', () => {
  it('finds [[wikilinks]]', () => {
    expect(extractRefs('this builds on [[embedding cache]] and [[Trionda]]')).toEqual(['embedding cache', 'trionda']);
  });
});

describe('makeLabel', () => {
  it('takes the first six words and strips markup', () => {
    expect(makeLabel('one two three four five six seven eight')).toBe('one two three four five six…');
    expect(makeLabel('check the [[embedding cache]] #perf idea')).toBe('check the embedding cache perf idea');
  });
});

describe('buildGraph', () => {
  it('assigns numeric ids equal to array index, ordered by createdAt', () => {
    const { nodes } = buildGraph([mk('newest', 'inbox', 300), mk('oldest', 'inbox', 100), mk('middle', 'inbox', 200)]);
    expect(nodes.map((n) => n.id)).toEqual([0, 1, 2]);
    expect(nodes.map((n) => n.text)).toEqual(['oldest', 'middle', 'newest']);
    expect(nodes.map((n) => n.born)).toEqual([0, 1, 2]);
  });

  it('links thoughts connected by a wikilink', () => {
    const { links } = buildGraph([
      mk('the embedding cache experiment worked', 'a'),
      mk('follow up on [[embedding cache]] results', 'b'),
    ]);
    expect(links).toContainEqual({ source: 1, target: 0, kind: 'ref' });
  });

  it('links thoughts sharing an explicit #tag', () => {
    const { links } = buildGraph([mk('render pass #cinematic', 'a'), mk('grade footage #cinematic', 'b')]);
    expect(links.some((l) => l.kind === 'tag')).toBe(true);
  });

  it('chains thoughts in the same category', () => {
    const { links } = buildGraph([mk('alpha', 'same'), mk('beta', 'same'), mk('gamma', 'same')]);
    const cat = links.filter((l) => l.kind === 'cat');
    expect(cat).toEqual([
      { source: 0, target: 1, kind: 'cat' },
      { source: 1, target: 2, kind: 'cat' },
    ]);
  });

  it('links thoughts sharing a significant word across categories', () => {
    const { links } = buildGraph([mk('tune sagemaker endpoint', 'a'), mk('sagemaker bill too high', 'b')]);
    expect(links.some((l) => l.kind === 'word')).toBe(true);
  });

  it('does not link on stopwords or short words', () => {
    const { links } = buildGraph([mk('think about that when done', 'a'), mk('maybe think about those there', 'b')]);
    expect(links).toEqual([]);
  });

  it('dedupes pairs, keeping the highest-priority kind', () => {
    const { links } = buildGraph([
      mk('deep dive on [[prompt caching]] #claude', 'a'),
      mk('prompt caching cut costs #claude', 'b'),
    ]);
    const between = links.filter((l) => (l.source === 0 && l.target === 1) || (l.source === 1 && l.target === 0));
    expect(between).toHaveLength(1);
    expect(between[0].kind).toBe('ref');
  });

  it('caps word-links per node at three', () => {
    const shared = ['zeppelin one', 'zeppelin two', 'zeppelin three', 'zeppelin four', 'zeppelin five'];
    const { links } = buildGraph(shared.map((t, i) => mk(t, `cat${i}`)));
    const wordLinksOfFirst = links.filter((l) => l.kind === 'word' && (l.source === 0 || l.target === 0));
    expect(wordLinksOfFirst.length).toBeLessThanOrEqual(3);
  });
});
