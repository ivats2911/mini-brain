import { useCallback, useEffect, useRef, useState } from 'react';
import { bestVoice, sortVoices } from './pickVoice';

const PREF_KEY = 'mini-brain:speak-replies';
const VOICE_KEY = 'mini-brain:voice';

export type Speaker = {
  supported: boolean;
  speaking: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** English voices, best (most natural + female) first. */
  voices: SpeechSynthesisVoice[];
  /** voiceURI of the current voice, or null while none is chosen. */
  voiceURI: string | null;
  setVoiceURI: (uri: string) => void;
  speak: (text: string) => void;
  cancel: () => void;
};

/**
 * Text-to-speech over the built-in Web Speech API (speechSynthesis) — free,
 * offline-capable, no services. Defaults to the most natural female English
 * voice the browser exposes (Chrome's network "Google UK English Female",
 * Windows "Microsoft Sonia/Aria", macOS "Samantha", …) instead of the robotic
 * local default, and lets the user pick another. Browsers gate audio behind a
 * user gesture, so the first pointer/key interaction primes the synth with a
 * silent utterance; every later speak() then starts reliably.
 */
export function useSpeaker(): Speaker {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const [enabled, setEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREF_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(VOICE_KEY);
    } catch {
      return null;
    }
  });
  const unlockedRef = useRef(false);

  const setEnabled = useCallback(
    (v: boolean) => {
      setEnabledState(v);
      try {
        localStorage.setItem(PREF_KEY, v ? '1' : '0');
      } catch {
        // private mode etc. — preference just won't persist
      }
      if (!v && supported) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
    },
    [supported],
  );

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri);
    try {
      localStorage.setItem(VOICE_KEY, uri);
    } catch {
      // preference just won't persist
    }
  }, []);

  // Voices load asynchronously. Sort English voices best-first and, if the user
  // hasn't chosen one, default to the most natural female voice available.
  useEffect(() => {
    if (!supported) return;
    const refresh = () => {
      const all = window.speechSynthesis.getVoices();
      const ranked = sortVoices(all) as SpeechSynthesisVoice[];
      setVoices(ranked);
      setVoiceURIState((current) => {
        if (current && ranked.some((v) => v.voiceURI === current)) return current;
        const best = bestVoice(all) as SpeechSynthesisVoice | null;
        return best?.voiceURI ?? current;
      });
    };
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, [supported]);

  // Unlock audio on the first user interaction with a silent utterance.
  useEffect(() => {
    if (!supported) return;
    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.resume();
      window.speechSynthesis.speak(u);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const chosen = voiceURI ? synth.getVoices().find((v) => v.voiceURI === voiceURI) : undefined;
      if (chosen) {
        u.voice = chosen;
        u.lang = chosen.lang;
      } else {
        u.lang = 'en-GB';
      }
      // A touch slower and slightly higher than default reads as a warmer,
      // more natural human cadence rather than a clipped robotic one.
      u.rate = 0.97;
      u.pitch = 1.06;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.resume(); // Chrome sometimes leaves the queue paused
      synth.speak(u);
    },
    [supported, voiceURI],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, enabled, setEnabled, voices, voiceURI, setVoiceURI, speak, cancel };
}
