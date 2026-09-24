import { describe, expect, it } from 'vitest'
import { analyze, distance, intersection, pose, PRESETS } from './kinematics'
import type { Geometry, Topology } from './kinematics'

describe('planar linkage solver', () => {
  for (const topology of Object.keys(PRESETS) as Topology[]) {
    it(`${topology}: closes the loop and preserves rigid attachments through full stroke`, () => {
      const g = PRESETS[topology].geometry
      const result = analyze(g, topology, 1, 55)
      expect(result.error).toBeNull()
      expect(result.warning).toBeNull()
      expect(result.compression).toBeCloseTo(55, 6)
      expect(result.travel).toBeGreaterThan(140)
      expect(result.travel).toBeLessThan(170)
      expect(result.progression).toBeGreaterThan(10)
      const pairs = [['main', 'chain'], ['chain', 'stay'], ['rocker', 'stay'], ['rocker', 'shockMoving'], ['stay', 'shockMoving']] as const
      const axlePairs = topology === 'single' ? ['main', 'chain'] as const : ['chain', 'stay'] as const
      result.samples.forEach((s, index) => {
        for (const [a, b] of pairs) expect(distance(s.points[a], s.points[b])).toBeCloseTo(distance(g[a], g[b]), 7)
        for (const pin of axlePairs) expect(distance(s.points.axle, s.points[pin])).toBeCloseTo(distance(g.axle, g[pin]), 7)
        expect(s.points.main).toEqual(g.main)
        expect(s.points.rocker).toEqual(g.rocker)
        expect(s.points.shockFixed).toEqual(g.shockFixed)
        expect(Number.isFinite(s.leverage)).toBe(true)
        expect(s.leverage).toBeGreaterThan(0)
        expect(s.compression).toBeCloseTo(index * .25, 6)
        if (index > 0) expect(s.travel).toBeGreaterThan(result.samples[index - 1].travel)
      })
      expect(result.progression).toBeCloseTo((1 - result.samples.at(-1)!.leverage / result.samples[0].leverage) * 100, 8)
    })
  }
  it('matches analytic single-pivot axle coordinates for arbitrary rotation', () => {
    const g = PRESETS.single.geometry
    for (const angle of [0, .01, .1, .3]) {
      const p = pose(g, 'single', angle)!
      const dx = g.axle.x - g.main.x
      const dy = g.axle.y - g.main.y
      expect(p.axle.x).toBeCloseTo(g.main.x + dx * Math.cos(angle) - dy * Math.sin(angle), 9)
      expect(p.axle.y).toBeCloseTo(g.main.y + dx * Math.sin(angle) + dy * Math.cos(angle), 9)
    }
  })
  it('translates the coupler without rotation for a parallelogram linkage', () => {
    const g: Geometry = {
      bb: { x: 0, y: 0 }, main: { x: 0, y: 0 }, rocker: { x: 100, y: 0 },
      chain: { x: -50, y: Math.sqrt(7500) }, stay: { x: 50, y: Math.sqrt(7500) },
      axle: { x: -100, y: 120 }, shockFixed: { x: 100, y: -100 }, shockMoving: { x: 50, y: Math.sqrt(7500) },
    }
    for (const angle of [.01, .1, .2]) {
      const p = pose(g, 'horst', angle)!
      expect(p.stay.y).toBeCloseTo(p.chain.y, 8)
      expect(p.stay.x - p.chain.x).toBeCloseTo(100, 8)
      expect(p.axle.x - g.axle.x).toBeCloseTo(p.chain.x - g.chain.x, 8)
      expect(p.axle.y - g.axle.y).toBeCloseTo(p.chain.y - g.chain.y, 8)
    }
  })
  it('is invariant under image translation and image pixel scaling', () => {
    const g = PRESETS.horst.geometry
    const transformed = Object.fromEntries(Object.entries(g).map(([key, p]) => [key, { x: 2 * p.x + 500, y: 2 * p.y - 100 }])) as Geometry
    const a = analyze(g, 'horst', 1, 55)
    const b = analyze(transformed, 'horst', .5, 55)
    expect(a.travel).toBeCloseTo(b.travel, 7)
    expect(a.progression).toBeCloseTo(b.progression, 6)
    expect(a.samples[0].axleX).toBeCloseTo(b.samples[0].axleX, 7)
  })
  it('supports mirrored side-view photos without reversing travel', () => {
    const g = PRESETS.horst.geometry
    const mirrored = Object.fromEntries(Object.entries(g).map(([key, p]) => [key, { x: -p.x, y: p.y }])) as Geometry
    const a = analyze(g, 'horst', 1, 55)
    const b = analyze(mirrored, 'horst', 1, 55)
    expect(b.error).toBeNull()
    expect(a.travel).toBeCloseTo(b.travel, 6)
  })
  it('refines a non-grid shock stroke endpoint', () => {
    const a = analyze(PRESETS.horst.geometry, 'horst', 1, 31.37)
    expect(a.compression).toBeCloseTo(31.37, 8)
    expect(a.samples.at(-2)!.compression).toBeCloseTo(31.25, 6)
  })
  it('reports partial ranges without fabricating motion beyond a reversal', () => {
    const a = analyze(PRESETS.vpp.geometry, 'vpp', 1, 150)
    expect(a.error).toBeNull()
    expect(a.warning).toMatch(/limit|reversal|sweep/)
    expect(a.compression).toBeLessThan(150)
    expect(a.samples.every(s => s.leverage > 0 && Number.isFinite(s.leverage))).toBe(true)
  })
  it('rejects invalid calibration, stroke, coordinates, coincident pivots and extending shocks', () => {
    const g = PRESETS.horst.geometry
    for (const [scale, stroke] of [[0, 55], [NaN, 55], [1, 0], [1, -1], [1, 250], [1, Infinity]]) {
      expect(analyze(g, 'horst', scale, stroke).error).toBeTruthy()
    }
    expect(analyze({ ...g, main: { x: NaN, y: 0 } }, 'horst', 1, 55).error).toBeTruthy()
    expect(analyze({ ...g, chain: g.main }, 'horst', 1, 55).error).toBeTruthy()
    expect(analyze({ ...g, shockMoving: { x: 600, y: 335 } }, 'horst', 1, 55).error).toMatch(/compress/)
  })
  it('handles non-intersecting, coincident, and toggle circles', () => {
    expect(intersection({ x: 0, y: 0 }, { x: 5, y: 0 }, 2, 2, 1)).toBeNull()
    expect(intersection({ x: 0, y: 0 }, { x: 0, y: 0 }, 2, 2, 1)).toBeNull()
    expect(intersection({ x: 0, y: 0 }, { x: 4, y: 0 }, 2, 2, 1)).toBeNull()
    expect(intersection({ x: 0, y: 0 }, { x: 1, y: 0 }, 4, 2, 1)).toBeNull()
  })
})
