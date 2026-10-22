import { mobileLayout } from './preferences'

export function initNavigation() {
  const toggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!
  const dialog = document.querySelector<HTMLDialogElement>('#mobile-menu')!
  const closeButton = dialog.querySelector<HTMLButtonElement>('.menu-close')!
  let scrollY = 0
  let locked = false

  const close = () => {
    dialog.close()
    onClose()
  }
  const open = () => {
    if (dialog.open) return
    scrollY = window.scrollY
    locked = true
    document.body.style.top = `-${scrollY}px`
    document.documentElement.classList.add('menu-open')
    dialog.showModal()
    toggle.setAttribute('aria-expanded', 'true')
  }
  const onClose = () => {
    if (!locked) return
    locked = false
    document.documentElement.classList.remove('menu-open')
    document.body.style.removeProperty('top')
    // Restore the underlying page before a selected anchor starts scrolling.
    window.scrollTo({ top: scrollY, behavior: 'instant' })
    toggle.setAttribute('aria-expanded', 'false')
    if (mobileLayout.matches) toggle.focus({ preventScroll: true })
  }
  const onClick = (event: MouseEvent) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]')
    if (link) {
      event.preventDefault()
      const target = document.querySelector<HTMLElement>(link.hash)
      close()
      // close events are queued by the native dialog; restore scroll before navigating.
      requestAnimationFrame(() => {
        history.pushState(null, '', link.hash)
        target?.scrollIntoView({ block: 'start' })
      })
    } else if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close()
    }
  }
  const onBreakpoint = () => {
    if (!mobileLayout.matches && dialog.open) close()
  }

  toggle.addEventListener('click', open)
  closeButton.addEventListener('click', close)
  dialog.addEventListener('click', onClick)
  dialog.addEventListener('close', onClose)
  mobileLayout.addEventListener('change', onBreakpoint)

  return () => {
    if (dialog.open) {
      close()
      onClose()
    }
    toggle.removeEventListener('click', open)
    closeButton.removeEventListener('click', close)
    dialog.removeEventListener('click', onClick)
    dialog.removeEventListener('close', onClose)
    mobileLayout.removeEventListener('change', onBreakpoint)
  }
}
