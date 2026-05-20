import { useEffect, useRef, useState } from 'react'

/** Измеряет ширину контейнера; ScatterChart получает фиксированные width/height (без ResponsiveContainer). */
export function useChartSize(height = 320) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const update = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.floor(w))
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, width, height, ready: width > 0 }
}

export function numericDomain(
  values: number[],
  opts?: { min?: number; max?: number; padRatio?: number },
): [number, number] {
  const padRatio = opts?.padRatio ?? 0.06
  if (!values.length) {
    return [opts?.min ?? 0, opts?.max ?? 1]
  }
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  if (opts?.min != null) lo = Math.min(lo, opts.min)
  if (opts?.max != null) hi = Math.max(hi, opts.max)
  const span = hi - lo || 1
  lo -= span * padRatio
  hi += span * padRatio
  return [lo, hi]
}
