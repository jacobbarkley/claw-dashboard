"use client"

import { useEffect, useRef, useCallback } from "react"

// ── Particle system ────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number
  vx: number; vy: number
  radius: number; opacity: number
}

function initParticles(w: number, h: number, count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.12,
    radius: Math.random() * 0.7 + 0.3,
    opacity: Math.random() * 0.18 + 0.04,
  }))
}

// ── Contour SVG paths (topology-style wavy lines) ─────────────────────────────
// Pre-computed sinusoidal paths relative to a 1440×900 viewport
const CONTOUR_PATHS = [
  "M-100,220 C200,200 400,240 700,215 C1000,190 1200,230 1540,210",
  "M-100,380 C150,360 350,400 650,375 C950,350 1150,395 1540,370",
  "M-100,520 C180,505 420,540 720,515 C1020,490 1220,530 1540,510",
  "M-100,650 C160,635 380,668 680,645 C980,622 1200,660 1540,640",
  "M-100,760 C200,748 450,775 750,755 C1050,735 1250,762 1540,750",
  // Steeper arcs — navigation bearing lines
  "M300,-50 C320,200 290,500 310,950",
  "M720,-50 C740,200 710,500 730,950",
  "M1100,-50 C1120,200 1090,500 1110,950",
]

export function AmbientField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const mouseRef = useRef({ x: 0.5, y: 0.5 })
  const gradientOriginRef = useRef({ x: 0.5, y: 0.5 })

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { width: w, height: h } = canvas

    ctx.clearRect(0, 0, w, h)

    // Drift gradient origin toward mouse (very slow)
    gradientOriginRef.current.x += (mouseRef.current.x - gradientOriginRef.current.x) * 0.003
    gradientOriginRef.current.y += (mouseRef.current.y - gradientOriginRef.current.y) * 0.003

    const ox = gradientOriginRef.current.x * w
    const oy = gradientOriginRef.current.y * h

    // Base gradient — desaturated indigo, lower intensity
    const grad = ctx.createRadialGradient(ox * 0.3 + w * 0.1, oy * 0.4 + h * 0.1, 0, w * 0.5, h * 0.5, w * 0.85)
    grad.addColorStop(0,   "rgba(55, 30, 130, 0.15)")
    grad.addColorStop(0.4, "rgba(40, 20, 90,  0.09)")
    grad.addColorStop(1,   "rgba(3,   1,  12, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Secondary bloom — cooler, more graphite-indigo
    const grad2 = ctx.createRadialGradient(
      w - ox * 0.2 - w * 0.05, h * 0.15, 0,
      w * 0.78, h * 0.22, w * 0.5
    )
    grad2.addColorStop(0,   "rgba(70, 40, 160, 0.10)")
    grad2.addColorStop(0.5, "rgba(45, 25, 100, 0.05)")
    grad2.addColorStop(1,   "rgba(3,   1,  12, 0)")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, w, h)

    // Particles
    const particles = particlesRef.current
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      if (p.x < -2) p.x = w + 2
      if (p.x > w + 2) p.x = -2
      if (p.y < -2) p.y = h + 2
      if (p.y > h + 2) p.y = -2

      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(150, 130, 220, ${p.opacity * 0.7})`
      ctx.fill()
    }

    rafRef.current = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      particlesRef.current = initParticles(canvas.width, canvas.height, 45)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      }
    }

    resize()
    window.addEventListener("resize", resize)
    window.addEventListener("mousemove", onMouseMove)
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMouseMove)
    }
  }, [draw])

  return (
    <>
      {/* Canvas: particles + parallax gradients */}
      <canvas
        ref={canvasRef}
        className="cb-ambient-layer"
        aria-hidden
      />

      {/* SVG: contour field + orbital arcs — fixed behind everything */}
      <svg
        className="cb-ambient-layer"
        aria-hidden
        xmlns="http://www.w3.org/2000/svg"
        style={{ zIndex: 1 }}
      >
        <defs>
          <filter id="contour-blur">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        {/* Topology contour lines — reduced opacity */}
        <g filter="url(#contour-blur)" stroke="#6040b0" fill="none" strokeWidth="0.5">
          {CONTOUR_PATHS.map((d, i) => (
            <path key={i} d={d} strokeOpacity={i < 5 ? 0.035 : 0.02} />
          ))}
        </g>

        {/* Page-level orbital arcs — very low opacity */}
        <g fill="none" stroke="#5030a0" strokeWidth="0.5">
          <ellipse cx="50%" cy="108%" rx="52%" ry="40%" strokeOpacity="0.05" />
          <ellipse cx="50%" cy="108%" rx="72%" ry="58%" strokeOpacity="0.035" />
          <ellipse cx="50%" cy="108%" rx="95%" ry="78%" strokeOpacity="0.022" />
          <ellipse cx="50%" cy="108%" rx="120%" ry="100%" strokeOpacity="0.012" />
        </g>

        {/* Navigation bearing ticks (top-right corner) */}
        <g stroke="#7c3aed" strokeWidth="0.5" strokeOpacity="0.09">
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180)
            const cx = typeof window !== "undefined" ? window.innerWidth : 1440
            const r1 = 120, r2 = i % 3 === 0 ? 134 : 126
            return (
              <line
                key={i}
                x1={`calc(100% + ${Math.cos(angle) * r1}px)`}
                y1={Math.sin(angle) * r1 + 0}
                x2={`calc(100% + ${Math.cos(angle) * r2}px)`}
                y2={Math.sin(angle) * r2 + 0}
              />
            )
          })}
          <circle cx="100%" cy="0" r="120" fill="none" strokeOpacity="0.06" />
          <circle cx="100%" cy="0" r="90"  fill="none" strokeOpacity="0.04" />
        </g>
      </svg>
    </>
  )
}
