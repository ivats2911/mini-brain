import { describe, expect, it } from 'vitest';
import { bestVoice, scoreVoice, sortVoices, type VoiceLike } from './pickVoice';

const v = (name: string, lang: string, localService = true): VoiceLike => ({
  name,
  lang,
  voiceURI: name,
  localService,
});

describe('scoreVoice', () => {
  it('excludes non-English voices', () => {
    expect(scoreVoice(v('Google Deutsch', 'de-DE'))).toBe(-Infinity);
  });

  it('scores a female name above a male one', () => {
    expect(scoreVoice(v('Microsoft Sonia', 'en-GB'))).toBeGreaterThan(scoreVoice(v('Microsoft David', 'en-US')));
  });

  it('does not treat the "male" inside "female" as male', () => {
    expect(scoreVoice(v('Google UK English Female', 'en-GB', false))).toBeGreaterThan(0);
  });

  it('rewards natural / network voices over local ones', () => {
    const network = scoreVoice(v('Google US English', 'en-US', false));
    const local = scoreVoice(v('English United States', 'en-US', true));
    expect(network).toBeGreaterThan(local);
  });
});

describe('bestVoice', () => {
  it('picks the natural female British voice from a realistic Windows+Chrome set', () => {
    const voices = [
      v('Microsoft David - English (United States)', 'en-US', true),
      v('Microsoft Zira - English (United States)', 'en-US', true),
      v('Google UK English Female', 'en-GB', false),
      v('Google UK English Male', 'en-GB', false),
      v('Google US English', 'en-US', false),
    ];
    expect(bestVoice(voices)?.name).toBe('Google UK English Female');
  });

  it('returns null when no English voice exists', () => {
    expect(bestVoice([v('Google 日本語', 'ja-JP')])).toBeNull();
  });

  it('still returns a female local voice when no network voice is present', () => {
    const voices = [v('Microsoft David', 'en-US'), v('Microsoft Zira', 'en-US')];
    expect(bestVoice(voices)?.name).toBe('Microsoft Zira');
  });
});

describe('sortVoices', () => {
  it('drops non-English and orders best-first', () => {
    const voices = [
      v('Microsoft Mark', 'en-US', true),
      v('Google Français', 'fr-FR', false),
      v('Google UK English Female', 'en-GB', false),
    ];
    const sorted = sortVoices(voices);
    expect(sorted.map((x) => x.name)).toEqual(['Google UK English Female', 'Microsoft Mark']);
  });
});
