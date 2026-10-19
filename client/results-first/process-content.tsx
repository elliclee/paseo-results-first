import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { copyText, Icon } from "@getpaseo/plugin/client/react-native";
import type { PluginTheme } from "@getpaseo/plugin";
import type { ProcessItem } from "../../shared/results-first/contracts";
import type { MarkdownNode } from "../../shared/results-first/markdown";
import { toolCategory } from "../../shared/results-first/model";
import { codeSurface } from "../components/host-font-escape";
import { useProcessText } from "./typography";
import { useFoldStrings } from "./strings";

type Resize = (change: () => void) => void;
type Colors = PluginTheme["colors"];
const TOOL_ICONS: Record<string, string> = {read: "FileText", edit: "FilePenLine", search: "Search", web: "Globe", command: "Terminal", tool: "Wrench"};
export function safeProcessLink(href = ""): boolean { return /^(https?:\/\/|mailto:)[^\s\u0000-\u001f]+$/i.test(href); }
function openLink(href: string) {
  if (safeProcessLink(href)) void Linking.openURL(href).catch(() => Alert.alert("Link unavailable", "This link could not be opened."));
}
function CopyButton({text, colors}: {text: string; colors: Colors}) {
  const t = useFoldStrings();
  const [copied, setCopied] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <Pressable accessibilityRole="button" accessibilityLabel={copied ? t.copied : t.copy}
    hitSlop={6} onPress={() => { void copyText(text).then(() => {setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 1500);})
      .catch(() => Alert.alert("Copy unavailable", "Select the text to copy it.")); }}
    style={({pressed}) => ({minWidth: 44, minHeight: 36, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.surface2 : "transparent", borderRadius: 6})}>
    <Icon name={copied ? "Check" : "Copy"} size={14} color={colors.foregroundMuted} />
  </Pressable>;
}
function CodeBlock({text, label, colors, resize}: {text: string; label?: string; colors: Colors; resize: Resize}) {
  const type = useProcessText();
  const t = useFoldStrings();
  const [all, setAll] = useState(false);
  const lines = text.split("\n"), shortened = lines.length > 18 || text.length > 2400;
  const shown = all || !shortened ? text : lines.slice(0, 18).join("\n").slice(0, 2400);
  return <View style={{minWidth: 0, backgroundColor: colors.surface1, borderRadius: 6, overflow: "hidden", marginVertical: 4}}>
    <View style={{flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingLeft: 12}}>
      <Text style={{...type.caption, color: colors.foregroundMuted}}>{label ? t.sectionLabels[label] ?? label : t.code}</Text><CopyButton text={text} colors={colors}/>
    </View>
    <ScrollView {...codeSurface} horizontal showsHorizontalScrollIndicator contentContainerStyle={{paddingHorizontal: 12, paddingBottom: 12}}>
      <Text selectable style={{...type.code, color: colors.foreground}}>{shown}</Text>
    </ScrollView>
    {shortened && <Pressable accessibilityRole="button" onPress={() => resize(() => setAll(!all))}
      style={{minHeight: 44, justifyContent: "center", paddingHorizontal: 12, borderTopWidth: 1, borderColor: colors.border}}>
      <Text style={{...type.caption, color: colors.foregroundMuted}}>{all ? t.less : t.full(lines.length)}</Text>
    </Pressable>}
  </View>;
}
function InlineText({nodes, colors}: {nodes: MarkdownNode[]; colors: Colors}): ReactNode {
  const type = useProcessText();
  return nodes.map((node, i) => {
    const children = node.children ? <InlineText nodes={node.children} colors={colors}/> : node.text;
    if (node.type === "inline") return <Text key={i}>{children}</Text>;
    return <Text key={i} onPress={node.type === "link" && safeProcessLink(node.href) ? () => openLink(node.href!) : undefined}
      accessibilityRole={node.type === "link" && safeProcessLink(node.href) ? "link" : undefined}
      style={node.type === "strong" ? {fontWeight: "700"} : node.type === "em" ? {fontStyle: "italic"} : node.type === "s" ? {textDecorationLine: "line-through"}
        : node.type === "code_inline" ? {...type.code, backgroundColor: colors.surface1}
        : node.type === "link" ? {color: colors.accent, textDecorationLine: "underline"} : undefined}>{children}</Text>;
  });
}
function MarkdownContent({nodes, colors, resize}: {nodes: MarkdownNode[]; colors: Colors; resize: Resize}): ReactNode {
  const type = useProcessText();
  return nodes.map((node, i) => {
    if (node.type === "code_block") return <CodeBlock key={i} text={node.text ?? ""} colors={colors} resize={resize}/>;
    if (node.type === "hr") return <View key={i} style={{height: 1, backgroundColor: colors.border, marginVertical: 10}}/>;
    if (node.type === "paragraph" || node.type === "heading" || node.type === "inline" || node.type === "text") return <Text key={i} selectable
      style={{...type.text, fontWeight: node.type === "heading" ? "600" : "400",
        color: colors.foreground, marginVertical: 4}}><InlineText nodes={node.children ?? [{type: "text", text: node.text}]} colors={colors}/></Text>;
    if (node.type === "bullet_list" || node.type === "ordered_list") return <View key={i} style={{gap: 2, marginVertical: 4}}>
      {node.children?.map((child, at) => <View key={at} style={{flexDirection: "row", gap: 8}}>
        <Text style={{...type.text, width: node.type === "bullet_list" ? 12 : 24, marginVertical: 4, color: colors.foregroundMuted}}>{node.type === "bullet_list" ? "•" : `${(node.start ?? 1) + at}.`}</Text>
        <View style={{flex: 1, minWidth: 0}}><MarkdownContent nodes={child.children ?? []} colors={colors} resize={resize}/></View>
      </View>)}
    </View>;
    if (node.type === "table") return <ScrollView horizontal key={i} style={{marginVertical: 8}}><View style={{borderWidth: 1, borderColor: colors.border, borderRadius: 6}}>
      <MarkdownContent nodes={node.children ?? []} colors={colors} resize={resize}/></View></ScrollView>;
    if (node.type === "tr") return <View key={i} style={{flexDirection: "row"}}><MarkdownContent nodes={node.children ?? []} colors={colors} resize={resize}/></View>;
    if (node.type === "th" || node.type === "td") return <View key={i} style={{width: 180, padding: 8, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: node.type === "th" ? colors.surface1 : "transparent"}}>
      <Text selectable style={{...type.text, fontWeight: node.type === "th" ? "600" : "400", color: colors.foreground}}><InlineText nodes={node.children ?? []} colors={colors}/></Text></View>;
    return <View key={i} style={node.type === "blockquote" ? {borderLeftWidth: 1, borderColor: colors.border, paddingLeft: 12, marginVertical: 4} : undefined}>
      <MarkdownContent nodes={node.children ?? []} colors={colors} resize={resize}/></View>;
  });
}
export const ProcessRecord = memo(function ProcessRecord({item, colors, resize}: {item: ProcessItem; colors: Colors; resize: Resize}) {
  const type = useProcessText(), t = useFoldStrings();
  const [open, setOpen] = useState(false);
  const category = toolCategory(item.title);
  const title = item.kind === "message" ? t.update : item.kind === "thinking" ? t.thinking : item.kind === "compaction" ? t.compaction
    : category === "tool" ? item.title : t.toolNames[category]!;
  const preview = item.summary || item.sections[0]?.text.replace(/\s+/g, " ").slice(0, 240) || "";
  const icon = item.kind === "message" ? "MessageSquare" : item.kind === "thinking" ? "Brain" : item.kind === "compaction" ? "Scissors" : TOOL_ICONS[category]!;
  if (item.kind === "compaction") return <View style={{flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8}}>
    <Icon name={icon} color={colors.foregroundMuted} size={type.iconSize}/><Text style={{...type.caption, color: colors.foregroundMuted}}>{title}</Text></View>;
  return <View style={{minWidth: 0}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${open ? t.hideDetail : t.showDetail}：${title}`} accessibilityState={{expanded: open}}
      onPress={() => resize(() => setOpen(!open))} style={({pressed}) => ({minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: 8,
        paddingVertical: 8, backgroundColor: pressed ? colors.surface1 : "transparent"})}>
      <View style={{height: type.text.lineHeight, justifyContent: "center"}}><Icon name={icon} size={type.iconSize} color={colors.foregroundMuted}/></View>
      <View style={{flex: 1, minWidth: 0, gap: 2}}>
        <Text style={{...type.text, color: colors.foreground}}>{title}</Text>
        {!!preview && <View {...(item.kind === "tool" ? codeSurface : {})} style={{minWidth: 0}}>
          <Text numberOfLines={2} style={{...(item.kind === "tool" ? type.code : type.caption), color: colors.foregroundMuted}}>{preview}</Text>
        </View>}
      </View>
      <View style={{height: type.text.lineHeight, justifyContent: "center"}}><Icon name={open ? "ChevronDown" : "ChevronRight"} size={type.iconSize} color={colors.foregroundMuted}/></View>
    </Pressable>
    {open && <View style={{minWidth: 0, paddingBottom: 8, gap: 6}}>
      {item.sections.length ? item.sections.map((section, i) => <View key={i} style={{minWidth: 0}}>
        {section.format === "code" ? <CodeBlock text={section.text} label={section.label} colors={colors} resize={resize}/>
          : <MarkdownContent nodes={section.blocks ?? [{type: "paragraph", children: [{type: "text", text: section.text}]}]} colors={colors} resize={resize}/>}
        {section.truncated && <Text style={{...type.caption, color: colors.foregroundMuted, marginTop: 4}}>{t.shortened}</Text>}
      </View>) : <Text style={{...type.caption, color: colors.foregroundMuted}}>{t.noOutput}</Text>}
    </View>}
  </View>;
});
