export type Side = "x-" | "x+" | "y-" | "y+"
export type Side2 = "top" | "bottom" | "left" | "right"

export const normalizeSide = (side: Side | Side2): Side => {
  switch (side) {
    case "x-":
      return "x-"
    case "x+":
      return "x+"
    case "y-":
      return "y-"
    case "bottom":
      return "y-"
    case "right":
      return "x+"
    case "left":
      return "x-"
    case "top":
      return "y+"
    default:
      throw new Error(`Invalid side: "${side}"`)
  }
}
