import { useEffect, useRef, useState, type FormEvent } from 'react';
import { sanitizeName } from '../profile';

type Props = {
  onDone: (name: string) => void;
};

/**
 * First-run welcome: asks what the user would like to be called. Accessible
 * modal — focus lands in the input, Enter submits, and a "skip" defaults to a
 * friendly name so no one is blocked from getting in.
 */
export function Onboarding({ onDone }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = sanitizeName(value) || 'friend';
    onDone(name);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0f]/70 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={submit}
        className="modal-in w-full max-w-sm rounded-2xl border border-white/10 bg-[#12121c]/90 p-6 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🧠
          </span>
          <div>
            <h1 id="onboard-title" className="text-lg font-semibold tracking-tight text-zinc-100">
              Hi, I&rsquo;m your mini brain.
            </h1>
            <p className="text-sm text-zinc-400">A quiet place to drop whatever&rsquo;s on your mind.</p>
          </div>
        </div>

        <label htmlFor="onboard-name" className="mb-1.5 block text-sm text-zinc-300">
          What should I call you?
        </label>
        <input
          id="onboard-name"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={24}
          autoComplete="given-name"
          placeholder="A short name…"
          className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-[15px] outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400/40"
        />

        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="flex-1 rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/25 to-violet-500/20 px-4 py-2.5 text-sm font-medium text-cyan-50 transition-colors hover:from-cyan-400/35 hover:to-violet-500/30"
          >
            Let&rsquo;s go{sanitizeName(value) ? `, ${sanitizeName(value)}` : ''}
          </button>
          <button
            type="button"
            onClick={() => onDone('friend')}
            className="rounded-xl px-3 py-2.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Skip
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-zinc-600">
          Stored only in this browser. Change it anytime in ⚙ Rules.
        </p>
      </form>
    </div>
  );
}
