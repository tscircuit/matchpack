import { DecouplingCapGroup } from "../../types"

export class IdentifyDecouplingCapsSolver {
  inputProblem: any

  async solve(inputProblem: any): Promise<{ decouplingCapGroups: DecouplingCapGroup[] }> {
    this.inputProblem = inputProblem
    const decouplingCapGroups: DecouplingCapGroup[] = []

    const capacitors = inputProblem.capacitors || []
    const chipPinMap = inputProblem.chipPinMap || {}
    const nets = inputProblem.nets || []

    for (const cap of capacitors) {
      // Find all pins belonging to this capacitor
      const pins = Object.values(chipPinMap).filter(
        (p: any) => p.chipId === cap.capacitorId
      ) as any[]

      // Decoupling caps are 2-pin components
      if (pins.length !== 2) continue

      const net1 = nets.find((n: any) => n.name === pins[0].net)
      const net2 = nets.find((n: any) => n.name === pins[1].net)

      if (!net1 || !net2) continue

      // Check if one pin is Ground and the other is Power
      const isGnd = (n: any) => n.isGround || n.name?.toLowerCase().includes("gnd")
      const isPwr = (n: any) => n.isPositiveVoltageSource || n.name?.match(/VCC|VDD|V\+/i)

      if ((isGnd(net1) && isPwr(net2)) || (isPwr(net1) && isGnd(net2))) {
        // Find what other chip this capacitor is connected to
        const connections = (inputProblem.connections || []).filter(
          (c: any) => c.from.startsWith(cap.capacitorId) || c.to.startsWith(cap.capacitorId)
        )

        for (const conn of connections) {
          const otherSide = conn.from.startsWith(cap.capacitorId) ? conn.to : conn.from
          const otherChipId = chipPinMap[otherSide]?.chipId

          if (otherChipId && otherChipId !== cap.capacitorId) {
            decouplingCapGroups.push({
              capacitorId: cap.capacitorId,
              chipId: otherChipId,
            })
            break
          }
        }
      }
    }
    return { decouplingCapGroups }
  }
}
