import { expect, test } from "bun:test"
import { LayoutPipelineSolver } from "lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import { findSharedTerminalBranchGroups } from "lib/solvers/PackInnerPartitionsSolver/findSharedTerminalBranchGroups"
import type { InputProblem } from "lib/types/InputProblem"

const isInputProblem = (value: unknown): value is InputProblem => {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<InputProblem>
  return Boolean(
    candidate.chipMap &&
      candidate.chipPinMap &&
      candidate.pinStrongConnMap &&
      candidate.netConnMap &&
      typeof candidate.chipGap === "number" &&
      typeof candidate.partitionGap === "number",
  )
}

const collectJsonPaths = async (): Promise<string[]> => {
  const paths: string[] = []
  const glob = new Bun.Glob("**/*.json")

  for (const root of ["pages/repros", "tests/assets"]) {
    for await (const relativePath of glob.scan({ cwd: root, onlyFiles: true })) {
      paths.push(`${root}/${relativePath}`)
    }
  }

  return paths.sort()
}

test("shared-terminal refinement has a narrow blast radius across repository fixtures", async () => {
  const jsonPaths = await collectJsonPaths()
  const inputProblemPaths: string[] = []
  const activatedPaths: string[] = []

  for (const path of jsonPaths) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await Bun.file(path).text())
    } catch {
      continue
    }
    if (!isInputProblem(parsed)) continue

    inputProblemPaths.push(path)
    const groups = findSharedTerminalBranchGroups(parsed)
    if (groups.length === 0) continue

    activatedPaths.push(path)
    const solver = new LayoutPipelineSolver(parsed)
    solver.solve()
    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.checkForOverlaps(solver.getOutputLayout())).toHaveLength(0)
  }

  console.log(
    `shared-terminal blast radius: ${activatedPaths.length}/${inputProblemPaths.length} InputProblem fixtures activated`,
  )
  console.log(`shared-terminal activated fixtures: ${activatedPaths.join(", ")}`)

  expect(inputProblemPaths.length).toBeGreaterThan(20)
  expect(activatedPaths).toContain(
    "pages/repros/repro-si7021/si7021-matchpack-input.json",
  )
})
