import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import type { ChipId, InputProblem } from "lib/types/InputProblem"
import type { OutputLayout, Placement } from "lib/types/OutputLayout"
import inputProblem from "../assets/repro-powerboost-500-charger-autolayout.input.json"

type Bounds = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type AnchorCluster = {
  anchorChipId: ChipId
  chipIds: ChipId[]
  bounds: ReturnType<typeof getClusterBounds>
}

const getRotatedChipBounds = (
  problem: InputProblem,
  chipId: ChipId,
  placement: Placement,
): Bounds => {
  const chip = problem.chipMap[chipId]!
  const halfWidth = chip.size.x / 2
  const halfHeight = chip.size.y / 2
  const angleRad = (placement.ccwRotationDegrees * Math.PI) / 180
  const cos = Math.abs(Math.cos(angleRad))
  const sin = Math.abs(Math.sin(angleRad))
  const rotatedHalfWidth = halfWidth * cos + halfHeight * sin
  const rotatedHalfHeight = halfWidth * sin + halfHeight * cos

  return {
    minX: placement.x - rotatedHalfWidth,
    maxX: placement.x + rotatedHalfWidth,
    minY: placement.y - rotatedHalfHeight,
    maxY: placement.y + rotatedHalfHeight,
  }
}

const getClusterBounds = (
  problem: InputProblem,
  chipIds: ChipId[],
  outputLayout: OutputLayout,
) => {
  const chipBounds = chipIds.map((chipId) => ({
    chipId,
    placement: outputLayout.chipPlacements[chipId]!,
    bounds: getRotatedChipBounds(
      problem,
      chipId,
      outputLayout.chipPlacements[chipId]!,
    ),
  }))
  const minX = Math.min(...chipBounds.map(({ bounds }) => bounds.minX))
  const maxX = Math.max(...chipBounds.map(({ bounds }) => bounds.maxX))
  const minY = Math.min(...chipBounds.map(({ bounds }) => bounds.minY))
  const maxY = Math.max(...chipBounds.map(({ bounds }) => bounds.maxY))

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    chipBounds,
  }
}

const getStrongChipNeighbors = (problem: InputProblem, chipId: ChipId) => {
  const chip = problem.chipMap[chipId]
  if (!chip) return []

  const chipPins = new Set(chip.pins)
  const neighbors = new Set<ChipId>()
  for (const [connKey, connected] of Object.entries(problem.pinStrongConnMap)) {
    if (!connected) continue
    const [pinA, pinB] = connKey.split("-")
    const ownPin = chipPins.has(pinA!)
      ? pinA
      : chipPins.has(pinB!)
        ? pinB
        : null
    if (!ownPin) continue
    const otherPin = ownPin === pinA ? pinB : pinA
    const otherChipId = Object.entries(problem.chipMap).find(([, otherChip]) =>
      otherChip.pins.includes(otherPin!),
    )?.[0]
    if (otherChipId && otherChipId !== chipId) neighbors.add(otherChipId)
  }

  return [...neighbors]
}

const getAnchorClusters = (
  problem: InputProblem,
  outputLayout: OutputLayout,
): AnchorCluster[] => {
  const clusters: AnchorCluster[] = []
  for (const [anchorChipId, chip] of Object.entries(problem.chipMap)) {
    if (chip.pins.length <= 2) continue

    const supportChipIds = getStrongChipNeighbors(problem, anchorChipId).filter(
      (chipId) => problem.chipMap[chipId]?.pins.length === 2,
    )
    if (supportChipIds.length < 2) continue

    const chipIds = [anchorChipId, ...supportChipIds].filter(
      (chipId) => outputLayout.chipPlacements[chipId],
    )
    if (chipIds.length < 3) continue

    clusters.push({
      anchorChipId,
      chipIds,
      bounds: getClusterBounds(problem, chipIds, outputLayout),
    })
  }

  return clusters.sort((a, b) => a.anchorChipId.localeCompare(b.anchorChipId))
}

const fmt = (value: number) => value.toFixed(2).padStart(6)

const logClusterReport = (label: string, cluster: AnchorCluster) => {
  console.log(`\n${label}`)
  console.log("=".repeat(label.length))
  const { bounds } = cluster
  console.log(
    `anchor=${cluster.anchorChipId}  chips=${cluster.chipIds.join(", ")}`,
  )
  console.log(
    `bounds  width=${fmt(bounds.width)}  height=${fmt(bounds.height)}  x=[${fmt(bounds.minX)}, ${fmt(bounds.maxX)}]  y=[${fmt(bounds.minY)}, ${fmt(bounds.maxY)}]`,
  )
  console.log("chips")
  for (const { chipId, placement, bounds: chipBounds } of bounds.chipBounds) {
    console.log(
      `  ${chipId.padEnd(3)} center=(${fmt(placement.x)}, ${fmt(placement.y)}) rot=${String(placement.ccwRotationDegrees).padStart(3)} box=${fmt(chipBounds.maxX - chipBounds.minX)}x${fmt(chipBounds.maxY - chipBounds.minY)}`,
    )
  }
}

const withAnchorClusterOverlays = (
  solver: LayoutPipelineSolver,
  clusters: AnchorCluster[],
) => ({
  visualize: (): GraphicsObject => {
    const graphics = solver.visualize()
    return {
      ...graphics,
      rects: [
        ...(graphics.rects ?? []),
        ...clusters.map(({ anchorChipId, bounds }) => ({
          center: {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2,
          },
          width: bounds.width,
          height: bounds.height,
          label: `${anchorChipId} anchor cluster`,
          fill: "rgba(239, 68, 68, 0.04)",
          stroke: "rgba(255, 0, 0, 0.95)",
          strokeWidth: 0.5,
        })),
      ],
      texts: [
        ...(graphics.texts ?? []),
        ...clusters.map(({ anchorChipId, bounds }) => ({
          x: bounds.minX,
          y: bounds.maxY + 0.28,
          text: `${anchorChipId} cluster ${bounds.width.toFixed(2)} x ${bounds.height.toFixed(2)}`,
          fontSize: 0.18,
          fill: "rgba(185, 28, 28, 0.95)",
        })),
      ],
    }
  },
})

// Captured from @tscircuit/core's
// tests/repros/repro143-powerboost-500-charger-autolayout.test.tsx with
// DEBUG=Group_doInitialSchematicLayoutMatchpack. This recreates the Adafruit
// PowerBoost 500 Charger style topology with a TPS61090 boost converter,
// MCP73871 charger, USB connectors, battery connector, LEDs, and programming
// passives.
test("core repro143 powerboost 500 charger autolayout", async () => {
  const solver = new LayoutPipelineSolver(inputProblem as any)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const outputLayout = solver.getOutputLayout()
  expect(solver.checkForOverlaps(outputLayout)).toHaveLength(0)

  const anchorClusters = getAnchorClusters(inputProblem as any, outputLayout)
  for (const cluster of anchorClusters) {
    logClusterReport(
      `${cluster.anchorChipId} anchor cluster placement`,
      cluster,
    )
  }

  const u1Cluster = anchorClusters.find(
    (cluster) => cluster.anchorChipId === "U1",
  )
  expect(u1Cluster).toBeDefined()
  expect(u1Cluster!.bounds.width).toBeLessThan(9.5)
  expect(u1Cluster!.bounds.height).toBeLessThan(4.5)

  await expect(
    withAnchorClusterOverlays(solver, anchorClusters),
  ).toMatchSolverSnapshot(import.meta.path, {
    svgName: "powerboost-500-charger-autolayout",
    svgWidth: 1400,
    svgHeight: 1000,
  })
})
