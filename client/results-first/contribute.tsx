import { useEffect } from "react";
import { Platform } from "react-native";
import { PreferenceSyncSlot } from "../state/preference-sync-slot";
import type { PluginClientContext, PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { bootstrapSchema, compactionSchema, rowSchema } from "../../shared/results-first/contracts";
import { createTurnRuntime } from "./runtime";
import { TurnDisclosure } from "./disclosure";
import { TurnCompaction } from "./compaction";
import type { z } from "zod";

export default function contribute(client: PluginClientContext) {
  const runtime = createTurnRuntime(client, Platform.OS !== "web");
  let disposed = false;
  let stopAgentList = () => {};
  const viewed = new Set<string>();
  const mounted = new Map<string, { count: number; release(): void }>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const states = new Map<string, string>();

  function Observer({ agentId, sourceKey }: { agentId: string; sourceKey?: string }) {
    useEffect(() => {
      if (sourceKey) runtime.noteSource(agentId, sourceKey);
      viewed.add(agentId);
      let slot = mounted.get(agentId);
      if (slot) { slot.count++; if (sourceKey) void runtime.refresh(agentId); }
      else { slot = { count: 1, release: runtime.mount(agentId) }; mounted.set(agentId, slot); }
      return () => { if (--slot.count === 0) { slot.release(); mounted.delete(agentId); } };
    }, [agentId, sourceKey]);
    return <PreferenceSyncSlot/>;
  }
  const removeBootstrap = client.addTimelineRenderer({ kind: "turn-bootstrap", version: 1, schema: bootstrapSchema,
    Component: ({ agentId, item }: PluginTimelineItemProps<z.output<typeof bootstrapSchema>>) => <Observer agentId={agentId} sourceKey={item.data.key}/> });
  const removeDisclosure = client.addTimelineRenderer({ kind: "turn-disclosure", version: 1, schema: rowSchema,
    Component: (props: PluginTimelineItemProps<z.output<typeof rowSchema>>) => <><Observer agentId={props.agentId}/><TurnDisclosure {...props} runtime={runtime}/></> });
  const removeCompaction = client.addTimelineRenderer({ kind: "turn-compaction", version: 1, schema: compactionSchema,
    Component: (props: PluginTimelineItemProps<z.output<typeof compactionSchema>>) => <><Observer agentId={props.agentId}/><TurnCompaction {...props} runtime={runtime}/></> });

  function changed(agent: { id: string; status: string; requiresAttention?: boolean; lastActivityAt?: string; updatedAt?: string }) {
    const key = `${agent.status}:${agent.requiresAttention}:${agent.lastActivityAt}:${agent.updatedAt}`;
    if (states.get(agent.id) === key) return;
    states.set(agent.id, key);
    if (!viewed.has(agent.id)) return;
    if (agent.status === "running") {
      if (!pending.has(agent.id)) pending.set(agent.id, setTimeout(() => {
        pending.delete(agent.id); void runtime.refresh(agent.id);
      }, 1500));
    } else {
      clearTimeout(pending.get(agent.id)); pending.delete(agent.id);
      void runtime.refresh(agent.id);
    }
  }
  void client.paseo.agents.list({ subscribe: {} }).then(({ subscription }) => {
    if (disposed) { void subscription.release().catch(() => {}); return; }
    const unsubscribe = subscription.subscribe({
      snapshot: ({ entries }) => { for (const { agent } of entries) changed(agent); },
      update: message => {
        if (message.type !== "agent_update") return;
        const update = message.payload;
        if (update.kind === "upsert") changed(update.agent);
        else {
          clearTimeout(pending.get(update.agentId)); pending.delete(update.agentId);
          states.delete(update.agentId); viewed.delete(update.agentId);
        }
      },
    });
    stopAgentList = () => { unsubscribe(); void subscription.release().catch(() => {}); };
  }).catch(() => { /* Index initialization still occurs when a source is viewed. */ });
  return () => {
    disposed = true; stopAgentList();
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear(); states.clear(); viewed.clear();
    for (const slot of mounted.values()) slot.release();
    mounted.clear(); runtime.dispose(); removeBootstrap(); removeDisclosure(); removeCompaction();
  };
}
