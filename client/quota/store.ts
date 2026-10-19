import { formatQuota, selectQuota, type QuotaReport } from "./model";
import type { FooterIdentity, FooterOwner } from "./host-bridge";

// Preserve the existing v1 storage format; the label is omitted when displaying.
const SNAPSHOT_PREFIX = "当前额度：";

/** One immutable snapshot per completed reply, persisted on this device. */
export function createQuotaStore(
  read: (owner: FooterOwner, force: boolean) => Promise<QuotaReport[]>,
  changed: () => void,
  now = Date.now,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  const activatedAt = now();
  const values = new Map<string, string | null>();
  const loading = new Map<string, Promise<void>>();
  let disposed = false;
  const key = (reply: FooterIdentity) => `better-paseo:quota:v1:${JSON.stringify([reply.serverId, reply.agentId, reply.completedAt])}`;
  async function capture(reply: FooterIdentity) {
    if (disposed) return;
    const id = key(reply), pending = loading.get(id);
    if (pending) return pending;
    if (values.has(id)) return;
    let saved: string | null = null;
    try { saved = storage?.getItem(id) ?? null; } catch { /* Storage may be disabled. */ }
    if (saved?.startsWith(SNAPSHOT_PREFIX) && saved.length < 256) {
      values.set(id, saved.slice(SNAPSHOT_PREFIX.length).replace(/剩余(?=\d)/, "剩余 "));
      return;
    }
    values.set(id, null);
    // Do not invent balances for replies that predate activation.
    if (reply.completedAt < activatedAt - 5000) return;
    const request = read(reply, true).then(reports => {
      if (disposed) return;
      const capturedAt = now();
      const text = formatQuota(selectQuota(reports, capturedAt), capturedAt);
      values.set(id, text);
      if (text) try { storage?.setItem(id, `${SNAPSHOT_PREFIX}${text}`); } catch { /* Keep the in-memory snapshot. */ }
      changed();
    }).catch(() => { if (!disposed) changed(); });
    loading.set(id, request);
    try { await request; } finally { loading.delete(id); }
  }
  return { capture, get: (reply: FooterIdentity) => values.get(key(reply)) ?? null,
    dispose() { disposed = true; values.clear(); loading.clear(); } };
}
