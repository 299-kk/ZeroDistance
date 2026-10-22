let active = 0
const pending: Array<() => void> = []
/** A fast scroll must not start hundreds of simultaneous metadata requests. */
export function queueSize<T>(read: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++
      void read().then(resolve, reject).finally(() => { active--; pending.shift()?.() })
    }
    if (active < 3) run(); else pending.push(run)
  })
}
