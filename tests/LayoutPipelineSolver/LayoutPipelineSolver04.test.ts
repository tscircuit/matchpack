import { expect, test } from "bun:test"
import { writeFileSync } from "fs"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"
import { getExampleCircuitJson } from "../assets/ExampleCircuit04"

test("LayoutPipelineSolver04 - ExampleCircuit04 full pipeline with stage snapshots", () => {
  // Get circuit json from ExampleCircuit04
  const circuitJson = getExampleCircuitJson()

  // Convert to InputProblem with readable IDs for easier debugging
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Create the solver
  const solver = new LayoutPipelineSolver(problem)

  // Test initial state
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"chipPartitionsSolver"`)

  // Run pipeline stage by stage and capture snapshots
  
  // Stage 1: ChipPartitionsSolver
  solver.solveUntilPhase("pinRangeMatchSolver")
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"pinRangeMatchSolver"`)
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.chipPartitions?.length).toMatchInlineSnapshot(`2`)
  
  // Capture chip partitions structure
  const partitionSummary = solver.chipPartitions?.map(partition => ({
    chipCount: Object.keys(partition.chipMap).length,
    chipIds: Object.keys(partition.chipMap).sort(),
    strongConnections: Object.keys(partition.pinStrongConnMap).length
  }))
  expect(partitionSummary).toMatchInlineSnapshot(`
    [
      {
        "chipCount": 5,
        "chipIds": [
          "C1",
          "C2",
          "C5",
          "C6",
          "U1",
        ],
        "strongConnections": 16,
      },
      {
        "chipCount": 1,
        "chipIds": [
          "U2",
        ],
        "strongConnections": 0,
      },
    ]
  `)

  // Stage 2: PinRangeMatchSolver  
  solver.solveUntilPhase("pinRangeLayoutSolver")
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"pinRangeLayoutSolver"`)
  expect(solver.pinRangeMatchSolver?.solved).toBe(true)
  
  const pinRanges = solver.pinRangeMatchSolver?.getAllPinRanges()
  const pinRangeSummary = pinRanges?.map(range => ({
    chipId: range.chipId,
    side: range.side,
    pinCount: range.pinIds.length,
    pinIds: range.pinIds.sort(),
    connectedChipsCount: range.connectedChips?.length || 0
  }))
  expect(pinRangeSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "U1",
        "connectedChipsCount": 1,
        "pinCount": 1,
        "pinIds": [
          "U1.4",
        ],
        "side": "x-",
      },
      {
        "chipId": "U1",
        "connectedChipsCount": 3,
        "pinCount": 3,
        "pinIds": [
          "U1.1",
          "U1.2",
          "U1.3",
        ],
        "side": "x-",
      },
      {
        "chipId": "U1",
        "connectedChipsCount": 0,
        "pinCount": 3,
        "pinIds": [
          "U1.5",
          "U1.6",
          "U1.7",
        ],
        "side": "x+",
      },
      {
        "chipId": "U1",
        "connectedChipsCount": 0,
        "pinCount": 1,
        "pinIds": [
          "U1.8",
        ],
        "side": "x+",
      },
      {
        "chipId": "U2",
        "connectedChipsCount": 0,
        "pinCount": 1,
        "pinIds": [
          "U2.4",
        ],
        "side": "x-",
      },
      {
        "chipId": "U2",
        "connectedChipsCount": 0,
        "pinCount": 3,
        "pinIds": [
          "U2.1",
          "U2.2",
          "U2.3",
        ],
        "side": "x-",
      },
      {
        "chipId": "U2",
        "connectedChipsCount": 0,
        "pinCount": 3,
        "pinIds": [
          "U2.5",
          "U2.6",
          "U2.7",
        ],
        "side": "x+",
      },
      {
        "chipId": "U2",
        "connectedChipsCount": 0,
        "pinCount": 1,
        "pinIds": [
          "U2.8",
        ],
        "side": "x+",
      },
    ]
  `)

  // Stage 3: PinRangeLayoutSolver
  solver.solveUntilPhase("pinRangeOverlapSolver") 
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"pinRangeOverlapSolver"`)
  expect(solver.pinRangeLayoutSolver?.solved).toBe(true)
  
  // Capture layout state after pin range layout - combine all completed solver layouts
  const allChipPlacements: Record<string, { x: number; y: number; ccwRotationDegrees: number }> = {}
  for (const singleSolver of solver.pinRangeLayoutSolver.completedSolvers) {
    if (singleSolver.layout) {
      Object.assign(allChipPlacements, singleSolver.layout.chipPlacements)
    }
  }
  // Include active solver if it has a layout
  if (solver.pinRangeLayoutSolver.activeSolver?.layout) {
    Object.assign(allChipPlacements, solver.pinRangeLayoutSolver.activeSolver.layout.chipPlacements)
  }
  
  const chipPlacementSummary = Object.entries(allChipPlacements)
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000, // Round to 3 decimals for stable snapshots
      y: Math.round(placement.y * 1000) / 1000,
      rotation: placement.ccwRotationDegrees
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(chipPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": -1.312,
        "y": 1.229,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": -2.617,
        "y": 0.854,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": -1.754,
        "y": -0.851,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": -1.754,
        "y": 0.1,
      },
      {
        "chipId": "U1",
        "rotation": 0,
        "x": 0,
        "y": 0,
      },
      {
        "chipId": "U2",
        "rotation": 0,
        "x": 0,
        "y": 0,
      },
    ]
  `)

  // Stage 4: PinRangeOverlapSolver
  solver.solveUntilPhase("partitionPackingSolver")
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"partitionPackingSolver"`) 
  expect(solver.pinRangeOverlapSolver?.solved).toBe(true)
  
  // Capture overlap resolution results
  const resolvedLayout = solver.pinRangeOverlapSolver?.resolvedLayout
  const resolvedPlacementSummary = Object.entries(resolvedLayout?.chipPlacements || {})
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000,
      y: Math.round(placement.y * 1000) / 1000, 
      rotation: placement.ccwRotationDegrees
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(resolvedPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": 1.305,
        "y": 1.229,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": 0,
        "y": 0.854,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": 0.863,
        "y": -1.005,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": 0.863,
        "y": 0.254,
      },
      {
        "chipId": "U1",
        "rotation": 0,
        "x": 2.617,
        "y": 0,
      },
      {
        "chipId": "U2",
        "rotation": 0,
        "x": 7.617,
        "y": 0,
      },
    ]
  `)

  // Stage 5: PartitionPackingSolver (Final)
  solver.solve() // Complete the pipeline
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(`"none"`)
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.partitionPackingSolver?.solved).toBe(true)

  // Capture and write the PackInput used by PartitionPackingSolver
  if (solver.partitionPackingSolver?.phasedPackSolver) {
    const packInput = (solver.partitionPackingSolver as any).phasedPackSolver.packInput
    if (packInput) {
      try {
        writeFileSync(
          "debug-outputs/LayoutPipelineSolver04-paritionpacking-packinput.json",
          JSON.stringify(packInput, null, 2)
        )
        console.log("✅ PackInput written to debug-outputs/LayoutPipelineSolver04-paritionpacking-packinput.json")
      } catch (error) {
        console.warn("⚠️ Failed to write PackInput:", error)
      }
    } else {
      console.warn("⚠️ No PackInput found in phasedPackSolver")
    }
  } else {
    console.warn("⚠️ No phasedPackSolver found in partitionPackingSolver")
  }

  // Final output layout
  const finalLayout = solver.getOutputLayout()
  const finalPlacementSummary = Object.entries(finalLayout.chipPlacements)
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000,
      y: Math.round(placement.y * 1000) / 1000,
      rotation: placement.ccwRotationDegrees
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(finalPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": -0.003,
        "y": 1.117,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": -1.308,
        "y": 0.742,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": -0.446,
        "y": -1.117,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": -0.446,
        "y": 0.142,
      },
      {
        "chipId": "U1",
        "rotation": 0,
        "x": 1.308,
        "y": -0.112,
      },
      {
        "chipId": "U2",
        "rotation": 0,
        "x": 5,
        "y": 5,
      },
    ]
  `)

  // Check for overlaps - should have none
  const overlaps = solver.checkForOverlaps(finalLayout)
  expect(overlaps.length).toBe(0)
})
