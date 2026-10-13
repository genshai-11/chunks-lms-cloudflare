/**
 * Lightweight canvas-based confetti explosion effect.
 * Generates celebratory particles that shoot up and rain down,
 * matching a "rớt pháo hoa" (dropping fireworks/confetti) requirement.
 */
export function triggerConfetti() {
  if (typeof window === 'undefined') return

  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '9999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  let width = (canvas.width = window.innerWidth)
  let height = (canvas.height = window.innerHeight)

  const handleResize = () => {
    width = canvas.width = window.innerWidth
    height = canvas.height = window.innerHeight
  }
  window.addEventListener('resize', handleResize)

  const colors = [
    '#a855f7', // Purple (main)
    '#c084fc', // Purple light
    '#e9d5ff', // Purple lighter
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f97316', // Orange
    '#ef4444', // Red
  ]

  const particles: Array<{
    x: number
    y: number
    vx: number
    vy: number
    color: string
    size: number
    rotation: number
    rotationSpeed: number
    opacity: number
  }> = []

  // Spawn particles shooting up from the bottom center (simulating fireworks launch)
  const particleCount = 140
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * 40,
      y: height + 20,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 22 - 12, // strong upward velocity
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 6,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 12,
      opacity: 1,
    })
  }

  function update() {
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)

    let active = false
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.55 // gravity pulling them down
      p.vx *= 0.985 // air resistance / friction

      p.rotation += p.rotationSpeed

      // Fade out slowly as they fall down
      if (p.vy > 0) {
        p.opacity -= 0.015
      }

      if (p.opacity > 0 && p.y < height + 20) {
        active = true
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = p.opacity
        ctx.fillStyle = p.color

        // Draw confetti rectangle
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      }
    }

    if (active) {
      requestAnimationFrame(update)
    } else {
      window.removeEventListener('resize', handleResize)
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas)
      }
    }
  }

  update()
}
