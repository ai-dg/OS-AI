import { useEffect, useRef } from "react";

/**
 * JarvisOrb — a self-contained <canvas> particle ring inspired by the
 * Jarvis_interface.webp reference: a swirling band of cyan/teal particles
 * orbiting a faint reactor core on a transparent background.
 *
 * Pure canvas + requestAnimationFrame — no animation library, no external
 * assets. Renders at any square `size`, so the same component drives both the
 * full-screen idle hero and the small mic-status orb.
 *
 * `color`/`intensity` are read through refs every frame, so changing them
 * (e.g. on voice-status change) retints the live animation without restarting.
 */
export interface JarvisOrbProps {
  /** Square render size in CSS pixels. */
  size?: number;
  /** Particle colour as [r, g, b] (0–255). */
  color?: [number, number, number];
  /** Overall brightness + motion speed multiplier (0–1+). */
  intensity?: number;
  /**
   * Optional live mic amplitude (0–1). When provided, voice energy drives
   * real-time "impulses": the ring brightens, expands and emits a shock-ring,
   * so the user sees the orb react the instant it hears them.
   */
  levelRef?: { current: number };
  className?: string;
  style?: React.CSSProperties;
}

const TEAL: [number, number, number] = [45, 212, 191];

interface Particle {
  band: number;
  theta: number;
  jitter: number;
  twPhase: number;
  twSpeed: number;
  spin: number;
}

export function JarvisOrb({
  size = 420,
  color = TEAL,
  intensity = 1,
  levelRef,
  className,
  style,
}: JarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intensityRef = useRef(intensity);
  const colorRef = useRef(color);
  const voiceRef = useRef(levelRef);
  intensityRef.current = intensity;
  colorRef.current = color;
  voiceRef.current = levelRef;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Local const keeps TS non-null narrowing alive inside the rAF closure.
    const c = ctx;

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    c.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    // Resting radius leaves headroom so the voice scale-pulse (up to ~1.26×)
    // and shock rings stay inside the canvas instead of clipping at the edge.
    const R = size * 0.36;

    // ── Build particle bands ────────────────────────────────────────────────
    // Higher particle count + finer dots → a crisper, higher-resolution ring.
    const BANDS = 7;
    const perBand = Math.max(64, Math.round(size * 1.4));
    const particles: Particle[] = [];
    for (let b = 0; b < BANDS; b++) {
      for (let i = 0; i < perBand; i++) {
        particles.push({
          band: b,
          theta: (i / perBand) * Math.PI * 2,
          jitter: Math.random() - 0.5,
          twPhase: Math.random() * Math.PI * 2,
          twSpeed: 0.5 + Math.random() * 1.6,
          spin: 0.05 + Math.random() * 0.04,
        });
      }
    }

    // Each band is a wavy ribbon: radius modulated by a travelling sine wave so
    // the ring ripples and folds the way the reference orb does.
    const bands = Array.from({ length: BANDS }, (_, b) => ({
      base: 0.7 + b * 0.045,
      waveK: 3 + b,
      waveAmp: 0.045 + b * 0.014,
      omega: 0.4 + b * 0.12,
      dir: b % 2 === 0 ? 1 : -1,
      phase: b * 1.3,
    }));

    let raf = 0;
    let t = 0;
    let last = performance.now();

    // Voice-reactive state (closure-persisted across frames).
    let vSmooth = 0;             // smoothed mic level (fast attack, slow release)
    let prevAbove = false;       // rising-edge detector for shock rings
    const shocks: { p: number }[] = []; // expanding rings, p = progress 0→1

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Smooth the raw mic level: jump up instantly, fall back slowly → the orb
      // "pops" the moment it hears the voice, then eases down between syllables.
      const rawV = voiceRef.current?.current ?? 0;
      vSmooth += (rawV - vSmooth) * (rawV > vSmooth ? 0.6 : 0.09);
      const V = vSmooth;

      const I = intensityRef.current + V * 1.8; // voice strongly brightens the orb
      t += dt * (0.45 + I * 0.75 + V * 2.4);     // …and spins it much faster

      // Rising edge above a low threshold → emit a shock ring on each syllable.
      const above = V > 0.18;
      if (above && !prevAbove) shocks.push({ p: 0 });
      prevAbove = above;

      c.clearRect(0, 0, size, size);

      // Whole-orb scale "breath": a gentle idle pulse plus a strong voice kick,
      // so pressing Space and speaking are both unmistakably visible.
      const breath = 0.012 * Math.sin(t * 2.2) * intensityRef.current;
      const pulseScale = 1 + breath + V * 0.14;
      c.save();
      c.translate(cx, cy);
      c.scale(pulseScale, pulseScale);
      c.translate(-cx, -cy);
      c.globalCompositeOperation = "lighter";

      const [r, g, bl] = colorRef.current;

      // ── Reactor core: soft central glow + faint concentric rings ──────────
      const glow = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
      glow.addColorStop(0, `rgba(${r},${g},${bl},${(0.10 + 0.18 * V) * I})`);
      glow.addColorStop(0.55, `rgba(${r},${g},${bl},${0.03 * I})`);
      glow.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      c.fillStyle = glow;
      c.fillRect(0, 0, size, size);

      const corePulse = 0.5 + 0.5 * Math.sin(t * 1.2);
      for (let k = 0; k < 3; k++) {
        const rr = R * (0.18 + k * 0.13);
        c.strokeStyle = `rgba(${r},${g},${bl},${(0.05 + 0.05 * corePulse) * I})`;
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, rr, 0, Math.PI * 2);
        c.stroke();
      }

      // ── Voice shock rings ─────────────────────────────────────────────────
      const radBump = 1 + V * 0.06; // particles also breathe outward on voice
      for (let i = shocks.length - 1; i >= 0; i--) {
        const s = shocks[i];
        s.p += dt * 1.9;
        if (s.p >= 1) {
          shocks.splice(i, 1);
          continue;
        }
        const rr = R * (0.26 + s.p * 0.78);
        const a = (1 - s.p) * 0.8 * Math.min(1.5, I);
        c.strokeStyle = `rgba(${r},${g},${bl},${a})`;
        c.lineWidth = 3 * (1 - s.p) + 0.6;
        c.beginPath();
        c.arc(cx, cy, rr, 0, Math.PI * 2);
        c.stroke();
      }

      // ── Particle ribbons ──────────────────────────────────────────────────
      for (const p of particles) {
        const cfg = bands[p.band];
        const ang = p.theta + cfg.dir * t * p.spin;
        const wave = Math.sin(cfg.waveK * p.theta + cfg.omega * t + cfg.phase);
        const radFrac = cfg.base + cfg.waveAmp * wave + p.jitter * 0.03;
        const rad = R * radFrac * radBump;
        const x = cx + Math.cos(ang) * rad;
        const y = cy + Math.sin(ang) * rad * 0.9; // slight vertical squash → depth

        const tw = 0.5 + 0.5 * Math.sin(p.twPhase + t * p.twSpeed);
        const alpha = Math.min(1, (0.10 + 0.5 * tw) * I);
        const ps = size * 0.0026 * (0.5 + tw * 0.85) * (1 + V * 1.1);

        c.fillStyle = `rgba(${r},${g},${bl},${alpha})`;
        c.beginPath();
        c.arc(x, y, ps, 0, Math.PI * 2);
        c.fill();
      }

      c.restore();
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size, display: "block", ...style }}
      aria-hidden
    />
  );
}
