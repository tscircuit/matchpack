# matchpack

The goal of this module is to find the best schematic layout for a set of `SchematicChip`s and `SchematicGroups` containing
`SchematicPins` connected to each other with `SchematicTraces`

To do this, we use a series of solvers that are run in a pipeline. Each solver is responsible for a specific piece of
input preprocessing or calculation.

This is roughly the hierarchy of solvers:

```
LayoutPipelineSolver: Runs pipeline
↳ ChipPartitionsSolver: Creates partitions (small subset groups) surrounding complex chips
  ↳ SingleChipPartitionSolver: Creates a single partition for a single chip
↳ PartitionPackingSolver: Packs the laid out chip partitions into a single layout
```

## Snapshot tests from TSX

Create a `.test.tsx` file inside `tests/` and use the existing test helpers:

```tsx
import { expect, test } from "bun:test"
import { getLayoutSolverFromTsx } from "lib/testing/getLayoutSolverFromTsx"

test("resistor and capacitor layout", async () => {
  const solver = await getLayoutSolverFromTsx(
    <board routingDisabled>
      <resistor name="R1" resistance="1k" connections={{ pin2: "C1.pin1" }} />
      <capacitor name="C1" capacitance="100nF" />
    </board>,
  )
  solver.solve()
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
```

Run `bun test tests/your-circuit.test.tsx` to create and check the SVG under
`__snapshots__/`. Use `bun test tests/your-circuit.test.tsx --update-snapshots`
when intentionally updating it.

The helper uses the installed `tscircuit` package with PCB rendering disabled,
converts its schematic Circuit JSON with readable component names, and returns
an unsolved solver from this checkout. No Core checkout or JSON fixture is needed.
You can inspect or modify `solver.inputProblem` before calling `solve()`.

This uses `getInputProblemFromCircuitJsonSchematic`, not Core's enriched
auto-layout input. Keep `schAutoLayoutEnabled` off for these tests. For exact
Core auto-layout regressions involving reserved sizes, fixed placements, rail
flags, or custom gaps, continue using a captured `InputProblem` fixture.

## Implementation Notes

- There is the concept of a "weak" and "strong" connection between pins. A "strong" connection is one where a pin is directly assigned to another pin. A "weak" connection is generally a pin assigned to a net like "GND" or "VCC". Strong connections are important for layout but weak connections often determine orientation of passives (e.g. a capacitor is "facing up" to VCC but "facing down" to GND)
- Often there are pre-laid-out designs that are passed in. This is represented by a `SchematicGroup`. We don't lay out anything inside of these groups but the inner pins are still used to compute a good packing
