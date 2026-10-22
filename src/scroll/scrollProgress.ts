import { reducedMotion, staticHero } from '../ui/preferences'

/** The actual sticky height is shared with CSS, including stable mobile viewport units. */
export function trackScrollProgress(section: HTMLElement, onChange: (progress: number) => void) {
  const sticky = section.querySelector<HTMLElement>('.hero-sticky')!
  let frame = 0

  const update = () => {
    frame = 0
    const range = section.offsetHeight - sticky.offsetHeight
    const scrolled = -section.getBoundingClientRect().top
    onChange(!staticHero() && range > 0 ? Math.min(1, Math.max(0, scrolled / range)) : 0)
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }

  addEventListener('scroll', schedule, { passive: true })
  addEventListener('resize', schedule)
  addEventListener('herolayoutchange', schedule)
  reducedMotion.addEventListener('change', schedule)
  const observer = new ResizeObserver(schedule)
  observer.observe(section)
  observer.observe(sticky)
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
