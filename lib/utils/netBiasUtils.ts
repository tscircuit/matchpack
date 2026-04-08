/**
 * Utility functions for applying schematic layout bias to nets.
 *
 * Convention:
 *  - Positive voltage nets (VCC, VDD, V3_3, etc.)  → biased UPWARD   (negative Y offset in screen coords)
 *  - Ground nets (GND, VSS, AGND, etc.)            → biased DOWNWARD  (positive Y offset)
 *  - Signal nets                                    → no bias
 *
 * This follows the universal schematic convention that makes schematics readable.
 */

import type { NetId, InputProblem } from "lib/types/InputProblem"

export type NetBiasType = "power" | "ground" | "signal"

/**
 * Detect whether a net name / id suggests a power, ground, or signal rail.
 */
export function getNetBiasType(netId: NetId, netLabel?: string): NetBiasType {
  const name = (netLabel ?? netId).toUpperCase()

  // Ground patterns
  if (
    /\bGND\b/.test(name) ||
    /\bVSS\b/.test(name) ||
    /\bAGND\b/.test(name) ||
    /\bDGND\b/.test(name) ||
    /\bPGND\b/.test(name) ||
    name === "0V" ||
    name === "GROUND"
  ) {
    return "ground"
  }

  // Positive voltage patterns
  if (
    /\bVCC\b/.test(name) ||
    /\bVDD\b/.test(name) ||
    /\bVIN\b/.test(name) ||
    /\bVBAT\b/.test(name) ||
    /\bVBUS\b/.test(name) ||
    /\bV3[_.]?3\b/.test(name) ||
    /\bV5\b/.test(name) ||
    /\bV1[_.]?8\b/.test(name) ||
    /\bV2[_.]?5\b/.test(name) ||
    /\bVREF\b/.test(name) ||
    /\bVPWR\b/.test(name) ||
    /^V\d/.test(name) || // e.g. V3_3, V5, V12
    /\bPWR\b/.test(name) ||
    /\bPOWER\b/.test(name) ||
    // Also check the isPositiveVoltageSource / isGround flags handled by caller
    false
  ) {
    return "power"
  }

  return "signal"
}

/**
 * Build a map from pinId → vertical bias offset (in schematic units).
 *
 * Positive Y is typically "down" in screen coords, so:
 *   power nets  → large negative Y  (pulls component up)
 *   ground nets → large positive Y  (pulls component down)
 */
export function buildNetVerticalBiasMap(
  inputProblem: InputProblem,
  opts: {
    powerBias?: number  // default -50 (strong upward pull)
    groundBias?: number // default +50 (strong downward pull)
  } = {},
): Map<string, number> {
  const { powerBias = -50, groundBias = 50 } = opts
  const pinBiasMap = new Map<string, number>()

  for (const [connKey, connected] of Object.entries(inputProblem.netConnMap)) {
    if (!connected) continue
    const [pinId, netId] = connKey.split("-") as [string, NetId]
    if (!pinId || !netId) continue

    const net = inputProblem.netMap[netId]
    let biasType: NetBiasType

    if (net?.isGround) {
      biasType = "ground"
    } else if (net?.isPositiveVoltageSource) {
      biasType = "power"
    } else {
      biasType = getNetBiasType(netId, net?.netId)
    }

    if (biasType === "power") {
      pinBiasMap.set(pinId, powerBias)
    } else if (biasType === "ground") {
      pinBiasMap.set(pinId, groundBias)
    }
  }

  return pinBiasMap
}
