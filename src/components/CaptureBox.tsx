import { useState, type KeyboardEvent, type RefObject } from 'react';

type Props = {
  onSave: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
};

/** Typed capture. The voice path lives in VoicePanel, above this. */
export function CaptureBox({ onSave, inputRef }: Props) {
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
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-[border-color,box-shadow] duration-300 focus-within:border-cyan-400/30 focus-within:shadow-[0_0_40px_-12px_rgba(34,211,238,0.35)]">
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        aria-label="Type a thought"
        placeholder="…or type a thought here"
        className="block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-zinc-600"
      />
      <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-3 py-2 text-xs tracking-wide text-zinc-500">
        <span>Ctrl+Enter to save · Ctrl+K to focus · Ctrl+M for voice</span>
        <button
          type="button"
          onClick={save}
          disabled={!text.trim()}
          className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 font-medium text-zinc-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
