import type { ChipId, GroupId } from "./InputProblem"
import type { Point } from "@tscircuit/math-utils"

export type Placement = Point & {
  ccwRotationDegrees: number
}

export type OutputLayout = {
  chipPlacements: Record<ChipId, Placement>
  groupPlacements: Record<GroupId, Placement>
}
