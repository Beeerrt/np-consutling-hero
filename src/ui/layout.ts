import { mobileLayout, reducedMotion } from './preferences'

/** Keep anchors and short / enlarged-text hero layouts in step with actual content. */
export function initLayout() {
  const root = document.documentElement
  const nav = document.querySelector<HTMLElement>('.nav')!
  const content = document.querySelector<HTMLElement>('.hero-content')!
  const title = content.querySelector<HTMLElement>('h1')!
  const titleLines = [...title.querySelectorAll<HTMLElement>('.hero-title-line')]
  const subtitle = content.querySelector<HTMLElement>('.hero-sub')!
  const cta = content.querySelector<HTMLElement>('.cta')!
  const pill = document.querySelector<HTMLElement>('.scan-pill')!
  let frame = 0
  const update = () => {
    frame = 0
    root.style.setProperty('--header-offset', `${Math.ceil(nav.getBoundingClientRect().bottom + 16)}px`)
    if (mobileLayout.matches) {
      // Measure the rendered font, including letter spacing and fallback fonts.
      const fontSize = parseFloat(getComputedStyle(title).fontSize)
      const widestLine = Math.max(...titleLines.map((line) => line.getBoundingClientRect().width))
      if (widestLine > 0) {
        const fittedSize = Math.floor(fontSize * (title.clientWidth - 1) / widestLine * 100) / 100
        title.style.setProperty('--hero-title-size', `${fittedSize}px`)
      }
    } else {
      title.style.removeProperty('--hero-title-size')
    }
    // Use intrinsic content sizes: the flexible space above the buttons must not
    // cause a full-height hero to switch back and forth between layouts.
    const contentStyle = getComputedStyle(content)
    const ctaStyle = getComputedStyle(cta)
    const pillStyle = getComputedStyle(pill)
    const minimumHeight = parseFloat(contentStyle.paddingTop) + title.offsetHeight
      + parseFloat(getComputedStyle(subtitle).marginTop) + subtitle.offsetHeight
      + cta.offsetHeight + parseFloat(ctaStyle.marginBottom)
      + pill.offsetHeight + parseFloat(pillStyle.marginBottom)
    const compact = mobileLayout.matches && (innerHeight <= 500 || minimumHeight > innerHeight)
    if (root.classList.contains('compact-hero') !== compact) {
      root.classList.toggle('compact-hero', compact)
      window.dispatchEvent(new Event('herolayoutchange'))
    }
  }
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update)
  }
  const observer = new ResizeObserver(schedule)
  ;[nav, content, title, subtitle, cta, pill].forEach((element) => observer.observe(element))
  addEventListener('resize', schedule)
  mobileLayout.addEventListener('change', schedule)
  reducedMotion.addEventListener('change', schedule)
  document.fonts.addEventListener('loadingdone', schedule)
  update()
  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
    removeEventListener('resize', schedule)
    mobileLayout.removeEventListener('change', schedule)
    reducedMotion.removeEventListener('change', schedule)
    document.fonts.removeEventListener('loadingdone', schedule)
  }
}
