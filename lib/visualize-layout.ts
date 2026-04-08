import { LayoutPipelineSolver } from "/Users/HP/matchpack/lib/solvers/LayoutPipelineSolver/LayoutPipelineSolver"
import si7021Input from "/Users/HP/matchpack/pages/repros/repro-si7021/repro-si7021.page"
import fs from "fs"

const solver = new LayoutPipelineSolver(si7021Input as any)
solver.solve()

if (solver.solved) {
  const layout = solver.getOutputLayout()

  // Generate HTML with component positions
  let html = `<!DOCTYPE html>
<html>
<head><title>SI7021 Layout - With Power/Ground Bias</title>
<style>
  body { font-family: monospace; padding: 20px; }
  .component { 
    position: absolute; 
    border: 2px solid #333; 
    padding: 4px 8px; 
    background: white;
    font-size: 12px;
    white-space: nowrap;
  }
  .power { border-color: red; background: #ffe0e0; }
  .ground { border-color: blue; background: #e0e0ff; }
  .signal { border-color: green; background: #e0ffe0; }
  #container { position: relative; border: 1px solid #ccc; min-height: 600px; margin: 20px; }
</style>
</head>
<body>
<h1>SI7021 Layout with Power/Ground Bias</h1>
<p>✅ Power nets (red) biased UP | Ground nets (blue) biased DOWN</p>
<div id="container">
`

  // Add components
  for (const [chipId, placement] of Object.entries(layout.chipPlacements)) {
    const isPower =
      chipId.includes("V3") || chipId.includes("VCC") || chipId.includes("VDD")
    const isGround = chipId.includes("GND") || chipId.includes("VSS")
    const cssClass = isPower ? "power" : isGround ? "ground" : "signal"

    html += `<div class="component ${cssClass}" style="left: ${placement.x * 10 + 100}px; top: ${placement.y * 10 + 100}px;">
      ${chipId} (y=${placement.y.toFixed(1)})
    </div>\n`
  }

  html += `</div>
<p><strong>Note:</strong> Power components have HIGHER Y? Actually check positions above.</p>
</body>
</html>`

  fs.writeFileSync("layout-visualization.html", html)
  console.log("✅ Created layout-visualization.html")
  console.log("📸 Open this file in your browser and take a screenshot!")
  console.log("   Power components should be higher (smaller Y)")
  console.log("   Ground components should be lower (larger Y)")
} else {
  console.log("Error:", solver.error)
}
