export type CategoryRule = {
  id: string;
  name: string;
  color: string; // tailwind-compatible hex
  keywords: { term: string; weight: number }[]; // weight 1–3
};

export const INBOX_ID = 'inbox';

/** Minimum top score required to leave Inbox. */
export const DEFAULT_THRESHOLD = 2;

/**
 * Seed rules for first run only. After first launch the rules live in
 * IndexedDB (edited via the Rules panel) and this file is never consulted again.
 */
export const seedRules: CategoryRule[] = [
  {
    id: 'ai-engineering',
    name: 'AI Engineering',
    color: '#60a5fa',
    keywords: [
      { term: 'model', weight: 2 },
      { term: 'llm', weight: 3 },
      { term: 'agent', weight: 2 },
      { term: 'prompt', weight: 2 },
      { term: 'fine-tune', weight: 3 },
      { term: 'lora', weight: 3 },
      { term: 'sagemaker', weight: 3 },
      { term: 'latency', weight: 2 },
      { term: 'embedding', weight: 3 },
      { term: 'rag', weight: 3 },
      { term: 'dataset', weight: 2 },
      { term: 'inference', weight: 3 },
      { term: 'gpu', weight: 2 },
      { term: 'mcp', weight: 3 },
      { term: 'eval', weight: 2 },
    ],
  },
  {
    id: 'youtube',
    name: 'YouTube / Content',
    color: '#f87171',
    keywords: [
      { term: 'video', weight: 2 },
      { term: 'short', weight: 2 },
      { term: 'thumbnail', weight: 3 },
      { term: 'hook', weight: 2 },
      { term: 'retention', weight: 3 },
      { term: 'views', weight: 2 },
      { term: 'subscriber', weight: 3 },
      { term: 'script', weight: 2 },
      { term: 'b-roll', weight: 3 },
      { term: 'upload', weight: 2 },
      { term: 'title', weight: 2 },
      { term: 'fidget', weight: 3 },
      { term: '3d print', weight: 3 },
      { term: 'filament', weight: 3 },
      { term: 'bambu', weight: 3 },
    ],
  },
  {
    id: 'pod',
    name: 'POD Business',
    color: '#4ade80',
    keywords: [
      { term: 't-shirt', weight: 3 },
      { term: 'design', weight: 1 },
      { term: 'qikink', weight: 3 },
      { term: 'order', weight: 2 },
      { term: 'niche', weight: 2 },
      { term: 'ideogram', weight: 3 },
      { term: 'mockup', weight: 3 },
      { term: 'listing', weight: 2 },
      { term: 'print on demand', weight: 3 },
      { term: 'webhook', weight: 2 },
      { term: 'store', weight: 2 },
    ],
  },
  {
    id: 'job-search',
    name: 'Job Search',
    color: '#fbbf24',
    keywords: [
      { term: 'job', weight: 2 },
      { term: 'job search', weight: 3 },
      { term: 'apply', weight: 2 },
      { term: 'hiring', weight: 2 },
      { term: 'interview', weight: 3 },
      { term: 'resume', weight: 3 },
      { term: 'application', weight: 2 },
      { term: 'recruiter', weight: 3 },
      { term: 'lpa', weight: 3 },
      { term: 'offer', weight: 2 },
      { term: 'portfolio', weight: 2 },
      { term: 'linkedin', weight: 2 },
      { term: 'referral', weight: 3 },
    ],
  },
  {
    id: 'personal',
    name: 'Personal / Life',
    color: '#c084fc',
    keywords: [
      { term: 'gym', weight: 3 },
      { term: 'workout', weight: 3 },
      { term: 'f1', weight: 3 },
      { term: 'race', weight: 2 },
      { term: 'book', weight: 2 },
      { term: 'health', weight: 2 },
      { term: 'sleep', weight: 2 },
      { term: 'family', weight: 2 },
      { term: 'buy', weight: 1 },
      { term: 'trip', weight: 2 },
    ],
  },
  {
    id: INBOX_ID,
    name: 'Inbox',
    color: '#9ca3af',
    keywords: [],
  },
];
