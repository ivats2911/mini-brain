import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph, { type LinkObject, type NodeObject } from 'force-graph';
import { buildGraph, type BrainNode, type LinkKind } from '../graph/buildGraph';
import type { CategoryRule } from '../categorization/rules';
import type { Thought } from '../types';
import { formatRelative } from '../utils/time';
import { hexToRgba } from '../utils/color';

type GNode = NodeObject & BrainNode;
type GLink = LinkObject<GNode> & { kind: LinkKind };

type Props = {
  rules: CategoryRule[];
  thoughts: Thought[];
  onDelete: (thought: Thought) => void;
  lastSaved: { thought: Thought; at: number } | null;
};

const MAX_NODES = 200;

/**
 * Map view: every thought is a glowing synaptic node in a force graph
 * (force-graph + d3-force, bundled — no CDN). Links come from buildGraph
 * (wikilinks, shared #tags, category chains, shared words). The simulation
 * never cools (alphaDecay 0 + a wander force), so the field drifts forever.
 * Hover lights up a node's neighborhood; click flies the camera in, dims the
 * rest (depth of field), and opens a side panel. Node positions persist
 * across data rebuilds by reusing node objects keyed by thought id.
 */
export function MapView({ rules, thoughts, onDelete, lastSaved }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraph<GNode, GLink> | null>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [copied, setCopied] = useState(false);

  const hoverRef = useRef<GNode | null>(null);
  const selectedRef = useRef<GNode | null>(null);
  selectedRef.current = selected;
  const neighborsRef = useRef(new Map<number, Set<number>>());
  const colorsRef = useRef(new Map<string, string>());
  const maxBornRef = useRef(1);
  const popRef = useRef(new Map<string, number>()); // thought id -> spawn timestamp
  const dataRef = useRef<{ nodes: GNode[]; links: GLink[] } | null>(null);
  const activeCacheRef = useRef<{ focus: number | null; set: Set<number> | null }>({ focus: null, set: null });

  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    colorsRef.current = new Map(rules.map((r) => [r.id, r.color]));
  }, [rules]);

  const capped = useMemo(() => thoughts.slice(0, MAX_NODES), [thoughts]); // thoughts arrive newest-first
  const built = useMemo(() => buildGraph(capped), [capped]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    /** Focused node (selected wins over hover) plus its neighbors; null = no focus. */
    const activeIds = (): Set<number> | null => {
      const focus = (selectedRef.current ?? hoverRef.current)?.id ?? null;
      if (activeCacheRef.current.focus !== focus) {
        activeCacheRef.current = {
          focus,
          set:
            focus === null
              ? null
              : new Set([...(neighborsRef.current.get(focus) ?? []), focus]),
        };
      }
      return activeCacheRef.current.set;
    };

    const nodeRadius = (node: GNode): number => {
      const rec = node.born / Math.max(1, maxBornRef.current);
      let r = 4 + 6 * rec;
      const pop = popRef.current.get(node.tid);
      if (pop !== undefined) {
        const tt = (performance.now() - pop) / 1000;
        if (tt > 1.2) popRef.current.delete(node.tid);
        else r *= Math.max(0.05, 1 - Math.exp(-6 * tt) * Math.cos(10 * tt)); // spring pop
      }
      if (hoverRef.current?.id === node.id) r *= 1.12;
      return r;
    };

    const drawNode = (node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const color = colorsRef.current.get(node.group) ?? '#8b8fa3';
      const rec = node.born / Math.max(1, maxBornRef.current);
      const r = nodeRadius(node);
      const act = activeIds();
      const inFocus = !act || act.has(node.id);
      let alpha = (0.45 + 0.55 * rec) * (inFocus ? 1 : 0.12);
      if (act && inFocus) alpha = Math.min(1, alpha + 0.25);

      // Additive outer glow so overlapping orbs bloom.
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
      glow.addColorStop(0, hexToRgba(color, 0.28 * alpha));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // Core: inner light top-left, colored body, faint rim.
      const core = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
      core.addColorStop(0, hexToRgba('#ffffff', 0.85 * alpha));
      core.addColorStop(0.35, hexToRgba(color, 0.8 * alpha));
      core.addColorStop(1, hexToRgba(color, 0.25 * alpha));
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(color, 0.7 * alpha);
      ctx.lineWidth = 0.6;
      ctx.stroke();

      // Spawn ripple ring.
      const pop = popRef.current.get(node.tid);
      if (pop !== undefined) {
        const tt = (performance.now() - pop) / 1000;
        if (tt < 0.9) {
          ctx.strokeStyle = hexToRgba(color, (1 - tt / 0.9) * 0.6);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(x, y, r + tt * 45, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (scale > 1.4 || (act !== null && inFocus)) {
        ctx.font = `500 ${Math.max(2.5, 10 / scale)}px "Inter Variable", ui-sans-serif, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(222, 226, 238, ${0.85 * (inFocus ? 1 : 0.15)})`;
        ctx.fillText(node.label, x, y + r + 3 / scale);
      }
    };

    const drawLink = (link: GLink, ctx: CanvasRenderingContext2D) => {
      const s = link.source;
      const t = link.target;
      if (typeof s !== 'object' || typeof t !== 'object') return;
      const sn = s as GNode;
      const tn = t as GNode;
      const act = activeIds();
      const lit = act !== null && act.has(sn.id) && act.has(tn.id);
      const base = act ? (lit ? 0.5 : 0.03) : 0.15;
      const grad = ctx.createLinearGradient(sn.x ?? 0, sn.y ?? 0, tn.x ?? 0, tn.y ?? 0);
      grad.addColorStop(0, hexToRgba(colorsRef.current.get(sn.group) ?? '#8b8fa3', base));
      grad.addColorStop(1, hexToRgba(colorsRef.current.get(tn.group) ?? '#8b8fa3', base));
      ctx.strokeStyle = grad;
      ctx.lineWidth = link.kind === 'ref' ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(sn.x ?? 0, sn.y ?? 0);
      ctx.lineTo(tn.x ?? 0, tn.y ?? 0);
      ctx.stroke();
      // Light pulse travelling along the synapse.
      if (!reduceMotion && base > 0.05) {
        const phase = ((sn.id * 13 + tn.id * 7) % 10) / 10;
        const pp = ((performance.now() / 1000) * 0.15 + phase) % 1;
        const px = (sn.x ?? 0) + ((tn.x ?? 0) - (sn.x ?? 0)) * pp;
        const py = (sn.y ?? 0) + ((tn.y ?? 0) - (sn.y ?? 0)) * pp;
        ctx.fillStyle = `rgba(205, 225, 255, ${base * 2})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const graph = new ForceGraph<GNode, GLink>(el);
    graphRef.current = graph;
    graph
      .backgroundColor('rgba(0,0,0,0)')
      .width(el.clientWidth)
      .height(el.clientHeight)
      .nodeId('id')
      .nodeLabel(() => '')
      .d3AlphaDecay(0) // never settle — perpetual idle drift is the point
      .d3VelocityDecay(0.4)
      .cooldownTicks(Infinity)
      .autoPauseRedraw(false)
      .nodeCanvasObject(drawNode)
      .nodePointerAreaPaint((node, color, ctx) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x ?? 0, node.y ?? 0, nodeRadius(node) + 4, 0, Math.PI * 2);
        ctx.fill();
      })
      .linkCanvasObjectMode(() => 'replace')
      .linkCanvasObject(drawLink)
      .onNodeHover((node) => {
        hoverRef.current = node ?? null;
        el.style.cursor = node ? 'pointer' : 'default';
      })
      .onNodeClick((node) => {
        setSelected(node);
        graph.centerAt(node.x ?? 0, node.y ?? 0, 800);
        if (graph.zoom() < 2.2) graph.zoom(2.2, 800);
      })
      .onBackgroundClick(() => setSelected(null));

    const charge = graph.d3Force('charge');
    if (charge) charge.strength(-70);
    const linkForce = graph.d3Force('link');
    if (linkForce) {
      linkForce.distance((l: GLink) => (l.kind === 'cat' ? 70 : l.kind === 'word' ? 95 : 55));
      linkForce.strength(0.06);
    }
    if (!reduceMotion) {
      // Gentle per-node wander so the field never looks frozen.
      const wander = Object.assign(
        () => {
          const t = performance.now() / 1000;
          for (const nd of dataRef.current?.nodes ?? []) {
            nd.vx = (nd.vx ?? 0) + Math.sin(t * 0.5 + nd.id * 1.7) * 0.015;
            nd.vy = (nd.vy ?? 0) + Math.cos(t * 0.4 + nd.id * 2.3) * 0.015;
          }
        },
        { initialize: () => undefined },
      );
      graph.d3Force('wander', wander);
    }

    const onResize = () => graph.width(el.clientWidth).height(el.clientHeight);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      graph._destructor();
      graphRef.current = null;
    };
  }, [reduceMotion]);

  // Feed data into the graph, reusing node objects so positions persist.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const prev = new Map((dataRef.current?.nodes ?? []).map((n) => [n.tid, n]));
    const nodes = built.nodes.map((n) => Object.assign(prev.get(n.tid) ?? {}, n) as GNode);
    const links = built.links.map((l) => ({ ...l }) as GLink);
    const nb = new Map<number, Set<number>>();
    const addNb = (a: number, b: number) => {
      const set = nb.get(a) ?? new Set<number>();
      set.add(b);
      nb.set(a, set);
    };
    for (const l of built.links) {
      addNb(l.source, l.target);
      addNb(l.target, l.source);
    }
    neighborsRef.current = nb;
    maxBornRef.current = Math.max(1, nodes.length - 1);
    activeCacheRef.current = { focus: null, set: null };
    dataRef.current = { nodes, links };
    graph.graphData(dataRef.current);
  }, [built]);

  // Spring-pop + ripple for a freshly captured thought.
  useEffect(() => {
    if (!lastSaved || Date.now() - lastSaved.at > 1500 || reduceMotion) return;
    popRef.current.set(lastSaved.thought.id, performance.now());
  }, [lastSaved, reduceMotion]);

  // Drop the selection if its thought disappears (deleted / filtered out).
  useEffect(() => {
    if (selected && !thoughts.some((t) => t.id === selected.tid)) setSelected(null);
  }, [thoughts, selected]);

  useEffect(() => {
    if (!selected) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [selected]);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const selThought = selected ? thoughts.find((t) => t.id === selected.tid) : undefined;
  const selRule = selected ? rules.find((r) => r.id === selected.group) : undefined;

  return (
    <div className={`fixed inset-0 overflow-hidden ${selected ? 'z-20' : 'z-0'}`}>
      <div ref={containerRef} className="h-full w-full" />

      {thoughts.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm tracking-wide text-zinc-600">No thoughts yet — capture one above and it becomes a node.</p>
        </div>
      )}

      {capped.length < thoughts.length && (
        <span className="pointer-events-none absolute bottom-3 left-3 text-[11px] tracking-wide text-zinc-600">
          showing the {MAX_NODES} most recent thoughts
        </span>
      )}

      {selected && selThought && (
        <aside className="panel-right absolute right-4 top-1/2 z-30 flex max-h-[72vh] w-80 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12121c]/90 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium tracking-wide"
              style={{ backgroundColor: `${selRule?.color ?? '#9ca3af'}22`, color: selRule?.color ?? '#9ca3af' }}
            >
              {selRule?.name ?? 'Thought'}
            </span>
            <span className="text-xs tracking-wide text-zinc-500" title={new Date(selThought.createdAt).toLocaleString()}>
              {formatRelative(selThought.createdAt)}
              {selThought.source === 'voice' ? ' · 🎤' : ''}
            </span>
            <button onClick={() => setSelected(null)} className="ml-auto text-zinc-500 transition-colors hover:text-zinc-200">
              ✕
            </button>
          </div>
          <p className="overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">{selThought.text}</p>
          {selected.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 pb-2">
              {selected.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] tracking-wide text-zinc-400">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2 border-t border-white/[0.06] px-4 py-2.5 text-xs">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(selThought.text);
                setCopied(true);
              }}
              className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-300 transition-colors hover:bg-white/5"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={() => {
                onDelete(selThought);
                setSelected(null);
              }}
              className="rounded-md border border-white/10 px-2.5 py-1 text-zinc-400 transition-colors hover:bg-white/5 hover:text-red-400"
            >
              Delete
            </button>
            <button
              onClick={() => setSelected(null)}
              className="ml-auto rounded-md px-2.5 py-1 text-zinc-500 transition-colors hover:text-zinc-200"
            >
              Close
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
