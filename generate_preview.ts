import { SingleInnerPartitionPackingSolver } from "./lib/solvers/PackInnerPartitionsSolver/SingleInnerPartitionPackingSolver"
import type { PartitionInputProblem } from "./lib/types/InputProblem"

// 构造包含 5 个解耦电容的 Mock Input
const problem: PartitionInputProblem = {
  isPartition: true,
  partitionType: "decoupling_caps",
  chipMap: {
    C1: {
      chipId: "C1",
      pins: ["C1_P1", "C1_P2"],
      size: { x: 1.0, y: 0.5 },
      availableRotations: [0, 180],
    },
    C2: {
      chipId: "C2",
      pins: ["C2_P1", "C2_P2"],
      size: { x: 1.2, y: 0.6 },
      availableRotations: [0, 180],
    },
    C3: {
      chipId: "C3",
      pins: ["C3_P1", "C3_P2"],
      size: { x: 0.8, y: 0.4 },
      availableRotations: [0, 180],
    },
    C4: {
      chipId: "C4",
      pins: ["C4_P1", "C4_P2"],
      size: { x: 1.5, y: 0.7 },
      availableRotations: [0, 180],
    },
    C5: {
      chipId: "C5",
      pins: ["C5_P1", "C5_P2"],
      size: { x: 0.9, y: 0.45 },
      availableRotations: [0, 180],
    },
  },
  chipPinMap: {
    C1_P1: { pinId: "C1_P1", offset: { x: 0, y: 0.25 }, side: "y+" },
    C1_P2: { pinId: "C1_P2", offset: { x: 0, y: -0.25 }, side: "y-" },
    C2_P1: { pinId: "C2_P1", offset: { x: 0, y: 0.3 }, side: "y+" },
    C2_P2: { pinId: "C2_P2", offset: { x: 0, y: -0.3 }, side: "y-" },
    C3_P1: { pinId: "C3_P1", offset: { x: 0, y: 0.2 }, side: "y+" },
    C3_P2: { pinId: "C3_P2", offset: { x: 0, y: -0.2 }, side: "y-" },
    C4_P1: { pinId: "C4_P1", offset: { x: 0, y: 0.35 }, side: "y+" },
    C4_P2: { pinId: "C4_P2", offset: { x: 0, y: -0.35 }, side: "y-" },
    C5_P1: { pinId: "C5_P1", offset: { x: 0, y: 0.225 }, side: "y+" },
    C5_P2: { pinId: "C5_P2", offset: { x: 0, y: -0.225 }, side: "y-" },
  },
  netMap: {
    VCC: { netId: "VCC", isPositiveVoltageSource: true },
    GND: { netId: "GND", isGround: true },
  },
  pinStrongConnMap: {},
  netConnMap: {
    "C1_P1-VCC": true,
    "C1_P2-GND": true,
    "C2_P1-VCC": true,
    "C2_P2-GND": true,
    "C3_P1-VCC": true,
    "C3_P2-GND": true,
    "C4_P1-VCC": true,
    "C4_P2-GND": true,
    "C5_P1-VCC": true,
    "C5_P2-GND": true,
  },
  chipGap: 0.2,
  partitionGap: 2,
  decouplingCapsGap: 0.3,
}

const solver = new SingleInnerPartitionPackingSolver({
  partitionInputProblem: problem,
  pinIdToStronglyConnectedPins: {},
})

solver.step()

const layout = solver.layout!
const placements = layout.chipPlacements

// 计算总宽度用于 SVG 视图框
const chipIds = Object.keys(problem.chipMap).sort()
let totalWidth = 0
let maxHeight = 0
for (const id of chipIds) {
  const chip = problem.chipMap[id]!
  totalWidth += chip.size.x
  totalWidth += problem.decouplingCapsGap!
  maxHeight = Math.max(maxHeight, chip.size.y)
}
totalWidth -= problem.decouplingCapsGap!

const viewBoxWidth = totalWidth + 2
const viewBoxHeight = maxHeight + 1

// 生成 SVG
const svgParts: string[] = []
svgParts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-viewBoxWidth/2} ${-viewBoxHeight/2} ${viewBoxWidth} ${viewBoxHeight}" width="800" height="400">`)
svgParts.push(`  <rect x="${-viewBoxWidth/2}" y="${-viewBoxHeight/2}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="#f5f5f5"/>`)

// 绘制每个电容
for (const id of chipIds) {
  const placement = placements[id]!
  const chip = problem.chipMap[id]!
  const halfWidth = chip.size.x / 2
  const halfHeight = chip.size.y / 2
  
  const x = placement.x - halfWidth
  const y = placement.y - halfHeight
  
  svgParts.push(`  <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${chip.size.x}" height="${chip.size.y}" fill="#4a90d9" stroke="#2c5a8c" stroke-width="0.05" rx="0.1"/>`)
  svgParts.push(`  <text x="${placement.x.toFixed(2)}" y="${placement.y.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="0.3" font-family="Arial">${id}</text>`)
  svgParts.push(`  <text x="${placement.x.toFixed(2)}" y="${(placement.y + halfHeight + 0.4).toFixed(2)}" text-anchor="middle" fill="#333" font-size="0.2" font-family="Arial">x:${placement.x.toFixed(2)}, y:${placement.y.toFixed(2)}</text>`)
}

// 添加标题
svgParts.push(`  <text x="0" y="${(-viewBoxHeight/2 + 0.3).toFixed(2)}" text-anchor="middle" fill="#333" font-size="0.25" font-family="Arial" font-weight="bold">Decoupling Capacitors Linear Layout</text>`)
svgParts.push(`  <text x="0" y="${(-viewBoxHeight/2 + 0.6).toFixed(2)}" text-anchor="middle" fill="#666" font-size="0.18" font-family="Arial">5 caps arranged horizontally with 0.3 gap</text>`)

svgParts.push(`</svg>`)

const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <title>Decoupling Caps Layout Preview</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #fafafa; }
    .container { max-width: 900px; margin: 0 auto; }
    h1 { color: #333; }
    .info { background: #e8f4fc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Decoupling Capacitors Linear Layout Preview</h1>
    <div class="info">
      <p><strong>Algorithm:</strong> _layoutDecouplingCapsLinear()</p>
      <p><strong>Gap:</strong> 0.3 | <strong>Coordinate System:</strong> Center-based</p>
      <p><strong>Sorting:</strong> chipId localeCompare (deterministic)</p>
    </div>
    <div>${svgParts.join("\n")}</div>
    <h2>Layout JSON</h2>
    <pre>${JSON.stringify(layout, null, 2)}</pre>
  </div>
</body>
</html>`

await Bun.write("preview.html", htmlContent)
console.log("✅ preview.html generated successfully!")
console.log("📐 Layout Summary:")
for (const id of chipIds) {
  const p = placements[id]!
  console.log(`   ${id}: x=${p.x.toFixed(2)}, y=${p.y.toFixed(2)}, rotation=${p.ccwRotationDegrees}°`)
}
