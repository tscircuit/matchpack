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
  isDecouplingCap?: boolean
  availableRotations?: Array<0 | 90 | 180 | 270>
}
export type Group = {
  groupId: GroupId
  pins: PinId[]
  /** The shape of the group is defined by a set of bounding boxes */
  shape: Bounds[]
}
export type GroupPin = { pinId: PinId; offset: Point }
export type Net = { netId: NetId }

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

  inferDecouplingCaps?: boolean
}
