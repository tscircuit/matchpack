import { BaseSolver } from "../BaseSolver"

export class ChipPartitionsSolver extends BaseSolver {
  async solve() {
    const { inputProblem } = this
    const decapGroupPartitions: string[][] = []

    for (const group of inputProblem.decouplingCapGroups || []) {
      const capsOnly = group.decouplingCapChipIds.filter(id => inputProblem.chipMap[id])
      
      if (capsOnly.length >= 2) {
        decapGroupPartitions.push(capsOnly)
      }
    }

    this.outputLayout.chipPartitions = decapGroupPartitions
  }
}
