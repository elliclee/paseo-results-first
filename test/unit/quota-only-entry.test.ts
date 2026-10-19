import { describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";

const { install, cleanup } = vi.hoisted(() => {
  const cleanup = vi.fn();
  return { cleanup, install: vi.fn(() => cleanup) };
});
vi.mock("../../client/quota/native-footer", () => ({ installQuotaFooters: install }));
import contributeClient from "../../index.client";
import contributeServer from "../../index.server";

describe("quota-only plugin entry", () => {
  it("installs only quota, contributes no timeline, settings or server features, and cleans up", () => {
    const host = new Proxy({}, { get(_target, key) { throw new Error(`Unexpected host API: ${String(key)}`); } });
    const dispose = contributeClient(host as PluginClientContext);
    expect(install).toHaveBeenCalledTimes(1);
    expect(dispose).toBe(cleanup);
    const disposeServer = contributeServer(host as PluginServerContext);
    expect(disposeServer).toBeTypeOf("function");
    expect(() => disposeServer()).not.toThrow();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
