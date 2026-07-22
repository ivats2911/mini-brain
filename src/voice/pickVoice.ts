/**
 * Choosing a natural, female-sounding voice from whatever the browser exposes.
 * Local OS voices (Microsoft David/Mark, eSpeak) sound robotic; the network /
 * "Natural" / "Neural" voices sound human. We score English voices toward
 * female + natural and pick the best, while letting the user override. Pure
 * module (no DOM), unit-tested against a minimal voice shape.
 */

export type VoiceLike = {
  name: string;
  lang: string;
  voiceURI: string;
  localService: boolean;
};

// Name fragments that signal a female voice across Windows / macOS / Chrome / Android.
const FEMALE = [
  'female', 'zira', 'hazel', 'susan', 'linda', 'heera', 'sonia', 'libby', 'aria', 'jenny',
  'michelle', 'clara', 'natasha', 'samantha', 'karen', 'moira', 'tessa', 'fiona', 'veena',
  'catherine', 'serena', 'kate', 'stephanie', 'joanna', 'salli', 'kimberly', 'ivy', 'kendra',
  'amy', 'emma', 'nicky', 'allison', 'ava', 'susan', 'victoria', 'zoe', 'neerja', 'raveena',
];

// Fragments that signal a male voice (checked after 'female' so the "male" substring is safe).
const MALE = [
  'david', 'mark', 'george', 'james', 'guy', 'ravi', 'prabhat', 'daniel', 'oliver', 'ryan',
  'brandon', 'christopher', 'eric', 'thomas', 'william', 'alex', 'fred', 'rishi', 'liam', 'aaron',
];

// Fragments that signal a higher-quality, more human-sounding engine.
const NATURAL = ['google', 'natural', 'neural', 'online', 'premium', 'enhanced', 'siri'];

function has(name: string, fragments: string[]): boolean {
  return fragments.some((f) => name.includes(f));
}

/** Higher is better. Non-English voices are excluded (−Infinity). */
export function scoreVoice(v: VoiceLike): number {
  const lang = v.lang.replace('_', '-').toLowerCase();
  if (!lang.startsWith('en')) return -Infinity;
  const name = v.name.toLowerCase();

  let score = 0;
  // Female is the headline ask. Check 'female' before the male list so the
  // literal substring "male" inside "female" never counts against it.
  if (name.includes('female')) score += 6;
  else if (has(name, FEMALE)) score += 6;
  else if (has(name, MALE)) score -= 6;

  if (!v.localService) score += 4; // network voices are far more natural
  if (has(name, NATURAL)) score += 3;
  if (lang === 'en-gb') score += 2; // a British lady, per the ask
  else if (lang === 'en-in' || lang === 'en-us' || lang === 'en-au') score += 1;

  return score;
}

/** English voices, best-first. */
export function sortVoices(voices: VoiceLike[]): VoiceLike[] {
  return voices
    .filter((v) => scoreVoice(v) !== -Infinity)
    .map((v, i) => ({ v, i, s: scoreVoice(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v);
}

/** The single best natural female English voice, or null if none qualify. */
export function bestVoice(voices: VoiceLike[]): VoiceLike | null {
  return sortVoices(voices)[0] ?? null;
}
