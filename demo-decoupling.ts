import { DecouplingCapLayoutSolver } from "./dist/index.js"

const problem = {
  components: [
    {
      id: "U1",
      type: "chip",
      x: 0,
      y: 0,
      pins: [{ net: "VCC" }, { net: "GND" }],
    },
    { id: "C1", type: "cap", pins: [{ net: "GND" }] },
    { id: "C2", type: "cap", pins: [{ net: "GND" }] },
    { id: "R1", type: "resistor" },
  ],
}

const solver = new DecouplingCapLayoutSolver(problem)
const result = solver.solve()

console.log("Decoupling capacitor positions:")
result.components
  .filter((c) => c.type.toLowerCase().includes("cap"))
  .forEach((c) => console.log(`${c.id}: x=${c.x}, y=${c.y}`))
