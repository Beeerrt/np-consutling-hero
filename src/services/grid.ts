import * as THREE from 'three'

export interface GridOptions {
  half: number
  step: number
  y?: number
  /** Grundopazität der Linien */
  alpha?: number
  /** 0 = gleichmäßig, 1 = zum Rand hin ausgeblendet */
  falloff?: number
  /** Linienfarbe als RGB 0..1 */
  color?: [number, number, number]
}

/** Raster in der XZ-Ebene; in isometrischer Ansicht ergibt das die typische Rautenstruktur. */
export function floorGrid(o: GridOptions) {
  const { half, step } = o
  const y = o.y ?? 0
  const alpha = o.alpha ?? 0.12
  const [cr, cg, cb] = o.color ?? [0.1, 0.1, 0.12]
  const falloff = o.falloff ?? 0.6
  const pieces = 32
  const pos: number[] = []
  const col: number[] = []

  const fade = (x: number, z: number) => 1 - falloff * Math.min(1, Math.hypot(x, z) / (half * 1.05)) ** 1.5

  const line = (x1: number, z1: number, x2: number, z2: number) => {
    for (let i = 0; i < pieces; i++) {
      const a = i / pieces
      const b = (i + 1) / pieces
      const ax = x1 + (x2 - x1) * a
      const az = z1 + (z2 - z1) * a
      const bx = x1 + (x2 - x1) * b
      const bz = z1 + (z2 - z1) * b
      pos.push(ax, y, az, bx, y, bz)
      col.push(cr, cg, cb, alpha * fade(ax, az), cr, cg, cb, alpha * fade(bx, bz))
    }
  }

  const n = Math.floor(half / step)
  for (let k = -n; k <= n; k++) {
    const c = k * step
    line(c, -half, c, half)
    line(-half, c, half, c)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })
  const lines = new THREE.LineSegments(geo, mat)
  lines.renderOrder = -1
  lines.userData.dispose = () => {
    geo.dispose()
    mat.dispose()
  }
  return lines
}
