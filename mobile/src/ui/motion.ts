let enabled = true

/** Whether the app's own transitions (a sheet rising, the menu sliding in) are animated. Tests turn them off so that a screen is in its final state as soon as it is shown. */
export const animationsEnabled = (): boolean => enabled

export const setAnimationsEnabled = (value: boolean): void => {
  enabled = value
}
