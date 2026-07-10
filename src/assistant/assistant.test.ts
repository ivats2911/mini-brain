import { describe, expect, it } from 'vitest';
import { bootGreeting, composeReply, detectIntent, findRelated } from './assistant';
import { categorize } from '../categorization/engine';
import { seedRules } from '../categorization/rules';
import type { Thought } from '../types';

let seq = 0;
const mk = (text: string, categoryId = 'inbox'): Thought => ({
  id: `t${seq++}`,
  text,
  categoryId,
  categorySource: 'auto',
  createdAt: 1000 + seq,
  source: 'typed',
});

describe('detectIntent', () => {
  it('detects questions by trailing ? and leading question words', () => {
    expect(detectIntent('should i fine-tune or prompt engineer?')).toBe('question');
    expect(detectIntent('how do i cut render time')).toBe('question');
  });

  it('detects tasks from obligation phrases and imperative verbs', () => {
    expect(detectIntent('need to renew the domain before friday')).toBe('task');
    expect(detectIntent('buy more filament')).toBe('task');
    expect(detectIntent('i want to buy a adidas ball')).toBe('task');
  });

  it('detects ideas, including "what if" before the question heuristic', () => {
    expect(detectIntent('idea: trionda ball timelapse')).toBe('idea');
    expect(detectIntent('what if the shorts used a split screen')).toBe('idea');
  });

  it('defaults to note', () => {
    expect(detectIntent('the gym was packed this evening')).toBe('note');
  });
});

describe('composeReply', () => {
  const ctx = (thoughts: Thought[]) => ({ rules: seedRules, thoughts });

  it('names the category and counts the thought', () => {
    const existing = [mk('older llm thing', 'ai-engineering')];
    const reply = composeReply(mk('tune the llm', 'ai-engineering'), ctx(existing));
    expect(reply).toContain('AI Engineering');
    expect(reply).toContain('Number 2');
  });

  it('uses first-one phrasing for a fresh category', () => {
    expect(composeReply(mk('draft the intro', 'youtube'), ctx([]))).toContain('First one — historic');
  });

  it('gives intent-matched category advice', () => {
    const reply = composeReply(mk('idea: a video about bambu plates', 'youtube'), ctx([]));
    expect(reply).toContain('Hook first');
  });

  it('explains Inbox instead of advising', () => {
    const reply = composeReply(mk('completely unplaceable', 'inbox'), ctx([]));
    expect(reply).toContain('Inbox');
    expect(reply).toContain('Rules');
  });

  it('explains an Inbox tie by naming both categories', () => {
    const text = 'gym before the interview';
    const result = categorize(text, seedRules);
    const reply = composeReply(mk(text, result.categoryId), ctx([]), { result });
    expect(reply).toContain('tied');
    expect(reply).toContain('Job Search');
    expect(reply).toContain('Personal / Life');
  });

  it('explains a below-threshold Inbox result and names the closest category', () => {
    const text = 'buy milk';
    const result = categorize(text, seedRules);
    const reply = composeReply(mk(text, result.categoryId), ctx([]), { result });
    expect(reply).toContain('Personal / Life came closest');
  });

  it('brief mode returns only the one-sentence filing line', () => {
    const brief = composeReply(mk('two interviews lined up', 'job-search'), ctx([]), { brief: true });
    expect(brief).toBe('Job Search. First one — historic.');
  });

  it('falls back to generic advice for custom categories', () => {
    const reply = composeReply(mk('need to look into this', 'my-custom-cat'), ctx([]));
    expect(reply).toContain('Deadline');
  });

  it('answers a purchase with a concrete plan and a follow-up question', () => {
    const reply = composeReply(mk('i want to buy a adidas ball', 'inbox'), ctx([]));
    expect(reply).toContain('adidas ball');
    expect(reply).toContain('price cap');
    expect(reply).toContain('budget');
  });

  it('prefers the action playbook over category advice', () => {
    const reply = composeReply(mk('need to fix the retention graph', 'youtube'), ctx([]));
    expect(reply).toContain('fifteen-minute step');
    expect(reply).not.toContain('Hook first');
  });

  it('asks an intent question for tasks without a playbook verb', () => {
    const reply = composeReply(mk('need to sort out the garage', 'personal'), ctx([]));
    expect(reply).toContain('When by?');
  });

  it('keeps plain notes question-free', () => {
    const reply = composeReply(mk('the gym was packed this evening', 'personal'), ctx([]));
    expect(reply).not.toContain('?');
  });

  it('quotes a related earlier thought sharing a significant word', () => {
    const existing = [mk('sagemaker costs are creeping up', 'ai-engineering')];
    const reply = composeReply(mk('check the sagemaker quota', 'ai-engineering'), ctx(existing));
    expect(reply).toContain('Ties back to');
    expect(reply).toContain('sagemaker costs');
  });
});

describe('findRelated', () => {
  it('returns undefined when only stopwords are shared', () => {
    const existing = [mk('think about those things')];
    expect(findRelated('about those other things maybe', existing, 'nope')).toBeUndefined();
  });

  it('excludes the thought itself', () => {
    const self = mk('sagemaker endpoint tuning');
    expect(findRelated(self.text, [self], self.id)).toBeUndefined();
  });
});

describe('bootGreeting', () => {
  it('uses the real thought count', () => {
    expect(bootGreeting(42, undefined, 0)).toBe('42 thoughts in here. Ambitious of you to call this a brain.');
  });

  it('has a dedicated empty-brain line', () => {
    expect(bootGreeting(0, 'Sahil')).toBe('Empty. Zero thoughts — bold starting position, Sahil.');
  });

  it('drops the name in occasionally, not every line', () => {
    expect(bootGreeting(5, 'Sahil', 0.3)).toContain('Sahil');
    expect(bootGreeting(5, 'Sahil', 0)).not.toContain('Sahil');
  });

  it('varies the ribbing across the random range', () => {
    const lines = new Set([0, 0.3, 0.6, 0.9].map((r) => bootGreeting(7, undefined, r)));
    expect(lines.size).toBe(4);
  });
});
