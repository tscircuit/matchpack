import type { GraphicsObject } from "graphics-debug"

export const graphicsToSvg = (graphics: GraphicsObject): string => {
  const {
    rects = [],
    lines = [],
    circles = [],
    texts = [],
    points = [],
  } = graphics

  // Calculate bounds
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity

  const updateBounds = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  rects.forEach((r) => {
    // @ts-ignore
    const cx = r.center?.x ?? r.x
    // @ts-ignore
    const cy = r.center?.y ?? r.y
    const width = r.width
    const height = r.height
    updateBounds(cx - width / 2, cy - height / 2)
    updateBounds(cx + width / 2, cy + height / 2)
  })

  lines.forEach((l) => {
    // @ts-ignore
    if (l.points && l.points.length >= 2) {
      // @ts-ignore
      updateBounds(l.points[0].x, l.points[0].y)
      // @ts-ignore
      updateBounds(l.points[1].x, l.points[1].y)
    } else {
      // @ts-ignore
      updateBounds(l.x1, l.y1)
      // @ts-ignore
      updateBounds(l.x2, l.y2)
    }
  })

  circles.forEach((c) => {
    // @ts-ignore
    const cx = c.center?.x ?? c.x ?? c.cx
    // @ts-ignore
    const cy = c.center?.y ?? c.y ?? c.cy
    // @ts-ignore
    const r = c.radius ?? c.r
    updateBounds(cx - r, cy - r)
    updateBounds(cx + r, cy + r)
  })

  points.forEach((p) => updateBounds(p.x, p.y))
  texts.forEach((t) => updateBounds(t.x, t.y)) // Approximation

  // Add padding
  const padding = 2
  minX -= padding
  minY -= padding
  maxX += padding
  maxY += padding

  const width = Math.max(10, maxX - minX)
  const height = Math.max(10, maxY - minY)

  // Scale content to make it viewable (optional, but helps validation)
  const scale = 20
  const transform = `translate(${-minX * scale}, ${-minY * scale}) scale(${scale}, ${scale})`
  const viewWidth = width * scale
  const viewHeight = height * scale

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" width="${viewWidth}" height="${viewHeight}">\n`
  svg += `  <g transform="${transform}">\n`

  // Grid (optional? skip for clean snapshot)

  // Render Lines
  for (const line of lines) {
    // @ts-ignore
    const stroke = line.color || line.strokeColor || "grey"
    // @ts-ignore
    const strokeWidth = line.strokeWidth || 0.05
    // @ts-ignore
    let x1, y1, x2, y2
    // @ts-ignore
    if (line.points && line.points.length >= 2) {
      // @ts-ignore
      x1 = line.points[0].x
      // @ts-ignore
      y1 = line.points[0].y
      // @ts-ignore
      x2 = line.points[1].x
      // @ts-ignore
      y2 = line.points[1].y
    } else {
      // @ts-ignore
      x1 = line.x1
      // @ts-ignore
      y1 = line.y1
      // @ts-ignore
      x2 = line.x2
      // @ts-ignore
      y2 = line.y2
    }

    svg += `    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" />\n`
  }

  // Render Rects
  for (const rect of rects) {
    // @ts-ignore
    const fill = rect.color ? rect.color : "none"
    // @ts-ignore
    const stroke = rect.stroke || "black"
    // @ts-ignore
    const strokeWidth = rect.strokeWidth || 0.05
    // @ts-ignore
    const cx = rect.center?.x ?? rect.x
    // @ts-ignore
    const cy = rect.center?.y ?? rect.y
    const width = rect.width
    const height = rect.height

    svg += `    <rect x="${cx - width / 2}" y="${cy - height / 2}" width="${rect.width}" height="${rect.height}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" vector-effect="non-scaling-stroke" />\n`
  }

  // Render Circles
  for (const circle of circles) {
    // @ts-ignore
    const fill = circle.color || "none"
    // @ts-ignore
    const stroke = circle.stroke || "black"
    // @ts-ignore
    const cx = circle.center?.x ?? circle.x ?? circle.cx
    // @ts-ignore
    const cy = circle.center?.y ?? circle.y ?? circle.cy
    // @ts-ignore
    const r = circle.radius ?? circle.r

    svg += `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="0.05" />\n`
  }

  // Render Texts
  for (const text of texts) {
    const fontSize = text.fontSize || 0.5
    svg += `    <text x="${text.x}" y="${text.y}" font-size="${fontSize}" fill="black" text-anchor="middle" dominant-baseline="middle">${text.text}</text>\n`
  }

  svg += `  </g>\n`
  svg += `</svg>`

  return svg
}
