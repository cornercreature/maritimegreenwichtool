# Greenwich — Bearing Studio

A dependency-free browser graphic tool: a flat blue globe, a draggable white point, and a straight line oriented along the projected spherical initial bearing toward the historic Airy Transit Circle at the Royal Observatory in Greenwich.

## Run

Requires Python 3 and Node.js (Node is only needed for tests).

```sh
npm start
# Open http://127.0.0.1:4173
npm test
```

The application is static HTML, CSS, and native JavaScript modules in `dist/`. Any static web host can serve that directory; no build step, package installation, server API, or credentials are required. Open it through an HTTP server rather than `file://`, which blocks ES module loading in some browsers.

## Use

- Drag the white point or click anywhere inside the globe. Off-globe drags stop at the rim.
- Rotate longitude with **Rotation** and change the viewing latitude with **Tilt** to reach the entire globe. These move the camera, preserving the point’s geographic location. A point on the far side disappears; **Bring point into view** centers the camera on it.
- Adjust point diameter, line thickness, and line length. Length is a percentage of globe diameter; size and thickness are in the 1,000-unit SVG coordinate system. The point stays on the line, which extends equally in each direction.
- Enable the grid, Greenwich reference marker, and navigation data independently. All are off initially. Navigation data adds a small directional arrow on the Greenwich-facing half of the line. A Greenwich marker on the far side is hidden, with its status reported in the navigation panel.
- The point is keyboard accessible: focus it and use arrow keys for one-degree steps, or Shift + arrow for five degrees. Controls support ordinary keyboard navigation.
- **Export SVG** downloads a standalone 1,600 × 1,600 scalable artwork, including enabled visual overlays and excluding app controls and the HTML navigation panel. Export clips the line at the square artwork boundary. The globe itself does not clip the line.
- Browser-local storage remembers settings and the point. Reset restores the initial composition and turns overlays off. Storage is optional; there are no external scripts, analytics, or outbound position requests.

## Geometry and historical context

The Airy Transit Circle target is approximately **51.477806° N, 0.001472° W** in modern geographic coordinates. It is the physical historic observatory reference, rather than the modern zero-longitude meridian about 102 metres east.

For unit position vector `p` and target vector `g`, the great-circle tangent at the point is:

```text
t = normalize(g − dot(p, g) p)
```

The camera’s east/right and north/up basis vectors project the sphere orthographically. Projecting `t` gives the straight line’s on-screen direction. This is the initial tangent of a great-circle route, so it need not aim directly at Greenwich’s projected marker. A route traced over the surface would generally curve on this projection. The bearing readout is true azimuth measured clockwise from local north; at exact poles the stored longitude supplies the meridian convention.

The central angle uses `atan2(length(g − dot(p,g)p), dot(p,g))`, which behaves well near zero and 180°. Distance follows the historical spherical navigation convention of 60 nautical miles per degree. The model treats geographic latitude as spherical latitude and is not an ellipsoidal geodesic solver.

At Greenwich the direction is undefined; at its antipode there are infinitely many shortest routes. The tool hides the line in both cases. A tangent aimed exactly along the viewing axis also has no visible direction, so the line is hidden until the view changes. Back-side positions are hidden rather than mapped incorrectly to the front hemisphere.

Historic celestial navigation used spherical triangles to calculate celestial altitude and azimuth, while marine chronometers related observed local time to Greenwich time for longitude. This terrestrial bearing graphic draws on that geometry, but is not a sextant simulation or a celestial line of position. In the intercept method, a celestial line of position is perpendicular to the celestial azimuth.

References:

- [NOAA — What is longitude?](https://oceanservice.noaa.gov/facts/longitude.html)
- [Royal Museums Greenwich — Airy Transit Circle telescope](https://www.rmg.co.uk/royal-observatory/attractions/airy-transit-circle-telescope)
- [Royal Museums Greenwich — site guide, including the 102 m modern meridian offset](https://www.rmg.co.uk/sites/default/files/Secondary%20School%20Guide.pdf)
- [Bowditch, The American Practical Navigator — Celestial Navigation](https://thenauticalalmanac.com/2024_Bowditch-_American_Practical_Navigator/Volume_1/05_Volume_1_Part_3_Celestial_Navigation/Part_3_Celestial_Navigation.pdf)

## Files

- `dist/index.html` — accessible app structure and method notes
- `dist/styles.css` — responsive layout and artwork styling
- `dist/navigation.js` — independent unit-sphere geometry
- `dist/app.js` — interaction, rendering, overlays, storage, and export
- `tests/navigation.test.js` — geographic round trips, known bearings, tangent invariants, inverse projection, degeneracies, and finite-difference projection checks
- `.openai/hosting.json` — Sites static hosting identity

A separate GitHub repository is not required to run or host the tool. The source is portable and can be committed to GitHub unchanged.
