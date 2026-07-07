import { DEFAULT_THRESHOLD, INBOX_ID, type CategoryRule } from './rules';

export type CategorizationResult = {
  categoryId: string;
  /** Score of the winning category (0 if nothing matched). */
  score: number;
  /** Per-category scores, keyed by category id. */
  scores: Record<string, number>;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Single words match on word boundaries, with simple plurals allowed
 * ("interview" matches "interviews" but "model" still ≠ "modeling");
 * multi-word phrases match as substrings ("print on demand").
 * `text` must already be lowercased.
 */
export function matchesKeyword(text: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  if (t.includes(' ')) return text.includes(t);
  return new RegExp(`\\b${escapeRegExp(t)}(?:s|es)?\\b`).test(text);
}

/** Sum of weights of matched keywords. Each keyword counts at most once. */
export function scoreThought(text: string, rule: CategoryRule): number {
  let score = 0;
  for (const { term, weight } of rule.keywords) {
    if (matchesKeyword(text, term)) score += weight;
  }
  return score;
}

/**
 * Highest score wins. Ties at the top, or a top score below `threshold`,
 * fall back to Inbox.
 */
export function categorize(
  rawText: string,
  rules: CategoryRule[],
  threshold: number = DEFAULT_THRESHOLD,
): CategorizationResult {
  const text = rawText.toLowerCase();
  const scores: Record<string, number> = {};
  let best: CategoryRule | null = null;
  let bestScore = 0;
  let tie = false;

  for (const rule of rules) {
    const s = scoreThought(text, rule);
    scores[rule.id] = s;
    if (s > bestScore) {
      best = rule;
      bestScore = s;
      tie = false;
    } else if (s === bestScore && s > 0) {
      tie = true;
    }
  }

  if (!best || tie || bestScore < threshold) {
    return { categoryId: INBOX_ID, score: bestScore, scores };
  }
  return { categoryId: best.id, score: bestScore, scores };
}
