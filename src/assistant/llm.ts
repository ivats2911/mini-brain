import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';

/**
 * Optional LLM-powered replies. Opt-in via the Rules panel: the user pastes
 * their own API key (stored only in this browser's localStorage) and each
 * captured thought — plus recent context — is sent directly from the browser
 * to the provider. When disabled or failing, the offline rule-based
 * assistant (assistant.ts) answers instead.
 */

export type AIProvider = 'openai' | 'anthropic';

export type AISettings = {
  enabled: boolean;
  provider: AIProvider;
  apiKey: string;
  model: string;
};

export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-opus-4-8',
};

const STORE_KEY = 'mini-brain:ai';
const RECENT_LIMIT = 15;
const TIMEOUT_MS = 20_000;

// On the dev server, go through Vite's same-origin proxy (vite.config.ts) so the
// authorization header never rides a cross-origin request; production builds
// call the providers directly.
const OPENAI_URL = import.meta.env.DEV
  ? '/ai-proxy/openai/v1/chat/completions'
  : 'https://api.openai.com/v1/chat/completions';
const ANTHROPIC_URL = import.meta.env.DEV
  ? '/ai-proxy/anthropic/v1/messages'
  : 'https://api.anthropic.com/v1/messages';

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AISettings>;
      const provider: AIProvider = p.provider === 'anthropic' ? 'anthropic' : 'openai';
      return {
        enabled: p.enabled === true,
        provider,
        apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
        model: typeof p.model === 'string' && p.model.trim() ? p.model : DEFAULT_MODELS[provider],
      };
    }
  } catch {
    // no localStorage (tests/private mode) or corrupt JSON — fall through
  }
  return { enabled: false, provider: 'openai', apiKey: '', model: DEFAULT_MODELS.openai };
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // preference just won't persist
  }
}

/** The persona: a dry, deadpan version of the user who lives inside the notes. */
export function buildSystemPrompt(name: string): string {
  return [
    `You are the voice of ${name}'s "mini brain" — a personal thought-capture app. You are not an assistant and not a butler: you are a dry, technically-literate version of ${name}, the sharp friend who has read every note in here and is not impressed by any of it.`,
    '',
    'Voice: dry, economical, quietly funny. Short sentences. No filler openers ("So,", "Great question", "Let me"). One well-timed observation beats three bland ones. Rib him gently, never meanly. Address him by name occasionally, not every line.',
    '',
    'You receive each new thought as he captures it, plus his recent thoughts for context. Reply with one to three short sentences that do real work: a concrete next step, a pattern or contradiction across his notes, or one sharp question that moves the thought forward. Never recite the thought back — he can read it on screen. If it connects to an earlier note, say so.',
    '',
    `Context about ${name}: AI engineer; runs the Kreyon Works 3D-printing YouTube channel; sells print-on-demand designs; currently job hunting.`,
    '',
    'Output rules: plain text only — your reply is spoken aloud via TTS. No markdown, no emoji, no lists, no headings, and do not wrap the reply in quotes.',
  ].join('\n');
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max).trimEnd()}…`;
}

export function buildUserPrompt(
  thought: Thought,
  ctx: { rules: CategoryRule[]; thoughts: Thought[] },
): string {
  const name = (id: string) => ctx.rules.find((r) => r.id === id)?.name ?? 'Inbox';
  const count = ctx.thoughts.filter((t) => t.categoryId === thought.categoryId && t.id !== thought.id).length + 1;
  const recent = ctx.thoughts
    .filter((t) => t.id !== thought.id)
    .slice(0, RECENT_LIMIT)
    .map((t) => `- [${name(t.categoryId)}] ${truncate(t.text, 120)}`);
  const lines = [
    `New thought, just captured (auto-filed under ${name(thought.categoryId)}, number ${count} there, via ${
      thought.source === 'voice' ? 'voice' : thought.source === 'remote' ? 'his phone' : 'keyboard'
    }):`,
    `"${truncate(thought.text, 400)}"`,
  ];
  if (recent.length > 0) {
    lines.push('', 'Recent thoughts, newest first:', ...recent);
  }
  lines.push('', 'Reply now.');
  return lines.join('\n');
}

/** Read the provider's error body and build a human-diagnosable message. */
async function providerError(providerName: string, res: Response): Promise<Error> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    detail = body.error?.message ?? body.error?.code ?? '';
  } catch {
    // non-JSON error body
  }
  const hint =
    res.status === 401
      ? 'invalid API key'
      : res.status === 429
        ? 'rate limit or no credit on the key — check the provider billing page'
        : res.status === 404
          ? 'unknown model id'
          : res.status === 403
            ? 'key lacks permission'
            : '';
  return new Error(
    `${providerName} ${res.status}${hint ? ` (${hint})` : ''}${detail ? `: ${truncate(detail, 160)}` : ''}`,
  );
}

/** Turn any thrown value into a short, human-readable diagnosis. */
export function describeError(err: unknown): string {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return 'timed out after 20s';
  }
  if (err instanceof TypeError) {
    return 'network error — check your connection, or the key contains stray spaces/newlines';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'unknown error';
}

/** Call the configured provider directly from the browser. Throws on any failure. */
export async function generateReply(settings: AISettings, system: string, user: string): Promise<string> {
  const apiKey = settings.apiKey.trim();
  const model = settings.model.trim() || DEFAULT_MODELS[settings.provider];
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (settings.provider === 'anthropic') {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // required for direct browser calls to the Anthropic API
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw await providerError('Anthropic', res);
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
        stop_reason?: string;
      };
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join(' ')
        .trim();
      if (!text) throw new Error(data.stop_reason === 'refusal' ? 'Model declined to reply' : 'Empty reply');
      return text;
    }

    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw await providerError('OpenAI', res);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Empty reply');
    return text;
  } finally {
    window.clearTimeout(timer);
  }
}

/** One tiny round-trip to verify key + model. Returns the model's reply; throws with a diagnosis. */
export async function testAIConnection(settings: AISettings): Promise<string> {
  return generateReply(settings, 'Reply with exactly: ok', 'ping');
}
