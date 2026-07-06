import { useState, type KeyboardEvent, type RefObject } from 'react';
import type { VoiceCapture } from '../voice/useVoiceCapture';

type Props = {
  onSave: (text: string) => void;
  voice: VoiceCapture;
  inputRef: RefObject<HTMLTextAreaElement>;
};

export function CaptureBox({ onSave, voice, inputRef }: Props) {
  const [text, setText] = useState('');

  const save = () => {
    const t = text.trim();
    if (!t) return;
    onSave(t);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 focus-within:border-zinc-600">
      {voice.listening ? (
        <div className="min-h-[92px] whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">
          {voice.finalText}
          <span className="text-zinc-500">{voice.interimText}</span>
          {!voice.finalText && !voice.interimText && (
            <span className="text-zinc-600">Listening… speak a thought; it saves after a pause.</span>
          )}
        </div>
      ) : (
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder="Dump a thought…"
          className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-zinc-600"
        />
      )}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-800/60 px-3 py-2 text-xs text-zinc-500">
        <span>
          {voice.error ? (
            <span className="text-red-400">{voice.error}</span>
          ) : !voice.supported ? (
            <span className="text-amber-400">Voice needs Chrome/Edge (Web Speech API missing)</span>
          ) : voice.listening ? (
            <span className="flex items-center gap-2 text-red-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Listening — pause ~2.5s to save, keep talking for the next thought
            </span>
          ) : (
            'Ctrl+Enter save · Ctrl+K focus · Ctrl+M voice'
          )}
        </span>
        <button
          type="button"
          onClick={voice.toggle}
          disabled={!voice.supported}
          title={voice.supported ? 'Toggle voice capture (Ctrl+M)' : 'Web Speech API not supported in this browser'}
          className={`shrink-0 rounded-md border px-2.5 py-1 font-medium transition-colors ${
            voice.listening
              ? 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
              : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40'
          }`}
        >
          🎤 {voice.listening ? 'Stop' : 'Voice'}
        </button>
      </div>
    </div>
  );
}
