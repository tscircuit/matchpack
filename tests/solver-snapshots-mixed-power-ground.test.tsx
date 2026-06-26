import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { RootCircuit } from "tscircuit"

const MixedChipPowerGroundPassivesCircuit = () => (
  <board routingDisabled>
    <chip
      name="U1"
      footprint="soic8"
      pinLabels={{
        pin1: "IN1",
        pin2: "IN2",
        pin3: "OUT1",
        pin4: "OUT2",
        pin5: "CTRL",
        pin6: "FB",
        pin7: "SDA",
        pin8: "SCL",
      }}
      schPinArrangement={{
        leftSide: {
          pins: [1, 2, 3, 4],
          direction: "top-to-bottom",
        },
        rightSide: {
          pins: [8, 7, 6, 5],
          direction: "top-to-bottom",
        },
      }}
    />

    <resistor
      name="R1"
      resistance="10k"
      footprint="0402"
      connections={{ pin1: "U1.1", pin2: "net.GND" }}
    />
    <capacitor
      name="C1"
      capacitance="0.1uF"
      footprint="0402"
      connections={{ pin1: "U1.2", pin2: "net.GND" }}
    />
    <resistor
      name="R2"
      resistance="4.7k"
      footprint="0402"
      connections={{ pin1: "U1.7", pin2: "net.VDD" }}
    />
    <capacitor
      name="C2"
      capacitance="1uF"
      footprint="0402"
      connections={{ pin1: "U1.8", pin2: "net.GND" }}
    />

    <resistor
      name="R3"
      resistance="10k"
      footprint="0402"
      connections={{ pin1: "net.VDD", pin2: "net.GND" }}
    />
    <resistor
      name="R4"
      resistance="22k"
      footprint="0402"
      connections={{ pin1: "net.VDD", pin2: "net.GND" }}
    />
    <capacitor
      name="C3"
      capacitance="0.1uF"
      footprint="0402"
      connections={{ pin1: "net.VDD", pin2: "net.GND" }}
    />
    <capacitor
      name="C4"
      capacitance="1uF"
      footprint="0402"
      connections={{ pin1: "net.VDD", pin2: "net.GND" }}
    />
  </board>
)

test("LayoutPipelineSolver SVG snapshot for mixed chip and standalone power ground passives", async () => {
  const circuit = new RootCircuit()
  circuit.add(<MixedChipPowerGroundPassivesCircuit />)

  const problem = getInputProblemFromCircuitJsonSchematic(
    circuit.getCircuitJson(),
    {
      useReadableIds: true,
    },
  )
  const solver = new LayoutPipelineSolver(problem)

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  await expect(solver).toMatchSolverSnapshot(import.meta.path, {
    svgName: "layout-pipeline-mixed-chip-power-ground-passives",
    svgWidth: 1000,
    svgHeight: 640,
  })
})
