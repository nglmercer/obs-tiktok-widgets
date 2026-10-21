import type { UniversalEvent } from "../../universal/index.js";
export interface WidgetInstance {
  id: string;
  name?: string;
  template: { id: string; version: string };
  enabled: boolean;
  locked: boolean;
  visible: boolean;
  transform: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
  };
  zIndex: number;
  settings: Record<string, unknown>;
  events?: string[];
  group?: string;
}
export interface Composition {
  contract: "obs-widget-composition";
  schemaVersion: 1;
  viewport: { width: number; height: number };
  background: string;
  widgets: WidgetInstance[];
}
export function emptyComposition(): Composition;
export function validateComposition(value: unknown): Composition;
export function orderedWidgets(value: Composition): WidgetInstance[];
export function patchWidget(
  value: Composition,
  id: string,
  patch: Partial<WidgetInstance>,
): Composition;
export interface WidgetContext {
  signal: AbortSignal;
  settings: Record<string, unknown>;
  fail?: (code: string) => void;
}
export interface WidgetRuntime {
  mount(container: HTMLElement): void | Promise<void>;
  update?(settings: Record<string, unknown>): void | Promise<void>;
  handleEvent(event: UniversalEvent): void | Promise<void>;
  destroy(): void | Promise<void>;
}
export interface WidgetDefinition {
  id: string;
  version: string;
  events: string[];
  createRuntime(context: WidgetContext): WidgetRuntime;
}
export class WidgetRegistry {
  register(value: WidgetDefinition): WidgetRegistry;
  resolve(id: string, version: string): WidgetDefinition | undefined;
}
