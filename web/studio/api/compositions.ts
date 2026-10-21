import { call, type Project } from "./client";
import type {
  Composition,
  WidgetInstance,
} from "../../renderer/app/composition.js";
export interface CompositionProject extends Project {
  settings: Project["settings"] & { composition: Composition };
}
export type CompositionPatch = Partial<
  Pick<Composition, "viewport" | "background" | "widgets">
>;
// Revision strings retain the existing content-hash preconditions. Widget edits
// return the authoritative project/revision together, avoiding stale draft bases.
export const compositions = {
  list: () => call<CompositionProject[]>("compositions.list"),
  get: (id: string) => call<CompositionProject>("compositions.get", { id }),
  create: (name: string) =>
    call<CompositionProject>("compositions.create", { name }),
  update: (id: string, ifRevision: string, patch: CompositionPatch) =>
    call<CompositionProject>("compositions.update", { id, ifRevision, patch }),
  duplicate: (id: string, ifRevision: string) =>
    call<CompositionProject>("compositions.duplicate", { id, ifRevision }),
  remove: (id: string, ifRevision: string) =>
    call<CompositionProject>("compositions.remove", {
      id,
      ifRevision,
      confirm: true,
    }),
  addWidget: (
    id: string,
    ifRevision: string,
    widget: Omit<WidgetInstance, "id">,
  ) =>
    call<CompositionProject>("compositions.widgets.add", {
      id,
      ifRevision,
      widget,
    }),
  updateWidget: (
    id: string,
    ifRevision: string,
    widgetId: string,
    patch: Partial<Omit<WidgetInstance, "id">>,
  ) =>
    call<CompositionProject>("compositions.widgets.update", {
      id,
      ifRevision,
      widgetId,
      patch,
    }),
  removeWidget: (id: string, ifRevision: string, widgetId: string) =>
    call<CompositionProject>("compositions.widgets.remove", {
      id,
      ifRevision,
      widgetId,
    }),
  publish: (id: string, ifRevision: string) =>
    call<{ buildId: string; release: string }>("compositions.publish", {
      id,
      ifRevision,
    }),
  history: (id: string) =>
    call<{ revision: string }[]>("compositions.history", { id }),
  restoreSource: (id: string, ifRevision: string, revision: string) =>
    call<CompositionProject>("compositions.rollback", {
      id,
      ifRevision,
      revision,
    }),
};
