import { createContext, useContext } from "react";
import type { PluginHostProps } from "@getpaseo/plugin/client";
import { useHostAppearance } from "../ui/tokens/host-appearance-shim";
import { readHostTypography, resolveTypography } from "../ui/tokens/typography";

const followHost = { uiFont: "host", monoFont: "host", customMonoFont: "", codeFontSize: null } as const;

export function useProcessTypography({ theme, layout }: Pick<PluginHostProps, "theme" | "layout">) {
  const appearance = useHostAppearance(readHostTypography(theme) === null, theme);
  const typography = resolveTypography(theme, followHost, layout.platform, appearance);
  return {
    text: { fontFamily: typography.ui.family, fontSize: typography.content.size, lineHeight: typography.content.lineHeight },
    caption: { fontFamily: typography.ui.family, fontSize: Math.max(10, typography.content.size - 2), lineHeight: typography.content.lineHeight - 2 },
    code: { fontFamily: typography.mono.family, fontSize: typography.mono.size, lineHeight: typography.mono.lineHeight },
    iconSize: typography.content.size,
  };
}

const defaultType = resolveTypography(null, followHost, "web");
export const ProcessTypography = createContext({
  text: { fontFamily: defaultType.ui.family, fontSize: defaultType.content.size, lineHeight: defaultType.content.lineHeight },
  caption: { fontFamily: defaultType.ui.family, fontSize: Math.max(10, defaultType.content.size - 2), lineHeight: defaultType.content.lineHeight - 2 },
  code: { fontFamily: defaultType.mono.family, fontSize: defaultType.mono.size, lineHeight: defaultType.mono.lineHeight },
  iconSize: defaultType.content.size,
});
export const useProcessText = () => useContext(ProcessTypography);
