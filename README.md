# Facade Maker

A browser-based design tool for houses, built around the facade. Set a brief and a site, and it produces a buildable house, dresses it in any of 15 facade systems, and draws it as a full drawing set. Change anything and every view updates together.

## What it can do

### 1. 3D view
- Opens on a rotatable 3D axonometric of the whole house: walls, slabs, parapet, stair head-room and the chosen facade.
- Drawn the way an architect draws: flat tones and crisp outlines, no glossy rendering.
- Orbit, pan and zoom; save the view as a PNG.

### 2. Plans
- Lays out the house automatically from the brief: floors, bedrooms, bathrooms, studies and parking.
- Living spaces face the street, bedrooms sit above, and the stair and bathrooms stack on one core.
- Edit the plan by hand: drag walls (they snap to 150 mm and the structural grid), split and merge rooms, change room types, move the stair, and resize or remove any window or door.
- Shows each room's area and the total built-up area as you edit.
- Proper floor plans: solid cut walls, door swings, window cills, stair arrows with riser count, grid bubbles, dimensions, levels and a north arrow.
- A site and roof plan shows setbacks, parking bays, roof falls and outlets.

### 3. Elevations
- All four elevations, fully dimensioned, with floor levels and the structural grid.
- 15 facade systems: jaali brick screen, timber fins, precast louvres, concrete egg-crate, exposed brick, fluted GRC, perforated weathering steel, lime render, double skin with mesh, terracotta baguettes, folded metal, stone cladding, timber shutters, green facade and ribbed cast stone.
- Each facade has 4–7 adjustable settings in real units, 3 material palettes, and can be set differently for each elevation.
- Facades respond to the sun: denser and deeper on the hot faces, lighter on the north, using the site's latitude.
- Facades never block a door, and any screen in front of a window lets through enough air for the room behind it.
- Compare mode shows 2–4 facades side by side on the same elevation at the same scale.

### Also included
- A section through the stair.
- Schedules of facade components, windows and doors, rooms and stair data.
- A live warnings list that checks room sizes, daylight, ventilation, stair rules, structural spans, setbacks and stacked bathrooms.
- Every drawing on an A3 sheet with a title block; export as SVG or print to PDF.
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
