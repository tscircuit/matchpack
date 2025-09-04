export const getColorFromString = (string: string, alpha = 1) => {
  // pseudo random number from string
  let hash = 0
  for (let i = 0; i < string.length; i++) {
    const char = string.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%, ${alpha})`
}
