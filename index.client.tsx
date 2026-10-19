import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installQuotaFooters } from "./client/quota/native-footer";

/** Remove reasoning before host layout, preserving native tools and replies. */
export default function contribute(client: PluginClientContext) {
  const removeThinking = client.addTimelineTransformer({
    id: "hide-thinking",
    query: { itemType: "reasoning" },
    transform: () => ({ items: [] }),
  });
  const removeQuota = installQuotaFooters();
  return () => { removeThinking(); removeQuota(); };
}
