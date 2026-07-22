import type { VoiceCapture } from '../voice/useVoiceCapture';
import type { AssistantStatus } from './AssistantBar';

type Props = {
  name: string;
  voice: VoiceCapture;
  status: AssistantStatus;
  reply: string | null;
  speechSupported: boolean;
  speechEnabled: boolean;
  replyStyle: 'chatty' | 'brief';
  onToggleSpeech: () => void;
  onToggleStyle: () => void;
  onDismiss: () => void;
};

const STATUS_META: Record<Exclude<AssistantStatus, 'idle'>, { dot: string; label: string }> = {
  listening: { dot: 'bg-red-500', label: 'Listening' },
  thinking: { dot: 'bg-amber-400', label: 'Thinking' },
  speaking: { dot: 'bg-cyan-400', label: 'Speaking' },
};

/**
 * The voice hero — a big, inviting mic surface that stands apart from the
 * typing field so it reads as "just say what's on your mind". Owns the live
 * transcript while listening and shows the assistant's reply as a
 * conversation. Fully keyboard/AT accessible.
 */
export function VoicePanel({
  name,
  voice,
  status,
  reply,
  speechSupported,
  speechEnabled,
  replyStyle,
  onToggleSpeech,
  onToggleStyle,
  onDismiss,
}: Props) {
  const listening = voice.listening;
  const meta = status !== 'idle' ? STATUS_META[status] : null;
  const who = name || 'friend';

  const invite = listening
    ? 'I’m listening — say whatever’s on your mind. It saves after a short pause.'
    : `Tap to talk, ${who}. Say anything — an idea, a worry, a to-do — I’ll catch it and sort it.`;

  return (
    <section
      aria-label="Voice assistant"
      className="pointer-events-auto mb-3 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] backdrop-blur-xl"
    >
      <div className="flex items-center gap-4 px-4 py-4 sm:px-5">
        {/* Mic orb */}
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          {listening && (
            <>
              <span className="mic-ring absolute inset-0 rounded-full bg-red-500/25" aria-hidden />
              <span className="mic-ring-2 absolute inset-0 rounded-full bg-red-500/20" aria-hidden />
            </>
          )}
          <button
            type="button"
            onClick={voice.toggle}
            disabled={!voice.supported}
            aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start talking to your brain'}
            title={voice.supported ? (listening ? 'Stop (Ctrl+M)' : 'Talk (Ctrl+M)') : 'Voice needs Chrome or Edge'}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full text-2xl transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${
              listening
                ? 'mic-glow border border-red-400/60 bg-red-500/20 text-red-100'
                : 'mic-breathe border border-cyan-400/30 bg-gradient-to-br from-cyan-400/25 to-violet-500/20 text-cyan-50 hover:from-cyan-400/35 hover:to-violet-500/30'
            }`}
          >
            {listening ? '⏹' : '🎙'}
          </button>
        </div>

        {/* Copy + status */}
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-100">Talk to your brain</h2>
            {meta && (
              <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-medium tracking-wide text-zinc-300">
                <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${meta.dot}`} />
                {meta.label}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-snug text-zinc-400">{invite}</p>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <button
            onClick={onToggleStyle}
            className="rounded-md px-1.5 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            title={
              replyStyle === 'chatty'
                ? 'Talk mode: speaks the full reply. Click for brief.'
                : 'Brief mode: quick confirmation. Click for talk.'
            }
          >
            {replyStyle === 'chatty' ? '💬' : '⚡'}
          </button>
          <button
            onClick={onToggleSpeech}
            className="rounded-md px-1.5 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-100"
            title={speechEnabled ? 'Mute spoken replies' : 'Speak replies aloud'}
            aria-label={speechEnabled ? 'Mute spoken replies' : 'Speak replies aloud'}
          >
            {speechEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </div>

      {/* Live transcript while speaking */}
      {listening && (voice.finalText || voice.interimText) && (
        <div className="border-t border-white/[0.06] px-5 py-3" aria-live="polite">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-100">
            {voice.finalText}
            <span className="text-zinc-500">{voice.interimText}</span>
          </p>
        </div>
      )}

      {/* Assistant reply — the conversation */}
      {reply && (
        <div className="flex items-start gap-2 border-t border-white/[0.06] bg-white/[0.02] px-5 py-3" aria-live="polite">
          <span className="mt-0.5 shrink-0 text-sm" aria-hidden>
            {'🧠'}
          </span>
          <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-zinc-200">{reply}</p>
          <button
            onClick={onDismiss}
            className="shrink-0 rounded px-1.5 py-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            aria-label="Dismiss reply"
          >
            {'✕'}
          </button>
        </div>
      )}

      {/* Fallback / error footer */}
      {(voice.error || !voice.supported) && (
        <div className="border-t border-white/[0.06] px-5 py-2 text-xs">
          {voice.error ? (
            <span className="text-red-400">{voice.error}</span>
          ) : (
            <span className="text-amber-400/90">Voice needs Chrome or Edge. You can still type below.</span>
          )}
        </div>
      )}
      {!speechSupported && speechEnabled && (
        <div className="border-t border-white/[0.06] px-5 py-2 text-xs text-amber-400/80">
          Spoken replies aren&rsquo;t available in this browser — you&rsquo;ll still see them in text.
        </div>
      )}
    </section>
  );
}
