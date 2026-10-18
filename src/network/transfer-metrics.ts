export function measureSpeedMbps(totalBytes: number, startedAt: number, finishedAt: number): number {
  return totalBytes * 8 / Math.max(finishedAt - startedAt, 1) / 1000;
}
