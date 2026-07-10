import { INBOX_ID, type CategoryRule } from '../categorization/rules';
import type { CategorizationResult } from '../categorization/engine';
import { significantWords } from '../graph/buildGraph';
import type { Thought } from '../types';

/**
 * Offline rule-based assistant: composes a short, actionable reply for every
 * captured thought. No LLM, no network — intent heuristics + per-category
 * advice templates + related-thought lookup. Pure module, unit-tested.
 *
 * Persona: the voice of the brain itself — a dry, technically-literate
 * version of the user. Economical, deadpan, zero filler. One good line beats
 * three bland ones. Rib, never gush. It's templated wit, so every line here
 * has to earn its place.
 */

export type Intent = 'question' | 'task' | 'idea' | 'note';

export type AssistantContext = {
  rules: CategoryRule[];
  /** Existing thoughts (the new one may or may not be included; it is excluded by id). */
  thoughts: Thought[];
};

export function detectIntent(text: string): Intent {
  const t = text.trim().toLowerCase();
  if (/^idea[:\s]/.test(t) || /\b(what if|could make|maybe (make|build|try)|concept for)\b/.test(t)) return 'idea';
  if (/\?\s*$/.test(t) || /^(how|what|why|when|where|which|should|can|could|is it|are|do i|does|will)\b/.test(t)) return 'question';
  if (
    /\b(need to|have to|must|remember to|don'?t forget|to-?do|deadline|i want to|i should)\b/.test(t) ||
    /^(buy|call|email|send|fix|update|finish|book|order|apply|upload|schedule|renew|pay|print)\b/.test(t)
  ) {
    return 'task';
  }
  return 'note';
}

/** Trim a captured subject phrase down to something speakable. */
function cleanSubject(raw: string): string {
  const s = raw
    .replace(/[.!?,;].*$/, '')
    .replace(/^\s*(a|an|the|some|my|that|this|new)\s+/i, '')
    .trim();
  return s.split(/\s+/).slice(0, 5).join(' ');
}

type Playbook = {
  pattern: RegExp;
  suggestion: (subject: string) => string;
  question: (subject: string) => string;
};

/**
 * Concrete plans keyed on the action verb. The follow-up question invites the
 * user to answer by capturing another thought.
 */
const PLAYBOOKS: Playbook[] = [
  {
    pattern: /\b(?:buy|order|purchase)\s+(.{3,60})/i,
    suggestion: (s) => `${s}: two or three options, a price cap, order. Not a research project.`,
    question: () => `Model and budget — say it, I'll file it.`,
  },
  {
    pattern: /\b(?:call|email|message|text|contact)\s+(.{2,60})/i,
    suggestion: (s) => `Draft the first line to ${s} now. That's the whole battle.`,
    question: () => `When's it going out?`,
  },
  {
    pattern: /\b(?:fix|debug|refactor|finish|build|improve)\s+(.{3,60})/i,
    suggestion: (s) => `First fifteen-minute step on ${s}. Just that one.`,
    question: () => `What's step one?`,
  },
  {
    pattern: /\b(?:watch|read|learn|study|research)\s+(.{3,60})/i,
    suggestion: (s) => `Twenty minutes on ${s} — small enough to survive contact with your calendar.`,
    question: () => `Which evening?`,
  },
  {
    pattern: /\b(?:book|schedule|renew|register for)\s+(.{3,60})/i,
    suggestion: (s) => `${s} is two minutes of admin. Do it now or pin the date.`,
    question: () => `Which day?`,
  },
];

function findPlaybook(text: string): { suggestion: string; question: string } | undefined {
  for (const pb of PLAYBOOKS) {
    const m = text.match(pb.pattern);
    if (m) {
      const subject = cleanSubject(m[1]);
      if (subject) return { suggestion: pb.suggestion(subject), question: pb.question(subject) };
    }
  }
  return undefined;
}

const CATEGORY_ADVICE: Record<string, Record<Intent, string>> = {
  'ai-engineering': {
    question: 'Time-box a thirty-minute spike. Opinions are free; data costs half an hour.',
    task: 'Define the eval first, or "done" stays a vibe.',
    idea: 'Baseline first, then the clever bit. In that order.',
    note: 'Put it in the experiment log before the context evaporates.',
  },
  youtube: {
    question: 'Score it before you overthink it. The data does not care about your gut.',
    task: 'Pin it to Monday, Wednesday or Friday, or it joins the graveyard of later.',
    idea: 'Hook first. Nobody watches second two if second one is boring.',
    note: 'If it could be a Short, write the on-screen text now. Future you is lazier.',
  },
  pod: {
    question: 'Demand first, design second. The other order is how stores die.',
    task: 'Batch it with the next design session. Context switches are not free.',
    idea: 'Mock it in Ideogram and sleep on it. The good half survives the night.',
    note: 'Tag the niche or you will never find it again.',
  },
  'job-search': {
    question: 'One application answers more than a week of wondering.',
    task: 'Today. Momentum beats polish in a job hunt.',
    idea: 'Portfolio or outreach — pick where it lands.',
    note: 'Add the who and the when, or it is just a mood.',
  },
  personal: {
    question: 'Sleep on it. Set a date to stop sleeping on it.',
    task: 'Calendar slot or it does not exist.',
    idea: 'Pin a weekend to it.',
    note: 'Noted. Guard the habit.',
  },
};

const GENERIC_ADVICE: Record<Intent, string> = {
  question: 'Turn it into one next step and file that too.',
  task: 'Deadline, or it rots here.',
  idea: 'One more detail while it is fresh.',
  note: 'Filed. The weekly review can deal with it.',
};

/** Fallback follow-up question when no playbook matched. Notes get none. */
const INTENT_QUESTION: Record<Intent, string | null> = {
  question: "What are the two options? Say them, I'll hold both.",
  task: "When by? Tell me and I'll file the deadline.",
  idea: "What's version zero? Say it while it's warm.",
  note: null,
};

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

/** Most recent earlier thought sharing at least one significant word. */
export function findRelated(text: string, thoughts: Thought[], excludeId: string): Thought | undefined {
  const words = significantWords(text);
  if (words.size === 0) return undefined;
  for (const t of thoughts) {
    if (t.id === excludeId) continue;
    const other = significantWords(t.text);
    for (const w of words) {
      if (other.has(w)) return t;
    }
  }
  return undefined;
}

/** Explain WHY a thought landed in Inbox, so tuning rules is never guesswork. */
function inboxLine(rules: CategoryRule[], result?: CategorizationResult): string {
  if (result) {
    const entries = Object.entries(result.scores)
      .filter(([id]) => id !== INBOX_ID)
      .sort((a, b) => b[1] - a[1]);
    const top = entries[0];
    if (top && top[1] > 0) {
      const name = (id: string) => rules.find((r) => r.id === id)?.name ?? id;
      const tied = entries.filter(([, s]) => s === top[1]);
      if (tied.length > 1) {
        return `Inbox — ${name(tied[0][0])} and ${name(tied[1][0])} tied, and I don't do coin flips. The pill's right there.`;
      }
      return `Inbox — ${name(top[0])} came closest but missed the bar. One decent keyword in Rules fixes that.`;
    }
  }
  return 'Inbox. Nothing matched — teach me a keyword in Rules, or enjoy the mystery pile.';
}

export type ComposeOptions = {
  /** Categorization scores, for explaining Inbox outcomes. */
  result?: CategorizationResult;
  /** One short sentence only — used for speech while the mic is muted. */
  brief?: boolean;
};

export function composeReply(thought: Thought, ctx: AssistantContext, opts: ComposeOptions = {}): string {
  const rule = ctx.rules.find((r) => r.id === thought.categoryId);
  const name = rule?.name ?? 'Inbox';
  const count = ctx.thoughts.filter((t) => t.categoryId === thought.categoryId && t.id !== thought.id).length + 1;
  const intent = detectIntent(thought.text);
  const playbook = findPlaybook(thought.text);
  const parts: string[] = [];

  if (thought.categoryId === INBOX_ID) {
    parts.push(inboxLine(ctx.rules, opts.result));
  } else {
    parts.push(`${name}. ${count === 1 ? 'First one — historic.' : `Number ${count}.`}`);
  }

  if (opts.brief) return parts[0];

  // Concrete plan beats generic advice; category advice beats nothing.
  if (playbook) {
    parts.push(playbook.suggestion);
  } else if (thought.categoryId !== INBOX_ID) {
    parts.push((CATEGORY_ADVICE[thought.categoryId] ?? GENERIC_ADVICE)[intent]);
  }

  const related = findRelated(thought.text, ctx.thoughts, thought.id);
  if (related) parts.push(`Ties back to “${truncate(related.text, 70)}”. You have a theme.`);

  const question = playbook ? playbook.question : INTENT_QUESTION[intent];
  if (question) parts.push(question);

  return parts.join(' ');
}

/**
 * One dry line on page load, with the real thought count. `rand` is
 * injectable so tests stay deterministic.
 */
export function bootGreeting(count: number, name?: string, rand: number = Math.random()): string {
  if (count === 0) {
    return `Empty. Zero thoughts — bold starting position${name ? `, ${name}` : ''}.`;
  }
  const variants = [
    `${count} thought${count === 1 ? '' : 's'} in here. Ambitious of you to call this a brain.`,
    `${count} thought${count === 1 ? '' : 's'} on file${name ? `, ${name}` : ''}. I've read them all. We should talk about the Inbox.`,
    `Back again. ${count} thought${count === 1 ? '' : 's'}, none of them about finishing the last one.`,
    `${count} in the vault. Say something worth filing.`,
  ];
  return variants[Math.min(variants.length - 1, Math.floor(rand * variants.length))];
}
