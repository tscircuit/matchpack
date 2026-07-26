import type { Net, NetId } from "../types/InputProblem"

export function isGroundNet(netId: NetId, net?: Net): boolean {
  if (net?.isGround) return true
  const lower = netId.toLowerCase()
  return lower.includes("gnd") || lower.includes("vss")
}

export function isPositiveVoltageNet(netId: NetId, net?: Net): boolean {
  if (isGroundNet(netId, net)) return false
  if (net?.isPositiveVoltageSource) return true

  const lower = netId.toLowerCase()
  // Common positive voltage names
  if (
    lower.includes("vcc") ||
    lower.includes("vdd") ||
    lower.includes("vsys") ||
    lower === "v+" ||
    lower.startsWith("+")
  ) {
    return true
  }
  // Matches like "v3_3", "v1_1", "v5", "3.3v", "5v", "3v3", "12v"
  if (/^v\d/.test(lower)) return true
  if (/\d+v/.test(lower)) return true
  if (/\d+v\d+/.test(lower)) return true

  return false
}
