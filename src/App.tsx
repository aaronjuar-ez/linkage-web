import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Activity, ArrowDownToLine, ArrowUpRight, CircleHelp, Code2, Crosshair, FileJson, ImagePlus, Info, Link2, Maximize2, MoveVertical, Pause, Play, RotateCcw, Ruler, SlidersHorizontal, Trash2, TrendingDown, X } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { analyze, distance, PIN_COLORS, PIN_LABELS, PIN_SHORT, PRESETS } from './kinematics'
import type { Geometry, Pin, Point, Topology } from './kinematics'
import { Viewer } from './Viewer'

const DEFAULT_CALIBRATION: [Point, Point] = [{ x: 145, y: 189 }, { x: 145, y: 811 }]
const format = (n: number, decimals = 1) => Number.isFinite(n) ? n.toFixed(decimals) : '—'
const download = (content: string, type: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function NumberField({ label, value, onChange, min, max, step = .1, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; disabled?: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(Number(value.toFixed(3)))) }, [value])
  return <label className="block min-w-0">
    <span className="field-label">{label}</span>
    <input type="number" value={draft} min={min} max={max} step={step} disabled={disabled}
      onFocus={() => { focused.current = true }}
      onChange={e => {
        setDraft(e.target.value)
        if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber)
      }}
      onBlur={() => { focused.current = false; setDraft(String(Number(value.toFixed(3)))) }} />
  </label>
}
export default function App() {
  const [topology, setTopology] = useState<Topology>('horst')
  const [geometry, setGeometry] = useState<Geometry>(PRESETS.horst.geometry)
  const [stroke, setStroke] = useState(55)
  const [diameter, setDiameter] = useState(622)
  const [calibration, setCalibration] = useState<[Point, Point]>(DEFAULT_CALIBRATION)
  const [calibrating, setCalibrating] = useState(false)
  const [selected, setSelected] = useState<Pin>('bb')
  const [tab, setTab] = useState<'setup' | 'pivots'>('setup')
  const [labels, setLabels] = useState(true)
  const [opacity, setOpacity] = useState(.32)
  const [image, setImage] = useState<{ url: string; width: number; height: number; name: string } | null>(null)
  const [imageError, setImageError] = useState('')
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [guide, setGuide] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const upload = useRef<HTMLInputElement>(null)
  const uploadSequence = useRef(0)
  const calibrationLength = distance(...calibration)
  const validCalibration = diameter >= 100 && diameter <= 1000 && calibrationLength >= 10
  const scale = validCalibration ? diameter / calibrationLength : 1
  const analysis = useMemo(() => analyze(geometry, topology, validCalibration ? scale : 0, stroke), [geometry, topology, scale, validCalibration, stroke])
  const currentSample = analysis.samples[Math.min(analysis.samples.length - 1, Math.round(position / 100 * (analysis.samples.length - 1)))]
  const current = currentSample?.points ?? geometry
  const startLR = analysis.samples[0]?.leverage ?? 0
  const endLR = analysis.samples.at(-1)?.leverage ?? 0
  const error = !validCalibration ? 'Enter a rim diameter from 100 to 1,000 mm and separate calibration endpoints by at least 10 canvas units.' : analysis.error
  const stop = () => { setPlaying(false); setPosition(0) }
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => setPosition(p => p >= 100 ? 0 : Math.min(100, p + 1)), 40)
    return () => window.clearInterval(timer)
  }, [playing])
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url) }, [image])
  const changePin = (id: Pin, point: Point) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return
    stop()
    setGeometry(g => ({ ...g, [id]: point }))
  }
  const loadPreset = (value: Topology) => {
    stop()
    setTopology(value)
    setGeometry(PRESETS[value].geometry)
    setStroke(PRESETS[value].stroke)
    setCalibration(DEFAULT_CALIBRATION)
    setDiameter(622)
    setCalibrating(false)
    setAnnouncement(`${PRESETS[value].name} demo loaded. Geometry and calibration reset.`)
  }
  const reset = () => {
    loadPreset('horst')
    uploadSequence.current++
    setImage(null)
    setImageError('')
    setOpacity(.32)
    setSelected('bb')
    setResetPending(false)
  }
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImageError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setImageError('Choose a JPEG, PNG, or WebP image under 12 MB.')
      return
    }
    const sequence = ++uploadSequence.current
    const url = URL.createObjectURL(file)
    const picture = new Image()
    picture.onload = () => {
      if (sequence !== uploadSequence.current) { URL.revokeObjectURL(url); return }
      if (picture.width < 100 || picture.height < 100 || picture.width * picture.height > 60_000_000) {
        setImageError('Use an image at least 100 × 100 pixels and below 60 megapixels.')
        URL.revokeObjectURL(url)
        return
      }
      stop()
      setImage({ url, name: file.name, width: picture.width, height: picture.height })
      setOpacity(.65)
      setTab('setup')
      setCalibrating(true)
      setAnnouncement('Photo loaded. Calibrate the rim, then place pivots on your bike.')
    }
    picture.onerror = () => { URL.revokeObjectURL(url); setImageError('This image could not be decoded. Try another JPEG, PNG, or WebP.') }
    picture.src = url
  }
  const exportData = (type: 'json' | 'csv') => {
    if (error) return
    const rows = analysis.samples.map(s => ({
      travel_mm: Number(s.travel.toFixed(6)), compression_mm: Number(s.compression.toFixed(6)),
      leverage_ratio: Number(s.leverage.toFixed(6)), axle_x_mm: Number(s.axleX.toFixed(6)),
      axle_y_mm: Number(((geometry.bb.y - s.points.axle.y) * scale).toFixed(6)),
    }))
    if (type === 'csv') {
      download([Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).join(','))].join('\r\n'), 'text/csv;charset=utf-8', `linkage-${topology}.csv`)
    } else {
      download(JSON.stringify({
        version: 1, topology, units: 'mm', origin: 'bottom bracket', axes: { x: 'right in image', y: 'up' },
        geometryCanvas: geometry, calibration: { points: calibration, diameterMm: diameter, mmPerCanvasUnit: scale },
        shockStrokeMm: stroke, summary: { travelMm: analysis.travel, compressionMm: analysis.compression, progressionPercent: analysis.progression },
        warning: analysis.warning, samples: rows,
      }, null, 2), 'application/json', `linkage-${topology}.json`)
    }
    setAnnouncement(`${type.toUpperCase()} exported with ${rows.length} samples.`)
  }
  return <div className="min-h-screen">
    <a href="#workbench" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-lime focus:p-4 focus:text-black">Skip to workbench</a>
    <header className="border-b border-[#303536]">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-5 sm:px-8 lg:px-10">
        <a href="#workbench" className="flex items-center gap-3" aria-label="Linkage Lab home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-[#1b2316]"><Link2 size={25} strokeWidth={2.5} /></span>
          <span className="text-lg font-bold tracking-[-.04em]">linkage<span className="ml-1 font-normal text-[#acb3aa]">lab</span></span>
          <span className="ml-2 hidden rounded border border-[#41493b] px-1.5 py-.5 text-[9px] tracking-widest text-lime sm:inline">BETA</span>
        </a>
        <nav className="flex items-center gap-2 sm:gap-5" aria-label="Resources">
          <button className="btn border-transparent! bg-transparent!" onClick={() => setGuide(!guide)} aria-expanded={guide} aria-label="How it works"><CircleHelp size={15} /><span className="hidden sm:inline">How it works</span></button>
          <a className="btn" href="https://github.com/aaronjuar-ez/linkage-web" target="_blank" rel="noreferrer" aria-label="Source code on GitHub (opens new tab)"><Code2 size={15} /><span className="hidden sm:inline">Source code</span><ArrowUpRight size={13} /></a>
        </nav>
      </div>
    </header>
    <main id="workbench" className="mx-auto max-w-[1600px] px-4 pb-8 pt-7 sm:px-8 lg:px-10">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2 text-lime!">Open-source suspension workbench</p>
          <h1 className="text-[28px] font-medium leading-tight tracking-[-.045em] sm:text-[36px]">Every millimeter matters.</h1>
          <p className="muted mt-2 text-sm">Map your linkage. Explore the motion. Find your curve.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => setResetPending(true)}><RotateCcw size={14} />Reset study</button>
          <button className="btn primary" disabled={!!error} onClick={() => exportData('json')}><ArrowDownToLine size={15} />Export JSON</button>
        </div>
      </div>
      {resetPending && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#7c6953] bg-[#30281f] p-4 text-sm">
        <p>Reset all pivots, calibration, and the reference photo?</p>
        <div className="flex gap-2"><button className="btn" onClick={() => setResetPending(false)}>Cancel</button><button className="btn primary" onClick={reset}>Reset to demo</button></div>
      </div>}
      {guide && <section className="panel mb-6 p-5" aria-label="Getting started">
        <div className="mb-4 flex justify-between"><h2 className="text-base font-medium">From photo to suspension curve</h2><button className="icon-btn" aria-label="Close guide" onClick={() => setGuide(false)}><X size={16} /></button></div>
        <div className="grid gap-5 text-xs leading-6 text-[#c0c8c1] md:grid-cols-3">
          <p><b className="text-lime">01 / Set the scene.</b><br />Choose a topology first, then upload a level, side-on photo at full extension. Drag the two calibration points to opposite bead seats of the same rim. A 29″ rim uses a 622 mm bead-seat diameter, not the tire outside diameter.</p>
          <p><b className="text-lime">02 / Map the pivots.</b><br />A and D are fixed frame pivots. B and C close the four-bar loop. For Horst and twin-link, the axle is rigidly attached to B–C; for single pivot it is attached to A–B. S1 is fixed to the frame and S2 to rocker D–C. BB sets the coordinate origin.</p>
          <p><b className="text-lime">03 / Read the motion.</b><br />Enter the shock stroke. Scrub or play the travel, inspect the live leverage curve, and export samples. Coordinates and pins are editable at 0%. Focus pins and use arrow keys (Shift for 10 mm) or enter precise values in Coordinates.</p>
        </div>
      </section>}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="panel min-w-0" aria-labelledby="geometry-heading">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#34393a] px-5 py-4">
            <div className="flex items-center gap-2.5"><Crosshair size={16} className="text-lime" /><h2 id="geometry-heading" className="text-sm font-medium">Geometry workspace</h2><span className="hidden text-xs text-[#6d7770] sm:inline">/</span><span className="muted hidden text-xs sm:inline">{PRESETS[topology].name}</span></div>
            <label className="muted flex items-center gap-2 text-xs"><input type="checkbox" checked={labels} onChange={e => setLabels(e.target.checked)} className="accent-lime" />Pin labels</label>
          </div>
          <Viewer geometry={geometry} current={current} onChange={changePin} topology={topology} samples={analysis.samples}
            image={image} opacity={opacity} calibrating={calibrating} calibration={calibration}
            onCalibration={points => { stop(); setCalibration(points) }} selected={selected}
            onSelect={setSelected} labels={labels} scale={scale} moving={position > 0 || playing} />
          <div className="border-t border-[#34393a] px-5 py-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <label htmlFor="travel" className="flex items-center gap-2"><Activity size={14} className="text-lime" />Cycle suspension</label>
              <span className="number muted">{format(currentSample?.travel ?? 0)} mm wheel <span className="mx-2 text-[#69716c]">/</span> {format(currentSample?.compression ?? 0)} mm shock</span>
            </div>
            <div className="flex items-center gap-4">
              <button className="icon-btn shrink-0 border border-[#48513e] bg-[#2d3623] text-lime" disabled={!!error} onClick={() => { setCalibrating(false); setPlaying(!playing) }} aria-label={playing ? 'Pause animation' : 'Play animation'}>{playing ? <Pause size={15} /> : <Play size={15} />}</button>
              <span className="number muted text-[10px]">0%</span>
              <input id="travel" type="range" min="0" max="100" step="0.1" value={position} disabled={!!error} onChange={e => { setPlaying(false); setCalibrating(false); setPosition(Number(e.target.value)) }} aria-valuetext={`${format(currentSample?.travel ?? 0)} mm wheel travel`} />
              <span className="number muted text-[10px]">100%</span>
              <button className="icon-btn shrink-0" aria-label="Return to full extension" onClick={stop}><RotateCcw size={15} /></button>
            </div>
          </div>
        </section>
        <aside className="panel" aria-label="Study configuration">
          <div className="flex items-center gap-2 border-b border-[#34393a] px-5 py-4"><SlidersHorizontal size={16} className="text-lime" /><h2 className="text-sm font-medium">Study setup</h2></div>
          <div className="flex px-5" role="tablist" aria-label="Configuration sections">
            <button id="setup-tab" className="tab" role="tab" aria-selected={tab === 'setup'} aria-controls="setup-panel" onClick={() => setTab('setup')}>Setup</button>
            <button id="pivots-tab" className="tab" role="tab" aria-selected={tab === 'pivots'} aria-controls="pivots-panel" onClick={() => setTab('pivots')}>Coordinates</button>
          </div>
          {tab === 'setup' ? <div id="setup-panel" role="tabpanel" aria-labelledby="setup-tab" className="p-5">
            <label className="field-label" htmlFor="topology"><span className="mr-2 text-[#718165]">01</span>Suspension layout</label>
            <select id="topology" value={topology} onChange={e => loadPreset(e.target.value as Topology)}>
              {(Object.keys(PRESETS) as Topology[]).map(key => <option key={key} value={key}>{PRESETS[key].name}</option>)}
            </select>
            <p className="muted mt-2 text-[10px] leading-4">{PRESETS[topology].description}. Changing layout resets pivots and calibration.</p>
            <div className="my-5 h-px bg-[#34393a]" />
            <p className="field-label"><span className="mr-2 text-[#718165]">02</span>Reference image</p>
            <input ref={upload} className="sr-only" tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload bike photo" onChange={onUpload} />
            <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-[#535e50] bg-[#232922] px-3 py-4 hover:bg-[#2c3429]" onClick={() => upload.current?.click()}>
              <ImagePlus size={20} className="text-lime" /><span className="max-w-full truncate text-xs">{image ? image.name : 'Upload a side-view photo'}</span><span className="muted text-[10px]">JPEG, PNG, WebP · max 12 MB</span>
            </button>
            {imageError && <p role="alert" className="mt-2 text-xs text-[#f4bd86]">{imageError}</p>}
            <div className="mt-3 flex items-center justify-between text-[11px]"><label htmlFor="opacity" className="muted">Reference opacity</label><span className="number">{Math.round(opacity * 100)}%</span></div>
            <input id="opacity" type="range" min="0" max="1" step=".01" value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
            {image && <button className="muted mt-1 flex items-center gap-1 text-[10px]" onClick={() => { uploadSequence.current++; setImage(null); setOpacity(.32) }}><Trash2 size={11} />Remove photo</button>}
            <div className="my-4 h-px bg-[#34393a]" />
            <div className="mb-3 flex items-center justify-between"><p className="field-label mb-0!"><span className="mr-2 text-[#718165]">03</span>Wheel calibration</p><Ruler size={14} className="muted" /></div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <NumberField label="Bead-seat diameter (mm)" value={diameter} min={100} max={1000} step={1} onChange={n => { stop(); setDiameter(n) }} />
              <button className={`btn h-[42px] ${calibrating ? 'primary' : ''}`} onClick={() => { stop(); setCalibrating(!calibrating) }} aria-pressed={calibrating}>{calibrating ? 'Done' : 'Calibrate'}</button>
            </div>
            <p className="muted mt-2 text-[10px] leading-4">{calibrating ? 'Drag orange endpoints across the rim, bead to bead. Use arrow keys for precision.' : '29″ = 622 mm · 27.5″ = 584 mm · 26″ = 559 mm'}</p>
            <div className="mt-2 flex items-center justify-between rounded bg-[#252c24] px-2 py-1.5 text-[10px]"><span className="text-[#b7c6ab]">{image ? 'Photo scale' : 'Demo scale'}</span><span className="number text-lime">{validCalibration ? format(scale, 4) : '—'} mm / canvas unit</span></div>
            <div className="my-4 h-px bg-[#34393a]" />
            <NumberField label="Shock stroke (mm)" value={stroke} min={1} max={200} step={.5} onChange={n => { stop(); setStroke(n) }} />
          </div> : <div id="pivots-panel" role="tabpanel" aria-labelledby="pivots-tab" className="p-5">
            <p className="muted mb-4 text-xs leading-5">Coordinates in millimeters, relative to BB. +X is right; +Y is up. Fixed pivots: A, D, S1.</p>
            <div className="space-y-1">
              {(Object.keys(PIN_LABELS) as Pin[]).map(id => <button key={id} onClick={() => setSelected(id)} aria-pressed={selected === id}
                className={`flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-xs ${selected === id ? 'bg-[#303a29] text-lime' : 'text-[#bcc4bd] hover:bg-[#262d29]'}`}>
                <span className="flex items-center gap-2"><span className="number w-6 text-[10px]" style={{ color: PIN_COLORS[id] }}>{PIN_SHORT[id]}</span>{PIN_LABELS[id]}</span><Crosshair size={12} />
              </button>)}
            </div>
            <div className="my-4 h-px bg-[#3b423b]" />
            <p className="mb-3 text-xs font-medium">{PIN_LABELS[selected]}</p>
            <div className="grid grid-cols-2 gap-3">
              <NumberField key={`${selected}-x`} label="X (mm)" value={(geometry[selected].x - geometry.bb.x) * scale} disabled={selected === 'bb' || position > 0 || playing}
                onChange={n => changePin(selected, { ...geometry[selected], x: geometry.bb.x + n / scale })} />
              <NumberField key={`${selected}-y`} label="Y (mm)" value={(geometry.bb.y - geometry[selected].y) * scale} disabled={selected === 'bb' || position > 0 || playing}
                onChange={n => changePin(selected, { ...geometry[selected], y: geometry.bb.y - n / scale })} />
            </div>
            <p className="muted mt-3 text-[10px] leading-5">{selected === 'bb' ? 'BB is the origin (0, 0). Drag its pin on the canvas to reposition the origin.' : 'Focus a canvas pin and use arrow keys: 1 mm. Hold Shift: 10 mm.'}</p>
            {(position > 0 || playing) && <button className="btn mt-3 w-full" onClick={stop}>Return to 0% to edit</button>}
          </div>}
        </aside>
      </div>
      {(error || analysis.warning) && <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-[#78644d] bg-[#30281f] px-4 py-3 text-xs leading-5 text-[#f4cba3]"><Info size={17} className="shrink-0" /><div><b>{error ? 'Check your setup. ' : 'Partial motion range. '}</b>{error ?? analysis.warning}</div></div>}
      <section aria-label="Analysis summary" className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {[
          { title: 'Vertical wheel travel', value: analysis.travel, unit: 'mm', icon: MoveVertical, note: 'Full valid motion range', accent: true },
          { title: 'Leverage ratio', value: startLR, unit: ': 1', icon: Activity, note: `${format(startLR, 2)} → ${format(endLR, 2)} across travel`, accent: false },
          { title: 'Overall progression', value: analysis.progression, unit: '%', icon: TrendingDown, note: analysis.progression >= 0 ? 'Decreasing leverage ratio' : 'Increasing leverage · regressive', accent: false },
          { title: 'Shock compression', value: analysis.compression, unit: 'mm', icon: Maximize2, note: `${format(analysis.initialLength)} mm initial eye-to-eye`, accent: false },
        ].map(item => <div className="panel px-4 py-4 sm:px-5" key={item.title}>
          <div className="mb-3 flex items-center justify-between gap-2"><p className="text-[10px] text-[#b1b9b1] sm:text-xs">{item.title}</p><item.icon size={14} className={item.accent ? 'text-lime' : 'text-[#889882]'} /></div>
          <p className={`number text-2xl tracking-tight sm:text-3xl ${item.accent ? 'text-lime' : ''}`}>{error ? '—' : format(item.value, item.title === 'Leverage ratio' ? 2 : 1)}<span className="ml-2 text-xs text-[#a1aba2]">{item.unit}</span></p>
          <p className="muted mt-2 text-[10px] leading-4">{error ? 'Waiting for valid geometry' : item.note}</p>
        </div>)}
      </section>
      <section className="panel" aria-labelledby="chart-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#34393a] px-5 py-4">
          <div><h2 id="chart-title" className="text-sm font-medium">Leverage curve</h2><p className="muted mt-1 text-[11px]">Wheel movement per millimeter of shock compression</p></div>
          <div className="flex items-center gap-4"><span className="hidden items-center gap-2 text-[10px] text-[#b9c3b7] sm:flex"><span className="h-0.5 w-5 bg-lime" />{PRESETS[topology].name}</span><button className="btn" disabled={!!error} onClick={() => exportData('csv')}><ArrowDownToLine size={13} />Export CSV</button></div>
        </div>
        <div className="px-2 pt-5 sm:px-5">
          <p className="eyebrow mb-2 ml-4">Leverage ratio</p>
          <div className="h-[260px] w-full" role="img" aria-label={error ? 'Chart unavailable. Correct the setup errors.' : `Leverage ratio changes from ${format(startLR, 2)} to ${format(endLR, 2)} over ${format(analysis.travel)} millimeters. A numeric sample table follows.`}>
            {error ? <div className="muted flex h-full items-center justify-center text-sm">Your curve will appear when the geometry is valid.</div> :
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.samples} margin={{ top: 10, right: 25, left: 0, bottom: 15 }} accessibilityLayer>
                  <CartesianGrid stroke="#353d36" vertical={false} strokeDasharray="3 5" />
                  <XAxis dataKey="travel" type="number" domain={[0, 'dataMax']} tickFormatter={v => format(Number(v), 0)} stroke="#647064" tick={{ fill: '#adb9aa', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} tickFormatter={v => format(Number(v), 2)} stroke="#647064" tick={{ fill: '#adb9aa', fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                  <Tooltip contentStyle={{ background: '#202720', border: '1px solid #58604d', borderRadius: 8, color: '#f0f1ed', fontSize: 12 }} labelFormatter={v => `${format(Number(v))} mm travel`} formatter={v => [format(Number(v), 3), 'Leverage ratio']} />
                  <ReferenceLine x={currentSample?.travel ?? 0} stroke="#9fac94" strokeDasharray="4 4" />
                  <Line type="linear" dataKey="leverage" stroke="#d4ed83" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>}
          </div>
          <p className="eyebrow mb-5 text-center">Rear wheel travel (mm)</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#34393a] px-5 py-3 text-[10px] text-[#a8b3a4]">
          <span>{analysis.samples.length} solved positions · rigid links · planar motion</span>
          <span className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-[#f4bd86]' : 'bg-lime'}`} />{error ? 'Setup needs attention' : 'Updates as you edit'}</span>
        </div>
      </section>
      <div className="mt-5 grid items-start gap-5 lg:grid-cols-2">
        <details className="panel px-5 py-4">
          <summary className="text-xs font-medium">Sample data <span className="muted ml-2 font-normal">11 checkpoints · all samples in export</span></summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[11px]"><caption className="sr-only">Numeric leverage curve checkpoints</caption>
              <thead className="muted"><tr><th scope="col" className="pb-2">Travel (mm)</th><th scope="col">Shock (mm)</th><th scope="col">Leverage</th></tr></thead>
              <tbody className="number">{Array.from(new Set(Array.from({ length: 11 }, (_, i) => Math.round(i / 10 * (analysis.samples.length - 1))))).map(index => {
                const s = analysis.samples[index]
                return s && <tr key={index} className="border-t border-[#343d34]"><td className="py-2">{format(s.travel, 2)}</td><td>{format(s.compression, 2)}</td><td>{format(s.leverage, 3)}</td></tr>
              })}</tbody>
            </table>
          </div>
        </details>
        <details className="panel px-5 py-4">
          <summary className="text-xs font-medium">Model notes & assumptions</summary>
          <div className="muted mt-3 space-y-2 text-xs leading-6">
            <p>The solver closes A–B–C–D using circle intersections, preserving the initial assembly branch. It brackets motion at 0.001 rad increments, then solves at 0.25 mm shock increments and the exact final stroke.</p>
            <p>Leverage = Δvertical wheel travel / Δshock compression. Progression = (1 − final leverage / initial leverage) × 100%. Positive values mean decreasing leverage. Limits and reversals stop the sweep.</p>
            <p>Presets are illustrative geometry, not measured production bikes. This version assumes a frame-fixed upper shock mount and a rocker-mounted lower mount. No flex, bearing play, tire deformation, frame rotation, anti-squat, anti-rise, or collision detection. A side-on, level, full-extension photo gives the best measurements.</p>
          </div>
        </details>
      </div>
      <footer className="muted mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#303630] pt-5 text-[10px]">
        <p className="flex items-center gap-2"><FileJson size={13} />Your images and calculations stay in your browser. Reloading clears the study.</p>
        <p>Built for curious riders. Open to everyone.</p>
      </footer>
      <p className="sr-only" role="status">{announcement}</p>
    </main>
  </div>
}
