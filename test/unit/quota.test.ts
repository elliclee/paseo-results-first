import { afterEach, describe, expect, it, vi } from "vitest";
import { formatQuota, selectQuota, type QuotaReport } from "../../client/quota/model";
import { footerIdentity, readHostQuota } from "../../client/quota/host-bridge";
import { createQuotaStore } from "../../client/quota/store";

const now = Date.parse("2026-10-19T08:30:00Z");
const owner = { serverId: "local", agentId: "one" };
const reply = { ...owner, completedAt: now };
const report = (usedPct = 24): QuotaReport => ({ fetchedAt: new Date(now).toISOString(), report: {
  status: "available", windows: [{ id: "weekly", label: "Weekly", usedPct,
    resetsAt: new Date(now + 5.5 * 86400_000).toISOString() }],
} });
afterEach(() => vi.unstubAllGlobals());

describe("quota footer values", () => {
  it("distinguishes the screenshot's 24% used from the 76% remaining", () => {
    const quota = selectQuota([report()], now);
    expect(formatQuota(quota, now)).toBe("weekly 剩余 76% · resets 5d");
    expect(formatQuota(quota, now + 60_000)).toBe("weekly 剩余 76% · resets 5d");
  });
  it("prefers explicit remaining percentage, including zero", () => {
    const input = report();
    input.report.windows![0]!.remainingPct = 0;
    expect(selectQuota([input], now)?.remaining).toBe(0);
  });
  it("does not present missing, stale or expired usage as remaining quota", () => {
    expect(selectQuota([{ ...report(), report: { status: "unavailable" } }], now)).toBeNull();
    expect(selectQuota([report()], now + 120_001)).toBeNull();
    const input = report();
    delete input.report.windows![0]!.usedPct;
    expect(selectQuota([input], now)).toBeNull();
    input.report.windows![0]!.usedPct = 24;
    input.report.windows![0]!.resetsAt = new Date(now).toISOString();
    expect(selectQuota([input], now)).toBeNull();
    expect(formatQuota(selectQuota([report()], now), now + 120_001)).toBeNull();
  });
  it("chooses the weekly window rather than the shorter summary window", () => {
    const input = report();
    input.report.windows!.unshift({ id: "five-hour", label: "5h", summary: true, remainingPct: 92 });
    expect(selectQuota([input], now)?.remaining).toBe(76);
    expect(selectQuota([report(), report(90)], now)).toBeNull();
  });
  it("uses the provider's single summary window when there is no weekly window", () => {
    const input: QuotaReport = { fetchedAt: new Date(now).toISOString(), report: { status: "available",
      windows: [{ id: "daily", label: "Daily", summary: true, remainingPct: 45,
        resetsAt: new Date(now + 3.5 * 3600_000).toISOString() }] } };
    expect(formatQuota(selectQuota([input], now), now)).toBe("daily 剩余 45% · resets 3h");
  });
});

describe("session-scoped host bridge", () => {
  it("uses the nearest owning conversation and tolerates an unrecognized footer", () => {
    expect(footerIdentity({})).toBeNull();
    expect(footerIdentity({ __reactFiber$test: { memoizedProps: { completedAt: new Date(now) }, return: {
      memoizedProps: owner, return: { memoizedProps: { serverId: "other", agentId: "two" } },
    } } })).toEqual(reply);
  });
  it("reuses the owning host's connection and requests the specific agent", async () => {
    const listUsageReports = vi.fn(async () => ({ reports: [report()] }));
    const getClient = vi.fn(() => ({ listUsageReports }));
    vi.stubGlobal("__r", vi.fn(() => ({ getHostRuntimeStore: () => ({ getClient }) })));
    expect(await readHostQuota(owner, true)).toEqual([report()]);
    expect(getClient).toHaveBeenCalledWith("local");
    expect(listUsageReports).toHaveBeenCalledWith({ agentId: "one", forceRefresh: true });
  });
  it("does not use a global account report when the host bridge is missing", async () => {
    vi.stubGlobal("__r", undefined);
    await expect(readHostQuota(owner, false)).rejects.toThrow("bridge unavailable");
  });
});

describe("immutable quota snapshots", () => {
  it("reads a completed reply once, coalescing repeated footer appearances", async () => {
    let resolve!: (reports: QuotaReport[]) => void;
    const read = vi.fn(() => new Promise<QuotaReport[]>(done => { resolve = done; }));
    const changed = vi.fn();
    const store = createQuotaStore(read, changed, () => now);
    const pending = [store.capture(reply), store.capture(reply), store.capture(reply)];
    expect(read).toHaveBeenCalledExactlyOnceWith(reply, true);
    resolve([report()]); await Promise.all(pending);
    expect(store.get(reply)).toBe("weekly 剩余 76% · resets 5d");
    await store.capture(reply);
    expect(read).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    store.dispose();
  });
  it("keeps old percentages and reset text fixed while new replies get their own snapshot", async () => {
    let clock = now;
    const read = vi.fn(async () => [{ ...report(), fetchedAt: new Date(clock).toISOString() }]);
    const store = createQuotaStore(read, () => {}, () => clock);
    await store.capture(reply);
    const first = store.get(reply);
    clock += 86400_000;
    await store.capture(reply);
    expect(store.get(reply)).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    const next = { ...reply, completedAt: clock };
    read.mockResolvedValueOnce([{ ...report(30), fetchedAt: new Date(clock).toISOString() }]);
    await store.capture(next);
    expect(store.get(next)).toContain("剩余 70%");
    expect(store.get(reply)).toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.get({ ...reply, serverId: "remote" })).toBeNull();
    expect(store.get({ ...reply, agentId: "two" })).toBeNull();
    store.dispose();
  });
  it.each(["剩余76%", "剩余 76%"])("restores saved snapshots (%s) without another request", async savedRemaining => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, text: string) => { data.set(key, text); } };
    const read = vi.fn(async () => [report()]);
    const first = createQuotaStore(read, () => {}, () => now, storage);
    await first.capture(reply);
    const text = first.get(reply);
    expect([...data.values()]).toEqual(["当前额度：weekly 剩余 76% · resets 5d"]);
    for (const [key, value] of data) data.set(key, value.replace("剩余 76%", savedRemaining));
    first.dispose();
    const reloaded = createQuotaStore(read, () => {}, () => now + 86400_000, storage);
    await reloaded.capture(reply);
    expect(reloaded.get(reply)).toBe(text);
    expect(reloaded.get(reply)).toBe("weekly 剩余 76% · resets 5d");
    expect(read).toHaveBeenCalledTimes(1);
    reloaded.dispose();
  });
  it("does not backfill an unknown historical balance", async () => {
    const read = vi.fn(async () => [report()]);
    const store = createQuotaStore(read, () => {}, () => now);
    const historical = { ...reply, completedAt: now - 3600_000 };
    await store.capture(historical);
    expect(store.get(historical)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    store.dispose();
  });
  it("captures a reply whose final message streamed for longer than ten seconds", async () => {
    let clock = now;
    const read = vi.fn(async () => [{ ...report(), fetchedAt: new Date(clock).toISOString() }]);
    const store = createQuotaStore(read, () => {}, () => clock);
    clock += 120_000;
    await store.capture(reply);
    expect(store.get(reply)).toContain("剩余 76%");
    expect(read).toHaveBeenCalledTimes(1);
    store.dispose();
  });
  it("does not retry unavailable snapshots on DOM updates or save a late response after disposal", async () => {
    const read = vi.fn(async () => [report()]);
    const changed = vi.fn();
    read.mockRejectedValueOnce(new Error("disconnected"));
    const store = createQuotaStore(read, changed, () => now);
    await store.capture(reply); await store.capture(reply);
    expect(store.get(reply)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
    let resolve!: (reports: QuotaReport[]) => void;
    read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const next = { ...reply, completedAt: now + 1000 };
    const pending = store.capture(next);
    store.dispose(); resolve([report()]); await pending;
    expect(store.get(next)).toBeNull();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
