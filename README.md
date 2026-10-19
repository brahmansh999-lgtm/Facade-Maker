# Facade Maker

Browser-only parametric residence + facade design tool. React + Vite + TypeScript + three.js (MeshBasicMaterial + edges only) + zustand. No backend.

```
npm install
npm run dev        # app
npm test           # headless acceptance test (Node 22+)
npm run build
```

- `src/model` — project types, defaults, layout solver, solar, validators, derive, edit ops
- `src/geometry` — walls, openings, stair, faces
- `src/facades` — one file per facade type (15) + `registry.ts`, `kit.ts`, `validate.ts`
- `src/drawings` — painter (SVG / canvas), plans, elevations, section, site/roof, dims, title block
- `src/three` — axonometric scene and facade meshes
- `src/ui` — rail, viewport, plan editor, inspector, schedule
- `src/export` — SVG, print (A3 PDF via print dialog), JSON, PNG

Keys: `1`–`9`,`0` facades 01–10 (`⇧1`–`⇧5` for 11–15), `[` `]` cycle, `E`/`A`/`P`/`S`/`R` views, `C` compare, `F` fit, `Ctrl/⌘Z` undo, `⇧` + that redo.
Deep links: `#plan`, `#axo`, `#section`, `#schedule`, `#compare`, `#elev-rear`, `#roof`.
