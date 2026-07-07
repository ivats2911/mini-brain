import { describe, expect, it } from 'vitest';
import { categorize } from './engine';
import { INBOX_ID, seedRules } from './rules';

const cat = (text: string, threshold?: number) => categorize(text, seedRules, threshold);

describe('categorize', () => {
  it('assigns a category from a single strong keyword', () => {
    expect(cat('experiment with a new LoRA').categoryId).toBe('ai-engineering');
  });

  it('assigns a category from a single weight-2 keyword at the default threshold', () => {
    expect(cat('brainstorm a better opening for the intro, need a stronger hook').categoryId).toBe('youtube');
  });

  it('sums weights across multiple keywords in the same category', () => {
    const r = cat('new thumbnail to fix retention');
    expect(r.categoryId).toBe('youtube');
    expect(r.scores['youtube']).toBe(6); // thumbnail(3) + retention(3)
  });

  it('the higher-scoring category wins when several match', () => {
    // ai: llm(3) + agents→agent(2) = 5; youtube: script(2) + video(2) = 4
    const r = cat('script a video about llm agents');
    expect(r.categoryId).toBe('ai-engineering');
    expect(r.scores['ai-engineering']).toBe(5);
    expect(r.scores['youtube']).toBe(4);
  });

  it('matches multi-word phrases as substrings', () => {
    // "print on demand"(3) + orders→order(2) + webhook(2)
    const r = cat('automate print on demand orders with a webhook');
    expect(r.categoryId).toBe('pod');
    expect(r.scores['pod']).toBe(7);
  });

  it('matches phrases that start with digits', () => {
    expect(cat('3d print a fidget toy tonight').categoryId).toBe('youtube'); // 3d print(3) + fidget(3)
  });

  it('matches simple plurals of single-word keywords', () => {
    expect(cat('two interviews lined up this week').categoryId).toBe('job-search');
    expect(cat('my resumes need a rework for these jobs').categoryId).toBe('job-search');
  });

  it('does not match single-word keywords inside larger words', () => {
    const r = cat('modeling clay for the kids'); // "model" must not match "modeling"
    expect(r.scores['ai-engineering']).toBe(0);
    expect(r.categoryId).toBe(INBOX_ID);
  });

  it('matches single words at punctuation boundaries', () => {
    expect(cat('ship the LLM!').categoryId).toBe('ai-engineering');
  });

  it('is case-insensitive', () => {
    expect(cat('THUMBNAIL IDEA FOR THE NEXT VIDEO').categoryId).toBe('youtube');
  });

  it('assigns Inbox on a tie between top categories', () => {
    // gym(3, personal) vs interview(3, job-search)
    expect(cat('gym before the interview').categoryId).toBe(INBOX_ID);
  });

  it('assigns Inbox when the top score is below the threshold', () => {
    expect(cat('buy milk').categoryId).toBe(INBOX_ID); // buy(1) < 2
  });

  it('respects a custom threshold', () => {
    expect(cat('buy milk', 1).categoryId).toBe('personal');
  });

  it('assigns Inbox when nothing matches or text is blank', () => {
    expect(cat('completely unrelated ramble').categoryId).toBe(INBOX_ID);
    expect(cat('   ').categoryId).toBe(INBOX_ID);
  });

  it('counts a repeated keyword only once', () => {
    const r = cat('gym gym gym');
    expect(r.scores['personal']).toBe(3);
    expect(r.categoryId).toBe('personal');
  });

  it('picks a clear winner when keywords from several categories appear', () => {
    // personal: gym(3) + workout(3) = 6; youtube: video(2)
    expect(cat('record a video about my gym workout').categoryId).toBe('personal');
  });
});
