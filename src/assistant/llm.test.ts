import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt, describeError, loadAISettings } from './llm';
import { seedRules } from '../categorization/rules';
import type { Thought } from '../types';

let seq = 0;
const mk = (text: string, categoryId = 'inbox', source: Thought['source'] = 'typed'): Thought => ({
  id: `t${seq++}`,
  text,
  categoryId,
  categorySource: 'auto',
  createdAt: 1000 + seq,
  source,
});

describe('buildSystemPrompt', () => {
  it('carries the persona, the name, and the TTS output rules', () => {
    const p = buildSystemPrompt('Sahil');
    expect(p).toContain('Sahil');
    expect(p).toContain('mini brain');
    expect(p).toContain('spoken aloud');
    expect(p).toContain('No markdown');
    expect(p).toContain('Never recite the thought back');
  });
});

describe('buildUserPrompt', () => {
  it('includes the thought, its category name, count, and capture source', () => {
    const existing = [mk('older llm note', 'ai-engineering')];
    const thought = mk('tune the llm eval', 'ai-engineering', 'voice');
    const p = buildUserPrompt(thought, { rules: seedRules, thoughts: [thought, ...existing] });
    expect(p).toContain('tune the llm eval');
    expect(p).toContain('AI Engineering');
    expect(p).toContain('number 2 there');
    expect(p).toContain('via voice');
  });

  it('lists recent thoughts with their category names, excluding the new one', () => {
    const recent = [mk('draft the hook first', 'youtube')];
    const thought = mk('new idea', 'inbox');
    const p = buildUserPrompt(thought, { rules: seedRules, thoughts: [thought, ...recent] });
    expect(p).toContain('- [YouTube / Content] draft the hook first');
    expect(p).not.toContain('- [Inbox] new idea');
  });

  it('caps recent context at 15 and truncates long texts', () => {
    const recent = Array.from({ length: 25 }, (_, i) => mk(`filler thought number ${i} ${'x'.repeat(200)}`, 'personal'));
    const thought = mk('the new one', 'personal');
    const p = buildUserPrompt(thought, { rules: seedRules, thoughts: [thought, ...recent] });
    expect(p.match(/^- \[/gm)).toHaveLength(15);
    expect(p).toContain('…');
    expect(p).not.toContain('x'.repeat(200));
  });

  it('omits the recent section for an empty brain', () => {
    const thought = mk('first ever', 'inbox');
    const p = buildUserPrompt(thought, { rules: seedRules, thoughts: [thought] });
    expect(p).not.toContain('Recent thoughts');
  });
});

describe('describeError', () => {
  it('passes through provider error messages', () => {
    expect(describeError(new Error('OpenAI 401 (invalid API key): Incorrect API key provided'))).toContain('invalid API key');
  });

  it('diagnoses aborts as timeouts', () => {
    expect(describeError(new DOMException('aborted', 'AbortError'))).toBe('timed out after 20s');
  });

  it('diagnoses TypeErrors as network/key-format problems', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toContain('network error');
  });
});

describe('loadAISettings', () => {
  it('defaults to disabled OpenAI when nothing is stored', () => {
    const s = loadAISettings();
    expect(s.enabled).toBe(false);
    expect(s.provider).toBe('openai');
    expect(s.apiKey).toBe('');
    expect(s.model).toBe('gpt-4o-mini');
  });
});
