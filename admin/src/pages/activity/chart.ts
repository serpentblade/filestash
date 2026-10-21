export type Buckets = { start: number; end: number; counts: number[]; max: number }

// Each line starts with a timestamp. Trailing empty buckets are -1 (nothing happened yet).
export function bucketLogTimes(log: string, buckets = 30, minWidthMs = 5000): Buckets {
  const times: number[] = []
  for (const line of log.split("\n")) {
    const t = new Date(line.substring(0, 19)).getTime()
    if (!isNaN(t)) times.push(t)
  }
  const counts: number[] = Array(buckets).fill(0)
  if (times.length === 0) return { start: 0, end: 0, counts: counts.fill(-1), max: 1 }
  const start = times[0]
  const end = times[times.length - 1]
  const width = Math.max((end - start) / buckets, minWidthMs)
  for (const t of times) {
    const idx = Math.min(Math.max(Math.floor((t - start) / width), 0), buckets - 1)
    counts[idx] += 1
  }
  for (let i = counts.length - 1; i >= 0 && counts[i] === 0; i--) counts[i] = -1
  return { start, end, counts, max: Math.max(1, ...counts) }
}
