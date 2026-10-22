import './style.css'
import { PointCloudScene } from './scene/PointCloudScene'
import { trackScrollProgress } from './scroll/scrollProgress'
import { trackHandoff } from './scroll/handoff'
import { initServices } from './services'

const hero = document.querySelector<HTMLElement>('#hero')!
const sticky = hero.querySelector<HTMLElement>('.hero-sticky')!
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

let scene: PointCloudScene | null = null
if (webglAvailable()) {
  scene = new PointCloudScene(canvas)
} else {
  canvas.remove()
}

trackScrollProgress(hero, (p) => {
  document.documentElement.style.setProperty('--p', p.toFixed(4))
  sticky.classList.toggle('is-scrolled', p > 0.15)
  if (scene) scene.progress = p
})

const stopHandoff = trackHandoff(canvas, document.querySelector<HTMLElement>('#leistungen')!)
const stopServices = webglAvailable() ? initServices() : () => {}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    scene?.dispose()
    stopHandoff()
    stopServices()
  })
}
