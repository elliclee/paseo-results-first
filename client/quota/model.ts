export interface QuotaWindow {
  id: string;
  label: string;
  shortLabel?: string;
  summary?: boolean;
  usedPct?: number | null;
  remainingPct?: number | null;
  resetsAt?: string | null;
}
export interface QuotaReport {
  fetchedAt: string;
  report: { status: string; windows?: QuotaWindow[] };
}
export interface QuotaSummary { label: string; remaining: number; resetsAt: number | null; fetchedAt: number }

export function selectQuota(reports: readonly QuotaReport[], now: number): QuotaSummary | null {
  const all = reports.flatMap(entry => entry.report.status === "available"
    ? (entry.report.windows ?? []).map(window => ({ window, fetchedAt: Date.parse(entry.fetchedAt) })) : []);
  const weekly = all.filter(({ window }) => window.id === "weekly");
  const candidates = weekly.length ? weekly : all.filter(({ window }) => window.summary);
  if (candidates.length !== 1) return null;
  const { window, fetchedAt } = candidates[0]!;
  const remaining = typeof window.remainingPct === "number" ? window.remainingPct
    : typeof window.usedPct === "number" ? 100 - window.usedPct : NaN;
  const resetsAt = window.resetsAt ? Date.parse(window.resetsAt) : null;
  if (!Number.isFinite(remaining) || !Number.isFinite(fetchedAt) || now - fetchedAt > 120_000 ||
    resetsAt !== null && (!Number.isFinite(resetsAt) || resetsAt <= now)) return null;
  return { label: window.id === "weekly" ? "weekly" : window.shortLabel || window.label.toLowerCase(),
    remaining: Math.round(Math.max(0, Math.min(100, remaining))), resetsAt, fetchedAt };
}
export function formatQuota(quota: QuotaSummary | null, now: number): string | null {
  if (!quota || now - quota.fetchedAt > 120_000 || quota.resetsAt !== null && quota.resetsAt <= now) return null;
  let reset = "";
  if (quota.resetsAt !== null) {
    const seconds = (quota.resetsAt - now) / 1000;
    const countdown = seconds >= 86400 ? `${Math.floor(seconds / 86400)}d` : seconds >= 3600 ? `${Math.floor(seconds / 3600)}h`
      : seconds >= 60 ? `${Math.floor(seconds / 60)}m` : "<1m";
    reset = ` \u00b7 resets ${countdown}`;
  }
  return `${quota.label} 剩余 ${quota.remaining}%${reset}`;
}
