import { expect, test } from "bun:test"
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

  expect(problem).toMatchInlineSnapshot(`
    {
      "chipGap": 0.2,
      "chipMap": {
        "C1": {
          "chipId": "C1",
          "pins": [
            "C1.1",
            "C1.2",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "C2": {
          "chipId": "C2",
          "pins": [
            "C2.1",
            "C2.2",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "C5": {
          "chipId": "C5",
          "pins": [
            "C5.1",
            "C5.2",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "C6": {
          "chipId": "C6",
          "pins": [
            "C6.1",
            "C6.2",
          ],
          "size": {
            "x": 0.5291665999999999,
            "y": 1.0583333000000001,
          },
        },
        "U1": {
          "chipId": "U1",
          "pins": [
            "U1.1",
            "U1.2",
            "U1.3",
            "U1.4",
            "U1.5",
            "U1.6",
            "U1.7",
            "U1.8",
          ],
          "size": {
            "x": 1.2000000000000002,
            "y": 1,
          },
        },
        "U2": {
          "chipId": "U2",
          "pins": [
            "U2.1",
            "U2.2",
            "U2.3",
            "U2.4",
            "U2.5",
            "U2.6",
            "U2.7",
            "U2.8",
          ],
          "size": {
            "x": 1.2000000000000002,
            "y": 1,
          },
        },
      },
      "chipPinMap": {
        "C1.1": {
          "offset": {
            "x": -0.00027335000000006104,
            "y": 0.5512093000000002,
          },
          "pinId": "C1.1",
          "side": "y+",
        },
        "C1.2": {
          "offset": {
            "x": 0.00027334999999961695,
            "y": -0.5512093000000002,
          },
          "pinId": "C1.2",
          "side": "y-",
        },
        "C2.1": {
          "offset": {
            "x": -0.00027334999999961695,
            "y": 0.5512093000000002,
          },
          "pinId": "C2.1",
          "side": "y+",
        },
        "C2.2": {
          "offset": {
            "x": 0.00027335000000006104,
            "y": -0.5512093000000002,
          },
          "pinId": "C2.2",
          "side": "y-",
        },
        "C5.1": {
          "offset": {
            "x": -0.000273349999999839,
            "y": 0.5512093000000002,
          },
          "pinId": "C5.1",
          "side": "y+",
        },
        "C5.2": {
          "offset": {
            "x": 0.00027334999999961695,
            "y": -0.5512093000000002,
          },
          "pinId": "C5.2",
          "side": "y-",
        },
        "C6.1": {
          "offset": {
            "x": -0.00027334999999961695,
            "y": 0.5512093000000002,
          },
          "pinId": "C6.1",
          "side": "y+",
        },
        "C6.2": {
          "offset": {
            "x": 0.00027334999999961695,
            "y": -0.5512093000000002,
          },
          "pinId": "C6.2",
          "side": "y-",
        },
        "U1.1": {
          "offset": {
            "x": -1,
            "y": 0.30000000000000004,
          },
          "pinId": "U1.1",
          "side": "x-",
        },
        "U1.2": {
          "offset": {
            "x": -1,
            "y": 0.10000000000000003,
          },
          "pinId": "U1.2",
          "side": "x-",
        },
        "U1.3": {
          "offset": {
            "x": -1,
            "y": -0.09999999999999998,
          },
          "pinId": "U1.3",
          "side": "x-",
        },
        "U1.4": {
          "offset": {
            "x": -1,
            "y": -0.30000000000000004,
          },
          "pinId": "U1.4",
          "side": "x-",
        },
        "U1.5": {
          "offset": {
            "x": 1,
            "y": -0.30000000000000004,
          },
          "pinId": "U1.5",
          "side": "x+",
        },
        "U1.6": {
          "offset": {
            "x": 1,
            "y": -0.10000000000000003,
          },
          "pinId": "U1.6",
          "side": "x+",
        },
        "U1.7": {
          "offset": {
            "x": 1,
            "y": 0.09999999999999998,
          },
          "pinId": "U1.7",
          "side": "x+",
        },
        "U1.8": {
          "offset": {
            "x": 1,
            "y": 0.30000000000000004,
          },
          "pinId": "U1.8",
          "side": "x+",
        },
        "U2.1": {
          "offset": {
            "x": -1,
            "y": 0.30000000000000004,
          },
          "pinId": "U2.1",
          "side": "x-",
        },
        "U2.2": {
          "offset": {
            "x": -1,
            "y": 0.10000000000000003,
          },
          "pinId": "U2.2",
          "side": "x-",
        },
        "U2.3": {
          "offset": {
            "x": -1,
            "y": -0.09999999999999998,
          },
          "pinId": "U2.3",
          "side": "x-",
        },
        "U2.4": {
          "offset": {
            "x": -1,
            "y": -0.30000000000000004,
          },
          "pinId": "U2.4",
          "side": "x-",
        },
        "U2.5": {
          "offset": {
            "x": 1,
            "y": -0.30000000000000004,
          },
          "pinId": "U2.5",
          "side": "x+",
        },
        "U2.6": {
          "offset": {
            "x": 1,
            "y": -0.10000000000000003,
          },
          "pinId": "U2.6",
          "side": "x+",
        },
        "U2.7": {
          "offset": {
            "x": 1,
            "y": 0.09999999999999998,
          },
          "pinId": "U2.7",
          "side": "x+",
        },
        "U2.8": {
          "offset": {
            "x": 1,
            "y": 0.30000000000000004,
          },
          "pinId": "U2.8",
          "side": "x+",
        },
      },
      "groupMap": {},
      "groupPinMap": {},
      "netConnMap": {
        "C5.2-GND": true,
        "U1.1-VSYS": true,
        "U1.2-GND": true,
        "U1.4-V3_3": true,
        "U2.1-VCC": true,
        "U2.2-GND": true,
      },
      "netMap": {
        "GND": {
          "netId": "GND",
        },
        "V3_3": {
          "netId": "V3_3",
        },
        "VCC": {
          "netId": "VCC",
        },
        "VSYS": {
          "netId": "VSYS",
        },
      },
      "partitionGap": 2,
      "pinStrongConnMap": {
        "C1.1-U1.1": true,
        "C1.2-U1.2": true,
        "C2.1-U1.1": true,
        "C2.2-U1.2": true,
        "C5.1-U1.4": true,
        "C6.1-U1.1": true,
        "C6.2-U1.2": true,
        "U1.1-C1.1": true,
        "U1.1-C2.1": true,
        "U1.1-C6.1": true,
        "U1.1-U1.3": true,
        "U1.2-C1.2": true,
        "U1.2-C2.2": true,
        "U1.2-C6.2": true,
        "U1.3-U1.1": true,
        "U1.4-C5.1": true,
      },
    }
  `)

  // Create the solver
  const solver = new LayoutPipelineSolver(problem)

  // Test initial state
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"chipPartitionsSolver"`,
  )

  // Run pipeline stage by stage and capture snapshots

  // Stage 1: ChipPartitionsSolver
  solver.solveUntilPhase("pinRangeMatchSolver")
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"pinRangeMatchSolver"`,
  )
  expect(solver.chipPartitionsSolver?.solved).toBe(true)
  expect(solver.chipPartitions?.length).toMatchInlineSnapshot(`2`)

  // Capture chip partitions structure
  const partitionSummary = solver.chipPartitions?.map((partition) => ({
    chipCount: Object.keys(partition.chipMap).length,
    chipIds: Object.keys(partition.chipMap).sort(),
    strongConnections: Object.keys(partition.pinStrongConnMap).length,
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
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"pinRangeLayoutSolver"`,
  )
  expect(solver.pinRangeMatchSolver?.solved).toBe(true)

  const pinRanges = solver.pinRangeMatchSolver?.getAllPinRanges()
  const pinRangeSummary = pinRanges?.map((range) => ({
    chipId: range.chipId,
    side: range.side,
    pinCount: range.pinIds.length,
    pinIds: range.pinIds.sort(),
    connectedChipsCount: range.connectedChips?.length || 0,
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
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"pinRangeOverlapSolver"`,
  )
  expect(solver.pinRangeLayoutSolver?.solved).toBe(true)

  // Capture layout state after pin range layout - combine all completed solver layouts
  const allChipPlacements: Record<
    string,
    { x: number; y: number; ccwRotationDegrees: number }
  > = {}
  for (const singleSolver of solver.pinRangeLayoutSolver.completedSolvers) {
    if (singleSolver.layout) {
      Object.assign(allChipPlacements, singleSolver.layout.chipPlacements)
    }
  }
  // Include active solver if it has a layout
  if (solver.pinRangeLayoutSolver.activeSolver?.layout) {
    Object.assign(
      allChipPlacements,
      solver.pinRangeLayoutSolver.activeSolver.layout.chipPlacements,
    )
  }

  const chipPlacementSummary = Object.entries(allChipPlacements)
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000, // Round to 3 decimals for stable snapshots
      y: Math.round(placement.y * 1000) / 1000,
      rotation: placement.ccwRotationDegrees,
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(chipPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": -1.312,
        "y": 1.029,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": -2.348,
        "y": 0.1,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": -1,
        "y": -1.029,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": -1.554,
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
  expect(solver.getCurrentPhase()).toMatchInlineSnapshot(
    `"partitionPackingSolver"`,
  )
  expect(solver.pinRangeOverlapSolver?.solved).toBe(true)

  // Capture overlap resolution results
  const resolvedLayout = solver.pinRangeOverlapSolver?.resolvedLayout
  const resolvedPlacementSummary = Object.entries(
    resolvedLayout?.chipPlacements || {},
  )
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000,
      y: Math.round(placement.y * 1000) / 1000,
      rotation: placement.ccwRotationDegrees,
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(resolvedPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": 1.037,
        "y": 1.194,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": 0,
        "y": 0.1,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": 1.348,
        "y": -1.029,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": 0.794,
        "y": -0.065,
      },
      {
        "chipId": "U1",
        "rotation": 0,
        "x": 2.348,
        "y": 0,
      },
      {
        "chipId": "U2",
        "rotation": 0,
        "x": 7.348,
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


  // Final output layout
  const finalLayout = solver.getOutputLayout()
  const finalPlacementSummary = Object.entries(finalLayout.chipPlacements)
    .map(([chipId, placement]) => ({
      chipId,
      x: Math.round(placement.x * 1000) / 1000,
      y: Math.round(placement.y * 1000) / 1000,
      rotation: placement.ccwRotationDegrees,
    }))
    .sort((a, b) => a.chipId.localeCompare(b.chipId))
  expect(finalPlacementSummary).toMatchInlineSnapshot(`
    [
      {
        "chipId": "C1",
        "rotation": 270,
        "x": -0.138,
        "y": 1.111,
      },
      {
        "chipId": "C2",
        "rotation": 180,
        "x": -1.174,
        "y": 0.018,
      },
      {
        "chipId": "C5",
        "rotation": 0,
        "x": 0.174,
        "y": -1.111,
      },
      {
        "chipId": "C6",
        "rotation": 180,
        "x": -0.38,
        "y": -0.147,
      },
      {
        "chipId": "U1",
        "rotation": 0,
        "x": 1.174,
        "y": -0.082,
      },
      {
        "chipId": "U2",
        "rotation": 0,
        "x": 2.348,
        "y": -3.351,
      },
    ]
  `)

  // Check for overlaps - should have none
  const overlaps = solver.checkForOverlaps(finalLayout)
  expect(overlaps.length).toBe(0)
})
