import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { RootCircuit } from "tscircuit"

const ExampleCircuit = () => (
  <board routingDisabled>
    <chip
      name="U1"
      footprint="soic8"
      schPinArrangement={{
        rightSide: {
          pins: [1, 2, 3, 4, 5, 6, 7, 8],
          direction: "top-to-bottom",
        },
      }}
    />
    {[1,1,2,2,2,3,4,5,7,8].map((n, i) => (
      <capacitor key={i} schOrientation="vertical" schX={2+i} capacitance="1uF" name={`C${i+1}`} connections={{ pin1: `U1.${n}`, pin2: "net.GND" }} />
    ))}
  </board>
)

test("LayoutPipelineSolver03 - chip with multiple capacitors", () => {
  const circuit = new RootCircuit()
  circuit.add(<ExampleCircuit />)
  const circuitJson = circuit.getCircuitJson()

  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, { useReadableIds: true })
  
  expect(problem.chipMap["U1"]).toBeDefined()
  expect(Object.keys(problem.chipMap).filter(k => k.startsWith("C")).length).toBe(10)
  expect(problem.chipMap["U1"].pins.length).toBe(8)
  
  const solver = new LayoutPipelineSolver(problem)
  const viz = solver.visualize()
  
  expect(viz.rects?.length).toBeGreaterThan(0)
  expect(viz.points?.length).toBeGreaterThan(0)
})