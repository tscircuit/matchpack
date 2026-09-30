# Regulator rail placement evidence

These are actual Core schematic renders of the same five-component circuit, with automatic schematic layout and no schematic coordinates. Only the Matchpack implementation changes between renders.

- Core: `ee6f10e4b7541ccfcedb66b23a23e58434d6cc06` (0.0.2024).
- Before: Matchpack `19fc12204765acda80dce87648c15c47c8056701` (repro PR #275).
- After: this branch's singleton decoupling partition fix.
- Source: `core-render.test.tsx.txt`, retained verbatim from the temporary Core test.

To reproduce, copy the source to `tests/repros/stm32-regulator-rail-placement.test.tsx` in Core, install Core dependencies, and build the desired Matchpack checkout. Temporarily link Core's `node_modules/@tscircuit/matchpack` to that checkout, run `BUN_UPDATE_SNAPSHOTS=1 bun test tests/repros/stm32-regulator-rail-placement.test.tsx`, and restore Core's dependency afterward. Repeat with the other Matchpack checkout. The PNGs are rasterizations of the saved SVG snapshots.

Before, both capacitors sit above the ground side of the regulator. After, C1 sits beside VI/VBUS on the right, while C2 remains beside VO/V3V3 on the left. The solver regression asserts these opposite sides and zero component overlaps; the separate direct-connection test protects pin-connected grouping.
