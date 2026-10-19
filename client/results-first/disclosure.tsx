import { Pressable, Text, View } from "react-native";
import { useLayoutEffect, useRef } from "react";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { z } from "zod";
import { rowSchema } from "../../shared/results-first/contracts";
import { useFoldStrings } from "./strings";
import type { TurnRuntime } from "./runtime";
import { keepFoldPosition, tidyFoldBoundary } from "./web";
import { InlineProcess } from "./inline-process";
import { useProcessTypography } from "./typography";

type Props = PluginTimelineItemProps<z.output<typeof rowSchema>> & { runtime: TurnRuntime };

export function TurnDisclosure(props: Props) {
  return props.runtime.inline ? <InlineProcess {...props}/> : <RowDisclosure {...props}/>;
}

function RowDisclosure({ agentId, item, timestamp, theme, layout, runtime }: Props) {
  const t = useFoldStrings();
  const type = useProcessTypography({ theme, layout });
  const headerRef = useRef<View>(null);
  const candidates = item.data.anchors.filter(anchor => anchor.agentId === agentId);
  const anchor = candidates.find(value => value.group.at === timestamp.getTime()) ?? (candidates.length === 1 ? candidates[0] : undefined);
  useLayoutEffect(() => anchor && !anchor.expanded ? tidyFoldBoundary(headerRef.current) : undefined, [anchor?.group.id, anchor?.expanded]);
  // Identity conflicts never erase a source row.
  if (!anchor) return <Text style={{ ...type.text, color: theme.colors.foreground }} selectable>{item.data.source}</Text>;
  const { group, expanded } = anchor;
  const compact = layout.compact;
  const details = expanded ? <View style={{ borderLeftWidth: 1, borderLeftColor: theme.colors.border, paddingLeft: compact ? 14 : 20, marginLeft: 6, paddingVertical: 8, marginBottom: 8 }}>
    <Text selectable style={{ ...type.text, color: theme.colors.foreground }}>{item.data.source}</Text>
  </View> : null;
  return <View style={{ minWidth: 0 }}>
    <Pressable ref={headerRef} nativeID={`completed-turns-${encodeURIComponent(group.id)}`}
      accessibilityRole="button" accessibilityLabel={`${expanded ? t.hide : t.show}：${t.summary(group)}`}
      accessibilityState={{ expanded }} onPress={() => runtime.toggle(group.id, change => keepFoldPosition(headerRef.current, change))}
      style={({ pressed }) => ({ minHeight: compact ? 44 : 36, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, opacity: pressed ? 0.65 : 1 })}>
      <Icon name={expanded ? "ChevronDown" : "ChevronRight"} color={theme.colors.foregroundMuted} size={type.iconSize} />
      <Text style={{ ...type.text, color: theme.colors.foregroundMuted, flexShrink: 1 }}>{group.running ? t.working : expanded ? t.hide : t.show}</Text>
    </Pressable>
    {details}
  </View>;
}
