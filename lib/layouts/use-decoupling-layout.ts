/**
 * use-decoupling-layout.ts
 *
 * React hook that computes decoupling capacitor placements for a chip.
 *
 * Usage:
 *
 *   const placements = useDecouplingLayout({ chip, pins, options })
 *
 *   // Then pass placements[i].position and placements[i].rotation to
 *   // your <chip> or <capacitor> tscircuit elements.
 */

import { useMemo } from "react"
import {
  layoutDecouplingCapacitors,
  filterDecouplingPins,
  type ComponentBounds,
  type PinInfo,
  type CapacitorPlacement,
  type DecouplingCapacitorLayoutOptions,
} from "./decoupling-capacitor-layout"

export interface UseDecouplingLayoutParams {
  chip: ComponentBounds
  /** All pins of the IC (power + signal). Non-power pins are filtered out. */
  pins: PinInfo[]
  options?: DecouplingCapacitorLayoutOptions
}

/**
 * Memoised hook: returns stable CapacitorPlacement[] whenever chip / pins
 * reference changes.
 */
export function useDecouplingLayout({
  chip,
  pins,
  options,
}: UseDecouplingLayoutParams): CapacitorPlacement[] {
  return useMemo(() => {
    const powerPins = filterDecouplingPins(pins)
    return layoutDecouplingCapacitors(chip, powerPins, options)
  }, [chip, pins, options])
}
