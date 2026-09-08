import { boundsDistance } from "@tscircuit/math-utils"
import { expect, test } from "bun:test"
import { alignChipConnectedRailLoads } from "../../lib/solvers/AlignChipConnectedRailLoadsSolver/alignChipConnectedRailLoads"
import { getChipConnectedRailLoadPairs } from "../../lib/solvers/AlignChipConnectedRailLoadsSolver/getChipConnectedRailLoadPairs"
import { getPlacementBounds } from "../../lib/solvers/AlignTestPointsSolver/placementsOverlap"
import type { InputProblem } from "../../lib/types/InputProblem"
import type { OutputLayout } from "../../lib/types/OutputLayout"
import input from "../assets/repro-battery-charger-status-led-overlap.input.json"

test.each([
  { resistorId: "R_CHG", mainRotation: 0, direction: -1 },
  { resistorId: "R_FAULT", mainRotation: 0, direction: 1 },
  { resistorId: "R_CHG", mainRotation: 180, direction: 1 },
  { resistorId: "R_FAULT", mainRotation: 180, direction: -1 },
])(
  "$resistorId clears rotated obstacles with the IC rotated $mainRotation degrees",
  ({ resistorId, mainRotation, direction }) => {
    const inputProblem = structuredClone(input) as InputProblem
    const pair = getChipConnectedRailLoadPairs(inputProblem).find(
      (pair) => pair.resistor.chipId === resistorId,
    )!
    inputProblem.chipMap = Object.fromEntries(
      [pair.mainChipId, pair.resistor.chipId, pair.railComponent.chipId].map(
        (chipId) => [chipId, inputProblem.chipMap[chipId]!],
      ),
    )
    const inputLayout: OutputLayout = {
      chipPlacements: {
        [pair.mainChipId]: { x: 0, y: 0, ccwRotationDegrees: mainRotation },
        [pair.resistor.chipId]: {
          x: direction * 2,
          y: 0,
          ccwRotationDegrees: 0,
        },
        [pair.railComponent.chipId]: {
          x: direction * 2,
          y: 2,
          ccwRotationDegrees: 270,
        },
      },
      groupPlacements: {},
    }
    // These tall, rotated obstacles block successive outward candidate positions.
    for (const [chipId, x] of [
      ["BLOCKER1", direction * 2.6],
      ["BLOCKER2", direction * 4.2],
    ] as const) {
      inputProblem.chipMap[chipId] = {
        chipId,
        pins: [],
        size: { x: 4, y: 0.5 },
        fixedPosition: { x, y: 0.8 },
      }
      inputLayout.chipPlacements[chipId] = {
        x,
        y: 0.8,
        ccwRotationDegrees: 90,
      }
    }
    const originalLayout = structuredClone(inputLayout)
    const outputLayout = alignChipConnectedRailLoads({
      railLoadPairs: [pair],
      inputProblem,
      inputLayout,
    })

    expect(inputLayout).toEqual(originalLayout)
    for (const chip of [pair.resistor, pair.railComponent]) {
      const placement = outputLayout.chipPlacements[chip.chipId]!
      const bounds = getPlacementBounds({ placement, size: chip.size })
      expect(placement.x * direction).toBeGreaterThan(4.2)
      for (const chipId of [pair.mainChipId, "BLOCKER1", "BLOCKER2"]) {
        const obstaclePlacement = outputLayout.chipPlacements[chipId]!
        expect(obstaclePlacement).toEqual(
          originalLayout.chipPlacements[chipId]!,
        )
        const obstacleBounds = getPlacementBounds({
          placement: obstaclePlacement,
          size: inputProblem.chipMap[chipId]!.size,
        })
        expect(boundsDistance(bounds, obstacleBounds)).toBeGreaterThanOrEqual(
          inputProblem.chipGap - 1e-6,
        )
      }
    }
  },
)
