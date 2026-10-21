import { CompositionRuntime } from "./app/CompositionRuntime.js";
import { builtinRegistry } from "./app/builtins.js";
import { emptyComposition } from "./app/composition.js";
export { CompositionRuntime, builtinRegistry };
const root = document.getElementById("composition-root");
if (root) {
  const runtime = new CompositionRuntime(root, builtinRegistry(), {
    preview: Boolean(window.TikTokPlaygroundPreview),
  });
  runtime
    .load(window.TikTokWidgetConfig?.composition ?? emptyComposition())
    .catch((error) => {
      root.dataset.error = String(error.message);
      console.error("Composition failed", error);
    });
  window.addEventListener("pagehide", () => runtime.destroy(), { once: true });
  // Read-only runtime diagnostics; no administration transport.
  window.TikTokCompositionDiagnostics = () => runtime.diagnostics();
}
