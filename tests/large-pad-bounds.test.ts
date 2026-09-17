import { test } from "bun:test"
import { strict as assert } from "node:assert"
import type { InputPad } from "calculate-packing"
import { getPadsBoundingBox } from "../lib/solvers/PackInnerPartitionsSolver/getPadsBoundingBox"

const pad = (x: number, y: number, width = 2, height = 4): InputPad => ({
  padId: `${x},${y}`,
  networkId: "test",
  type: "rect",
  offset: { x, y },
  size: { x: width, y: height },
})

test("bounds accept a large pad list without spreading all coordinates", () => {
  const pads = Array.from({ length: 100_000 }, (_, i) => pad(i, -i))
  assert.deepEqual(getPadsBoundingBox(pads), {
    minX: -1,
    maxX: 100_000,
    minY: -100_001,
    maxY: 2,
  })
})

test("empty lists keep the zero bounds fallback", () => {
  assert.deepEqual(getPadsBoundingBox([]), {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  })
})

test("non-origin geometry retains both offset and size", () => {
  assert.deepEqual(getPadsBoundingBox([pad(3, -2)]), {
    minX: 2,
    maxX: 4,
    minY: -4,
    maxY: 0,
  })
})

test("sparse arrays retain the previous flatMap hole behavior", () => {
  const pads = new Array<InputPad>(5)
  assert.deepEqual(getPadsBoundingBox(pads), getPadsBoundingBox([]))
  pads[2] = pad(3, -2)
  assert.deepEqual(getPadsBoundingBox(pads), getPadsBoundingBox([pads[2]!]))
})

test("bounds do not mutate pad geometry", () => {
  const p = pad(3, -2)
  Object.freeze(p.offset)
  Object.freeze(p.size)
  Object.freeze(p)
  const before = JSON.stringify(p)
  getPadsBoundingBox([p])
  assert.equal(JSON.stringify(p), before)
})

test("existing reversed-size and NaN endpoint behavior stays intact", () => {
  assert.deepEqual(getPadsBoundingBox([pad(3, -2, -2)]), {
    minX: 2,
    maxX: 4,
    minY: -4,
    maxY: 0,
  })
  const bounds = getPadsBoundingBox([pad(Number.NaN, 0)])
  assert.ok(Number.isNaN(bounds.minX))
  assert.ok(Number.isNaN(bounds.maxX))
  assert.equal(bounds.minY, -2)
  assert.equal(bounds.maxY, 2)
})
