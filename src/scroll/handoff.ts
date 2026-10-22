import { reducedMotion, staticHero } from '../ui/preferences'

/**
 * Übergabe Hero -> Leistungen: Die fixierte Punktwolke wandert beim Einscrollen der Leistungen-Sektion
 * nach oben, wird kleiner und dunkler und bleibt danach an der Sektion „kleben“ (scrollt mit hinaus).
 */
export function trackHandoff(canvas: HTMLElement, section: HTMLElement) {
  let frame = 0
  const sticky = document.querySelector<HTMLElement>('.hero-sticky')!
  const smooth = (x: number) => x * x * (3 - 2 * x)

  const update = () => {
    frame = 0
    const H = Math.min(sticky.offsetHeight, innerHeight)
    const top = section.getBoundingClientRect().top
    if (staticHero()) {
      canvas.style.setProperty('--scene-y', '0px')
      canvas.style.setProperty('--scene-s', '1')
      canvas.style.setProperty('--scene-o', (Math.min(1, Math.max(0, top / H)) * 0.5).toFixed(3))
      canvas.style.setProperty('--scene-fade', '0')
      return
    }
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
    if (!frame) frame = requestAnimationFrame(update)
  }

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  addEventListener('herolayoutchange', schedule)
  reducedMotion.addEventListener('change', schedule)
  const observer = new ResizeObserver(schedule)
  observer.observe(sticky)
  observer.observe(section)
  update()

  return () => {
    removeEventListener('scroll', schedule)
    removeEventListener('resize', schedule)
    removeEventListener('herolayoutchange', schedule)
    reducedMotion.removeEventListener('change', schedule)
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
