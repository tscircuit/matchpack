import { expect, test } from "bun:test"
import { AlignPowerGroundRowsSolver } from "lib/solvers/AlignPowerGroundRowsSolver/AlignPowerGroundRowsSolver"
import type { InputProblem } from "lib/types/InputProblem"
import type { OutputLayout } from "lib/types/OutputLayout"
import { normalizeSide } from "lib/types/Side"

const addTwoPinChip = (
  problem: InputProblem,
  chipId: string,
  net1: string,
  net2: string,
) => {
  const pin1 = `${chipId}.1`
  const pin2 = `${chipId}.2`

  problem.chipMap[chipId] = {
    chipId,
    pins: [pin1, pin2],
    size: { x: 1.1, y: 0.4 },
  }
  problem.chipPinMap[pin1] = {
    pinId: pin1,
    offset: { x: -0.55, y: 0 },
    side: normalizeSide("left"),
  }
  problem.chipPinMap[pin2] = {
    pinId: pin2,
    offset: { x: 0.55, y: 0 },
    side: normalizeSide("right"),
  }
  problem.netConnMap[`${pin1}-${net1}`] = true
  problem.netConnMap[`${pin2}-${net2}`] = true
}

const getSignalGroupedInputProblem = (): InputProblem => {
  const problem: InputProblem = {
    chipMap: {},
    chipPinMap: {},
    netMap: {
      SIG1: { netId: "SIG1" },
      SIG2: { netId: "SIG2" },
      VCC: { netId: "VCC", isPositiveVoltageSource: true },
      GND: { netId: "GND", isGround: true },
    },
    pinStrongConnMap: {},
    netConnMap: {},
    chipGap: 0.6,
    partitionGap: 1.2,
  }

  addTwoPinChip(problem, "R1", "SIG1", "VCC")
  addTwoPinChip(problem, "S1", "SIG1", "GND")
  addTwoPinChip(problem, "R2", "SIG2", "VCC")
  addTwoPinChip(problem, "S2", "SIG2", "GND")

  return problem
}

test.each([0, 90, 180, 270])(
  "row alignment preserves clearance to a fixed neighbor rotated %i degrees",
  (rotation) => {
    const problem = getSignalGroupedInputProblem()
    delete problem.chipMap.R2
    delete problem.chipMap.S2
    problem.chipMap.U1 = {
      chipId: "U1",
      pins: [],
      size: { x: 0.4, y: 0.8 },
      fixedPosition: { x: -1.15, y: 2.8 },
    }
    const inputLayout: OutputLayout = {
      chipPlacements: {
        R1: { x: -2, y: 0, ccwRotationDegrees: 0 },
        S1: { x: 2, y: 4, ccwRotationDegrees: 0 },
        U1: { x: -1.15, y: 2.8, ccwRotationDegrees: rotation },
      },
      groupPlacements: {},
    }
    const before = structuredClone(inputLayout)
    const solver = new AlignPowerGroundRowsSolver({
      inputProblem: problem,
      inputLayout,
    })
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.outputLayout).toEqual(before)
    expect(inputLayout).toEqual(before)
  },
)

test.each([
  { name: "exact minimum clearance", neighborY: 3, firstY: 0, secondY: 4 },
  {
    name: "an improved existing small gap",
    neighborY: 2.8,
    firstY: 2.3,
    secondY: 1.7,
  },
])("row alignment allows $name", ({ neighborY, firstY, secondY }) => {
  const problem = getSignalGroupedInputProblem()
  delete problem.chipMap.R2
  delete problem.chipMap.S2
  problem.chipMap.U1 = {
    chipId: "U1",
    pins: [],
    size: { x: 0.4, y: 0.4 },
    fixedPosition: { x: -1.15, y: neighborY },
  }
  const inputLayout: OutputLayout = {
    chipPlacements: {
      R1: { x: -1.15, y: firstY, ccwRotationDegrees: 0 },
      S1: { x: 1.15, y: secondY, ccwRotationDegrees: 0 },
      U1: { x: -1.15, y: neighborY, ccwRotationDegrees: 0 },
    },
    groupPlacements: {},
  }
  const solver = new AlignPowerGroundRowsSolver({
    inputProblem: problem,
    inputLayout,
  })
  solver.solve()
  expect(solver.outputLayout!.chipPlacements.R1!.y).toBeCloseTo(2)
  expect(solver.outputLayout!.chipPlacements.S1!.y).toBeCloseTo(2)
  expect(solver.outputLayout!.chipPlacements.U1).toEqual(
    inputLayout.chipPlacements.U1,
  )
})

const getSignalGroupedInputLayout = (): OutputLayout => ({
  chipPlacements: {
    R1: { x: -1, y: 0, ccwRotationDegrees: 270 },
    R2: { x: 0, y: -2, ccwRotationDegrees: 270 },
    S1: { x: 1, y: -3, ccwRotationDegrees: 0 },
    S2: { x: 0, y: -5, ccwRotationDegrees: 0 },
  },
  groupPlacements: {},
})

const getPlacementY = (layout: OutputLayout, chipId: string): number =>
  layout.chipPlacements[chipId]!.y

const expectSameRow = (
  layout: OutputLayout,
  chipIdA: string,
  chipIdB: string,
) => {
  expect(getPlacementY(layout, chipIdA)).toBeCloseTo(
    getPlacementY(layout, chipIdB),
  )
}

const expectDifferentRows = (
  layout: OutputLayout,
  chipIdA: string,
  chipIdB: string,
) => {
  expect(getPlacementY(layout, chipIdA)).not.toBeCloseTo(
    getPlacementY(layout, chipIdB),
  )
}

test("AlignPowerGroundRowsSolver groups rail-connected two-pin components by signal net", () => {
  const inputLayout = getSignalGroupedInputLayout()

  const solver = new AlignPowerGroundRowsSolver({
    inputProblem: getSignalGroupedInputProblem(),
    inputLayout,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.outputLayout).toBeDefined()

  const outputLayout = solver.outputLayout!

  expectSameRow(outputLayout, "R1", "S1")
  expectSameRow(outputLayout, "R2", "S2")
  expectDifferentRows(outputLayout, "R1", "R2")

  expect(outputLayout.chipPlacements.R1!.x).toBeLessThan(
    outputLayout.chipPlacements.S1!.x,
  )
  expect(outputLayout.chipPlacements.R2!.x).toBeLessThan(
    outputLayout.chipPlacements.S2!.x,
  )

  for (const chipId of ["R1", "R2", "S1", "S2"] as const) {
    expect(outputLayout.chipPlacements[chipId]!.ccwRotationDegrees).toBe(
      inputLayout.chipPlacements[chipId]!.ccwRotationDegrees,
    )
  }
})
