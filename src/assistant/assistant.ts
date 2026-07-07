import { INBOX_ID, type CategoryRule } from '../categorization/rules';
import { significantWords } from '../graph/buildGraph';
import type { Thought } from '../types';

/**
 * Offline rule-based assistant: composes a short, actionable spoken reply for
 * every captured thought. No LLM, no network — intent heuristics + per-category
 * advice templates + related-thought lookup. Pure module, unit-tested.
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
 * Concrete, content-aware plans keyed on the action verb. The follow-up
 * question invites the user to answer by capturing another thought.
 */
const PLAYBOOKS: Playbook[] = [
  {
    pattern: /\b(?:buy|order|purchase)\s+(.{3,60})/i,
    suggestion: (s) => `For the ${s}: compare two or three options, set a price cap, then order from your usual store.`,
    question: (s) => `Which ${s} model, and what's your budget? Say it and I'll capture it.`,
  },
  {
    pattern: /\b(?:call|email|message|text|contact)\s+(.{2,60})/i,
    suggestion: (s) => `Draft the first line to ${s} now — starting is the hard part.`,
    question: () => 'When will you send it? Say the day and I\'ll log it.',
  },
  {
    pattern: /\b(?:fix|debug|refactor|finish|build|improve)\s+(.{3,60})/i,
    suggestion: (s) => `Break ${s} into a first fifteen-minute step and do only that.`,
    question: () => "What's step one? Say it and I'll capture it.",
  },
  {
    pattern: /\b(?:watch|read|learn|study|research)\s+(.{3,60})/i,
    suggestion: (s) => `Give ${s} a twenty-minute slot — small enough to actually happen.`,
    question: () => 'Which evening this week? Tell me and I\'ll note it.',
  },
  {
    pattern: /\b(?:book|schedule|renew|register for)\s+(.{3,60})/i,
    suggestion: (s) => `${s} is two minutes of calendar work — do it now or pin a date.`,
    question: () => 'Which day works? Say it and I\'ll log the deadline.',
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

/** Fallback follow-up question when no playbook matched. Notes get none. */
const INTENT_QUESTION: Record<Intent, string | null> = {
  question: "What are the two options you're weighing? Say them and I'll log both.",
  task: 'When do you want it done by? Tell me and I\'ll note the deadline.',
  idea: "What would version zero look like? Say it while it's fresh.",
  note: null,
};

const CATEGORY_ADVICE: Record<string, Record<Intent, string>> = {
  'ai-engineering': {
    question: 'Spike it: time-box a thirty-minute experiment and capture the answer back here.',
    task: 'Define the eval before touching the model, so you know when you are done.',
    idea: 'Log the baseline first, then try it — ideas without baselines are just vibes.',
    note: 'Worth a line in your experiment log while the context is fresh.',
  },
  youtube: {
    question: 'Check the data before guessing — score the title, then decide.',
    task: 'Slot it against your Monday-Wednesday-Friday cadence so it actually ships.',
    idea: 'Draft the hook first — the first two seconds decide retention.',
    note: 'If it could be a Short, write the on-screen text now while it is vivid.',
  },
  pod: {
    question: 'Search the niche before you decide — demand first, design second.',
    task: 'Batch it into your next design session instead of context-switching now.',
    idea: 'Mock it up in Ideogram and sleep on it before you list it.',
    note: 'Tag it to a niche so you can find it when you batch designs.',
  },
  'job-search': {
    question: 'Answer it by doing: one application or one follow-up today.',
    task: 'Do it today — momentum beats polish in a job search.',
    idea: 'Fold it into your portfolio or your next outreach message.',
    note: 'Add the concrete next step: who to contact, and by when.',
  },
  personal: {
    question: 'Sleep on it, but set a date to decide.',
    task: 'Give it a time slot in your calendar, or it will not happen.',
    idea: 'Nice one — pin a weekend for it.',
    note: 'Logged. Protect the habit that goes with it.',
  },
};

const GENERIC_ADVICE: Record<Intent, string> = {
  question: 'Turn it into one concrete next step and capture that too.',
  task: 'Give it a deadline so it does not rot here.',
  idea: 'Add one more detail while it is fresh — future you will thank you.',
  note: 'Saved. It will come back around in your weekly review.',
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

export function composeReply(thought: Thought, ctx: AssistantContext): string {
  const rule = ctx.rules.find((r) => r.id === thought.categoryId);
  const name = rule?.name ?? 'Inbox';
  const count = ctx.thoughts.filter((t) => t.categoryId === thought.categoryId && t.id !== thought.id).length + 1;
  const intent = detectIntent(thought.text);
  const playbook = findPlaybook(thought.text);
  const parts: string[] = [];

  if (thought.categoryId === INBOX_ID) {
    parts.push("Went to Inbox — tap the pill to reassign it, or teach me a keyword in Rules.");
  } else {
    parts.push(`Filed under ${name} — ${count === 1 ? 'your first one there' : `number ${count} there`}.`);
  }

  // Concrete plan beats generic advice; category advice beats nothing.
  if (playbook) {
    parts.push(playbook.suggestion);
  } else if (thought.categoryId !== INBOX_ID) {
    parts.push((CATEGORY_ADVICE[thought.categoryId] ?? GENERIC_ADVICE)[intent]);
  }

  const related = findRelated(thought.text, ctx.thoughts, thought.id);
  if (related) parts.push(`It connects with an earlier note: “${truncate(related.text, 70)}”.`);

  const question = playbook ? playbook.question : INTENT_QUESTION[intent];
  if (question) parts.push(question);

  return parts.join(' ');
}
