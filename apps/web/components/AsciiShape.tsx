"use client";

import { useEffect, useRef } from "react";

/**
 * A slowly turning solid, drawn in text.
 *
 * Ported from the Fala landing page, with two changes. The indexing is written
 * out rather than destructured, because this project compiles with
 * `noUncheckedIndexedAccess` and every lookup into a sparse buffer is
 * genuinely possibly-undefined. And there is a shape here that Fala has no use
 * for: `ledger`, which is the Zowall mark - three bars with the third out of
 * line - so the art on the page is this product's and not a borrowed one.
 *
 * It only animates while on screen, and not at all when the reader has asked
 * for reduced motion.
 */
const RAMP = " .:-=+*#%@";

export type ShapeName = "clock" | "coin" | "envelope" | "lock" | "plane" | "ledger";

const near = (a: number, b: number, w: number) => Math.abs(a - b) < w;

const PLANE: ReadonlyArray<readonly [number, number]> = [
  [1, 0.75],
  [-1, 0.1],
  [-0.4, -0.12],
  [-0.15, -0.75],
  [0.1, -0.3],
];

function inPoly(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Each shape is a flat silhouette in -1..1, with gaps cut out for its details. */
const MASK: Record<ShapeName, (x: number, y: number) => boolean> = {
  clock: (x, y) => {
    const r = Math.hypot(x, y);
    if (r > 0.98 || near(r, 0.84, 0.035)) return false;
    const hour = near(x, 0, 0.05) && y > -0.04 && y < 0.5;
    const minute = near(y, 0, 0.05) && x > -0.04 && x < 0.65;
    return !(hour || minute);
  },
  coin: (x, y) => {
    const r = Math.hypot(x, y);
    if (r > 0.98 || near(r, 0.8, 0.035)) return false;
    const top = near(Math.hypot(x, y - 0.2), 0.22, 0.06) && !(x > 0 && y < 0.25);
    const bottom = near(Math.hypot(x, y + 0.2), 0.22, 0.06) && !(x < 0 && y > -0.25);
    return !(top || bottom || (near(x, 0, 0.05) && Math.abs(y) < 0.6));
  },
  envelope: (x, y) =>
    Math.abs(x) < 1 &&
    Math.abs(y) < 0.7 &&
    !near(y, 0.7 - 0.75 * (1 - Math.abs(x)), 0.05) &&
    !(near(y, -0.7 + 0.5 * (1 - Math.abs(x)), 0.04) && Math.abs(x) > 0.45),
  lock: (x, y) => {
    if (Math.abs(x) < 0.65 && y > -0.9 && y < 0.1) {
      return !(Math.hypot(x, y + 0.3) < 0.14 || (near(x, 0, 0.05) && y > -0.62 && y < -0.3));
    }
    return y >= 0.1 && near(Math.hypot(x, y - 0.1), 0.42, 0.11);
  },
  plane: (x, y) => inPoly(x, y, PLANE) && !near(y - 0.75, ((x - 1) * 0.87) / 1.4, 0.03),
  // The mark: three documents, the third out of line.
  ledger: (x, y) => {
    const bar = (cy: number, x0: number, x1: number) =>
      y > cy - 0.16 && y < cy + 0.16 && x > x0 && x < x1;
    return bar(0.5, -0.78, 0.3) || bar(0, -0.78, 0.3) || bar(-0.5, -0.3, 0.78);
  },
};

type Point = { x: number; y: number; z: number; nz: number; ny: number; gloss: number };

function points(shape: ShapeName, t: number, step: number): Point[] {
  const out: Point[] = [];
  const mask = MASK[shape];
  for (let x = -1; x <= 1; x += step) {
    for (let y = -1; y <= 1; y += step * 1.5) {
      if (!mask(x, y)) continue;
      const gloss = 0.3 * Math.sin(2.5 * x + 1.5 * y + t * 2.5);
      // Two faces, so the solid reads as a slab rather than a sheet.
      out.push({ x, y, z: -0.1, ny: 0, nz: -1, gloss });
      out.push({ x, y, z: 0.1, ny: 0, nz: 1, gloss });
    }
  }
  return out;
}

export function AsciiShape({
  shape,
  cols = 52,
  rows = 26,
  speed = 1,
  className = "",
}: {
  shape: ShapeName;
  cols?: number;
  rows?: number;
  speed?: number;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = 0;
    let t = Math.random() * 6;

    const render = () => {
      const a = Math.sin(t) * 0.25;
      const b = Math.sin(t * 0.7) * 0.6;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const cb = Math.cos(b);
      const sb = Math.sin(b);

      const chars: string[] = new Array<string>(cols * rows).fill(" ");
      const depth = new Float32Array(cols * rows);
      const k = Math.min(cols, rows * 2) * 1.7;

      for (const p of points(shape, t, Math.min(0.022, 2 / k))) {
        // Rotate the position and the face normal through the same two angles.
        const py0 = p.y * ca - p.z * sa;
        const pz0 = p.y * sa + p.z * ca;
        const px = p.x * cb + pz0 * sb;
        const pz = pz0 * cb - p.x * sb;

        const ly = p.ny * ca - p.nz * sa;
        const lz0 = p.ny * sa + p.nz * ca;
        const lz = lz0 * cb;

        const ooz = 1 / (pz + 3.6);
        const col = Math.floor(cols / 2 + k * ooz * px);
        const row = Math.floor(rows / 2 - k * 0.5 * ooz * py0);
        if (col < 0 || col >= cols || row < 0 || row >= rows) continue;

        const i = row * cols + col;
        if (ooz > (depth[i] ?? 0)) {
          depth[i] = ooz;
          const light = Math.min(0.99, Math.max(0.12, 0.55 * ly - 0.65 * lz + p.gloss));
          chars[i] = RAMP[Math.max(1, Math.floor(light * RAMP.length))] ?? " ";
        }
      }

      let out = "";
      for (let r = 0; r < rows; r++) out += chars.slice(r * cols, (r + 1) * cols).join("") + "\n";
      el.textContent = out;
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 50) return;
      t += ((now - last) / 1000) * 0.6 * speed;
      last = now;
      render();
    };

    render();

    const io = new IntersectionObserver((entries) => {
      const visible = entries[0]?.isIntersecting ?? false;
      cancelAnimationFrame(raf);
      if (visible && !still) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [shape, cols, rows, speed]);

  return <pre ref={ref} aria-hidden="true" className={`ascii-shape ${className}`} />;
}
