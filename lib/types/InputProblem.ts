import type { Point, Bounds } from "@tscircuit/math-utils"
import type { Side } from "./Side"

export type PinId = string
export type ChipId = string
export type GroupId = string
export type NetId = string

export type ChipPin = { pinId: PinId; offset: Point; side: Side }
export type Chip = {
  chipId: ChipId
  pins: PinId[]
  size: Point
  /**
   * Whether this chip is a capacitor (circuit-json ftype "simple_capacitor").
   * A capacitor's *component type*, not its geometry: two pins bridging a power
   * and a ground net also describes a TVS diode or a voltmeter, so decoupling-cap
   * detection relies on this flag rather than pin count. See IdentifyDecouplingCapsSolver.
   */
  isCapacitor?: boolean
  availableRotations?: Array<0 | 90 | 180 | 270>
  fixedPosition?: Point
}
export type Group = {
  groupId: GroupId
  pins: PinId[]
  /** The shape of the group is defined by a set of bounding boxes */
  shape: Bounds[]
}
export type GroupPin = { pinId: PinId; offset: Point }
export type Net = {
  netId: NetId
  isGround?: boolean
  isPositiveVoltageSource?: boolean
  // Add a flag to indicate if this is a power net that should be routed upward
  preferUpwardRouting?: boolean
}

export type InputProblem = {
  chipMap: Record<ChipId, Chip>
  chipPinMap: Record<PinId, ChipPin>
  netMap: Record<NetId, Net>

  /** This is a two-way map */
  pinStrongConnMap: Record<`${PinId}-${PinId}`, boolean>
  netConnMap: Record<`${PinId}-${NetId}`, boolean>

  /** The minimum gap between chips within a partition */
  chipGap: number
  /** The minimum gap between two partitions */
  partitionGap: number

  decouplingCapsGap?: number

  inferDecouplingCaps?: boolean
}

export interface PartitionInputProblem extends InputProblem {
  isPartition?: true
  partitionType?: "default" | "decoupling_caps"
}
