import { useState, type KeyboardEvent, type RefObject } from 'react';
import type { VoiceCapture } from '../voice/useVoiceCapture';

export type AssistantStatus = 'idle' | 'listening' | 'thinking' | 'speaking';

type Props = {
  name: string;
  onSave: (text: string) => void;
  inputRef: RefObject<HTMLTextAreaElement>;
  voice: VoiceCapture;
  status: AssistantStatus;
  reply: string | null;
  onDismissReply: () => void;
  speechSupported: boolean;
  speechEnabled: boolean;
  onToggleSpeech: () => void;
  replyStyle: 'chatty' | 'brief';
  onToggleStyle: () => void;
  voices: SpeechSynthesisVoice[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
  onPreviewVoice: () => void;
};

const STATUS: Record<Exclude<AssistantStatus, 'idle'>, { dot: string; label: string }> = {
  listening: { dot: 'bg-red-500', label: 'Listening — just talk' },
  thinking: { dot: 'bg-amber-400', label: 'Thinking…' },
  speaking: { dot: 'bg-cyan-400', label: 'Speaking…' },
};

/**
 * The single, unified capture surface: one clean card holding the text field
 * and an inline mic, with voice settings tucked behind a gear and the
 * assistant's reply shown below as a soft bubble. Replaces the old two-card
 * VoicePanel + CaptureBox stack.
 */
export function CaptureCard({
  name,
  onSave,
  inputRef,
  voice,
  status,
  reply,
  onDismissReply,
  speechSupported,
  speechEnabled,
  onToggleSpeech,
  replyStyle,
  onToggleStyle,
  voices,
  voiceURI,
  onVoiceChange,
  onPreviewVoice,
}: Props) {
  const [text, setText] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const listening = voice.listening;
  const meta = status !== 'idle' ? STATUS[status] : null;

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
    <div className="pointer-events-auto">
      {/* Capture card */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_8px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-[border-color,box-shadow] duration-300 focus-within:border-cyan-400/30 focus-within:shadow-[0_0_44px_-14px_rgba(34,211,238,0.35)]">
        <div className="flex items-start gap-2 px-4 pt-3.5">
          {listening ? (
            <p
              className="min-h-[64px] flex-1 whitespace-pre-wrap py-0.5 text-[16px] leading-relaxed"
              aria-live="polite"
            >
              {voice.finalText}
              <span className="text-zinc-500">{voice.interimText}</span>
              {!voice.finalText && !voice.interimText && (
                <span className="text-zinc-500">I&rsquo;m listening — say whatever&rsquo;s on your mind.</span>
              )}
            </p>
          ) : (
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              aria-label="Write a thought"
              placeholder={`What's on your mind${name ? `, ${name}` : ''}?`}
              className="min-h-[64px] flex-1 resize-none bg-transparent py-0.5 text-[16px] leading-relaxed outline-none placeholder:text-zinc-500"
            />
          )}

          {/* Inline mic */}
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
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
              aria-label={listening ? 'Stop listening' : 'Talk instead of typing'}
              title={voice.supported ? (listening ? 'Stop (Ctrl+M)' : 'Talk (Ctrl+M)') : 'Voice needs Chrome or Edge'}
              className={`relative flex h-11 w-11 items-center justify-center rounded-full text-lg transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-40 ${
                listening
                  ? 'border border-red-400/60 bg-red-500/20 text-red-100'
                  : 'border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-violet-500/15 text-cyan-50 hover:from-cyan-400/30 hover:to-violet-500/25'
              }`}
            >
              {listening ? '⏹' : '🎙'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2 text-xs text-zinc-500">
          {meta ? (
            <span className="flex items-center gap-1.5 font-medium tracking-wide text-zinc-300">
              <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          ) : (
            <span className="tracking-wide">Ctrl+Enter to save · Ctrl+M to talk</span>
          )}

          <span className="relative ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-label="Voice settings"
              aria-expanded={settingsOpen}
              className="rounded-md px-1.5 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
              title="Voice settings"
            >
              ⚙
            </button>
            {settingsOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Close voice settings"
                  onClick={() => setSettingsOpen(false)}
                />
                <div className="brain-panel absolute bottom-8 right-0 z-20 w-64 rounded-xl border border-white/10 bg-[#12121c]/95 p-3 text-xs shadow-2xl backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-zinc-300">Speak replies aloud</span>
                    <button
                      onClick={onToggleSpeech}
                      role="switch"
                      aria-checked={speechEnabled}
                      className={`h-5 w-9 rounded-full border transition-colors ${
                        speechEnabled ? 'border-cyan-400/40 bg-cyan-400/30' : 'border-white/15 bg-white/5'
                      }`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition-transform ${
                          speechEnabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-zinc-300">Reply length</span>
                    <button
                      onClick={onToggleStyle}
                      className="rounded-md border border-white/10 px-2 py-0.5 text-zinc-300 transition-colors hover:bg-white/5"
                      title={replyStyle === 'chatty' ? 'Full spoken reply' : 'Short confirmation'}
                    >
                      {replyStyle === 'chatty' ? '💬 Full' : '⚡ Brief'}
                    </button>
                  </div>
                  {speechSupported && voices.length > 0 ? (
                    <div>
                      <div className="mb-1 text-zinc-300">Voice</div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={voiceURI ?? ''}
                          onChange={(e) => onVoiceChange(e.target.value)}
                          aria-label="Choose the assistant's voice"
                          className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-black/30 px-2 py-1 outline-none focus:border-cyan-400/30"
                        >
                          {voices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={onPreviewVoice}
                          className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-zinc-300 transition-colors hover:bg-white/5"
                          title="Hear this voice"
                        >
                          ▶
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-zinc-500">Spoken replies need Chrome or Edge.</p>
                  )}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={save}
              disabled={!text.trim() || listening}
              className="rounded-md border border-white/10 px-2.5 py-1 font-medium text-zinc-200 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Save
            </button>
          </span>
        </div>
      </div>

      {/* Voice fallback / errors */}
      {(voice.error || !voice.supported) && (
        <p className="mt-1.5 px-1 text-xs text-amber-400/80">
          {voice.error ?? 'Voice needs Chrome or Edge — you can still type.'}
        </p>
      )}

      {/* Assistant reply — soft bubble */}
      {reply && (
        <div className="brain-panel mt-2 flex items-start gap-2.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 backdrop-blur" aria-live="polite">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400/30 to-violet-500/20 text-sm"
            aria-hidden
          >
            🧠
          </span>
          <p className="min-w-0 flex-1 text-[15px] leading-relaxed text-zinc-200">{reply}</p>
          <button
            onClick={onDismissReply}
            className="shrink-0 rounded px-1.5 py-0.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            aria-label="Dismiss reply"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
