import type { InputProblem, NetId } from "../types/InputProblem"

/** Prefer explicit power metadata; a grounded group's sole non-ground net is its rail. */
export const getDecouplingRailNetId = ({
  inputProblem,
  netIds,
}: {
  inputProblem: InputProblem
  netIds: NetId[]
}): NetId | null => {
  const positiveNetIds = netIds.filter(
    (netId) => inputProblem.netMap[netId]?.isPositiveVoltageSource,
  )
  if (positiveNetIds.length === 1) return positiveNetIds[0]!

  const groundNetIds = netIds.filter(
    (netId) => inputProblem.netMap[netId]?.isGround,
  )
  const nonGroundNetIds = netIds.filter((netId) => {
    const net = inputProblem.netMap[netId]
    if (!net) return false
    return !net.isGround
  })
  if (groundNetIds.length !== 1 || nonGroundNetIds.length !== 1) return null

  return nonGroundNetIds[0]!
}
