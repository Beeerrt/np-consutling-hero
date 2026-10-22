/**
 * Übergabe Hero -> Leistungen: Die fixierte Punktwolke wandert beim Einscrollen der Leistungen-Sektion
 * nach oben, wird kleiner und dunkler und bleibt danach an der Sektion „kleben“ (scrollt mit hinaus).
 */
export function trackHandoff(canvas: HTMLElement, section: HTMLElement) {
  let ticking = false
  const smooth = (x: number) => x * x * (3 - 2 * x)

  const update = () => {
    ticking = false
    const H = innerHeight
    const top = section.getBoundingClientRect().top
    const h = Math.min(1, Math.max(0, (H - top) / H))
    const e = smooth(h)

    const y = e * -0.29 * H + Math.min(0, top)
    const s = 1 - 0.4 * e
    const style = canvas.style
    style.setProperty('--scene-y', `${y.toFixed(1)}px`)
    style.setProperty('--scene-s', s.toFixed(4))
    style.setProperty('--scene-o', (1 - 0.5 * e).toFixed(3))
    style.setProperty('--scene-fade', e.toFixed(3))
  }

  const schedule = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(update)
  }

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  update()

  return () => {
    removeEventListener('scroll', schedule)
    removeEventListener('resize', schedule)
  }
}
