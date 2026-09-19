export type Point = { x: number; y: number }
export type Topology = 'horst' | 'single' | 'vpp'
export type Pin = 'bb' | 'axle' | 'main' | 'rocker' | 'chain' | 'stay' | 'shockFixed' | 'shockMoving'
export type Geometry = Record<Pin, Point>
export type Sample = {
  travel: number
  compression: number
  leverage: number
  axleX: number
  angle: number
  points: Geometry
}
export type Analysis = {
  samples: Sample[]
  travel: number
  compression: number
  progression: number
  initialLength: number
  warning: string | null
  error: string | null
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const rotate = (p: Point, center: Point, angle: number): Point => ({
  x: center.x + (p.x - center.x) * Math.cos(angle) - (p.y - center.y) * Math.sin(angle),
  y: center.y + (p.x - center.x) * Math.sin(angle) + (p.y - center.y) * Math.cos(angle),
})
const angleBetween = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x)
const attached = (p: Point, from: Point, to: Point, angle: number) => {
  const r = rotate(p, from, angle)
  return { x: r.x + to.x - from.x, y: r.y + to.y - from.y }
}

/** Intersection of two fixed-length links; the sign preserves the assembly branch. */
export function intersection(b: Point, d: Point, bc: number, dc: number, branch: number): Point | null {
  const length = distance(b, d)
  if (length < 1e-8 || length >= bc + dc - 1e-7 || length <= Math.abs(bc - dc) + 1e-7) return null
  const a = (bc * bc - dc * dc + length * length) / (2 * length)
  const h = Math.sqrt(Math.max(0, bc * bc - a * a))
  const dx = (d.x - b.x) / length
  const dy = (d.y - b.y) / length
  return { x: b.x + a * dx - branch * h * dy, y: b.y + a * dy + branch * h * dx }
}

export function pose(g: Geometry, topology: Topology, angle: number): Geometry | null {
  const { main: a, chain: b, stay: c, rocker: d } = g
  const branch = Math.sign((d.x - b.x) * (c.y - b.y) - (d.y - b.y) * (c.x - b.x))
  if (!branch) return null
  const nextB = rotate(b, a, angle)
  const nextC = intersection(nextB, d, distance(b, c), distance(d, c), branch)
  if (!nextC) return null
  const couplerAngle = angleBetween(nextB, nextC) - angleBetween(b, c)
  const rockerAngle = angleBetween(d, nextC) - angleBetween(d, c)
  return {
    ...g, chain: nextB, stay: nextC,
    axle: topology === 'single' ? rotate(g.axle, a, angle) : attached(g.axle, b, nextB, couplerAngle),
    shockMoving: rotate(g.shockMoving, d, rockerAngle),
  }
}

export function analyze(g: Geometry, topology: Topology, scale: number, stroke: number): Analysis {
  const empty: Analysis = { samples: [], travel: 0, compression: 0, progression: 0, initialLength: 0, warning: null, error: null }
  if (!Object.values(g).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
      !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(stroke) || stroke <= 0 || stroke > 200) {
    return { ...empty, error: 'Use finite coordinates, a valid calibration, and a shock stroke between 0 and 200 mm.' }
  }
  const length = distance(g.shockFixed, g.shockMoving) * scale
  if (length <= stroke || distance(g.main, g.chain) * scale < 2 ||
      distance(g.chain, g.stay) * scale < 2 || distance(g.rocker, g.stay) * scale < 2 ||
      distance(g.rocker, g.shockMoving) * scale < 2) {
    return { ...empty, error: 'Separate the link pivots and shock mounts. Shock eye-to-eye must exceed stroke.' }
  }
  const sample = (angle: number): Sample | null => {
    const p = pose(g, topology, angle)
    return p ? {
      angle, points: p, travel: (g.axle.y - p.axle.y) * scale,
      compression: length - distance(p.shockFixed, p.shockMoving) * scale,
      axleX: (p.axle.x - g.bb.x) * scale, leverage: 0,
    } : null
  }
  const probe = sample(0.0001)
  if (!probe) return { ...empty, error: 'The linkage is at a toggle or cannot close. Move a pivot away from the straight-line configuration.' }
  const direction = probe.travel > 0 ? 1 : -1
  if (probe.compression * direction <= 0 || Math.abs(probe.travel) < 1e-7) {
    return { ...empty, error: 'Upward axle motion must compress the shock. Move the moving shock mount to the other side of the rocker, or adjust the pivots.' }
  }
  const samples: Sample[] = [sample(0)!]
  let warning: string | null = null
  for (let i = 1; i <= 3000; i++) {
    let next = sample(direction * i * 0.001)
    const prev = samples[samples.length - 1]
    if (!next || next.travel <= prev.travel + 1e-8 || next.compression <= prev.compression + 1e-8) {
      warning = 'Motion stopped at a linkage limit or reversal before full shock stroke. Only the valid range is shown.'
      break
    }
    if (next.compression >= stroke) {
      let lo = (i - 1) * 0.001
      let hi = i * 0.001
      for (let j = 0; j < 35; j++) {
        const mid = (lo + hi) / 2
        if (sample(direction * mid)!.compression < stroke) lo = mid
        else hi = mid
      }
      next = sample(direction * (lo + hi) / 2)!
      samples.push(next)
      break
    }
    samples.push(next)
  }
  if (samples.length < 3) return { ...empty, error: 'Not enough valid motion. Adjust the pivot geometry.' }
  const last = samples[samples.length - 1]
  const increments: Sample[] = [samples[0]]
  let bracket = 1
  for (let compression = .25; compression < last.compression - 1e-6; compression += .25) {
    while (samples[bracket].compression < compression) bracket++
    let lo = Math.abs(samples[bracket - 1].angle)
    let hi = Math.abs(samples[bracket].angle)
    for (let j = 0; j < 25; j++) {
      const mid = (lo + hi) / 2
      if (sample(direction * mid)!.compression < compression) lo = mid
      else hi = mid
    }
    increments.push(sample(direction * (lo + hi) / 2)!)
  }
  increments.push(last)
  const output = increments.length >= 3 ? increments : samples
  output.forEach((s, i) => {
    const before = output[Math.max(0, i - 1)]
    const after = output[Math.min(output.length - 1, i + 1)]
    s.leverage = (after.travel - before.travel) / (after.compression - before.compression)
  })
  if (last.compression < stroke - 0.01 && !warning) warning = 'Maximum sweep reached before full shock stroke.'
  return {
    samples: output, travel: last.travel, compression: last.compression, initialLength: length,
    progression: (1 - last.leverage / output[0].leverage) * 100, warning, error: null,
  }
}

export const PIN_LABELS: Record<Pin, string> = {
  bb: 'Bottom bracket', axle: 'Rear axle', main: 'Main frame pivot', rocker: 'Rocker frame pivot',
  chain: 'Lower link / Horst pivot', stay: 'Stay / rocker pivot', shockFixed: 'Upper shock mount',
  shockMoving: 'Lower shock mount',
}
export const PIN_COLORS: Record<Pin, string> = {
  bb: '#f0f1ed', axle: '#d4ed83', main: '#d4ed83', chain: '#d4ed83',
  stay: '#d4ed83', rocker: '#d4ed83', shockFixed: '#a4c9fa', shockMoving: '#a4c9fa',
}
export const PIN_SHORT: Record<Pin, string> = {
  bb: 'BB', axle: 'RA', main: 'A', chain: 'B', stay: 'C', rocker: 'D', shockFixed: 'S1', shockMoving: 'S2',
}
export const PRESETS: Record<Topology, { name: string; description: string; geometry: Geometry; stroke: number }> = {
  horst: {
    name: 'Horst Link', description: 'Four-bar · axle on rear coupler', stroke: 55,
    geometry: {
      bb: { x: 575, y: 525 }, axle: { x: 145, y: 500 }, main: { x: 550, y: 460 },
      rocker: { x: 580, y: 300 }, chain: { x: 185, y: 535 }, stay: { x: 430, y: 260 },
      shockFixed: { x: 780, y: 290 }, shockMoving: { x: 560, y: 210 },
    },
  },
  single: {
    name: 'Single Pivot', description: 'Linkage-driven · axle on swingarm', stroke: 55,
    geometry: {
      bb: { x: 575, y: 525 }, axle: { x: 145, y: 500 }, main: { x: 550, y: 455 },
      rocker: { x: 575, y: 305 }, chain: { x: 415, y: 425 }, stay: { x: 490, y: 260 },
      shockFixed: { x: 780, y: 290 }, shockMoving: { x: 560, y: 210 },
    },
  },
  vpp: {
    name: 'Twin-link / VPP', description: 'Floating rear triangle · two short links', stroke: 55,
    geometry: {
      bb: { x: 575, y: 525 }, axle: { x: 145, y: 500 }, main: { x: 560, y: 470 },
      rocker: { x: 580, y: 300 }, chain: { x: 485, y: 530 }, stay: { x: 490, y: 320 },
      shockFixed: { x: 780, y: 290 }, shockMoving: { x: 570, y: 240 },
    },
  },
}
