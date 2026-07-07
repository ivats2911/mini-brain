import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';
import { formatRelative } from '../utils/time';
import { hexToRgba } from '../utils/color';

type Props = {
  rules: CategoryRule[];
  thoughts: Thought[];
  onDelete: (thought: Thought) => void;
  /** Most recently saved thought — triggers the fly-into-bubble animation. */
  lastSaved: { thought: Thought; at: number } | null;
  /** Element the fly-in projectile launches from (the capture box). */
  originRef?: RefObject<HTMLElement>;
};

type Body = { x: number; y: number; vx: number; vy: number; r: number; phase: number; turnFreq: number };
type Particle = { x: number; y: number; vx: number; vy: number; size: number; phase: number };
type Projectile = { categoryId: string; color: string; sx: number; sy: number; cx: number; cy: number; start: number; duration: number };
type Ripple = { x: number; y: number; r0: number; color: string; start: number };

const PARTICLE_COUNT = 36;
const LINK_DISTANCE = 300;
const RIPPLE_MS = 650;
const CURSOR_RANGE = 110;
const WHISPER_PERIOD_S = 8;
const WHISPER_POOL = 8;

function radiusFor(count: number, freshness: number): number {
  return (44 + Math.min(52, count * 6)) * (0.88 + 0.16 * freshness);
}

/** 1 for categories touched within the hour, fading to 0 over a week. */
function freshnessOf(lastAt: number | undefined, now: number): number {
  if (!lastAt) return 0;
  const hours = (now - lastAt) / 3_600_000;
  if (hours <= 1) return 1;
  if (hours >= 168) return 0;
  return 1 - (hours - 1) / 167;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Stable 0..1 phase per bubble pair, for the synapse light pulses. */
function pairPhase(a: string, b: string): number {
  let h = 0;
  for (const ch of a + b) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h / 997;
}

/**
 * Floating "brain" view. One frosted-glass orb per category, drifting
 * organically (wandering heading, wall bounce, soft repulsion, cursor
 * avoidance). A canvas layer underneath draws synapse lines that fade in and
 * carry light pulses, ambient dust, and the fly-in projectile + ripple when a
 * thought is captured. Physics lives in refs and writes transforms
 * imperatively each frame — React never renders at 60fps. Recently active
 * categories glow brighter and float larger. Everything pauses under
 * prefers-reduced-motion, and positions are applied synchronously on rebuild
 * because rAF never fires in hidden tabs.
 */
export function BrainView({ rules, thoughts, onDelete, lastSaved, originRef }: Props) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [focused, setFocused] = useState<Thought | null>(null);
  const [copied, setCopied] = useState(false);
  // Coarse clock driving the rotating thought whispers under each bubble.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const bodiesRef = useRef(new Map<string, Body>());
  const colorsRef = useRef(new Map<string, string>());
  const particlesRef = useRef<Particle[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const linkAgeRef = useRef(new Map<string, number>());
  const pointerRef = useRef({ x: 0, y: 0, active: false });
  const openRef = useRef<string | null>(null);
  openRef.current = openCategory;

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const byCategory = useMemo(() => {
    const m = new Map<string, Thought[]>();
    for (const t of thoughts) {
      const arr = m.get(t.categoryId) ?? [];
      arr.push(t);
      m.set(t.categoryId, arr);
    }
    return m;
  }, [thoughts]);

  const lastActivity = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of thoughts) m.set(t.categoryId, Math.max(m.get(t.categoryId) ?? 0, t.createdAt));
    return m;
  }, [thoughts]);

  useEffect(() => {
    colorsRef.current = new Map(rules.map((r) => [r.id, r.color]));
  }, [rules]);

  // Create/update one physics body per category; keep position across renders.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const now = Date.now();
    const bodies = bodiesRef.current;
    for (const rule of rules) {
      const count = byCategory.get(rule.id)?.length ?? 0;
      const r = radiusFor(count, freshnessOf(lastActivity.get(rule.id), now));
      const existing = bodies.get(rule.id);
      if (existing) {
        existing.r = r;
        continue;
      }
      const angle = Math.random() * Math.PI * 2;
      const speed = 14 + Math.random() * 16; // px per second — lava lamp, not screensaver
      bodies.set(rule.id, {
        x: r + Math.random() * Math.max(1, W - 2 * r),
        y: r + Math.random() * Math.max(1, H - 2 * r),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        phase: Math.random() * Math.PI * 2,
        turnFreq: 0.25 + Math.random() * 0.5,
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
  }, [rules, byCategory, lastActivity]);

  // Fly the freshly captured thought into its category bubble.
  useEffect(() => {
    if (!lastSaved || Date.now() - lastSaved.at > 1500 || reduceMotion) return;
    const body = bodiesRef.current.get(lastSaved.thought.categoryId);
    const el = containerRef.current;
    if (!body || !el) return;
    const W = el.offsetWidth;
    // Launch from the actual capture box when we can see it, else top-center.
    const crect = el.getBoundingClientRect();
    const orig = originRef?.current?.getBoundingClientRect();
    const sx = orig ? orig.left + orig.width / 2 - crect.left : W / 2 + (Math.random() - 0.5) * 80;
    const sy = orig ? orig.bottom - crect.top : -14;
    const dx = body.x - sx;
    const dy = body.y - sy;
    const len = Math.hypot(dx, dy) || 1;
    const off = (Math.random() < 0.5 ? -1 : 1) * Math.min(120, len * 0.35);
    projectilesRef.current.push({
      categoryId: lastSaved.thought.categoryId,
      color: colorsRef.current.get(lastSaved.thought.categoryId) ?? '#9ca3af',
      sx,
      sy,
      cx: (sx + body.x) / 2 + (-dy / len) * off,
      cy: (sy + body.y) / 2 + (dx / len) * off,
      start: performance.now(),
      duration: 750,
    });
  }, [lastSaved, reduceMotion, originRef]);

  useEffect(() => {
    const id = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Main loop: physics + canvas (synapses, particles, projectiles, ripples).
  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = containerRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      const W = el.offsetWidth;
      const H = el.offsetHeight;
      const bodies = bodiesRef.current;
      const t = now / 1000;

      if (!openRef.current && !reduceMotion) {
        const ptr = pointerRef.current;
        for (const b of bodies.values()) {
          // Organic wander: heading slowly oscillates instead of flying straight.
          const heading = Math.atan2(b.vy, b.vx) + Math.sin(t * b.turnFreq + b.phase) * 0.9 * dt;
          const speed = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(heading) * speed;
          b.vy = Math.sin(heading) * speed;

          // The field reacts to the cursor: bubbles softly drift away from it.
          if (ptr.active) {
            const pdx = b.x - ptr.x;
            const pdy = b.y - ptr.y;
            const pdist = Math.hypot(pdx, pdy) || 1;
            const range = b.r + CURSOR_RANGE;
            if (pdist < range) {
              const f = ((range - pdist) / range) * 900 * dt;
              b.vx += (pdx / pdist) * f;
              b.vy += (pdy / pdist) * f;
            }
          }

          // Keep speeds in the calm band even after cursor shoves.
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 70) {
            b.vx *= 70 / sp;
            b.vy *= 70 / sp;
          } else if (sp > 34) {
            const damp = 1 - 0.5 * dt;
            b.vx *= damp;
            b.vy *= damp;
          }

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

      // ---- canvas layer ----
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Synapse lines: fade in as bubbles approach, carry a travelling pulse.
      const linkAges = linkAgeRef.current;
      const seen = new Set<string>();
      const entries = [...bodies.entries()];
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const [idA, a] = entries[i];
          const [idB, c] = entries[j];
          const dist = Math.hypot(c.x - a.x, c.y - a.y);
          if (dist > LINK_DISTANCE) continue;
          const key = `${idA}|${idB}`;
          seen.add(key);
          const age = (linkAges.get(key) ?? 0) + dt;
          linkAges.set(key, age);
          const ramp = Math.min(1, age / 0.9); // the line draws itself in
          const alpha = (1 - dist / LINK_DISTANCE) * 0.22 * ramp;
          const grad = ctx.createLinearGradient(a.x, a.y, c.x, c.y);
          grad.addColorStop(0, hexToRgba(colorsRef.current.get(idA) ?? '#71717a', alpha));
          grad.addColorStop(1, hexToRgba(colorsRef.current.get(idB) ?? '#71717a', alpha));
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
          // A faint light travelling along the synapse.
          const pp = (t * 0.22 + pairPhase(idA, idB)) % 1;
          const px = a.x + (c.x - a.x) * pp;
          const py = a.y + (c.y - a.y) * pp;
          ctx.fillStyle = `rgba(205, 225, 255, ${alpha * 2.2})`;
          ctx.beginPath();
          ctx.arc(px, py, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const key of [...linkAges.keys()]) {
        if (!seen.has(key)) linkAges.delete(key);
      }

      // Ambient neural dust.
      if (particlesRef.current.length === 0 && W > 0) {
        particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => ({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          size: 0.8 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
        }));
      }
      for (const p of particlesRef.current) {
        if (!reduceMotion) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0) p.x += W;
          if (p.x > W) p.x -= W;
          if (p.y < 0) p.y += H;
          if (p.y > H) p.y -= H;
        }
        const twinkle = 0.6 + 0.4 * Math.sin(t * 1.4 + p.phase);
        ctx.fillStyle = `rgba(170, 180, 210, ${0.15 * twinkle})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Expanding ripple rings where a thought landed.
      ripplesRef.current = ripplesRef.current.filter((rp) => now - rp.start < RIPPLE_MS);
      for (const rp of ripplesRef.current) {
        const p = (now - rp.start) / RIPPLE_MS;
        ctx.strokeStyle = hexToRgba(rp.color, (1 - p) * 0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r0 + p * 34, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Captured thoughts flying into their bubble along a curved path.
      projectilesRef.current = projectilesRef.current.filter((pr) => {
        const target = bodiesRef.current.get(pr.categoryId);
        if (!target) return false;
        const raw = (now - pr.start) / pr.duration;
        if (raw >= 1) {
          ripplesRef.current.push({ x: target.x, y: target.y, r0: target.r, color: pr.color, start: now });
          const scaler = nodeRefs.current.get(pr.categoryId)?.firstElementChild;
          if (scaler instanceof HTMLElement) {
            scaler.animate(
              [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }],
              { duration: 420, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
            );
          }
          return false;
        }
        const drawAt = (tt: number, radius: number, alpha: number) => {
          const e = easeInOutCubic(tt);
          const u = 1 - e;
          const x = u * u * pr.sx + 2 * u * e * pr.cx + e * e * target.x;
          const y = u * u * pr.sy + 2 * u * e * pr.cy + e * e * target.y;
          ctx.fillStyle = hexToRgba(pr.color, alpha);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        };
        for (let k = 5; k >= 1; k--) {
          const tt = raw - k * 0.035;
          if (tt > 0) drawAt(tt, 3 * (1 - k / 7), 0.5 * (1 - k / 6));
        }
        ctx.shadowColor = pr.color;
        ctx.shadowBlur = 14;
        drawAt(raw, 4, 0.95);
        ctx.shadowBlur = 0;
        return true;
      });
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  useEffect(() => {
    if (!openCategory) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenCategory(null);
        setFocused(null);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openCategory]);

  const handleFieldPointer = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
  };

  const handleTilt = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotion) return;
    const tiltEl = e.currentTarget.querySelector<HTMLElement>('[data-tilt]');
    if (!tiltEl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    tiltEl.style.transform = `perspective(520px) rotateX(${(-ny * 12).toFixed(2)}deg) rotateY(${(nx * 12).toFixed(2)}deg)`;
  };

  const resetTilt = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const tiltEl = e.currentTarget.querySelector<HTMLElement>('[data-tilt]');
    if (tiltEl) tiltEl.style.transform = '';
  };

  const openRule = openCategory ? rules.find((r) => r.id === openCategory) : undefined;
  const openList = openCategory ? byCategory.get(openCategory) ?? [] : [];
  const now = Date.now();

  const closePanel = () => {
    setOpenCategory(null);
    setFocused(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handleFieldPointer}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
      className={`fixed inset-0 overflow-hidden ${openCategory ? 'z-20' : 'z-0'}`}
    >
      <canvas
        ref={canvasRef}
        className={`pointer-events-none absolute inset-0 h-full w-full transition-[filter,opacity] duration-500 ${
          openCategory ? 'opacity-40 blur-sm' : ''
        }`}
        aria-hidden
      />

      {thoughts.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm tracking-wide text-zinc-600">Your brain is empty — capture a thought above and watch it fly in.</p>
        </div>
      )}

      {rules.map((rule, i) => {
        const count = byCategory.get(rule.id)?.length ?? 0;
        const f = freshnessOf(lastActivity.get(rule.id), now);
        const r = radiusFor(count, f);
        const receded = openCategory !== null && openCategory !== rule.id;
        const bright = count === 0 ? 0.55 : 0.75 + 0.25 * f;
        // A rotating "whisper": one recent thought from this category, so the
        // field reminds you what's inside without opening anything.
        const pool = (byCategory.get(rule.id) ?? []).slice(0, WHISPER_POOL);
        const whisper =
          pool.length > 0
            ? pool[Math.floor((nowSec + i * 5) / WHISPER_PERIOD_S) % pool.length]
            : null;
        return (
          <button
            key={rule.id}
            ref={(n) => {
              nodeRefs.current.set(rule.id, n);
            }}
            onClick={() => setOpenCategory(rule.id)}
            onPointerMove={handleTilt}
            onPointerLeave={resetTilt}
            className="group absolute left-0 top-0 will-change-transform"
            style={{ width: r * 2, height: r * 2 }}
            title={`${rule.name} — ${count} thought${count === 1 ? '' : 's'}`}
          >
            <span
              className={`bubble-pop relative block h-full w-full transition-all duration-500 group-hover:scale-110 ${
                receded ? 'scale-90 opacity-30 blur-[2px]' : ''
              }`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span data-tilt className="relative block h-full w-full transition-transform duration-200 ease-out will-change-transform">
                <span
                  aria-hidden
                  className="halo-pulse absolute inset-0 rounded-full blur-xl"
                  style={{
                    backgroundColor: hexToRgba(rule.color, 0.35 + 0.4 * f),
                    animationDelay: `${i * 400}ms`,
                  }}
                />
                <span
                  className="orb-breathe relative flex h-full w-full flex-col items-center justify-center rounded-full border text-center backdrop-blur-md"
                  style={{
                    opacity: bright,
                    background: `radial-gradient(circle at 30% 25%, rgba(255, 255, 255, 0.13), transparent 42%), radial-gradient(circle at 32% 30%, ${hexToRgba(
                      rule.color,
                      0.3 + 0.14 * f,
                    )}, ${hexToRgba(rule.color, 0.09)} 60%, ${hexToRgba(rule.color, 0.04)})`,
                    borderColor: hexToRgba(rule.color, 0.32 + 0.28 * f),
                    boxShadow: `0 0 ${18 + 26 * f}px ${hexToRgba(rule.color, 0.14 + 0.22 * f)}, inset 0 0 20px ${hexToRgba(
                      rule.color,
                      0.1,
                    )}, inset 0 1px 0 rgba(255, 255, 255, 0.09)`,
                    animationDelay: `${i * 500}ms`,
                    animationDuration: `${3.4 + (i % 3) * 0.6}s`,
                  }}
                >
                  <span className="px-2 text-[11px] font-semibold leading-tight tracking-wide text-zinc-100">{rule.name}</span>
                  <span className="text-[10px] font-medium" style={{ color: rule.color }}>
                    {count}
                  </span>
                </span>
              </span>
            </span>
            {whisper && (
              <span
                className={`pointer-events-none absolute left-1/2 top-full mt-2 w-52 -translate-x-1/2 transition-opacity duration-300 ${
                  openCategory ? 'opacity-0' : ''
                }`}
              >
                <span
                  key={whisper.id}
                  className="whisper-in line-clamp-2 block text-center text-[11px] italic leading-snug tracking-wide text-zinc-400/90 [text-shadow:0_1px_8px_rgba(0,0,0,0.85)]"
                >
                  “{whisper.text}”
                </span>
              </span>
            )}
          </button>
        );
      })}

      {openCategory && (
        <div
          className="brain-backdrop absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0f]/55 p-4"
          onClick={closePanel}
        >
          <div
            className="brain-panel flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12121c]/90 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {focused ? (
              <div key={focused.id} className="brain-panel flex max-h-full flex-col">
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 text-xs">
                  <button onClick={() => setFocused(null)} className="text-zinc-400 transition-colors hover:text-zinc-100">
                    ← Back
                  </button>
                  <span className="ml-auto tracking-wide text-zinc-500" title={new Date(focused.createdAt).toLocaleString()}>
                    {formatRelative(focused.createdAt)}
                    {focused.source === 'voice' ? ' · 🎤' : ''}
                  </span>
                </div>
                <p className="overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">{focused.text}</p>
                <div className="flex gap-2 border-t border-white/[0.06] px-4 py-2.5 text-xs">
                  <button
                    onClick={() => {
                      void navigator.clipboard.writeText(focused.text);
                      setCopied(true);
                    }}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300 transition-colors hover:bg-white/5"
                  >
                    {copied ? 'Copied ✓' : 'Copy'}
                  </button>
                  <button
                    onClick={() => {
                      onDelete(focused);
                      setFocused(null);
                    }}
                    className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-red-400"
                  >
                    Delete
                  </button>
                  <button onClick={closePanel} className="ml-auto rounded-md px-2.5 py-1 text-zinc-500 transition-colors hover:text-zinc-200">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium tracking-wide"
                    style={{ backgroundColor: `${openRule?.color ?? '#9ca3af'}22`, color: openRule?.color ?? '#9ca3af' }}
                  >
                    {openRule?.name ?? 'Category'}
                  </span>
                  <span className="text-xs text-zinc-500">{openList.length}</span>
                  <button onClick={closePanel} className="ml-auto text-zinc-500 transition-colors hover:text-zinc-200">
                    ✕
                  </button>
                </div>
                <ul className="overflow-y-auto">
                  {openList.length === 0 && (
                    <li className="px-4 py-8 text-center text-sm text-zinc-600">Nothing in here yet.</li>
                  )}
                  {openList.map((t, i) => (
                    <li
                      key={t.id}
                      className="panel-item border-b border-white/[0.04] last:border-0"
                      style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
                    >
                      <button onClick={() => setFocused(t)} className="w-full px-4 py-2.5 text-left transition-colors hover:bg-white/5">
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
