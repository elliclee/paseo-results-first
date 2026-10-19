import { useEnhancerPreferences } from "../preferences";
import { resolveLanguage } from "../i18n/settings-strings";
import { summary, type Group } from "../../shared/results-first/model";

const en = {
  show: "Show process",
  hide: "Hide process",
  retry: "Couldn’t load process · tap to retry",
  retryMore: "Couldn’t load · retry",
  loading: "Loading…",
  working: "Working…",
  update: "Progress update",
  thinking: "Reasoning",
  compaction: "Context compacted",
  toolNames: { command: "Run command", read: "Read file", edit: "Edit file", search: "Search", web: "Browse web", tool: "Tool call" } as Record<string, string>,
  showDetail: "Show details",
  hideDetail: "Hide details",
  copy: "Copy text",
  copied: "Copied",
  code: "Code",
  less: "Show less",
  full: (count: number) => `Show all ${count} lines`,
  shortened: "Long output shortened.",
  noOutput: "No additional output was recorded.",
  sectionLabels: {} as Record<string, string>,
  more: (count: number) => `Show more · ${count} entries shown`,
};
const zh: typeof en = {
  show: "查看过程",
  hide: "收起过程",
  retry: "过程加载失败，点按重试",
  retryMore: "加载失败，重试",
  loading: "加载中…",
  working: "正在处理…",
  update: "进度说明",
  thinking: "思考",
  compaction: "上下文压缩",
  toolNames: { command: "运行命令", read: "读取文件", edit: "修改文件", search: "搜索", web: "访问网页", tool: "调用工具" },
  showDetail: "展开详情",
  hideDetail: "收起详情",
  copy: "复制文本",
  copied: "已复制",
  code: "代码",
  less: "收起全文",
  full: count => `查看全部 ${count} 行`,
  shortened: "较长的输出已截短。",
  noOutput: "没有更多输出。",
  sectionLabels: { Command: "命令", "Working directory": "工作目录", Output: "输出", File: "文件", Content: "内容", Diff: "修改差异", Before: "修改前", After: "修改后", Query: "查询", Results: "结果", URL: "网址", Result: "结果", Plan: "计划", Description: "说明", Branch: "分支", Directory: "目录", Input: "输入", Details: "详情", Error: "错误" },
  more: (count) => `加载更多 · 已显示 ${count} 项`,
};

export function useFoldStrings() {
  const preferences = useEnhancerPreferences();
  const language = resolveLanguage(preferences.language);
  return {
    ...(language === "zh" ? zh : en),
    summary: (group: Pick<Group, "tools" | "messages" | "thinking" | "compactions" | "running" | "todos">) => summary(group, language),
  };
}
