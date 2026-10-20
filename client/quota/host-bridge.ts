import type { QuotaReport } from "./model";

export interface FooterOwner { serverId: string; agentId: string }
export interface FooterIdentity extends FooterOwner { completedAt: number }
interface Fiber { memoizedProps?: { serverId?: unknown; agentId?: unknown; completedAt?: unknown }; return?: Fiber | null }
interface UsageClient { listUsageReports(input: { agentId: string; forceRefresh: boolean }): Promise<{ reports: QuotaReport[] }> }
interface HostRuntimeModule { getHostRuntimeStore?: () => { getClient(serverId: string): UsageClient | null } }

/** Read-only bridge for the verified desktop builds, outside the plugin SDK. */
export function footerIdentity(element: object): FooterIdentity | null {
  const key = Object.keys(element).find(key => key.startsWith("__reactFiber$"));
  let fiber = key ? (element as Record<string, Fiber>)[key] : undefined;
  let completedAt: number | undefined;
  for (let depth = 0; fiber && depth < 80; depth++, fiber = fiber.return ?? undefined) {
    const props = fiber.memoizedProps;
    if (completedAt === undefined) {
      const value = props?.completedAt;
      const timestamp = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
      if (Number.isFinite(timestamp)) completedAt = timestamp;
    }
    if (typeof props?.serverId === "string" && typeof props.agentId === "string" && props.serverId && props.agentId) {
      return completedAt === undefined ? null : { serverId: props.serverId, agentId: props.agentId, completedAt };
    }
  }
  return null;
}
export async function readHostQuota(owner: FooterOwner, forceRefresh: boolean): Promise<QuotaReport[]> {
  const metro = (globalThis as { __r?: (id: number) => unknown }).__r;
  // Known host-runtime/store IDs: 0.12.0 -> 3767; 0.11.4 -> 3761.
  // Inspect exports because the app build owns module IDs, not the daemon.
  let module: HostRuntimeModule | null = null;
  if (typeof metro === "function") for (const id of [3767, 3761]) {
    let candidate: HostRuntimeModule | null;
    try { candidate = metro(id) as HostRuntimeModule | null; } catch { continue; }
    if (typeof candidate?.getHostRuntimeStore === "function") { module = candidate; break; }
  }
  const client = typeof module?.getHostRuntimeStore === "function" ? module.getHostRuntimeStore().getClient(owner.serverId) : null;
  if (typeof client?.listUsageReports !== "function") throw new Error("Quota footer host bridge unavailable");
  return (await client.listUsageReports({ agentId: owner.agentId, forceRefresh })).reports;
}
