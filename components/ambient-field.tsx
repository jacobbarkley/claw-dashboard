"use client"

import { useEffect, useRef, useCallback } from "react"

// ── Particle system ────────────────────────────────────────────────────────────
interface Particle {
  x: number; y: number
  vx: number; vy: number
  radius: number; opacity: number
}

// Three depth tiers — biased toward top of viewport (hero/chart region)
function initParticles(w: number, h: number): Particle[] {
  const particles: Particle[] = []

  // Tier 1: fine dust — 32 tiny, very faint, extremely slow
  for (let i = 0; i < 32; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.pow(Math.random(), 1.6) * h, // bias toward top
      vx: (Math.random() - 0.5) * 0.10,
      vy: (Math.random() - 0.5) * 0.07,
      radius: Math.random() * 0.35 + 0.18,
      opacity: Math.random() * 0.09 + 0.03,
    })
  }

  // Tier 2: mid-field — 16 medium, moderate opacity, moderate speed
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.pow(Math.random(), 1.3) * h,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.10,
      radius: Math.random() * 0.45 + 0.55,
      opacity: Math.random() * 0.12 + 0.05,
    })
  }

  // Tier 3: depth anchors — 5 slightly larger, sparse
  for (let i = 0; i < 5; i++) {
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h * 0.6, // upper 60% only
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.06,
      radius: Math.random() * 0.5 + 1.0,
      opacity: Math.random() * 0.10 + 0.04,
    })
  }

  return particles
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

    // Base gradient — cool indigo bloom
    const grad = ctx.createRadialGradient(ox * 0.3 + w * 0.1, oy * 0.4 + h * 0.1, 0, w * 0.5, h * 0.5, w * 0.85)
    grad.addColorStop(0,   "rgba(40, 55, 120, 0.14)")
    grad.addColorStop(0.4, "rgba(25, 40, 90,  0.08)")
    grad.addColorStop(1,   "rgba(5,  8,  26, 0)")
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)

    // Secondary bloom — deeper navy-indigo
    const grad2 = ctx.createRadialGradient(
      w - ox * 0.2 - w * 0.05, h * 0.15, 0,
      w * 0.78, h * 0.22, w * 0.5
    )
    grad2.addColorStop(0,   "rgba(35, 55, 130, 0.10)")
    grad2.addColorStop(0.5, "rgba(20, 35, 85,  0.05)")
    grad2.addColorStop(1,   "rgba(5,  8,  26, 0)")
    ctx.fillStyle = grad2
    ctx.fillRect(0, 0, w, h)

    // Particles — cool silver-white, read as stars against indigo
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
      ctx.fillStyle = `rgba(205, 220, 245, ${p.opacity * 0.65})`
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
      particlesRef.current = initParticles(canvas.width, canvas.height)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      }
    }

    resize()
    window.addEventListener("resize", resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

        {/* Topology contour lines — desaturated indigo, barely perceptible */}
        <g filter="url(#contour-blur)" stroke="#2a3560" fill="none" strokeWidth="0.5">
          {CONTOUR_PATHS.map((d, i) => (
            <path key={i} d={d} strokeOpacity={i < 5 ? 0.028 : 0.018} />
          ))}
        </g>
      </svg>
    </>
  )
}
