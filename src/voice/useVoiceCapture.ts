import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceCaptureOptions = {
  lang?: string;
  /** Silence gap after which the pending transcript auto-saves as one thought. */
  silenceMs?: number;
  onThought: (text: string) => void;
};

export type VoiceCapture = {
  supported: boolean;
  listening: boolean;
  /** Finalized transcript of the thought currently being dictated. */
  finalText: string;
  /** Interim (not yet finalized) transcript — render greyed. */
  interimText: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  /** Temporarily mute recognition (e.g. while the app speaks) without leaving voice mode. */
  pause: () => void;
  resume: () => void;
};

/**
 * Continuous hands-free capture over webkitSpeechRecognition.
 * Chrome kills continuous recognition after silence, so onend auto-restarts
 * while the user still wants to listen. A ~2.5s silence gap flushes the
 * buffered transcript as one thought and keeps listening for the next.
 */
export function useVoiceCapture(options: VoiceCaptureOptions): VoiceCapture {
  const { lang = 'en-IN', silenceMs = 2500, onThought } = options;

  const [listening, setListening] = useState(false);
  const [finalText, setFinalText] = useState('');
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const activeRef = useRef(false); // user intent: keep listening across auto-restarts
  const suspendedRef = useRef(false); // muted while the app itself is speaking
  const bufferRef = useRef('');
  const interimRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const onThoughtRef = useRef(onThought);

  useEffect(() => {
    onThoughtRef.current = onThought;
  }, [onThought]);

  const supported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const flush = useCallback(() => {
    clearSilenceTimer();
    // Fall back to interim text in case Chrome never finalized before the gap.
    const text = bufferRef.current.trim() || interimRef.current.trim();
    bufferRef.current = '';
    interimRef.current = '';
    setFinalText('');
    setInterimText('');
    if (text) onThoughtRef.current(text);
  }, [clearSilenceTimer]);

  const resetSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = window.setTimeout(() => {
      silenceTimerRef.current = null;
      flush();
    }, silenceMs);
  }, [clearSilenceTimer, flush, silenceMs]);

  const stop = useCallback(() => {
    activeRef.current = false;
    flush();
    recognitionRef.current?.stop();
    setListening(false);
  }, [flush]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser — try Chrome or Edge.');
      return;
    }
    setError(null);
    activeRef.current = true;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) {
          bufferRef.current += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      interimRef.current = interim;
      setFinalText(bufferRef.current);
      setInterimText(interim);
      if (bufferRef.current.trim() || interim.trim()) resetSilenceTimer();
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access was denied. Allow mic access and try again.');
        activeRef.current = false;
        setListening(false);
      }
      // 'no-speech', 'aborted', 'network' etc. fall through to onend,
      // which restarts recognition while still active.
    };

    recognition.onend = () => {
      if (activeRef.current && !suspendedRef.current) {
        window.setTimeout(() => {
          if (!activeRef.current) return;
          try {
            recognition.start();
          } catch {
            // already restarted
          }
        }, 250);
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError('Could not start speech recognition.');
      activeRef.current = false;
    }
  }, [lang, resetSilenceTimer]);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  const pause = useCallback(() => {
    if (!activeRef.current || suspendedRef.current) return;
    suspendedRef.current = true;
    clearSilenceTimer();
    // Drop whatever the mic caught so the app's own voice is never saved.
    bufferRef.current = '';
    interimRef.current = '';
    setFinalText('');
    setInterimText('');
    recognitionRef.current?.abort();
  }, [clearSilenceTimer]);

  const resume = useCallback(() => {
    if (!suspendedRef.current) return;
    suspendedRef.current = false;
    if (activeRef.current) {
      try {
        recognitionRef.current?.start();
      } catch {
        // already running
      }
    }
  }, []);

  useEffect(
    () => () => {
      activeRef.current = false;
      clearSilenceTimer();
      recognitionRef.current?.abort();
    },
    [clearSilenceTimer],
  );

  return { supported, listening, finalText, interimText, error, start, stop, toggle, pause, resume };
}
