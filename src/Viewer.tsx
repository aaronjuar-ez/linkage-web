import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Focus, Minus, Plus } from 'lucide-react'
import { PIN_COLORS, PIN_LABELS, PIN_SHORT } from './kinematics'
import type { Geometry, Pin, Point, Sample, Topology } from './kinematics'

type Props = {
  geometry: Geometry
  onChange: (id: Pin, point: Point) => void
  current: Geometry
  samples: Sample[]
  topology: Topology
  image: { url: string; width: number; height: number } | null
  opacity: number
  calibrating: boolean
  calibration: [Point, Point]
  onCalibration: (points: [Point, Point]) => void
  selected: Pin
  onSelect: (pin: Pin) => void
  labels: boolean
  scale: number
  moving: boolean
}
const DEFAULT_VIEW = { x: -240, y: -40, width: 1800, height: 950 }
function zoomView(v: typeof DEFAULT_VIEW, factor: number, anchor?: Point) {
  const width = Math.min(5400, Math.max(300, v.width * factor))
  const ratio = width / v.width
  const a = anchor ?? { x: v.x + v.width / 2, y: v.y + v.height / 2 }
  return { x: a.x - (a.x - v.x) * ratio, y: a.y - (a.y - v.y) * ratio, width, height: v.height * ratio }
}
export function Viewer(props: Props) {
  const { geometry: g, current: p, image, calibrating, calibration, scale } = props
  const svg = useRef<SVGSVGElement>(null)
  const [view, setView] = useState(DEFAULT_VIEW)
  const drag = useRef<{ id: Pin | 'cal0' | 'cal1' | 'pan'; start: Point; origin: Point } | null>(null)
  const toScene = (x: number, y: number): Point => {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const point = new DOMPoint(x, y).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }
  const start = (event: ReactPointerEvent<SVGElement>, id: Pin | 'cal0' | 'cal1' | 'pan') => {
    if (event.button !== 0 || (id !== 'pan' && props.moving && !calibrating)) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const origin = id === 'pan' ? { x: view.x, y: view.y } : id === 'cal0' ? calibration[0] : id === 'cal1' ? calibration[1] : g[id]
    drag.current = { id, start: toScene(event.clientX, event.clientY), origin }
    if (id !== 'pan' && id !== 'cal0' && id !== 'cal1') props.onSelect(id)
  }
  const move = (event: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    const point = toScene(event.clientX, event.clientY)
    if (d.id === 'pan') {
      setView(v => ({ ...v, x: v.x + d.start.x - point.x, y: v.y + d.start.y - point.y }))
      return
    }
    const next = { x: d.origin.x + point.x - d.start.x, y: d.origin.y + point.y - d.start.y }
    if (d.id === 'cal0') props.onCalibration([next, calibration[1]])
    else if (d.id === 'cal1') props.onCalibration([calibration[0], next])
    else props.onChange(d.id, next)
  }
  const zoom = (factor: number) => setView(v => zoomView(v, factor))
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const matrix = element.getScreenCTM()
      if (!matrix) return
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      setView(v => zoomView(v, event.deltaY > 0 ? 1.1 : .9, anchor))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const poly = (points: Point[]) => points.map(point => `${point.x},${point.y}`).join(' ')
  const front = { x: 1120, y: 500 }
  const radius = 311
  const line = (a: Point, b: Point, color: string, width = 7) => <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width} strokeLinecap="round" />
  return <div className="relative bg-[#171b1c]">
    <svg ref={svg} className="scene block h-[380px] w-full sm:h-[470px] lg:h-[510px]"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      aria-label="Interactive suspension geometry. Drag pins or use arrow keys on focused pins. Drag the background to pan."
      onPointerDown={e => start(e, 'pan')} onPointerMove={move}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onLostPointerCapture={() => { drag.current = null }}>
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#36403d" strokeWidth="1" opacity=".55" /></pattern>
      </defs>
      <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" />
      {image ? <image href={image.url} x="-150" y="50" width="1500" height={1500 * image.height / image.width} opacity={props.opacity} /> :
        <g opacity={props.opacity} fill="none" stroke="#7d8982">
          {[g.axle, front].map((wheel, i) => <g key={i}>
            <circle cx={wheel.x} cy={wheel.y} r={radius + 35} strokeWidth="23" stroke="#58605b" />
            <circle cx={wheel.x} cy={wheel.y} r={radius} strokeWidth="5" />
            <circle cx={wheel.x} cy={wheel.y} r="20" strokeWidth="4" />
            {Array.from({ length: 16 }, (_, j) => <line key={j} x1={wheel.x} y1={wheel.y} x2={wheel.x + Math.cos(j * Math.PI / 8) * radius} y2={wheel.y + Math.sin(j * Math.PI / 8) * radius} strokeWidth="1" />)}
          </g>)}
          <path d={`M ${g.bb.x} ${g.bb.y} L 465 115 L 990 130 L 1035 225 Z M 465 115 L 430 20 M 1035 225 L 1120 500 M 990 130 L 1080 475`}
            strokeWidth="22" strokeLinejoin="round" />
          <path d="M 405 20 L 515 20 M 990 130 L 975 55 L 1040 55" strokeWidth="14" strokeLinecap="round" />
          <circle cx={g.bb.x} cy={g.bb.y} r="48" strokeWidth="9" />
          <path d={`M ${g.bb.x} ${g.bb.y} l 35 75 h 40`} strokeWidth="9" />
        </g>}
      <g opacity=".3" stroke="#bac9bf" strokeDasharray="7 8" fill="none">
        <polyline points={poly([g.main, g.chain, g.stay, g.rocker])} strokeWidth="3" />
        <line x1={g.bb.x - 120} y1={g.bb.y} x2={g.bb.x + 160} y2={g.bb.y} />
        <line x1={g.bb.x} y1={g.bb.y - 130} x2={g.bb.x} y2={g.bb.y + 120} />
      </g>
      {props.samples.length > 0 && <polyline points={poly(props.samples.map(s => s.points.axle))} fill="none" stroke="#a4c9fa" strokeWidth="3" strokeDasharray="6 6" />}
      <g fill="#d4ed8310" strokeLinejoin="round">
        <polygon points={poly(props.topology === 'single' ? [p.main, p.chain, p.axle] : [p.chain, p.stay, p.axle])} stroke="#a1b663" strokeWidth="5" />
        <polygon points={poly([p.rocker, p.stay, p.shockMoving])} stroke="#d4ed83" strokeWidth="6" />
        {line(p.main, p.chain, '#d4ed83')}
        {line(p.chain, p.stay, '#a1b663', 5)}
        {line(p.shockFixed, p.shockMoving, '#334c65', 24)}
        {line(p.shockFixed, p.shockMoving, '#a4c9fa', 7)}
      </g>
      {(Object.keys(PIN_LABELS) as Pin[]).map(id => <g key={id} className="pin" role="button" tabIndex={0}
        aria-label={`${PIN_LABELS[id]} pin. Arrow keys move 1 mm, Shift moves 10 mm.`}
        aria-pressed={props.selected === id}
        onPointerDown={e => start(e, id)}
        onFocus={() => props.onSelect(id)}
        onKeyDown={e => {
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
          e.preventDefault()
          if (props.moving) return
          const step = (e.shiftKey ? 10 : 1) / scale
          props.onChange(id, { x: g[id].x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: g[id].y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) })
        }}
        transform={`translate(${p[id].x},${p[id].y})`} opacity={calibrating ? .35 : 1}>
        <circle r="34" fill="transparent" />
        <circle className="pin-focus" r="29" stroke="#fff" fill="none" strokeWidth="3" opacity="0" />
        {props.selected === id && <circle r="24" fill={`${PIN_COLORS[id]}22`} stroke={PIN_COLORS[id]} strokeWidth="1" />}
        <circle r="12" fill="#161b19" stroke={PIN_COLORS[id]} strokeWidth="3" />
        <path d="M -19 0 H 19 M 0 -19 V 19" stroke={PIN_COLORS[id]} strokeWidth="2" />
        {props.labels && <g transform="translate(22,-30)">
          <rect x="-5" y="-16" width="35" height="25" rx="4" fill="#141917" />
          <text fontSize="17" fontFamily="monospace" fill={PIN_COLORS[id]}>{PIN_SHORT[id]}</text>
        </g>}
      </g>)}
      {calibrating && <g stroke="#f4bd86" strokeWidth="3">
        <line x1={calibration[0].x} y1={calibration[0].y} x2={calibration[1].x} y2={calibration[1].y} strokeDasharray="9 6" />
        {calibration.map((point, i) => <g key={i} transform={`translate(${point.x},${point.y})`} className="pin" role="button" tabIndex={0}
          aria-label={`Calibration endpoint ${i + 1}`}
          onPointerDown={e => start(e, i === 0 ? 'cal0' : 'cal1')}
          onKeyDown={e => {
            if (!e.key.startsWith('Arrow')) return
            e.preventDefault()
            const step = e.shiftKey ? 10 : 1
            const next = { x: point.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: point.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) }
            props.onCalibration(i === 0 ? [next, calibration[1]] : [calibration[0], next])
          }}>
          <circle r="35" fill="transparent" stroke="none" /><circle className="pin-focus" r="30" fill="none" stroke="#fff" opacity="0" />
          <circle r="15" fill="#33281f" /><path d="M -24 0 H 24 M 0 -24 V 24" />
          <text x="27" y="6" fontSize="19" stroke="none" fill="#f4bd86">{i + 1}</text>
        </g>)}
      </g>}
    </svg>
    <div className="absolute left-4 top-4 flex gap-2 text-[10px]">
      <span className="rounded border border-[#414a42] bg-[#202720]/95 px-2.5 py-1.5 text-lime">{image ? 'YOUR REFERENCE' : 'DEMO GEOMETRY'}</span>
      <span className="rounded border border-[#3c4444] bg-[#1a2020]/95 px-2.5 py-1.5 text-[#c1c9c3]">SIDE VIEW</span>
    </div>
    <div className="absolute bottom-4 right-4 flex gap-1 rounded-lg border border-[#434a46] bg-[#1b2120]/95 p-1">
      <button className="icon-btn" aria-label="Zoom out" onClick={() => zoom(1.25)}><Minus size={16} /></button>
      <span className="number self-center px-1 text-[10px]">{Math.round(DEFAULT_VIEW.width / view.width * 100)}%</span>
      <button className="icon-btn" aria-label="Zoom in" onClick={() => zoom(.8)}><Plus size={16} /></button>
      <span className="mx-1 w-px bg-[#424944]" />
      <button className="icon-btn" aria-label="Reset view" onClick={() => setView(DEFAULT_VIEW)}><Focus size={16} /></button>
    </div>
    <p className="absolute bottom-4 left-4 max-w-[48%] text-[10px] text-[#b0bbb3]">{calibrating ? 'Place 1 & 2 on opposite rim bead seats' : props.moving ? 'Return to 0% to edit pins' : 'Drag pins to edit · drag canvas to pan'}</p>
  </div>
}
