import type { ChipId, NetId, PinId } from "./InputProblem"

export interface DecouplingCapGroup {
  decouplingCapGroupId: string
  mainChipId: ChipId
  netPair: [NetId, NetId]
  decouplingCapChipIds: ChipId[]
  /** Map of decoupling cap chip id to connection details */
  capToMainPinMap: Record<
    ChipId,
    {
      mainPinId: PinId
      capPinId: PinId
    }
  >
}
