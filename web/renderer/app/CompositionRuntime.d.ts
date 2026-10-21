import type { Composition, WidgetRegistry } from "./composition.js";
export class CompositionRuntime {
  constructor(
    root: HTMLElement,
    registry: WidgetRegistry,
    options?: {
      target?: EventTarget;
      mountTimeout?: number;
      preview?: boolean;
    },
  );
  load(value: Composition): Promise<void>;
  destroy(): void;
  diagnostics(): unknown;
}
