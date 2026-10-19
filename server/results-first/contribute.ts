import type { PluginServerContext } from "@getpaseo/plugin/server";
import { indexRpc, processRpc, statusRpc } from "../../shared/results-first/contracts";
import { readIndex, readProcess, status } from "./index";

export default function contribute(server: PluginServerContext): () => void {
  server.handle(indexRpc, readIndex);
  server.handle(statusRpc, status);
  server.handle(processRpc, readProcess);
  // Handler registrations belong to the subprocess and end with its SDK session.
  return () => {};
}
