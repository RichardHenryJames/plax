// In-memory stand-in for the Android Keystore store, used by every test.
const values = new Map<string, string>()

export const getItemAsync = jest.fn(async (key: string) => (values.has(key) ? (values.get(key) as string) : null))
export const setItemAsync = jest.fn(async (key: string, value: string) => {
  values.set(key, value)
})
export const deleteItemAsync = jest.fn(async (key: string) => {
  values.delete(key)
})
/** Test helper: forget everything (called between tests by jest.after-env.ts). */
export const __reset = () => {
  values.clear()
  getItemAsync.mockClear()
  setItemAsync.mockClear()
  deleteItemAsync.mockClear()
}
export const __dump = () => new Map(values)
