import type { GraphicsObject } from "graphics-debug"
import type {
  Chip,
  ChipId,
  InputProblem,
  NetId,
  PinId,
} from "../../types/InputProblem"
import { BaseSolver } from "../BaseSolver"
import { doBasicInputProblemLayout } from "../LayoutPipelineSolver/doBasicInputProblemLayout"
import { visualizeInputProblem } from "../LayoutPipelineSolver/visualizeInputProblem"

export interface CrystalLoadCap {
  chipId: ChipId
  signalPinId: PinId
  groundPinId: PinId
}

export interface CrystalSeriesResistor {
  chipId: ChipId
  crystalPinId: PinId
  connectedPinId: PinId
}

export interface CrystalCircuitGroup {
  crystalCircuitGroupId: string
  crystalChipId: ChipId
  activeCrystalPinIds: [PinId, PinId]
  loadCaps: [CrystalLoadCap, CrystalLoadCap]
  groundNetId: NetId
  seriesResistors: CrystalSeriesResistor[]
}

/**
 * Identifies the standard crystal oscillator network: two active crystal pins,
 * one grounded load capacitor on each pin, plus optional series resistors on
 * either crystal-side node. Component types are explicit so an arbitrary
 * two-pin component with similar connectivity is never treated as a crystal.
 */
export class IdentifyCrystalCircuitsSolver extends BaseSolver {
  inputProblem: InputProblem
  queuedCrystals: Chip[]
  outputCrystalCircuitGroups: CrystalCircuitGroup[] = []

  constructor(inputProblem: InputProblem) {
    super()
    this.inputProblem = inputProblem
    this.queuedCrystals = Object.values(inputProblem.chipMap).filter(
      (chip) => chip.isCrystal,
    )
  }

  private getNetIdsForPin(pinId: PinId): Set<NetId> {
    const nets = new Set<NetId>()
    for (const netId of Object.keys(this.inputProblem.netMap)) {
      if (this.inputProblem.netConnMap[`${pinId}-${netId}`]) nets.add(netId)
    }
    return nets
  }

  private pinsAreConnected(pinA: PinId, pinB: PinId): boolean {
    if (
      this.inputProblem.pinStrongConnMap[`${pinA}-${pinB}`] ||
      this.inputProblem.pinStrongConnMap[`${pinB}-${pinA}`]
    ) {
      return true
    }

    const netsA = this.getNetIdsForPin(pinA)
    return Array.from(this.getNetIdsForPin(pinB)).some((netId) =>
      netsA.has(netId),
    )
  }

  private getGroundNetId(pinId: PinId): NetId | null {
    for (const netId of this.getNetIdsForPin(pinId)) {
      if (this.inputProblem.netMap[netId]?.isGround) return netId
    }
    return null
  }

  private findLoadCapsForCrystalPin(
    crystalPinId: PinId,
  ): Array<CrystalLoadCap & { groundNetId: NetId }> {
    const candidates: Array<CrystalLoadCap & { groundNetId: NetId }> = []

    for (const chip of Object.values(this.inputProblem.chipMap)) {
      if (!chip.isCapacitor || chip.pins.length !== 2) continue

      for (const signalPinId of chip.pins) {
        if (!this.pinsAreConnected(crystalPinId, signalPinId)) continue

        const groundPinId = chip.pins.find((pinId) => pinId !== signalPinId)
        if (!groundPinId) continue
        const groundNetId = this.getGroundNetId(groundPinId)
        if (!groundNetId) continue

        candidates.push({
          chipId: chip.chipId,
          signalPinId,
          groundPinId,
          groundNetId,
        })
      }
    }

    return candidates
  }

  private findSeriesResistors(
    activeCrystalPinIds: [PinId, PinId],
    loadCapIds: Set<ChipId>,
  ): CrystalSeriesResistor[] {
    const seriesResistors: CrystalSeriesResistor[] = []

    for (const chip of Object.values(this.inputProblem.chipMap)) {
      if (
        !chip.isResistor ||
        chip.pins.length !== 2 ||
        loadCapIds.has(chip.chipId)
      ) {
        continue
      }

      const activeConnections = activeCrystalPinIds.flatMap((crystalPinId) =>
        chip.pins
          .filter((pinId) => this.pinsAreConnected(crystalPinId, pinId))
          .map((connectedPinId) => ({ crystalPinId, connectedPinId })),
      )
      if (activeConnections.length !== 1) continue

      const connection = activeConnections[0]!
      const outwardPinId = chip.pins.find(
        (pinId) => pinId !== connection.connectedPinId,
      )
      if (!outwardPinId || this.getGroundNetId(outwardPinId)) continue

      seriesResistors.push({
        chipId: chip.chipId,
        crystalPinId: connection.crystalPinId,
        connectedPinId: connection.connectedPinId,
      })
    }

    return seriesResistors
  }

  private identifyCrystal(crystal: Chip): CrystalCircuitGroup | null {
    const activeCrystalPinIds = crystal.pins.filter(
      (pinId) => !this.getGroundNetId(pinId),
    )
    if (activeCrystalPinIds.length !== 2) return null

    const [pinA, pinB] = activeCrystalPinIds as [PinId, PinId]
    const capsA = this.findLoadCapsForCrystalPin(pinA)
    const capsB = this.findLoadCapsForCrystalPin(pinB)

    // Reject ambiguity instead of claiming an arbitrary capacitor.
    if (capsA.length !== 1 || capsB.length !== 1) return null
    if (capsA[0]!.chipId === capsB[0]!.chipId) return null
    if (capsA[0]!.groundNetId !== capsB[0]!.groundNetId) return null

    const loadCaps: [CrystalLoadCap, CrystalLoadCap] = [
      {
        chipId: capsA[0]!.chipId,
        signalPinId: capsA[0]!.signalPinId,
        groundPinId: capsA[0]!.groundPinId,
      },
      {
        chipId: capsB[0]!.chipId,
        signalPinId: capsB[0]!.signalPinId,
        groundPinId: capsB[0]!.groundPinId,
      },
    ]
    const loadCapIds = new Set(loadCaps.map((cap) => cap.chipId))

    return {
      crystalCircuitGroupId: `crystal_circuit_${crystal.chipId}`,
      crystalChipId: crystal.chipId,
      activeCrystalPinIds: [pinA, pinB],
      loadCaps,
      groundNetId: capsA[0]!.groundNetId,
      seriesResistors: this.findSeriesResistors([pinA, pinB], loadCapIds),
    }
  }

  override _step() {
    const crystal = this.queuedCrystals.shift()
    if (!crystal) {
      this.solved = true
      return
    }

    const group = this.identifyCrystal(crystal)
    if (group) this.outputCrystalCircuitGroups.push(group)
  }

  override visualize(): GraphicsObject {
    return visualizeInputProblem(
      this.inputProblem,
      doBasicInputProblemLayout(this.inputProblem),
    )
  }

  override getConstructorParams(): [InputProblem] {
    return [this.inputProblem]
  }

  computeProgress(): number {
    const crystalCount = Object.values(this.inputProblem.chipMap).filter(
      (chip) => chip.isCrystal,
    ).length
    if (crystalCount === 0) return 1
    return (crystalCount - this.queuedCrystals.length) / crystalCount
  }
}
