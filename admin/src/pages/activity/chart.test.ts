import { describe, expect, it } from "vitest"
import { bucketLogTimes } from "./chart"

const sum = (counts: number[]) => counts.filter((c) => c > 0).reduce((a, b) => a + b, 0)

describe("bucketLogTimes", () => {
  it("counts lines into buckets", () => {
    const log = [
      "2024/05/01 00:00:00 INFO a",
      "2024/05/01 00:00:01 INFO b",
      "2024/05/01 00:02:30 INFO c",
    ].join("\n")
    const r = bucketLogTimes(log)
    expect(sum(r.counts)).toBe(3)
    expect(r.counts[0]).toBeGreaterThanOrEqual(2)
    expect(r.max).toBeGreaterThanOrEqual(2)
  })

  it("ignores unparseable lines", () => {
    const r = bucketLogTimes("garbage\n2024/05/01 00:00:00 INFO a\n")
    expect(sum(r.counts)).toBe(1)
  })

  it("marks trailing empty buckets with -1", () => {
    const r = bucketLogTimes("2024/05/01 00:00:00 INFO a\n")
    expect(r.counts[0]).toBe(1)
    expect(r.counts[29]).toBe(-1)
  })
})
