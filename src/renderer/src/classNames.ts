export const classNames = (
  ...classes: (string | undefined | null | false)[]
): string => {
  return classes.filter(Boolean).join(" ")
}

export const classNamesWithReset = (
  defaultClassNames: string,
  classNamesProp: string | undefined | null,
): string => {
  if (classNamesProp == null || classNamesProp.trim() === "") {
    return defaultClassNames
  }

  if (classNamesProp.includes("reset-class-names")) {
    return classNamesProp
  }

  return `${defaultClassNames.trim()} ${classNamesProp.trim()}`.trim()
}
