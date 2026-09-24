# Linkage Lab

An open-source, entirely client-side mountain bike suspension workbench. Built with Vite, React, TypeScript, Tailwind CSS, Lucide React, and Recharts. No account, backend, API keys, or image uploads to a server.

## Setup & development

Use **Node.js 22.12+** (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev -- --host 0.0.0.0
```

Open the URL printed by Vite. No environment variables are required.

```sh
npm run lint       # Oxlint (React + TypeScript)
npm run typecheck  # TypeScript project check
npm test           # Vitest physics and validation tests
npm run test:watch
npm run build      # Type-check and production bundle in dist/
npm run preview    # Serve the production build locally
```

## Using the workbench

1. **Choose a layout.** Horst Link, linkage-driven Single Pivot, and Twin-link / VPP each load valid, illustrative geometry and a 55 mm shock stroke. Changing layout resets pivots and calibration. The initial Horst demo produces approximately 149 mm vertical travel.
2. **Upload a reference.** Use a level side-on photo at full extension. JPEG, PNG, and WebP under 12 MB / 60 MP are accepted. Adjust opacity to see the links. Images stay in browser memory.
3. **Calibrate the rim.** Click Calibrate and move the two orange endpoints to opposite bead seats of one rim. Enter its bead-seat diameter: 622 mm for 29″, 584 mm for 27.5″, or 559 mm for 26″. Do not measure the tire. The image is displayed in normalized canvas units; scale = rim diameter / calibration distance, independent of pan and zoom.
4. **Place pivots.** Drag the crosshairs, or focus a pin and press arrow keys (1 mm, Shift for 10 mm). The Coordinates tab provides numeric editing relative to BB, with X right and Y up. Drag BB to move the origin. Wheel/trackpad scrolling and +/- zoom the canvas; drag empty space to pan. Reset view restores the viewport.
5. **Analyze.** Enter shock stroke, scrub the suspension, or play its motion. Return to 0% to edit geometry. Charts, four readouts, an axle path, and a keyboard-accessible checkpoint table update as you edit.
6. **Export.** JSON includes topology, canvas coordinates, calibration, physical units, summary, warnings, and all samples. CSV contains `travel_mm,compression_mm,leverage_ratio,axle_x_mm,axle_y_mm`. Reloading clears the study; export before leaving. JSON import is not implemented.

### Link definitions

| Pin | Meaning | Attachment |
| --- | --- | --- |
| BB | Bottom bracket | Fixed coordinate origin |
| RA | Rear axle | B–C coupler for Horst/twin-link; A–B swingarm for single pivot |
| A | Main frame pivot | Fixed |
| B | Lower link / Horst pivot | Moving end of A–B |
| C | Stay / rocker pivot | Moving joint of B–C and D–C |
| D | Rocker frame pivot | Fixed |
| S1 | Upper shock mount | Fixed to frame |
| S2 | Lower shock mount | Rigidly attached to rocker D–C |

The extra B pivot is necessary to close a four-bar loop; axle and Horst pivot are separate points. Single Pivot is **linkage-driven**, not a direct-mounted shock model. Twin-link and Horst use the same four-bar equations with different geometry and link proportions. Floating shocks / alternative shock attachments are outside this version's model.

## Solver & limits

`src/kinematics.ts` is independent of React. It solves A–B–C–D by intersecting fixed-radius circles about B and D while preserving the initial assembly branch. The input A–B angle is swept in 0.001 rad increments, then bisection solves the loop at **0.25 mm shock compression increments** and the exact stroke endpoint. Very short partial ranges retain the angular samples. Link lengths and rigid axle/shock attachments are conserved.

- Vertical wheel travel is upward displacement from the initial rear axle.
- Leverage is the finite-difference derivative of vertical wheel travel with respect to shock compression (centered differences inside the curve, one-sided endpoints).
- Progression is `(1 - final leverage / initial leverage) × 100%`. Positive is progressive, negative is regressive.
- The solver stops at a toggle, infeasible closure, wheel/shock reversal, or maximum 3 rad sweep. A partial-range warning reports when full stroke is unavailable; exports retain the warning.
- Validation rejects nonfinite inputs, invalid calibration, collapsed links, impossible shock stroke, and geometry where upward wheel motion extends the shock.

These are rigid, planar kinematics. Photo perspective and pin-placement accuracy affect results. No flex, tire deformation, frame rotation, interference/collision checks, anti-squat, anti-rise, spring/damping forces, or structural safety analysis. Demo geometries are not production-bike measurements. Unit tests check all three topologies, analytic rotation, parallelogram translation, calibration invariance, mirrored photos, rigid lengths, endpoints, and invalid/partial configurations.

## Deployment

Import this repository into **Vercel**, select the Vite framework, and use Node 24. `vercel.json` specifies `npm run build` and `dist`. Vercel installs dependencies from the lockfile; no secrets or server functions are needed. Pull requests receive previews when a Vercel project is connected. Nothing is deployed automatically by this repository itself.

Any static host can also serve `dist/` at its site root. The app has no client-side routes, so no SPA rewrite is necessary.

## License

MIT. This project is independent and is not affiliated with Linkage X3 or its authors.
