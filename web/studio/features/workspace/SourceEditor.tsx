import { t as tr } from "../../../shared/i18n";
import { lazy, Suspense } from "react";
const Code = lazy(() => import("../Code"));
export function SourceEditor({
  file,
  dirty,
  busy,
  task,
  save,
  compilerLocations,
  read,
  setEditorLocation,
  remote,
  saved,
  text,
  confirmAction,
  setText,
  setSaved,
  navigation,
  setFileRevision,
  remoteRevision,
  setRemote,
  setNotice,
  mergeDraft,
  project,
  editorCommand,
  editorLocation,
}: {
  file: string;
  dirty: boolean;
  busy: string;
  task: (label: string, fn: () => Promise<void>) => Promise<void>;
  save: () => Promise<void>;
  compilerLocations: {
    file: string;
    line: number;
    column: number;
    message: string;
  }[];
  read: (f: string) => Promise<void>;
  setEditorLocation: (v: {
    line: number;
    column: number;
    serial: number;
  }) => void;
  remote: string | undefined;
  saved: string;
  text: string;
  confirmAction: (message: string) => Promise<boolean>;
  setText: (v: string) => void;
  setSaved: (v: string) => void;
  navigation: { current: number };
  setFileRevision: (v: string) => void;
  remoteRevision: string;
  setRemote: (v: string | undefined) => void;
  setNotice: (v: string) => void;
  mergeDraft: (
    base: string,
    local: string,
    remote: string,
  ) => string | undefined;
  project: { id: string };
  editorCommand: { id: string; serial: number } | undefined;
  editorLocation: { line: number; column: number; serial: number } | undefined;
}) {
  return (
    <>
      {" "}
      <div className="code-bar">
        <span>{file || "Choose a source file"}</span>
        <button
          disabled={!dirty || !!busy || !file}
          onClick={() => task("Save source", save)}
        >
          {tr("Save source")}
        </button>
      </div>
      {compilerLocations.map((d, i) => (
        <button
          key={i}
          onClick={() =>
            task("Diagnostic", async () => {
              await read(d.file);
              setEditorLocation({
                line: d.line,
                column: d.column,
                serial: Date.now(),
              });
            })
          }
        >
          {d.file}:{d.line}:{d.column} {d.message}
        </button>
      ))}
      {remote !== undefined && (
        <div role="alert" className="conflict">
          <strong>{tr("External change detected. Draft retained.")}</strong>
          <details>
            <summary>{tr("Compare base / local / remote")}</summary>
            <h3>{tr("Base")}</h3>
            <pre>{saved}</pre>
            <h3>{tr("Local draft")}</h3>
            <pre>{text}</pre>
            <h3>{tr("Remote")}</h3>
            <pre>{remote}</pre>
          </details>
          <button
            onClick={async () => {
              if (
                await confirmAction("Discard draft and reload saved version?")
              ) {
                setText(remote);
                setSaved(remote);
                ++navigation.current;
                setFileRevision(remoteRevision);
                setRemote(undefined);
              }
            }}
          >
            {tr("Reload saved version")}
          </button>
          <button
            onClick={() => {
              ++navigation.current;
              setSaved(remote);
              setFileRevision(remoteRevision);
              setRemote(undefined);
              setNotice(
                "Review and merge your draft, then Save source explicitly.",
              );
            }}
          >
            {tr("Keep draft for manual merge")}
          </button>
          <button
            onClick={() => {
              const merged = mergeDraft(saved, text, remote);
              if (merged === undefined) {
                setNotice(
                  "Overlapping changes require manual merge; all three versions remain available.",
                );
                return;
              }
              ++navigation.current;
              setText(merged);
              setSaved(remote);
              setFileRevision(remoteRevision);
              setRemote(undefined);
            }}
          >
            {tr("Merge non-overlapping changes")}
          </button>
        </div>
      )}
      {file && (
        <Suspense fallback={<p>{tr("Loading syntax editor…")}</p>}>
          <Code
            file={project.id + ":" + file}
            text={text}
            onChange={setText}
            command={editorCommand}
            location={editorLocation}
          />
        </Suspense>
      )}
    </>
  );
}
