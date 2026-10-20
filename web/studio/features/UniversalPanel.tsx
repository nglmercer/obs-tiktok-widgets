import { useEffect, useRef } from "react";
import { mountEditor } from "../../universal/editor-ui.js";
import { getLocale, t } from "../../shared/i18n";
import { call } from "../api/client";
import type { StudioController } from "./useStudioProject";
export function UniversalPanel({
  controller,
}: {
  controller: StudioController;
}) {
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<ReturnType<typeof mountEditor> | undefined>(undefined);
  useEffect(() => {
    if (!root.current) return;
    editor.current = mountEditor(root.current, { locale: getLocale() });
    return () => editor.current?.dispose();
  }, []);
  return (
    <section>
      <div ref={root} />
      {controller.project && (
        <button
          disabled={Boolean(
            controller.dirty || controller.visualDraft || controller.busy,
          )}
          onClick={() =>
            controller.task("Save", async () => {
              const text = editor.current?.export();
              if (!text) throw Error("Import a package first");
              const id = controller.project!.id;
              const generation = controller.navigation.current;
              const project = await call<typeof controller.project>(
                "widgets.portable.set",
                {
                  id,
                  project: JSON.parse(text),
                  ifRevision: controller.project!.revision,
                },
              );
              if (
                controller.active.current.id !== id ||
                controller.navigation.current !== generation
              )
                return;
              ++controller.navigation.current;
              controller.setProject(project);
            })
          }
        >
          {t("Save portable project to selected widget")}
        </button>
      )}
    </section>
  );
}
