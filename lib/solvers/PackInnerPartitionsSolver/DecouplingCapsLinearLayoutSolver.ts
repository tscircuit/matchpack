export function applyDecouplingCapsLinearLayout(
  chips: Array<{
    chipId: string
    center: { x: number; y: number }
    ccwRotationDegrees: number
  }>,
  opts?: { decouplingCapsGap?: number; chipGap?: number },
) {
  if (chips.length === 0) return

  const gap = opts?.decouplingCapsGap ?? opts?.chipGap ?? 0.2
  const chipWidth = 1
  const totalWidth = chips.length * chipWidth + (chips.length - 1) * gap

  const sorted = [...chips].sort((a, b) => a.chipId.localeCompare(b.chipId))
  let x = -totalWidth / 2 + chipWidth / 2

  for (const chip of sorted) {
    chip.center.x = x
    chip.center.y = 0
    chip.ccwRotationDegrees = 0
    x += chipWidth + gap
  }
}
