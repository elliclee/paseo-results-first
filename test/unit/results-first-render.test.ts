import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import type { TurnRuntime } from "../../client/results-first/runtime";
import { indexTurns, type Entry } from "../../shared/results-first/model";
import { indexRpc } from "../../shared/results-first/contracts";

vi.mock("react-native", () => import("./helpers/rn-mock"));
vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: (props: object) => React.createElement("Icon", props) }));
vi.mock("@getpaseo/plugin/client", () => ({ useAgent: () => undefined }));
vi.mock("../../client/state/preference-sync-slot", () => ({ PreferenceSyncSlot: () => null }));
vi.mock("../../client/preferences", async original => ({
  ...await original<object>(),
  useEnhancerPreferences: () => ({ language: "zh" }),
}));
vi.mock("../../client/results-first/web", () => ({
  tidyFoldBoundary: () => () => {},
  keepFoldPosition: (_: unknown, change: () => void) => { change(); return () => {}; },
}));
vi.mock("../../client/results-first/native", () => ({ useNativeFoldPosition: () => ({}) }));

await import("./helpers/quiet-renderer");
const { default: TestRenderer, act } = await import("react-test-renderer");
const { TurnDisclosure } = await import("../../client/results-first/disclosure");
const { default: contribute } = await import("../../client/results-first/contribute");
const { ProcessRecord } = await import("../../client/results-first/process-content");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReturnType<typeof TestRenderer.create> | undefined;
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  delete (globalThis as { __rnMockOS?: string }).__rnMockOS;
});

describe("results-first disclosure", () => {
  it("starts as one quiet summary and exposes its original source only on expansion", async () => {
    const toggle = vi.fn();
    const runtime = { inline: false, toggle } as unknown as TurnRuntime;
    const group = { id: "a:e:1", at: 2000, tools: 3, messages: 1, thinking: 1, compactions: 0, kinds: ["read", "edit"] };
    const props = (expanded: boolean) => ({
      runtime, agentId: "a", timestamp: new Date(2000), host: { id: "local", label: "Local" },
      layout: { compact: false, platform: "web" as const },
      theme: { colors: { foreground: "#18181b", foregroundMuted: "#62626b", border: "#e2e2e6" } } as never,
      item: { type: "plugin" as const, kind: "turn-disclosure", version: 1,
        data: { key: "a:progress", anchors: [{ agentId: "a", group, expanded }], source: "先检查调用方。" } },
    });
    await act(async () => { renderer = TestRenderer.create(React.createElement(TurnDisclosure, props(false))); });
    expect(renderer!.root.find(node => (node.type as unknown) === "Text").children).toEqual(["查看过程"]);
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("先检查调用方");
    const button = renderer!.root.find(node => (node.type as unknown) === "Pressable");
    expect(button.props.accessibilityState).toEqual({ expanded: false });
    expect(button.props.style.minHeight).toBe(36);
    expect(renderer!.root.findAll(node => (node.type as unknown) === "Icon")).toHaveLength(1);
    await act(async () => { button.props.onPress(); });
    expect(toggle).toHaveBeenCalledWith(group.id, expect.any(Function));
    await act(async () => { renderer!.update(React.createElement(TurnDisclosure, props(true))); });
    expect(JSON.stringify(renderer!.toJSON())).toContain("先检查调用方");
    expect(renderer!.root.find(node => (node.type as unknown) === "Pressable").props.accessibilityState).toEqual({ expanded: true });
  });

  it("cleans up renderer registrations so switching back into results-first does not duplicate them", async () => {
    const renderers = new Set<string>();
    const unsubscribe = vi.fn();
    const release = vi.fn(async () => {});
    const client = {
      addTimelineRenderer: (value: { kind: string }) => {
        if (renderers.has(value.kind)) throw new Error("Duplicate renderer");
        renderers.add(value.kind); return () => { renderers.delete(value.kind); };
      },
      addTimelineTransformer: () => () => {},
      paseo: { agents: { list: async () => ({ subscription: { subscribe: () => unsubscribe, release } }) } },
    } as unknown as PluginClientContext;
    for (let i = 0; i < 3; i++) {
      const stop = contribute(client);
      await Promise.resolve();
      expect(renderers.size).toBe(3);
      stop();
      expect(renderers.size).toBe(0);
    }
    expect(unsubscribe).toHaveBeenCalledTimes(3);
    expect(release).toHaveBeenCalledTimes(3);
  });

  it("initializes folds from an invisible timeline source without a composer button or replacing the final answer", async () => {
    (globalThis as { __rnMockOS?: string }).__rnMockOS = "web";
    type Transform = { query: { itemType: string }; transform(input: { item: object; phase: string }): { items: object[] } | undefined };
    type Renderer = { kind: string; Component: React.ComponentType<any> };
    const transforms = new Map<string, Transform>(), renderers = new Map<string, Renderer>();
    const rows = [
      { type: "user_message", text: "检查" },
      { type: "tool_call", callId: "command", name: "exec_command", status: "completed" },
      { type: "assistant_message", messageId: "final", text: "已完成" },
    ].map((item, at) => ({ item, seqStart: at + 1, seqEnd: at + 1, timestamp: new Date(at * 1000).toISOString(), turnId: "one" })) as Entry[];
    const index = { ...indexTurns("a", "e", rows, { running: false, pending: false, failed: false, hasOlder: false }), status: "ok" };
    let resolveIndex!: (value: typeof index) => void;
    const pending = new Promise<typeof index>(resolve => { resolveIndex = resolve; });
    const rpc = vi.fn(() => pending), addComposerPill = vi.fn();
    let events!: { update(message: unknown): void };
    const client = {
      rpc, addComposerPill,
      addTimelineTransformer: (value: Transform) => { transforms.set(value.query.itemType, value); return () => { transforms.delete(value.query.itemType); }; },
      addTimelineRenderer: (value: Renderer) => { renderers.set(value.kind, value); return () => { renderers.delete(value.kind); }; },
      paseo: { agents: { list: async () => ({ subscription: { subscribe: (listener: typeof events) => { events = listener; return () => {}; }, release: async () => {} } }) } },
    } as unknown as PluginClientContext;
    const stop = contribute(client);
    await Promise.resolve();
    const tool = () => transforms.get("tool_call")!.transform({ item: rows[1]!.item, phase: "complete" });
    expect(transforms.has("assistant_message")).toBe(false);
    const bootstrap = tool()!.items[0]!;
    expect(bootstrap).toMatchObject({ kind: "turn-bootstrap" });
    const props = { agentId: "a", timestamp: new Date(1000), host: { id: "local", label: "Local" },
      layout: { compact: false, platform: "web" }, theme: { colors: {} } };
    try {
      await act(async () => { renderer = TestRenderer.create(React.createElement(renderers.get("turn-bootstrap")!.Component, { ...props, item: bootstrap })); });
      expect(renderer!.toJSON()).toBeNull();
      expect(rpc).toHaveBeenCalledWith(indexRpc, { agentId: "a" });
      await act(async () => resolveIndex(index));
      expect(transforms.has("assistant_message")).toBe(false);
      expect(tool()!.items[0]).toMatchObject({ kind: "turn-disclosure" });
      await act(async () => renderer!.update(React.createElement(renderers.get("turn-disclosure")!.Component, { ...props, item: tool()!.items[0] })));
      expect(renderer!.root.find(node => (node.type as unknown) === "Text").children).toEqual(["查看过程"]);
      const header = renderer!.root.find(node => (node.type as unknown) === "Pressable");
      await act(async () => header.props.onPress());
      await act(async () => renderer!.update(React.createElement(renderers.get("turn-disclosure")!.Component, { ...props, item: tool()!.items[0] })));
      expect(JSON.stringify(renderer!.toJSON())).toContain("exec_command");
      expect(renderer!.root.find(node => (node.type as unknown) === "Pressable").props.accessibilityState.expanded).toBe(true);
      const before = rpc.mock.calls.length;
      await act(async () => events.update({ type: "agent_update", payload: { kind: "upsert", agent: { id: "unviewed", status: "idle", updatedAt: "new" } } }));
      expect(rpc.mock.calls.length).toBe(before);
      await act(async () => events.update({ type: "agent_update", payload: { kind: "upsert", agent: { id: "a", status: "idle", updatedAt: "new" } } }));
      expect(rpc.mock.calls.length).toBe(before + 1);
      expect(addComposerPill).not.toHaveBeenCalled();
      await act(async () => renderer!.unmount()); renderer = undefined;
    } finally { stop(); }
    expect(transforms.size).toBe(0);
    expect(renderers.size).toBe(0);
  });

  it("restores the native source when the first index read fails", async () => {
    type Transform = { query: { itemType: string }; transform(input: { item: object; phase: string }): { items: object[] } | undefined };
    const transforms = new Map<string, Transform>();
    let Bootstrap!: React.ComponentType<any>;
    const client = {
      rpc: async () => ({ status: "unavailable" }),
      addComposerPill: () => { throw new Error("No composer entry should be registered"); },
      addTimelineTransformer: (value: Transform) => { transforms.set(value.query.itemType, value); return () => {}; },
      addTimelineRenderer: (value: { kind: string; Component: typeof Bootstrap }) => { if (value.kind === "turn-bootstrap") Bootstrap = value.Component; return () => {}; },
      paseo: { agents: { list: async () => ({ subscription: { subscribe: () => () => {}, release: async () => {} } }) } },
    } as unknown as PluginClientContext;
    const stop = contribute(client);
    const source = { type: "tool_call", callId: "first", name: "read_file", status: "completed" };
    const item = transforms.get("tool_call")!.transform({ item: source, phase: "complete" })!.items[0];
    try {
      await act(async () => { renderer = TestRenderer.create(React.createElement(Bootstrap, { agentId: "a", timestamp: new Date(1000), item })); });
      expect(transforms.get("tool_call")!.transform({ item: source, phase: "complete" })).toBeUndefined();
      expect(renderer!.toJSON()).toBeNull();
    } finally { stop(); }
  });

  it("keeps progress messages as a short preview and reveals their full content only on request", async () => {
    const full = "先检查调用方。\n".repeat(50) + "完整进度说明的末尾";
    await act(async () => { renderer = TestRenderer.create(React.createElement(ProcessRecord, {
      item: { id: "progress", kind: "message", title: "Update", summary: "", sections: [{ label: "", text: full, format: "markdown", truncated: false }] },
      colors: {} as never, resize: (change: () => void) => change(),
    })); });
    expect(JSON.stringify(renderer!.toJSON())).toContain("进度说明");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Update");
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("完整进度说明的末尾");
    const preview = renderer!.root.find(node => (node.type as unknown) === "Text" && node.props.numberOfLines === 2);
    expect(preview.children.join("").length).toBeLessThanOrEqual(240);
    const expand = renderer!.root.find(node => (node.type as unknown) === "Pressable" && node.props.accessibilityLabel === "展开详情：进度说明");
    await act(async () => expand.props.onPress());
    expect(JSON.stringify(renderer!.toJSON())).toContain("完整进度说明的末尾");
    const collapse = renderer!.root.find(node => (node.type as unknown) === "Pressable" && node.props.accessibilityLabel === "收起详情：进度说明");
    await act(async () => collapse.props.onPress());
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("完整进度说明的末尾");
  });
});
