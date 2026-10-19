import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import type { z } from "zod";
import { rowSchema, type ProcessPage } from "../../shared/results-first/contracts";
import { useFoldStrings } from "./strings";
import type { TurnRuntime } from "./runtime";
import { useNativeFoldPosition } from "./native";
import { ProcessRecord } from "./process-content";
import { ProcessTypography, useProcessTypography } from "./typography";

type Props = PluginTimelineItemProps<z.output<typeof rowSchema>> & {runtime: TurnRuntime};
type Anchor = Props["item"]["data"]["anchors"][number];

export function InlineProcess(props: Props) {
  const candidates = props.item.data.anchors.filter(anchor => anchor.agentId === props.agentId);
  const anchor = candidates.find(value => value.group.at === props.timestamp.getTime()) ?? (candidates.length === 1 ? candidates[0] : undefined);
  return anchor ? <InlineFold key={anchor.group.id} {...props} anchor={anchor}/> : <Text selectable style={{color: props.theme.colors.foreground}}>{props.item.data.source}</Text>;
}

function InlineFold({agentId, runtime, anchor: {group}, theme, layout}: Props & {anchor: Anchor}) {
  const t = useFoldStrings();
  const { colors } = theme;
  const type = useProcessTypography({ theme, layout });
  const wanted = useSyncExternalStore(callback => runtime.subscribe(group.id, callback), () => runtime.isExpanded(group.id), () => false);
  const [page, setPage] = useState<ProcessPage | undefined>(() => runtime.cachedProcess(agentId, group.id));
  const [visible, setVisible] = useState(() => wanted && !!page);
  const [loading, setLoading] = useState(false), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const wantedRef = useRef(wanted), mounted = useRef(true), busy = useRef(false);
  wantedRef.current = wanted;
  const header = useRef<View>(null), position = useNativeFoldPosition(), positionRef = useRef(position);
  positionRef.current = position;
  const cancel = useRef<(() => void) | undefined>(undefined);
  const resize = useCallback((change: () => void) => {
    cancel.current?.();
    cancel.current = runtime.anchor(group.id, change => positionRef.current.keepPosition(group.id, change), () => {if (mounted.current) change();});
  }, [runtime, group.id]);
  useLayoutEffect(() => {position.didLayout(group.id);});
  useLayoutEffect(() => { mounted.current = true; return () => {mounted.current = false; cancel.current?.();}; }, []);
  useEffect(() => {
    if (!wanted) {setLoading(false); setError(false); busy.current = false; return;}
    if (page) return;
    let cancelled = false;
    setLoading(true); setError(false);
    void runtime.readProcess(agentId, group.id).then(result => {
      if (cancelled) return;
      setLoading(false);
      if (result.status === "ok") setPage(result); else setError(true);
    }).catch(() => {if (!cancelled) {setError(true); setLoading(false);}});
    return () => {cancelled = true;};
  }, [wanted, !!page, retry, agentId, group.id, runtime]);
  // Keep visibility separate from intent/data. Loading never changes the cell's
  // height; the complete body enters in one anchored local React commit.
  useLayoutEffect(() => {
    if (wanted === visible || wanted && !page) return;
    const target = wanted;
    resize(() => {if (wantedRef.current === target) setVisible(target);});
    return cancel.current;
  }, [wanted, !!page, group.id]);
  const more = () => {
    if (busy.current || page?.nextCursor == null) return;
    busy.current = true; setLoading(true); setError(false);
    void runtime.readProcess(agentId, group.id, page.nextCursor).then(result => {
      if (!mounted.current || !wantedRef.current) return;
      if (result.status === "ok") resize(() => setPage(result)); else setError(true);
    }).catch(() => {if (mounted.current) setError(true);}).finally(() => {busy.current = false; if (mounted.current) setLoading(false);});
  };
  const title = error && !visible ? t.retry : group.running ? t.working : visible ? t.hide : t.show;
  return <ProcessTypography.Provider value={type}><View style={{minWidth: 0}}>
    <Pressable ref={value => {position.setHeader(group.id, value, header.current); header.current = value;}}
      nativeID={`completed-turns-${encodeURIComponent(group.id)}`} accessibilityRole="button"
      accessibilityLabel={`${visible ? t.hide : t.show}：${t.summary(group)}`} accessibilityState={{expanded: visible, busy: loading || wanted && !visible && !error}}
      onPress={() => {if (error && !visible && wanted) setRetry(value => value + 1); else runtime.toggle(group.id);}}
      style={({pressed}) => ({minHeight: layout.compact ? 44 : 36, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6,
        borderRadius: 6, backgroundColor: pressed ? colors.surface1 : "transparent"})}>
      <View style={{width: type.iconSize, height: type.text.lineHeight, alignItems: "center", justifyContent: "center"}}>
        {wanted && !visible && !error ? <ActivityIndicator size="small" color={colors.foregroundMuted}/> : <Icon name={visible ? "ChevronDown" : "ChevronRight"} size={type.iconSize} color={colors.foregroundMuted}/>}
      </View>
      <Text numberOfLines={1} style={{...type.text, flexShrink: 1, color: colors.foregroundMuted}}>{title}</Text>
    </Pressable>
    {visible && page && <View nativeID={`completed-turns-body-${encodeURIComponent(group.id)}`}
      style={{borderLeftWidth: 1, borderColor: colors.border, marginLeft: 6, paddingLeft: 14, paddingTop: 8, paddingBottom: 8, marginBottom: 8, gap: 10}}>
      {page.items.map(item => <ProcessRecord key={item.id} item={item} colors={colors} resize={resize}/>)}
      {page.nextCursor !== null && <Pressable accessibilityRole="button" accessibilityLabel={error ? t.retryMore : t.more(page.items.length)}
        disabled={loading} onPress={more} style={{minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 6, backgroundColor: colors.surface1}}>
        {loading && <ActivityIndicator size="small" color={colors.foregroundMuted}/>}
        <Text style={{...type.text, color: colors.foregroundMuted}}>{error ? t.retryMore : loading ? t.loading : t.more(page.items.length)}</Text>
      </Pressable>}
    </View>}
  </View></ProcessTypography.Provider>;
}
