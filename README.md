# Facade Maker

A browser-based design tool for houses, built around the facade. Set a brief and a site, and it produces a buildable house, dresses it in any of 15 facade systems, and draws it as a full drawing set. Change anything and every view updates together.

## What it can do

### 1. 3D view
- Opens on a rotatable 3D axonometric of the whole house: walls, slabs, parapet, stair head-room and the chosen facade, with see-through framed glazing showing the furnished rooms inside.
- Drawn the way an architect draws: flat tones and crisp outlines, no glossy rendering.
- Orbit, pan and zoom; save the view as a PNG.

- A shaped, non-box plan: the upper wing beside the stair cantilevers 3 m over a covered porch (past 1.8 m it becomes a glazed lounge bay carried on columns that keep clear of the entrance path), slides back 1.5 m at the rear for a roof terrace with a glass door and balustrade, and the ground-floor entrance recesses under the floor above. Storey outlines are true rectilinear shapes (L-plans, notches, steps), so plans, elevations, section, roof plan, 3D, facade zones and the floating roof lid all follow them. Every move is adjustable or can be switched off.
- Site works on a 15 × 30 m plot with real setbacks all round (front 6, sides 3, rear 6): a boundary wall on the plot line (1.2 m at the front with a sliding car gate and a pedestrian gate on the entrance path), a 3 m covered rear verandah on slim columns with steps to the garden and French doors from the dining room, and a backyard with lawn, a paved sit-out, planting bed and trees. Shown on the ground floor plan, site plan, rear and side elevations, section and 3D; all adjustable under Site works.

### 2. Plans
- Lays out the house automatically from the brief: floors, bedrooms, bathrooms, studies and parking.
- Living spaces face the street, bedrooms sit above, and the stair and bathrooms stack on one core.
- Edit the plan by hand: drag walls (they snap to 150 mm and the structural grid), split and merge rooms, change room types, move the stair, and resize or remove any window or door.
- Shows each room's area and the total built-up area as you edit.
- Detailed drawing layer: timber-board and tile floor finishes, room tags with clear ceiling heights, kitchen wall units, covered porch and terrace paving with falls, lines of floors above and below, and the roof lid outline.
- Every room is furnished automatically to suit its type and size (beds, wardrobes, sofas, dining sets, kitchen runs, desks, bathroom fittings), kept clear of door swings and windows, and re-planned whenever the layout changes.
- Proper floor plans: solid cut walls, door swings, window cills, stair arrows with riser count, grid bubbles, dimensions, levels and a north arrow.
- A site and roof plan shows setbacks, parking bays, roof falls and outlets.

### 3. Elevations
- All four elevations, fully dimensioned, with floor levels and the structural grid.
- 15 modern facade systems, led by Voronoi and green: a cushioned Voronoi shell (every window sits in its own organic cell), a bone-like Voronoi web screen, fluid flow lines that part around openings like water, a Voronoi living wall with planted cells, pastel terracotta baguettes in quiet sage, sand and clay, and a vertical garden net; then dichroic glass fins, wave ribbons, twisting aluminium fins, aerofoil louvres, diagrid exoskeleton, parametric perforated skin, faceted hex tiles, UHPC brise-soleil grid and, last, chromatic Voronoi glass.
- Each facade has 4–7 adjustable settings in real units, 3 material palettes, and can be set differently for each elevation.
- Facades respond to the sun: denser and deeper on the hot faces, lighter on the north, using the site's latitude.
- Facades never block a door, and any screen in front of a window lets through enough air for the room behind it.
- Compare mode shows 2–4 facades side by side on the same elevation at the same scale.

### Also included
- A section through the stair.
- Schedules of facade components, windows and doors, rooms and stair data.
- A live warnings list that checks room sizes, daylight, ventilation, stair rules, structural spans, setbacks and stacked bathrooms.
- Every drawing on an A3 sheet with a title block; export as SVG or print to PDF.
- Works on phones: single-column layout, swipeable facade strip, pinch-zoom on drawings, touch-sized edit handles.
- Save and open projects as JSON; undo and redo; autosave in the browser.

## Run it

```
npm install
npm run dev        # open the address it prints
npm test           # headless acceptance test (Node 22+)
npm run build
```

Keys: `A` 3D, `P` plans, `E` elevations, `S` section, `R` schedule, `C` compare, `F` fit, `1`–`9`,`0` facades 01–10 (`⇧1`–`⇧5` for 11–15), `[` `]` cycle, `Ctrl/⌘Z` undo.

Built with React, TypeScript, Three.js, Vite and Zustand. Runs entirely in the browser, with no server.
