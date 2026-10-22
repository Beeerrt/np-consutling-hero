/** Shared with the 600 / 1024 px layout breakpoints in style.css. */
export const mobileLayout = matchMedia('(max-width: 1024px)')
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)')

export function staticHero() {
  return reducedMotion.matches || document.documentElement.classList.contains('compact-hero') || document.documentElement.classList.contains('scene-unavailable')
}
