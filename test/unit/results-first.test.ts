import { describe, expect, it } from "vitest";
import { indexTurns, itemKey, projectIndexes, summary, type Entry, type Item } from "../../shared/results-first/model";
import { processRows } from "../../shared/results-first/process";
import { createTurnRuntime } from "../../client/results-first/runtime";
import { readIndex } from "../../server/results-first/index";
import { indexRpc } from "../../shared/results-first/contracts";

const idle = { running: false, pending: false, failed: false, hasOlder: false };
function entries(items: Item[], turnId = "turn", offset = 0): Entry[] {
  return items.map((item, i) => ({ item, turnId, seqStart: offset + i + 1, seqEnd: offset + i + 1,
    timestamp: new Date(1000 * (offset + i + 1)).toISOString() }));
}
const source: Item[] = [
  { type: "user_message", text: "检查代码" },
  { type: "assistant_message", messageId: "progress", text: "先检查调用方。" },
  { type: "reasoning", text: "检查上下文" },
  ...["read_file", "apply_patch", "exec_command"].map((name, i) => ({ type: "tool_call", callId: `call-${i}`, name, status: "completed", detail: { type: "unknown", output: "Done" } })),
  { type: "assistant_message", messageId: "final", text: "已修复，相关测试通过。" },
];

describe("results-first turn projection", () => {
  it("replaces the entire completed process with one disclosure and leaves the final answer native", () => {
    const index = indexTurns("agent", "epoch", entries(source), idle);
    expect(index.groups).toHaveLength(1);
    const group = index.groups[0]!;
    expect([group.tools, group.messages, group.thinking]).toEqual([3, 1, 1]);
    expect(summary(group, "zh")).toBe("执行记录 · 5 项");
    const roles = projectIndexes([index], new Set());
    expect(roles.size).toBe(5);
    expect(roles.get("a:progress")?.anchors).toHaveLength(1);
    expect(roles.has("a:final")).toBe(false);
    expect(roles.has(itemKey(source[0]!)!)).toBe(false);
  });

  it("folds live tools and progress into the same running disclosure", () => {
    const rows = entries([...source.slice(0, -1), { type: "tool_call", callId: "active", name: "exec_command", status: "running" }]);
    const index = indexTurns("agent", "epoch", rows, { ...idle, running: true, activeTurnId: "turn" });
    const group = index.groups[0]!;
    expect(group.running).toBe(true);
    expect(summary(group, "zh")).toBe("正在处理 · 6 项");
    const roles = projectIndexes([index], new Set());
    expect(roles.get("t:active")?.hidden).toBe(true);
    expect(roles.get("a:progress")?.anchors).toHaveLength(1);
    expect([...roles.values()].flatMap(role => role.anchors)).toHaveLength(1);
    expect(roles.get("t:call-0")?.hidden).toBe(true);
    expect(processRows("agent", "epoch", rows, group).map(row => itemKey(row.item))).toEqual(group.keys);
  });

  it("holds streaming text in the process and releases the native final answer on completion", () => {
    const index = indexTurns("agent", "epoch", entries(source), { ...idle, running: true });
    expect(projectIndexes([index], new Set()).get("a:final")?.hidden).toBe(true);
    expect(projectIndexes([indexTurns("agent", "epoch", entries(source), idle)], new Set()).has("a:final")).toBe(false);
  });

  it("keeps failed command details inside the process while the agent continues", async () => {
    const failed: Item = { type: "tool_call", callId: "failure", name: "shell", status: "failed", error: "exit 1" };
    const rows = entries([...source.slice(0, -1), failed, source.at(-1)!]);
    const index = indexTurns("agent", "epoch", rows, { ...idle, running: true });
    const group = index.groups[0]!;
    expect(projectIndexes([index], new Set()).get("t:failure")?.hidden).toBe(true);
    expect(processRows("agent", "epoch", rows, group).some(row => row.item.callId === "failure")).toBe(true);
    let transform!: (input: { item: Item; phase: string }) => unknown;
    const runtime = createTurnRuntime({ rpc: async () => ({ status: "ok", ...index }),
      addTimelineTransformer: (value: { query: { itemType: string }; transform: typeof transform }) => {
        if (value.query.itemType === "tool_call") transform = value.transform;
        return () => {};
      },
    } as unknown as Parameters<typeof createTurnRuntime>[0]);
    expect(transform({ item: failed, phase: "complete" })).toMatchObject({ items: [{ kind: "turn-bootstrap" }] });
    await runtime.refresh("agent");
    expect(transform({ item: failed, phase: "complete" })).toEqual({ items: [] });
    runtime.toggle(group.id);
    expect(transform({ item: failed, phase: "complete" })).toBeUndefined();
    runtime.dispose();
  });

  it("folds completed checklists and can recover their contents when expanded", () => {
    const rows = entries([...source.slice(0, -1), { type: "todo", items: [{ text: "验证结果", status: "completed" }] }, source.at(-1)!]);
    const index = indexTurns("agent", "epoch", rows, idle);
    const group = index.groups[0]!;
    expect(group.todos).toBe(1);
    expect(summary(group, "zh")).toBe("执行记录 · 6 项");
    expect(processRows("agent", "epoch", rows, group).some(row => row.item.type === "todo")).toBe(true);
  });

  it.each([{ pending: true }, { failed: true }])("keeps a blocked turn visible: %j", state => {
    expect(indexTurns("agent", "epoch", entries(source), { ...idle, ...state }).groups).toEqual([]);
  });

  it("leaves incomplete history, unresolved errors and stale running tools visible", () => {
    expect(indexTurns("agent", "epoch", entries(source.slice(1)), { ...idle, hasOlder: true }).groups).toEqual([]);
    expect(indexTurns("agent", "epoch", entries([...source, { type: "error", message: "失败" }]), idle).groups).toEqual([]);
    expect(indexTurns("agent", "epoch", entries([...source.slice(0, -1), { type: "tool_call", callId: "stale", status: "running" }, source.at(-1)!]), idle).groups).toEqual([]);
  });

  it.each(["request_user_input", "functions.request_user_input_async", "AskUserQuestion", "ExitPlanMode"])("keeps decision tool %s visible", name => {
    const index = indexTurns("agent", "epoch", entries([...source.slice(0, -1), { type: "tool_call", callId: "decision", name, status: "completed" }, source.at(-1)!]), idle);
    expect(projectIndexes([index], new Set()).has("t:decision")).toBe(false);
  });

  it("restores the process on expansion without changing final-answer identity", () => {
    const index = indexTurns("agent", "epoch", entries(source), idle);
    const group = index.groups[0]!;
    const roles = projectIndexes([index], new Set([group.id]));
    expect(roles.get("a:progress")?.anchors[0]?.expanded).toBe(true);
    for (const item of source.slice(2, -1)) expect(roles.get(itemKey(item)!)?.hidden).toBe(false);
    expect(roles.has("a:final")).toBe(false);
  });

  it("keeps turns and agents separate and protects a reused final identity", () => {
    const first = indexTurns("one", "epoch", entries(source), idle);
    const second = indexTurns("two", "epoch", entries([{ type: "user_message" }, { type: "assistant_message", messageId: "progress", text: "其他对话的最终回复" }]), idle);
    expect(projectIndexes([first, second], new Set()).size).toBe(0);
    const next = entries([{ type: "user_message", text: "下一轮" }, { type: "tool_call", callId: "next", status: "running" }], "next", 20);
    const index = indexTurns("one", "epoch", [...entries(source), ...next], { ...idle, running: true, activeTurnId: "next" });
    expect(index.groups).toHaveLength(2);
    expect(index.groups[0]?.running).toBeUndefined();
    expect(index.groups[1]?.running).toBe(true);
  });
});

describe("results-first runtime", () => {
  it.each([
    { type: "tool_call", callId: "question", name: "request_user_input", status: "completed" },
    { type: "tool_call", callId: "permission", name: "execute", detail: { type: "user_questions" } },
  ])("keeps actionable source %j native before the first index loads", item => {
    let transform!: (input: { item: Item; phase: string }) => unknown;
    const runtime = createTurnRuntime({ addTimelineTransformer: (value: { query: { itemType: string }; transform: typeof transform }) => {
      if (value.query.itemType === "tool_call") transform = value.transform;
      return () => {};
    } } as unknown as Parameters<typeof createTurnRuntime>[0]);
    expect(transform({ item, phase: "complete" })).toBeUndefined();
    runtime.dispose();
  });

  it("restores a viewed source that falls outside the bounded server history", async () => {
    let transform!: (input: { item: Item; phase: string }) => unknown;
    const index = indexTurns("agent", "epoch", entries(source), idle);
    const runtime = createTurnRuntime({ rpc: async () => ({ status: "ok", ...index }),
      addTimelineTransformer: (value: { query: { itemType: string }; transform: typeof transform }) => {
        if (value.query.itemType === "tool_call") transform = value.transform;
        return () => {};
      },
    } as unknown as Parameters<typeof createTurnRuntime>[0]);
    const older = { type: "tool_call", callId: "outside-window", name: "read_file", status: "completed" };
    expect(transform({ item: older, phase: "complete" })).toMatchObject({ items: [{ kind: "turn-bootstrap" }] });
    runtime.noteSource("agent", "t:outside-window");
    await runtime.refresh("agent");
    expect(transform({ item: older, phase: "complete" })).toBeUndefined();
    runtime.dispose();
  });

  it("invalidates cached process as its turn grows and reuses an unchanged index", async () => {
    let index = indexTurns("agent", "epoch", entries(source), idle);
    let processReads = 0;
    const runtime = createTurnRuntime({
      rpc: async (definition: { name: string }) => definition.name === indexRpc.name ? { status: "ok", ...index }
        : { status: "ok", items: [], nextCursor: null, read: ++processReads },
      addTimelineTransformer: () => () => {},
    } as unknown as Parameters<typeof createTurnRuntime>[0]);
    await runtime.refresh("agent");
    const groupId = index.groups[0]!.id;
    await runtime.readProcess("agent", groupId);
    await runtime.readProcess("agent", groupId);
    expect(processReads).toBe(1);
    const snapshot = runtime.getIndex("agent");
    await runtime.refresh("agent");
    expect(runtime.getIndex("agent")).toBe(snapshot);
    index = indexTurns("agent", "epoch", entries([...source.slice(0, -1), { type: "tool_call", callId: "extra", name: "read_file", status: "completed" }, source.at(-1)!]), idle);
    await runtime.refresh("agent");
    expect(runtime.cachedProcess("agent", groupId)).toBeUndefined();
    await runtime.readProcess("agent", groupId);
    expect(processReads).toBe(2);
    runtime.dispose();
  });

  it("invalidates host projections on toggle and removes registrations on dispose", async () => {
    const index = indexTurns("agent", "epoch", entries(source), idle);
    type Transform = { query: { itemType: string }; transform(input: { item: Item; phase: "streaming" | "complete" }): unknown };
    const transforms = new Map<string, Transform>();
    const runtime = createTurnRuntime({ rpc: async () => ({ status: "ok", ...index }), addTimelineTransformer(value: Transform) {
      transforms.set(value.query.itemType, value); return () => { transforms.delete(value.query.itemType); };
    } } as unknown as Parameters<typeof createTurnRuntime>[0]);
    await runtime.refresh("agent");
    expect(transforms.get("assistant_message")!.transform({ item: source.at(-1)!, phase: "complete" })).toBeUndefined();
    expect(transforms.get("reasoning")!.transform({ item: source[2]!, phase: "streaming" })).toEqual({ items: [] });
    expect(transforms.get("tool_call")!.transform({ item: source[3]!, phase: "complete" })).toEqual({ items: [] });
    runtime.toggle(index.groups[0]!.id);
    expect(transforms.get("tool_call")!.transform({ item: source[3]!, phase: "complete" })).toBeUndefined();
    runtime.dispose();
    expect(transforms.size).toBe(0);
  });

  it("does not return transcript text in its grouping index", async () => {
    const rows = entries(source);
    const agent = { timeline: { refetch: async ({ limit }: { limit: number }) => ({ epoch: "epoch", entries: limit === 1 ? rows.slice(-1) : rows, hasOlder: false, endCursor: { seq: rows.at(-1)!.seqEnd } }) }, refresh: async () => ({ agent: { status: "idle", pendingPermissions: [], activeTurn: null } }) };
    const result = await readIndex({ agentId: "agent" }, { paseo: { agents: { ref: () => agent } } } as unknown as Parameters<typeof readIndex>[1]);
    expect(result.status).toBe("ok");
    expect(result.groups).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain("先检查调用方");
    expect(JSON.stringify(result)).not.toContain("已修复，相关测试通过");
  });
});
