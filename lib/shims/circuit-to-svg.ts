// Shim for a version mismatch between @tscircuit/schematic-viewer and circuit-to-svg.
//
// The schematic-viewer package imports `convertCircuitJsonToSchematicSimulationSvg`
// from "circuit-to-svg", but circuit-to-svg@0.0.174 doesn't export it.
// For Cosmos/Vite dev, we alias "circuit-to-svg" to this module and provide the
// missing export by falling back to `convertCircuitJsonToSchematicSvg`.

export * from "circuit-to-svg/dist/index.js"

import {
  convertCircuitJsonToSchematicSvg,
  type ColorOverrides,
} from "circuit-to-svg/dist/index.js"
import type { CircuitJson } from "circuit-json"

type ConvertArgs = {
  circuitJson: CircuitJson
  colorOverrides?: ColorOverrides
  width?: number
  height?: number
  // Keep it permissive; circuit-to-svg option shapes can evolve.
  [key: string]: unknown
}

export const convertCircuitJsonToSchematicSimulationSvg = (args: ConvertArgs) =>
  convertCircuitJsonToSchematicSvg(args as any)

