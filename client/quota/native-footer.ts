import { Platform } from "react-native";
import { footerIdentity, readHostQuota, type FooterIdentity } from "./host-bridge";
import { createQuotaStore } from "./store";

interface Patch {
  owner: FooterIdentity;
  spans: HTMLElement[];
  baseLabel: string;
  lastLabel: string;
  styles: { element: HTMLElement; name: string; previous: string; applied: string }[];
}
/** Append only plugin-owned spans; native text and handlers remain host-owned. */
export function installQuotaFooters() {
  if (Platform.OS !== "web" || typeof document === "undefined") return () => {};
  const patches = new Map<HTMLElement, Patch>();
  let frame = 0, disposed = false;
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Snapshots still work in memory. */ }
  const store = createQuotaStore(readHostQuota, schedule, Date.now, storage);
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(() => { frame = 0; reconcile(); });
  }
  function remove(element: HTMLElement, patch: Patch) {
    for (const span of patch.spans) span.remove();
    if (element.getAttribute("aria-label") === patch.lastLabel) element.setAttribute("aria-label", patch.baseLabel);
    for (const style of patch.styles) if (style.element.style.getPropertyValue(style.name) === style.applied) {
      if (style.previous) style.element.style.setProperty(style.name, style.previous); else style.element.style.removeProperty(style.name);
    }
    patches.delete(element);
  }
  function reconcile() {
    for (const [element, patch] of patches) if (!element.isConnected) remove(element, patch);
    for (const element of document.querySelectorAll<HTMLElement>('[aria-label*=", ended "]')) {
      const owner = footerIdentity(element);
      if (!owner) { const patch = patches.get(element); if (patch) remove(element, patch); continue; }
      void store.capture(owner);
      const text = store.get(owner);
      let patch = patches.get(element);
      if (patch && (patch.owner.agentId !== owner.agentId || patch.owner.serverId !== owner.serverId || patch.owner.completedAt !== owner.completedAt)) { remove(element, patch); patch = undefined; }
      if (!text) { if (patch) remove(element, patch); continue; }
      const sizer = element.querySelector<HTMLElement>('[aria-hidden="true"]');
      const wrapper = sizer?.parentElement;
      const overlay = wrapper?.children[1] as HTMLElement | undefined;
      if (!sizer || !overlay || overlay === sizer) continue;
      if (!patch) {
        const label = element.getAttribute("aria-label") ?? "";
        patch = { owner, spans: [], baseLabel: label, lastLabel: label, styles: [] };
        patches.set(element, patch);
      }
      const style = (target: HTMLElement | null, name: string, applied: string) => {
        if (!target || patch!.styles.some(style => style.element === target && style.name === name)) return;
        patch!.styles.push({ element: target, name, previous: target.style.getPropertyValue(name), applied });
        target.style.setProperty(name, applied);
      };
      style(element.parentElement, "flex-wrap", "wrap");
      style(element, "max-width", "100%"); style(element, "min-width", "0px"); style(element, "flex-shrink", "1");
      style(overlay, "right", "0px");
      patch.spans = patch.spans.filter(span => span.isConnected);
      for (const target of [sizer, overlay]) {
        let span = patch.spans.find(span => span.parentElement === target);
        if (!span) {
          span = document.createElement("span"); span.setAttribute("data-bp-quota", "");
          span.title = "回复完成时的额度快照";
          span.style.font = "inherit"; span.style.color = "inherit";
          target.appendChild(span); patch.spans.push(span);
        }
        const value = `，${text}`;
        if (span.textContent !== value) span.textContent = value;
      }
      const label = element.getAttribute("aria-label") ?? "";
      if (label !== patch.lastLabel) patch.baseLabel = label;
      const nextLabel = `${patch.baseLabel}，${text}`;
      patch.lastLabel = nextLabel;
      if (label !== nextLabel) element.setAttribute("aria-label", nextLabel);
    }
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
  schedule();
  return () => {
    disposed = true; observer.disconnect(); cancelAnimationFrame(frame); store.dispose();
    for (const [element, patch] of patches) remove(element, patch);
  };
}
