import { useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';
import { formatRelative } from '../utils/time';

type Props = {
  rules: CategoryRule[];
  thoughts: Thought[];
  onDelete: (thought: Thought) => void;
};

type Body = { x: number; y: number; vx: number; vy: number; r: number };

function radiusFor(count: number): number {
  return 36 + Math.min(44, count * 5);
}

/**
 * Floating "brain" view: one drifting bubble per category, sized by thought
 * count. Physics runs outside React — positions live in refs and are applied
 * as transforms each animation frame; React only re-renders when the data
 * changes. Drift pauses while a category panel is open, and entirely under
 * prefers-reduced-motion.
 */
export function BrainView({ rules, thoughts, onDelete }: Props) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [focused, setFocused] = useState<Thought | null>(null);
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const bodiesRef = useRef(new Map<string, Body>());
  const openRef = useRef<string | null>(null);
  openRef.current = openCategory;

  const byCategory = useMemo(() => {
    const m = new Map<string, Thought[]>();
    for (const t of thoughts) {
      const arr = m.get(t.categoryId) ?? [];
      arr.push(t);
      m.set(t.categoryId, arr);
    }
    return m;
  }, [thoughts]);

  // Create/update one physics body per category; keep position across renders.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const bodies = bodiesRef.current;
    for (const rule of rules) {
      const r = radiusFor(byCategory.get(rule.id)?.length ?? 0);
      const existing = bodies.get(rule.id);
      if (existing) {
        existing.r = r;
        continue;
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = 12 + Math.random() * 14; // px per second — a calm drift
      bodies.set(rule.id, {
        x: r + Math.random() * Math.max(1, W - 2 * r),
        y: r + Math.random() * Math.max(1, H - 2 * r),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
      });
    }
    for (const id of [...bodies.keys()]) {
      if (!rules.some((r) => r.id === id)) bodies.delete(id);
    }
    // Position immediately — don't wait for the first animation frame
    // (rAF doesn't fire at all in hidden tabs).
    for (const [id, b] of bodies) {
      const node = nodeRefs.current.get(id);
      if (node) node.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
    }
  }, [rules, byCategory]);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = containerRef.current;
      if (!el) return;
      const W = el.offsetWidth;
      const H = el.offsetHeight;
      const bodies = bodiesRef.current;

      if (!openRef.current && !reduceMotion) {
        for (const b of bodies.values()) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.x < b.r) {
            b.x = b.r;
            b.vx = Math.abs(b.vx);
          }
          if (b.x > W - b.r) {
            b.x = Math.max(b.r, W - b.r);
            b.vx = -Math.abs(b.vx);
          }
          if (b.y < b.r) {
            b.y = b.r;
            b.vy = Math.abs(b.vy);
          }
          if (b.y > H - b.r) {
            b.y = Math.max(b.r, H - b.r);
            b.vy = -Math.abs(b.vy);
          }
        }
        // Soft pairwise repulsion so bubbles jostle instead of overlapping.
        const arr = [...bodies.values()];
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const a = arr[i];
            const c = arr[j];
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            const dist = Math.hypot(dx, dy) || 1;
            const min = a.r + c.r + 6;
            if (dist < min) {
              const push = ((min - dist) / dist) * 0.25;
              a.x -= dx * push;
              a.y -= dy * push;
              c.x += dx * push;
              c.y += dy * push;
            }
          }
        }
      }

      for (const [id, b] of bodies) {
        const node = nodeRefs.current.get(id);
        if (node) node.style.transform = `translate3d(${b.x - b.r}px, ${b.y - b.r}px, 0)`;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const openRule = openCategory ? rules.find((r) => r.id === openCategory) : undefined;
  const openList = openCategory ? byCategory.get(openCategory) ?? [] : [];

  const closePanel = () => {
    setOpenCategory(null);
    setFocused(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative h-[62vh] min-h-[420px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
    >
      {rules.map((rule) => {
        const count = byCategory.get(rule.id)?.length ?? 0;
        const r = radiusFor(count);
        return (
          <button
            key={rule.id}
            ref={(n) => {
              nodeRefs.current.set(rule.id, n);
            }}
            onClick={() => setOpenCategory(rule.id)}
            className="group absolute left-0 top-0 will-change-transform"
            style={{ width: r * 2, height: r * 2 }}
            title={`${rule.name} — ${count} thought${count === 1 ? '' : 's'}`}
          >
            <span
              className={`flex h-full w-full flex-col items-center justify-center rounded-full border text-center transition-transform duration-200 group-hover:scale-110 ${
                count === 0 ? 'opacity-50' : ''
              }`}
              style={{
                backgroundColor: `${rule.color}1e`,
                borderColor: `${rule.color}55`,
                color: rule.color,
                boxShadow: `0 0 24px ${rule.color}14`,
              }}
            >
              <span className="px-2 text-[11px] font-medium leading-tight">{rule.name}</span>
              <span className="text-[10px] opacity-70">{count}</span>
            </span>
          </button>
        );
      })}

      {openCategory && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-950/60 p-4" onClick={closePanel}>
          <div
            className="flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {focused ? (
              <>
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5 text-xs">
                  <button onClick={() => setFocused(null)} className="text-zinc-400 hover:text-zinc-100">
                    ← Back
                  </button>
                  <span className="ml-auto text-zinc-500" title={new Date(focused.createdAt).toLocaleString()}>
                    {formatRelative(focused.createdAt)}
                    {focused.source === 'voice' ? ' · 🎤' : ''}
                  </span>
                </div>
                <p className="overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">{focused.text}</p>
                <div className="flex gap-2 border-t border-zinc-800 px-4 py-2.5 text-xs">
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(focused.text);
                      setCopied(true);
                    }}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
                  >
                    {copied ? 'Copied ✓' : 'Copy'}
                  </button>
                  <button
                    onClick={() => {
                      onDelete(focused);
                      setFocused(null);
                    }}
                    className="rounded-md border border-zinc-700 px-2.5 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                  >
                    Delete
                  </button>
                  <button onClick={closePanel} className="ml-auto rounded-md px-2.5 py-1 text-zinc-500 hover:text-zinc-200">
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${openRule?.color ?? '#9ca3af'}22`, color: openRule?.color ?? '#9ca3af' }}
                  >
                    {openRule?.name ?? 'Category'}
                  </span>
                  <span className="text-xs text-zinc-500">{openList.length}</span>
                  <button onClick={closePanel} className="ml-auto text-zinc-500 hover:text-zinc-200">
                    ✕
                  </button>
                </div>
                <ul className="overflow-y-auto">
                  {openList.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-zinc-600">Nothing in here yet.</li>
                  )}
                  {openList.map((t) => (
                    <li key={t.id} className="border-b border-zinc-800/50 last:border-0">
                      <button onClick={() => setFocused(t)} className="w-full px-4 py-2.5 text-left hover:bg-zinc-800/60">
                        <p className="line-clamp-2 text-sm text-zinc-200">{t.text}</p>
                        <span className="text-[11px] text-zinc-500">
                          {formatRelative(t.createdAt)}
                          {t.source === 'voice' ? ' · 🎤' : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
