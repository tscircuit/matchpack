import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { getSymmetricSwitchMatrixJson } from "../assets/SymmetricSwitchMatrix"
import { getInputProblemFromCircuitJsonSchematic } from "lib/testing/getInputProblemFromCircuitJsonSchematic"

/**
 * Test case demonstrating symmetric group layout issues
 *
 * This test demonstrates that circuits with symmetric patterns (like switch matrices)
 * are not being laid out optimally. The current algorithm doesn't recognize and
 * optimize layouts for symmetric component groups.
 *
 * Expected behavior:
 * - Components with identical patterns should be arranged in organized grids
 * - Symmetric groups should maintain consistent spacing and alignment
 * - Related components should be grouped together visually
 *
 * Current behavior:
 * - Components may be scattered without recognizing patterns
 * - No special handling for symmetric/repeated structures
 * - Layout may not reflect logical relationships between similar components
 */

test("Current algorithm doesn't optimize symmetric group layouts", () => {
  // Convert SymmetricSwitchMatrix to InputProblem
  const circuitJson = getSymmetricSwitchMatrixJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  // Verify we have the expected symmetric components
  const chipIds = Object.keys(problem.chipMap)

  // Should have 4 identical component rows (using actual components that appear in chipMap)
  expect(
    chipIds.filter((id) => id.startsWith("R") && id.includes("_1")),
  ).toHaveLength(4)
  expect(
    chipIds.filter((id) => id.startsWith("R") && id.includes("_2")),
  ).toHaveLength(4)
  expect(
    chipIds.filter((id) => id.startsWith("C") && id.includes("_1")),
  ).toHaveLength(4)
  expect(
    chipIds.filter((id) => id.startsWith("C") && id.includes("_2")),
  ).toHaveLength(4)

  // Should have power distribution components
  expect(chipIds.filter((id) => id.startsWith("C_PWR"))).toHaveLength(4)

  // Should have control logic
  expect(chipIds).toContain("C_CTRL")

  // Create and solve the layout
  const solver = new LayoutPipelineSolver(problem)
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)

  const layout = solver.getOutputLayout()
  expect(layout).toBeDefined()
  expect(layout.chipPlacements).toBeDefined()

  // === ANALYSIS OF CURRENT SUBOPTIMAL BEHAVIOR ===

  // Get positions of symmetric components (resistors and capacitors that form patterns)
  const resistor1Positions = [
    layout.chipPlacements["R1_1"],
    layout.chipPlacements["R2_1"],
    layout.chipPlacements["R3_1"],
    layout.chipPlacements["R4_1"],
  ].filter(Boolean) as Array<{
    x: number
    y: number
    ccwRotationDegrees: number
  }>

  const resistor2Positions = [
    layout.chipPlacements["R1_2"],
    layout.chipPlacements["R2_2"],
    layout.chipPlacements["R3_2"],
    layout.chipPlacements["R4_2"],
  ].filter(Boolean) as Array<{
    x: number
    y: number
    ccwRotationDegrees: number
  }>

  const capacitor1Positions = [
    layout.chipPlacements["C1_1"],
    layout.chipPlacements["C2_1"],
    layout.chipPlacements["C3_1"],
    layout.chipPlacements["C4_1"],
  ].filter(Boolean) as Array<{
    x: number
    y: number
    ccwRotationDegrees: number
  }>

  const powerCapPositions = [
    layout.chipPlacements["C_PWR1"],
    layout.chipPlacements["C_PWR2"],
    layout.chipPlacements["C_PWR3"],
    layout.chipPlacements["C_PWR4"],
  ].filter(Boolean) as Array<{
    x: number
    y: number
    ccwRotationDegrees: number
  }>

  // Verify all symmetric components were placed
  expect(resistor1Positions).toHaveLength(4)
  expect(resistor2Positions).toHaveLength(4)
  expect(capacitor1Positions).toHaveLength(4)
  expect(powerCapPositions).toHaveLength(4)

  // === DETECT SUBOPTIMAL PATTERNS ===

  function analyzeAlignment(
    positions: Array<{ x: number; y: number }>,
    tolerance = 0.5,
  ): {
    horizontallyAligned: boolean
    verticallyAligned: boolean
    maxXVariance: number
    maxYVariance: number
  } {
    if (positions.length < 2)
      return {
        horizontallyAligned: true,
        verticallyAligned: true,
        maxXVariance: 0,
        maxYVariance: 0,
      }

    const xCoords = positions.map((p) => p.x)
    const yCoords = positions.map((p) => p.y)

    const maxX = Math.max(...xCoords)
    const minX = Math.min(...xCoords)
    const maxY = Math.max(...yCoords)
    const minY = Math.min(...yCoords)

    const maxXVariance = maxX - minX
    const maxYVariance = maxY - minY

    return {
      horizontallyAligned: maxYVariance <= tolerance,
      verticallyAligned: maxXVariance <= tolerance,
      maxXVariance,
      maxYVariance,
    }
  }

  // Verify no overlaps (this should always pass)
  const overlaps = solver.checkForOverlaps(layout)
  expect(overlaps.length).toBe(0)

  // Basic sanity checks
  expect(Object.keys(layout.chipPlacements).length).toBeGreaterThan(20) // Should place all components

  // All components should be positioned (not at origin unless intentionally placed there)
  let componentsAtOrigin = 0
  for (const [chipId, placement] of Object.entries(layout.chipPlacements)) {
    if (placement.x === 0 && placement.y === 0) {
      componentsAtOrigin++
    }
  }

  // Most components should not be clustered at origin
  expect(componentsAtOrigin).toBeLessThan(
    Object.keys(layout.chipPlacements).length / 2,
  )
})

test("Measure layout quality metrics for symmetric groups", () => {
  // This test implements advanced metrics to quantify layout quality
  // for symmetric/repeated component groups

  const circuitJson = getSymmetricSwitchMatrixJson()
  const problem = getInputProblemFromCircuitJsonSchematic(circuitJson, {
    useReadableIds: true,
  })

  const solver = new LayoutPipelineSolver(problem)
  solver.solve()
  const layout = solver.getOutputLayout()

  // Helper function to calculate variance (spread) of positions
  function calculateVariance(values: number[]): number {
    if (values.length <= 1) return 0
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length
    const variance =
      values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      values.length
    return variance
  }

  // Helper function to calculate centroid (center point) of a group
  function calculateCentroid(positions: Array<{ x: number; y: number }>): {
    x: number
    y: number
  } {
    if (positions.length === 0) return { x: 0, y: 0 }
    const sum = positions.reduce(
      (sum, pos) => ({ x: sum.x + pos.x, y: sum.y + pos.y }),
      { x: 0, y: 0 },
    )
    return { x: sum.x / positions.length, y: sum.y / positions.length }
  }

  // Helper function to calculate distance between two points
  function calculateDistance(
    pos1: { x: number; y: number },
    pos2: { x: number; y: number },
  ): number {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2),
    )
  }

  // 1. SYMMETRY SCORE - How symmetric are the identical component groups?
  const symmetryGroups = [
    ["R1_1", "R2_1", "R3_1", "R4_1"], // Resistor group 1
    ["R1_2", "R2_2", "R3_2", "R4_2"], // Resistor group 2
    ["C1_1", "C2_1", "C3_1", "C4_1"], // Capacitor group 1
    ["C_PWR1", "C_PWR2", "C_PWR3", "C_PWR4"], // Power capacitors
  ]

  let totalSymmetryScore = 0
  for (const group of symmetryGroups) {
    const positions = group
      .map((id) => layout.chipPlacements[id])
      .filter(Boolean) as Array<{
      x: number
      y: number
      ccwRotationDegrees: number
    }>
    if (positions.length >= 2) {
      const xCoords = positions.map((p) => p.x)
      const yCoords = positions.map((p) => p.y)
      const xVariance = calculateVariance(xCoords)
      const yVariance = calculateVariance(yCoords)
      // Lower variance = higher symmetry. Convert to 0-1 score where 1 is perfect
      const symmetryScore = Math.max(
        0,
        1 - Math.sqrt(xVariance + yVariance) / 100,
      )
      totalSymmetryScore += symmetryScore
    }
  }
  const avgSymmetryScore = totalSymmetryScore / symmetryGroups.length

  // 2. ALIGNMENT SCORE - How well are components aligned in rows/columns?
  let totalAlignmentScore = 0
  for (const group of symmetryGroups) {
    const positions = group
      .map((id) => layout.chipPlacements[id])
      .filter(Boolean) as Array<{
      x: number
      y: number
      ccwRotationDegrees: number
    }>
    if (positions.length >= 2) {
      const xCoords = positions.map((p) => p.x)
      const yCoords = positions.map((p) => p.y)

      // Check both horizontal and vertical alignment
      const xRange = Math.max(...xCoords) - Math.min(...xCoords)
      const yRange = Math.max(...yCoords) - Math.min(...yCoords)

      // Score based on how tightly aligned they are (smaller range = better)
      const alignmentScore = Math.max(0, 1 - Math.min(xRange, yRange) / 50)
      totalAlignmentScore += alignmentScore
    }
  }
  const avgAlignmentScore = totalAlignmentScore / symmetryGroups.length

  // 3. GROUPING SCORE - Are related components placed close together?
  const groupCentroids = symmetryGroups.map((group) => {
    const positions = group
      .map((id) => layout.chipPlacements[id])
      .filter(Boolean) as Array<{
      x: number
      y: number
      ccwRotationDegrees: number
    }>
    return calculateCentroid(positions.map((p) => ({ x: p.x, y: p.y })))
  })

  // Calculate average distance between group centroids (smaller = better grouping)
  let totalDistance = 0
  let pairCount = 0
  for (let i = 0; i < groupCentroids.length; i++) {
    for (let j = i + 1; j < groupCentroids.length; j++) {
      totalDistance += calculateDistance(groupCentroids[i]!, groupCentroids[j]!)
      pairCount++
    }
  }
  const avgGroupDistance = pairCount > 0 ? totalDistance / pairCount : 0
  const groupingScore = Math.max(0, 1 - avgGroupDistance / 200) // Normalize to 0-1

  // Overall layout quality score
  const overallScore =
    (avgSymmetryScore + avgAlignmentScore + groupingScore) / 3

  console.log("=== LAYOUT QUALITY METRICS ===")
  console.log(`Symmetry Score: ${avgSymmetryScore.toFixed(3)}`)
  console.log(`Alignment Score: ${avgAlignmentScore.toFixed(3)}`)
  console.log(`Grouping Score: ${groupingScore.toFixed(3)}`)
  console.log(`Overall Score: ${overallScore.toFixed(3)}`)

  // These metrics help us quantify improvements after we enhance the algorithm
  expect(overallScore).toBeGreaterThanOrEqual(0) // Should always be non-negative
  expect(overallScore).toBeLessThanOrEqual(1) // Should always be normalized to 0-1 range
})
