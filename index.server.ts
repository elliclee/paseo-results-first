import type { PluginServerContext } from "@getpaseo/plugin/server";

/** Quota is read from the existing host connection; no server contributions. */
export default function contribute(_server: PluginServerContext) {
  return () => {};
}
