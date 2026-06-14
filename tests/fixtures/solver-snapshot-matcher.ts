import { expect, type MatcherResult } from "bun:test"
import { type GraphicsObject, getSvgFromGraphicsObject } from "graphics-debug"

type VisualSolver = {
  visualize: () => GraphicsObject
}

interface SolverSnapshotOptions {
  svgName?: string
  svgWidth?: number
  svgHeight?: number
}

const getAllGraphicsElements = (graphicsObject: GraphicsObject) => {
  return [
    ...(graphicsObject.lines ?? []),
    ...(graphicsObject.points ?? []),
    ...(graphicsObject.rects ?? []),
    ...(graphicsObject.circles ?? []),
    ...(graphicsObject.texts ?? []),
  ]
}

async function toMatchSolverSnapshot(
  this: unknown,
  received: VisualSolver,
  testPath: string,
  optionsOrSvgName?: SolverSnapshotOptions | string,
): Promise<MatcherResult> {
  const options =
    typeof optionsOrSvgName === "string"
      ? { svgName: optionsOrSvgName }
      : (optionsOrSvgName ?? {})
  const graphicsObject = received.visualize()
  const allElements = getAllGraphicsElements(graphicsObject)
  const lastStep = allElements.reduce(
    (last, element) => Math.max(last, element.step ?? 0),
    0,
  )

  if (lastStep !== 0) {
    graphicsObject.points = graphicsObject.points?.filter(
      (point) => point.step === lastStep,
    )
    graphicsObject.lines = graphicsObject.lines?.filter(
      (line) => line.step === lastStep,
    )
    graphicsObject.rects = graphicsObject.rects?.filter(
      (rect) => rect.step === lastStep,
    )
    graphicsObject.circles = graphicsObject.circles?.filter(
      (circle) => circle.step === lastStep,
    )
    graphicsObject.texts = graphicsObject.texts?.filter(
      (text) => text.step === lastStep,
    )
  }

  const svg = getSvgFromGraphicsObject(graphicsObject, {
    backgroundColor: "white",
    svgWidth: options.svgWidth,
    svgHeight: options.svgHeight,
  })

  return expect(svg).toMatchSvgSnapshot(testPath, options.svgName)
}

expect.extend({
  toMatchSolverSnapshot: toMatchSolverSnapshot as never,
})

declare module "bun:test" {
  interface Matchers<T = unknown> {
    toMatchSolverSnapshot(
      testPath: string,
      optionsOrSvgName?: SolverSnapshotOptions | string,
    ): Promise<MatcherResult>
  }
}
