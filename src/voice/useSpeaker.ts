import { useCallback, useEffect, useRef, useState } from 'react';

const PREF_KEY = 'mini-brain:speak-replies';

export type Speaker = {
  supported: boolean;
  speaking: boolean;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
};

/**
 * Text-to-speech over the built-in Web Speech API (speechSynthesis) — free,
 * offline-capable, no services. Prefers a British English voice when the
 * system has one. Browsers gate audio behind a user gesture, so the first
 * pointer/key interaction primes the synth with a silent utterance; every
 * later speak() then starts reliably.
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
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
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

  // Voices load asynchronously; pick (and re-pick) a British one when they arrive.
  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => v.lang.replace('_', '-') === 'en-GB' && v.name.includes('Google')) ??
        voices.find((v) => v.lang.replace('_', '-') === 'en-GB') ??
        voices.find((v) => v.lang.startsWith('en')) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pick);
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
      if (voiceRef.current) u.voice = voiceRef.current;
      u.lang = voiceRef.current?.lang ?? 'en-GB';
      u.rate = 1.03;
      u.pitch = 1;
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      synth.resume(); // Chrome sometimes leaves the queue paused
      synth.speak(u);
    },
    [supported],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, enabled, setEnabled, speak, cancel };
}
