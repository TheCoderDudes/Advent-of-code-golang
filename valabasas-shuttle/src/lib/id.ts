let counter = 0

/** Stable-enough unique id without pulling in a uuid dependency. */
export const newId = (prefix: string): string => {
  counter += 1
  const random = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`
}
