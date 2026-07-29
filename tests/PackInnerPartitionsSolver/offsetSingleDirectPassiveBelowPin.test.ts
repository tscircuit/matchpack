import { expect, test } from "bun:test"
import {
  applyVerticalPinClearanceToDirectPassive,
  getVerticalPinClearanceOffset,
} from "../../lib/solvers/PackInnerPartitionsSolver/offsetSingleDirectPassiveBelowPin"
import type {
  ChipPin,
  PartitionInputProblem,
} from "../../lib/types/InputProblem"
import type { Placement } from "../../lib/types/OutputLayout"

const VERTICAL_PIN_CLEARANCE = 0.2

const createProblem = (): {
  problem: PartitionInputProblem
  connectedPinsByPinId: Record<string, ChipPin[]>
} => {
  const mainPin: ChipPin = {
    pinId: "U1.1",
    offset: { x: 0, y: 0 },
    side: "x+",
  }
  const passivePin: ChipPin = {
    pinId: "R1.1",
    offset: { x: 0, y: 0.5 },
    side: "y+",
  }

  return {
    problem: {
      chipMap: {
        U1: {
          chipId: "U1",
          pins: ["U1.1", "U1.2", "U1.3"],
          size: { x: 2, y: 2 },
        },
        R1: {
          chipId: "R1",
          pins: ["R1.1", "R1.2"],
          size: { x: 0.4, y: 1 },
          isResistor: true,
        },
      },
      chipPinMap: {
        "U1.1": mainPin,
        "U1.2": {
          pinId: "U1.2",
          offset: { x: 0, y: 0.5 },
          side: "x+",
        },
        "U1.3": {
          pinId: "U1.3",
          offset: { x: 0, y: -0.5 },
          side: "x+",
        },
        "R1.1": passivePin,
        "R1.2": {
          pinId: "R1.2",
          offset: { x: 0, y: -0.5 },
          side: "y-",
        },
      },
      netMap: {},
      pinStrongConnMap: { "R1.1-U1.1": true },
      netConnMap: {},
      chipGap: 0.2,
      partitionGap: 1,
    },
    connectedPinsByPinId: {
      "R1.1": [mainPin],
      "U1.1": [passivePin],
    },
  }
}

test.each([0, 180])(
  "offsets an aligned vertical direct passive at %d degrees",
  (ccwRotationDegrees) => {
    const { problem, connectedPinsByPinId } = createProblem()
    let passiveY = 0.5
    if (ccwRotationDegrees === 0) passiveY = -0.5
    const placements: Record<string, Placement> = {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      R1: { x: 1, y: passiveY, ccwRotationDegrees },
    }

    applyVerticalPinClearanceToDirectPassive({
      problem,
      connectedPinsByPinId,
      chipPlacements: placements,
    })

    expect(placements.R1!.y).toBeCloseTo(passiveY - VERTICAL_PIN_CLEARANCE)
  },
)

test.each([90, 270])(
  "does not offset an aligned horizontal direct passive at %d degrees",
  (ccwRotationDegrees) => {
    const { problem, connectedPinsByPinId } = createProblem()
    const placements: Record<string, Placement> = {
      U1: { x: 0, y: 0, ccwRotationDegrees: 0 },
      R1: { x: 1, y: 0, ccwRotationDegrees },
    }

    applyVerticalPinClearanceToDirectPassive({
      problem,
      connectedPinsByPinId,
      chipPlacements: placements,
    })

    expect(placements.R1!.y).toBe(0)
  },
)

test("returns the offset needed for vertical pin clearance", () => {
  const upperPin: ChipPin = {
    pinId: "U1.1",
    offset: { x: 0, y: 0 },
    side: "y-",
  }
  const lowerPin: ChipPin = {
    pinId: "R1.1",
    offset: { x: 0, y: 0.5 },
    side: "y+",
  }

  const offset = getVerticalPinClearanceOffset({
    upperPin,
    upperPlacement: { x: 0, y: 0, ccwRotationDegrees: 0 },
    lowerPin,
    lowerPlacement: { x: 0, y: -0.5, ccwRotationDegrees: 0 },
  })

  expect(offset).toBeCloseTo(-VERTICAL_PIN_CLEARANCE)
})
