/**
 * Identifies decoupling capacitor groups based on specific criteria:
 * 1. Component has exactly 2 pins and restricted rotation (0/180 only or no rotation)
 * 2. One pin indirectly connected to net with "y+" restriction, one to "y-" restriction
 * 3. At least one pin directly connected to another chip
 */

import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../BaseSolver"
import type {
  ChipId,
  InputProblem,
  NetId,
  PinId,
  Chip,
} from "lib/types/InputProblem"
import { getColorFromString } from "lib/utils/getColorFromString"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

interface DecouplingCapGroup {
  decouplingCapGroupId: string
  mainChipId: ChipId
  decouplingCapChipIds: ChipId[]
}

/**
 * Identify decoupling capacitor groups based on specific criteria:
 * 1. Component has exactly 2 pins and restricted rotation (0/180 only or no rotation)
 * 2. One pin indirectly connected to net with "y+" restriction, one to "y-" restriction
 * 3. At least one pin directly connected to a chip (the main chip, typically a microcontroller)
 */
export class IdentifyDecouplingCapsSolver extends BaseSolver {
  inputProblem: InputProblem

  queuedChips: Chip[]

  outputDecouplingCapGroups: DecouplingCapGroup[] = []

  // TODO add output type

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.queuedChips = Object.values(inputProblem.chipMap)
  }

  override _step() {
    const currentChip = this.queuedChips.shift()
    if (!currentChip) {
      this.solved = true
      return
    }
    // TODO implement
  }

  override visualize(): GraphicsObject {
    const basicLayout = doBasicInputProblemLayout(this.inputProblem)
    const graphics: GraphicsObject = visualizeInputProblem(
      this.inputProblem,
      basicLayout,
    )

    // TODO modify rect labels and fill/color to reflect decoupling cap groups
    // NOTE: the rect.label is the chipId

    return graphics
  }
}
