import { expect, test } from "bun:test"
import { getLayoutSolverFromTsx } from "lib/testing/getLayoutSolverFromTsx"

test("TSX circuit to local Matchpack solver snapshot", async () => {
  const solver = await getLayoutSolverFromTsx(
    <board routingDisabled>
      <chip
        name="U1"
        pinLabels={{ pin1: "OUT", pin2: "IN" }}
        schPinArrangement={{
          rightSide: { pins: [1, 2], direction: "top-to-bottom" },
        }}
      />
      <resistor
        name="R1"
        resistance="1k"
        connections={{ pin1: "U1.pin1", pin2: "net.VCC" }}
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        connections={{ pin1: "U1.pin2", pin2: "net.GND" }}
      />
    </board>,
  )

  expect(Object.keys(solver.inputProblem.chipMap).sort()).toEqual([
    "C1",
    "R1",
    "U1",
  ])
  expect(solver.inputProblem.chipMap.U1!.pins).toHaveLength(2)
  expect(Object.keys(solver.inputProblem.pinStrongConnMap)).not.toHaveLength(0)
  expect(Object.keys(solver.inputProblem.netConnMap)).not.toHaveLength(0)

  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  await expect(solver).toMatchSolverSnapshot(import.meta.path)
})
