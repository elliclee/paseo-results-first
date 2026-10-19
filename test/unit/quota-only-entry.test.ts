import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext, PluginTimelineTransformerContribution } from "@getpaseo/plugin/client";
import type { PluginServerContext } from "@getpaseo/plugin/server";

const { install, cleanup } = vi.hoisted(() => {
  const cleanup = vi.fn();
  return { cleanup, install: vi.fn(() => cleanup) };
});
vi.mock("../../client/quota/native-footer", () => ({ installQuotaFooters: install }));
import contributeClient from "../../index.client";
import contributeServer from "../../index.server";

beforeEach(() => vi.clearAllMocks());

describe("native presentation with quota and hidden thinking", () => {
  it("registers only the reasoning filter, adds no renderers or settings, and cleans up both features", () => {
    const removeThinking = vi.fn();
    const addTimelineTransformer = vi.fn(() => removeThinking);
    const host = new Proxy({ addTimelineTransformer }, { get(target, key) {
      if (key === "addTimelineTransformer") return target.addTimelineTransformer;
      throw new Error(`Unexpected host API: ${String(key)}`);
    } });
    const dispose = contributeClient(host as unknown as PluginClientContext);
    expect(install).toHaveBeenCalledTimes(1);
    expect(addTimelineTransformer).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      id: "hide-thinking", query: { itemType: "reasoning" },
    }));
    const disposeServer = contributeServer(host as unknown as PluginServerContext);
    expect(disposeServer).toBeTypeOf("function");
    disposeServer(); dispose();
    expect(removeThinking).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it.each(["streaming", "complete"] as const)("removes the entire %s item before layout, emitting no placeholder row", phase => {
    let contribution!: PluginTimelineTransformerContribution<"reasoning">;
    const dispose = contributeClient({ addTimelineTransformer(value: typeof contribution) {
      contribution = value; return () => {};
    } } as unknown as PluginClientContext);
    expect(contribution.query.itemType).toBe("reasoning");
    expect(contribution.transform({ item: { type: "reasoning", text: "Checking the tests" }, phase })).toEqual({ items: [] });
    dispose();
  });
});
