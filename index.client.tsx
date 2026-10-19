import type { PluginClientContext } from "@getpaseo/plugin/client";
import { installQuotaFooters } from "./client/quota/native-footer";

/** Keep Paseo's native presentation; append only provider quota snapshots. */
export default function contribute(_client: PluginClientContext) {
  return installQuotaFooters();
}
