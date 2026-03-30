export default function performanceNow() {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now()
  }
  return Date.now()
}
