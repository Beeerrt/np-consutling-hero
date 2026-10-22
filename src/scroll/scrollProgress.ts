/** Liefert den Scrollfortschritt 0..1 einer Sticky-Section und ruft `onChange` bei Änderungen auf. */
export function trackScrollProgress(section: HTMLElement, onChange: (progress: number) => void) {
  let ticking = false

  const update = () => {
    ticking = false
    const range = section.offsetHeight - innerHeight
    const scrolled = -section.getBoundingClientRect().top
    onChange(range > 0 ? Math.min(1, Math.max(0, scrolled / range)) : 0)
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
