export type AssistantStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

type Props = {
  status: AssistantStatus;
  reply: string | null;
  speechSupported: boolean;
  speechEnabled: boolean;
  onToggleSpeech: () => void;
  onDismiss: () => void;
};

const DOT: Record<Exclude<AssistantStatus, 'idle'>, string> = {
  listening: 'bg-red-500',
  thinking: 'bg-amber-400',
  speaking: 'bg-cyan-400',
};

export function AssistantBar({ status, reply, speechSupported, speechEnabled, onToggleSpeech, onDismiss }: Props) {
  if (status === 'idle' && !reply) return null;
  return (
    <div className="toast-in pointer-events-auto mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs tracking-wide text-zinc-400">
        {status !== 'idle' ? (
          <span className="flex items-center gap-1.5">
            <span className={`h-2 w-2 animate-pulse rounded-full ${DOT[status]}`} />
            {status}…
          </span>
        ) : (
          <span className="text-zinc-500">assistant</span>
        )}
        {!speechSupported && <span className="text-amber-400/80">voice output unavailable in this browser</span>}
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={onToggleSpeech}
            className="rounded px-1.5 py-0.5 transition-colors hover:bg-white/5"
            title={speechEnabled ? 'Mute spoken replies' : 'Speak replies aloud'}
          >
            {speechEnabled ? '🔊' : '🔇'}
          </button>
          {reply && (
            <button onClick={onDismiss} className="rounded px-1.5 py-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200">
              ✕
            </button>
          )}
        </span>
      </div>
      {reply && <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{reply}</p>}
    </div>
  );
}
