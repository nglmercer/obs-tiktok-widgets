import { Layers } from "./features/Layers";
import { ask, confirmAction } from "./components/Dialog";
import { Canvas } from "./features/Canvas";
import { DraftManager, mergeDraft } from "./features/drafts";
import { lazy, Suspense, useEffect, useState, useRef } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Action } from "./components/Action";
import {
  call,
  ApiError,
  requestedWidget,
  type Project,
  type Template,
} from "./api/client";
import { Inspector } from "./features/Inspector";
const Code = lazy(() => import("./features/Code"));
export default function App() {
  const [nav, setNav] = useState("Templates"),
    [templates, setTemplates] = useState<Template[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [search, setSearch] = useState(""),
    [project, setProject] = useState<Project>(),
    [files, setFiles] = useState<string[]>([]),
    [file, setFile] = useState(""),
    [text, setText] = useState(""),
    [saved, setSaved] = useState(""),
    [fileRevision, setFileRevision] = useState(""),
    [remote, setRemote] = useState<string>(),
    [remoteRevision, setRemoteRevision] = useState(""),
    [tab, setTab] = useState("Design"),
    [schema, setSchema] = useState<any>({}),
    [preview, setPreview] = useState(""),
    [viewport, setViewport] = useState("600×400"),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [editorLocation, setEditorLocation] = useState<{
      line: number;
      column: number;
      serial: number;
    }>(),
    [compilerLocations, setCompilerLocations] = useState<
      { file: string; line: number; column: number; message: string }[]
    >([]),
    [history, setHistory] = useState<any[]>([]),
    [editorCommand, setEditorCommand] = useState<{
      id: string;
      serial: number;
    }>();
  const drafts = useRef(new DraftManager(sessionStorage));
  const active = useRef({
    id: project?.id,
    file,
    text,
    saved,
    fileRevision,
    remote,
  });
  active.current = { id: project?.id, file, text, saved, fileRevision, remote };
  const navigation = useRef(0);
  async function upload(kind: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept =
      kind === "asset" ? "image/*,audio/*,.woff,.woff2" : ".tiktokwidget";
    input.onchange = () =>
      task("Import", async () => {
        const f = input.files?.[0];
        if (!f) return;
        if (f.size > 700000)
          throw new Error(
            "Browser uploads are limited to 700 KB; use widgetctl for larger resources.",
          );
        const bytes = new Uint8Array(await f.arrayBuffer());
        let raw = "";
        for (const b of bytes) raw += String.fromCharCode(b);
        const base64 = btoa(raw);
        if (kind === "asset" && project) {
          setProject(
            await call("studio.asset.import", {
              id: project.id,
              file: "assets/" + f.name,
              base64,
              ifRevision: project.revision,
            }),
          );
          setFiles(await call("widgets.files.list", { id: project.id }));
        } else {
          const report = await call("studio.package.import", { base64, kind });
          if (
            await confirmAction(
              "Validated package preview: " +
                JSON.stringify(report) +
                "\nImport this trusted package?",
            )
          ) {
            await call("studio.package.import", {
              base64,
              kind,
              confirm: true,
            });
            await discover();
          }
        }
      });
    input.click();
  }
  async function exportProject() {
    if (!project) return;
    const data = await call<{ base64: string }>("studio.project.export", {
      id: project.id,
    });
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/zip" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = project.id + ".tiktokwidget";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const [narrow, setNarrow] = useState(window.innerWidth < 900);
  useEffect(() => {
    const fn = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  const [fileUndo, setFileUndo] = useState<
    { before: string; after: string; expected: string; undone: boolean }[]
  >([]);
  async function reverseFile(redo = false) {
    if (!project) return;
    const index = redo
      ? fileUndo.findIndex((op) => op.undone)
      : fileUndo.map((op) => op.undone).lastIndexOf(false);
    const op = fileUndo[index];
    if (!op || op.expected !== project.revision)
      throw new Error(
        "External revision changed; use History to compare before restoring.",
      );
    const m = await call<Project>("widgets.rollback", {
      id: project.id,
      revision: redo ? op.after : op.before,
      ifRevision: project.revision,
    });
    ++navigation.current;
    setProject(m);
    setFiles(await call("widgets.files.list", { id: project.id }));
    setFileUndo(
      fileUndo.map((entry, i) => ({
        ...entry,
        expected: m.revision,
        undone: i === index ? !redo : entry.undone,
      })),
    );
    setFile("");
    setText("");
    setSaved("");
  }
  const dirty = text !== saved;
  const [visualDraft, setVisualDraft] = useState<Record<string, unknown>>();
  const [visualPast, setVisualPast] = useState<Record<string, unknown>[]>([]);
  const [visualFuture, setVisualFuture] = useState<Record<string, unknown>[]>(
    [],
  );
  const studioSession = useRef(crypto.randomUUID());
  const visualRevision = useRef("");
  function visualChange(v: Record<string, unknown>, checkpoint = true) {
    if (!visualDraft) visualRevision.current = project?.revision || "";
    if (checkpoint)
      setVisualPast((p) =>
        [...p, visualDraft || project?.settings || {}].slice(-100),
      );
    setVisualFuture([]);
    setVisualDraft(v);
  }
  const [selectedLayer, setSelectedLayer] = useState<string>("");
  const [obsReady, setObsReady] = useState(false);
  useEffect(() => {
    call("obs.status")
      .then(() => setObsReady(true))
      .catch(() => setObsReady(false));
  }, [project?.id]);
  async function addScene() {
    if (!project) return;
    const scenes = await call<any[]>("obs.scenes.list");
    const scene = await ask(
      "Scene name: " +
        scenes.map((s) => (typeof s === "string" ? s : s.name)).join(", "),
      "",
    );
    if (scene && (await confirmAction("Add this widget to " + scene + "?")))
      await call("obs.sources.add", { id: project.id, scene, confirm: true });
  }

  async function task(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      if (["build", "publish"].includes(label)) setCompilerLocations([]);
      setNotice(label + " completed");
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details.locations)) {
        setCompilerLocations(e.details.locations as any);
        const d = e.details.locations[0] as any;
        if (d?.file) {
          try {
            await read(d.file);
            setEditorLocation({
              line: d.line,
              column: d.column,
              serial: Date.now(),
            });
          } catch {
            /* preserve compiler error even if source was removed */
          }
        }
      }
      setNotice(e instanceof ApiError ? e.code + ": " + e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  const discover = async () => {
    const installed = await call<Template[]>("templates.list");
    const latest = new Map<string, Template>();
    for (const t of installed.filter(
      (t) => !t.build || t.build.mode === "static",
    ))
      if (
        !latest.has(t.id) ||
        t.version.localeCompare(latest.get(t.id)!.version, undefined, {
          numeric: true,
        }) > 0
      )
        latest.set(t.id, t);
    setTemplates([...latest.values()]);
    const current = await call<Project[]>("widgets.list");
    setProjects(current);
    if (requestedWidget && !project) {
      const selected = current.find((p) => p.id === requestedWidget);
      if (selected) await open(selected);
    }
  };
  useEffect(() => {
    task("Loading", discover);
  }, []);
  async function open(p: Project) {
    const generation = ++navigation.current;
    setFileUndo([]);
    setVisualDraft(undefined);
    setVisualPast([]);
    setVisualFuture([]);

    const m = await call<Project>("widgets.show", { id: p.id });
    if (generation !== navigation.current) return;
    window.history.replaceState(
      null,
      "",
      location.pathname + "?widget=" + encodeURIComponent(p.id),
    );
    setFile("");
    setText("");
    setSaved("");
    setRemote(undefined);
    setPreview("");
    setProject(m);
    const projectFiles = await call<string[]>("widgets.files.list", {
      id: p.id,
    });
    if (generation !== navigation.current) return;
    setFiles(projectFiles);
    setFile("");
    setText("");
    setSaved("");
    setRemote(undefined);
    setPreview("");
    setNav("My Widgets");
    try {
      const s = await call<{ text: string }>("widgets.files.read", {
        id: p.id,
        file: "schema/settings.schema.json",
      });
      if (generation !== navigation.current) return;
      setSchema(JSON.parse(s.text));
    } catch {
      if (generation !== navigation.current) return;
      setSchema({});
    }
    let lastFile: string | null = null;
    try {
      lastFile = sessionStorage.getItem("studio-active-file:" + p.id);
    } catch {}
    if (lastFile && projectFiles.includes(lastFile)) await read(lastFile, m);
  }
  async function read(f: string, selectedProject = project) {
    if (!selectedProject) return;
    const generation = ++navigation.current;
    const data = await call<{ text: string; revision: string }>(
      "widgets.files.read",
      { id: selectedProject.id, file: f },
    );
    if (generation !== navigation.current) return;
    const draft = drafts.current.open(
      selectedProject.id,
      f,
      data.text,
      data.revision,
    );
    try {
      sessionStorage.setItem("studio-active-file:" + selectedProject.id, f);
    } catch {}
    setFile(f);
    setSaved(draft.base);
    setText(draft.local);
    setFileRevision(draft.revision);
    setRemote(draft.remote);
    setRemoteRevision(draft.remoteRevision || draft.revision);
    setTab("Code");
  }
  useEffect(() => {
    if (project && file)
      drafts.current.edit(project.id, file, {
        base: saved,
        local: text,
        revision: fileRevision,
        remote,
        remoteRevision: project.revision,
      });
  }, [project?.id, file, text, saved, fileRevision, remote]);
  useEffect(() => {
    if (!project) return;
    const controller = new AbortController();
    let cancelled = false,
      pending = false;
    const id = setInterval(async () => {
      if (pending) return;
      pending = true;
      const generation = navigation.current,
        selected = active.current.file;
      try {
        const m = await call<Project>(
          "widgets.show",
          { id: project.id },
          controller.signal,
        );
        const data = selected
          ? await call<{ text: string; revision: string }>(
              "widgets.files.read",
              { id: project.id, file: selected },
              controller.signal,
            )
          : undefined;
        if (
          cancelled ||
          generation !== navigation.current ||
          active.current.id !== project.id
        )
          return;
        if (data) {
          const current = active.current;
          drafts.current.edit(project.id, selected, {
            base: current.saved,
            local: current.text,
            revision: current.fileRevision,
            remote: current.remote,
          });
          const draft = drafts.current.open(
            project.id,
            selected,
            data.text,
            data.revision,
          );
          setSaved(draft.base);
          setText(draft.local);
          setFileRevision(draft.revision);
          setRemote(draft.remote);
          setRemoteRevision(draft.remoteRevision || draft.revision);
        }
        setProject(m);
        const next = await call<string[]>(
          "widgets.files.list",
          { id: project.id },
          controller.signal,
        );
        if (!cancelled) setFiles(next);
      } catch (e) {
        if (!cancelled) setNotice(String(e));
      } finally {
        pending = false;
      }
    }, 2000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [project?.id]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        setTab("Code");
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  async function save() {
    if (!project) return;
    const m = await call<Project>("widgets.files.write", {
      id: project.id,
      file,
      text,
      ifRevision: fileRevision,
    });
    ++navigation.current; // invalidate reads started before this commit
    setProject(m);
    setFileRevision(m.revision);
    setSaved(text);
    setRemote(undefined);
  }
  async function operation(op: string) {
    if (!project) return;
    if (op === "preview") {
      const data = await call<{ url: string }>("widgets.preview", {
        id: project.id,
        event: project.events.includes("gift") ? "gift" : project.events[0],
        user: "Viewer123",
        gift: "Rose",
        count: "23",
      });
      setPreview(data.url);
      return;
    }
    if (op === "history") {
      setHistory(await call("widgets.history", { id: project.id }));
      setTab("History");
      return;
    }
    await call("widgets." + op, {
      id: project.id,
      ifRevision: project.revision,
    });
    ++navigation.current;
    setProject(await call("widgets.show", { id: project.id }));
    if (op === "publish") await operation("preview");
  }
  async function fileOp(op: string) {
    if (!project) return;
    if (dirty)
      throw new Error("Save or discard the editor draft before changing files");
    let target =
      op === "new" ? await ask("New source path", "src/new.js") : file;
    if (!target) return;
    if (
      op === "delete" &&
      !(await confirmAction(
        "Delete " + target + "? A source snapshot is retained.",
      ))
    )
      return;
    const to =
      op === "rename" ? await ask("New source path", target) : undefined;
    if (op === "rename" && !to) return;
    const prior = project.revision;
    const m = await call<Project>(
      op === "new"
        ? "widgets.files.write"
        : "widgets.files." + (op === "delete" ? "remove" : op),
      {
        id: project.id,
        file: target,
        to,
        other: to,
        text: "",
        ifRevision: project.revision,
      },
    );
    await call("widgets.snapshot", { id: project.id, ifRevision: m.revision });
    setFileUndo([
      ...fileUndo
        .filter((op) => !op.undone)
        .map((op) => ({ ...op, expected: m.revision })),
      { before: prior, after: m.revision, expected: m.revision, undone: false },
    ]);
    ++navigation.current;
    setProject(m);
    setFiles(await call("widgets.files.list", { id: project.id }));
    setFile("");
    setText("");
    setSaved("");
  }
  const disabled = busy || (!project ? "Select a widget" : "");
  return (
    <Tooltip.Provider delayDuration={200}>
      <div className="studio">
        <aside className="navigation">
          <h1>Widget Studio</h1>
          <small>LOCAL AUTHORING · v3</small>
          {["Templates", "My Widgets", "Live Events", "Assets", "Settings"].map(
            (item) => (
              <button
                className={nav === item ? "selected" : ""}
                key={item}
                onClick={() => {
                  setNav(item);
                  if (item === "Live Events") setTab("Events");
                }}
              >
                {item}
              </button>
            ),
          )}
          <p>One project. Stable OBS source. Isolated previews.</p>
        </aside>
        <main>
          <header>
            <div>
              <strong>
                {(project?.settings.name as string) ||
                  "Create your next widget"}
              </strong>
              <small>
                {project
                  ? project.template.id + " / " + project.id.slice(0, 8)
                  : "Templates / Gallery"}
              </small>
            </div>
            <div className="toolbar">
              <Action
                id="undo"
                disabledReason={
                  tab !== "Code" && !fileUndo.length
                    ? "Open Code editor or perform a file operation"
                    : ""
                }
                onClick={() =>
                  fileUndo.length && !file
                    ? task("Undo file operation", () => reverseFile(false))
                    : setEditorCommand({ id: "undo", serial: Date.now() })
                }
              />
              <Action
                id="redo"
                disabledReason={
                  tab !== "Code" && !fileUndo.length
                    ? "Open Code editor or perform a file operation"
                    : ""
                }
                onClick={() =>
                  fileUndo.length && !file
                    ? task("Redo file operation", () => reverseFile(true))
                    : setEditorCommand({ id: "redo", serial: Date.now() })
                }
              />
              {["validate", "build", "publish", "preview", "history"].map(
                (id) => (
                  <Action
                    key={id}
                    id={id}
                    primary={["build", "publish"].includes(id)}
                    disabledReason={
                      disabled ||
                      (["build", "publish", "validate"].includes(id) &&
                      (dirty || visualDraft)
                        ? "Save author drafts first; Preview is isolated"
                        : "")
                    }
                    onClick={() => task(id, () => operation(id))}
                  />
                ),
              )}
              <Action
                id="scene"
                disabledReason={
                  !obsReady ? "OBS IPC is offline or disabled" : disabled
                }
                onClick={() => task("Add to scene", addScene)}
              />
              <Action
                id="export"
                disabledReason={disabled}
                onClick={() => task("Export", exportProject)}
              />
              <Action
                id="import"
                onClick={() => upload(project ? "project" : "template")}
              />
              <Action
                id="help"
                onClick={() =>
                  setNotice(
                    "Author files live in projects/<uuid>/src. Build creates a candidate; Publish changes production. See docs/WIDGETCTL.md. Templates are trusted code.",
                  )
                }
              />
            </div>
          </header>
          <div className="status" role="status">
            {busy ? busy + "…" : notice || "Ready"}
            {project && (
              <span>
                {dirty ? " · Unsaved draft" : " · Source saved"} ·{" "}
                {project.autoPublish
                  ? "Auto-publish enabled"
                  : "Explicit publish"}
                {project.build?.mode === "vite"
                  ? " · Requires opt-in Node toolchain"
                  : ""}
              </span>
            )}
          </div>
          {((nav === "Templates" || nav === "My Widgets") && !project) ||
          nav === "Templates" ? (
            <section className="gallery">
              <h2>{nav}</h2>
              <input
                aria-label="Search templates"
                placeholder="Search templates and categories"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="cards">
                {(nav === "Templates" ? templates : projects)
                  .filter((t: any) =>
                    JSON.stringify(t)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((t: any) => (
                    <article key={t.id + (t.version || "")}>
                      <div className="thumbnail">
                        {t.thumbnail ? (
                          <img
                            src={
                              "/template/" +
                              t.id +
                              "/" +
                              t.version +
                              "/" +
                              t.thumbnail
                            }
                            alt={t.name}
                          />
                        ) : (
                          <span>✦</span>
                        )}
                      </div>
                      <h3>{t.name || t.settings.name}</h3>
                      <p>{t.description || t.template.id}</p>
                      <span className="badge">
                        {t.build?.framework === "react"
                          ? "React"
                          : t.build?.mode === "vite"
                            ? "TS"
                            : "Vanilla"}
                      </span>
                      <span className="badge">{t.category || "Widget"}</span>
                      <small>
                        {t.build?.mode === "vite"
                          ? "Optional pinned Node toolchain; offline after installation"
                          : "No build dependencies"}
                      </small>
                      <button
                        onClick={() =>
                          task("Open", async () => {
                            const p =
                              nav === "Templates"
                                ? await call<Project>("widgets.create", {
                                    template: t.id,
                                    version: t.version,
                                    name: t.name,
                                  })
                                : t;
                            await open(p);
                          })
                        }
                      >
                        {nav === "Templates" ? "Use template" : "Open widget"}
                      </button>
                      {nav === "My Widgets" && (
                        <Action
                          id="duplicate"
                          onClick={() =>
                            task("Duplicate", async () => {
                              await call("widgets.duplicate", {
                                id: t.id,
                                ifRevision: t.revision,
                              });
                              await discover();
                            })
                          }
                        />
                      )}
                    </article>
                  ))}
              </div>
              <p>
                Package install/import/export is available through widgetctl
                with preview and confirmation.
              </p>
            </section>
          ) : !project ? (
            <section>
              <h2>{nav}</h2>
              <p>
                Select a widget in My Widgets to inspect its {nav.toLowerCase()}
                .
              </p>
              <button onClick={() => setNav("My Widgets")}>My Widgets</button>
            </section>
          ) : (
            <>
              <nav className="tabs">
                {["Design", "Code", "Events", "History"].map((t) => (
                  <button
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() =>
                      t === "History"
                        ? task("History", () => operation("history"))
                        : setTab(t)
                    }
                  >
                    {t}
                  </button>
                ))}
                <select
                  aria-label="Preview viewport"
                  value={viewport}
                  onChange={(e) => setViewport(e.target.value)}
                >
                  {["600×400", "1280×720", "400×700"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setProject(undefined);
                    task("Discover", discover);
                  }}
                >
                  All widgets
                </button>
              </nav>
              <PanelGroup
                direction={narrow ? "vertical" : "horizontal"}
                className="workspace"
              >
                <Panel defaultSize={20} minSize={12}>
                  <section className="file-panel">
                    <h2>Project files</h2>
                    <div className="toolbar">
                      <Action
                        id="new-file"
                        onClick={() => task("New file", () => fileOp("new"))}
                      />
                      <Action
                        id="rename-file"
                        disabledReason={!file ? "Select a file" : ""}
                        onClick={() => task("Rename", () => fileOp("rename"))}
                      />
                      <Action
                        id="delete-file"
                        disabledReason={!file ? "Select a file" : ""}
                        onClick={() =>
                          task("Delete file", () => fileOp("delete"))
                        }
                      />
                    </div>
                    {files
                      .filter((f) =>
                        f.startsWith(nav === "Assets" ? "assets/" : "src/"),
                      )
                      .map((f) => (
                        <button
                          className={f === file ? "selected" : ""}
                          key={f}
                          disabled={!!busy}
                          onClick={() => task("Read", () => read(f))}
                        >
                          {f}
                        </button>
                      ))}
                    <h2>Layers</h2>
                    <Layers
                      components={schema["x-visual"]?.components || []}
                      selected={selectedLayer}
                      onSelect={(id) => {
                        setSelectedLayer(id);
                        setTab("Design");
                      }}
                    />
                    {nav === "Assets" && (
                      <button onClick={() => upload("asset")}>
                        Import asset
                      </button>
                    )}
                    <p>
                      {schema["x-visual"]
                        ? "Declared visual components"
                        : "This template has no visual component schema. Source structure is edited in Code."}
                    </p>
                    <label>
                      <input
                        type="checkbox"
                        checked={project.autoPublish}
                        onChange={(e) =>
                          task("Preference", async () => {
                            setProject(
                              await call("widgets.project.set", {
                                id: project.id,
                                settings: { autoPublish: e.target.checked },
                                ifRevision: project.revision,
                              }),
                            );
                          })
                        }
                      />
                      Auto-publish saved source
                    </label>
                  </section>
                </Panel>
                <PanelResizeHandle
                  className="resize"
                  style={narrow ? { height: 5, width: "100%" } : undefined}
                />
                <Panel defaultSize={55} minSize={25}>
                  <section className="center">
                    {tab === "Code" ? (
                      <>
                        <div className="code-bar">
                          <span>{file || "Choose a source file"}</span>
                          <button
                            disabled={!dirty || !!busy || !file}
                            onClick={() => task("Save source", save)}
                          >
                            Save source
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
                            <strong>
                              External change detected. Draft retained.
                            </strong>
                            <details>
                              <summary>Compare base / local / remote</summary>
                              <h3>Base</h3>
                              <pre>{saved}</pre>
                              <h3>Local draft</h3>
                              <pre>{text}</pre>
                              <h3>Remote</h3>
                              <pre>{remote}</pre>
                            </details>
                            <button
                              onClick={async () => {
                                if (
                                  await confirmAction(
                                    "Discard draft and reload saved version?",
                                  )
                                ) {
                                  setText(remote);
                                  setSaved(remote);
                                  ++navigation.current;
                                  setFileRevision(remoteRevision);
                                  setRemote(undefined);
                                }
                              }}
                            >
                              Reload saved version
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
                              Keep draft for manual merge
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
                              Merge non-overlapping changes
                            </button>
                          </div>
                        )}
                        {file && (
                          <Suspense fallback={<p>Loading syntax editor…</p>}>
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
                    ) : tab === "History" ? (
                      <>
                        <h2>Revision history</h2>
                        {history.map((h: any) => (
                          <div key={h.revision}>
                            <code>{h.revision}</code>
                            <button
                              onClick={() =>
                                task("Rollback", async () => {
                                  if (
                                    await confirmAction(
                                      "Restore this source revision? Publish separately to apply it.",
                                    )
                                  ) {
                                    setProject(
                                      await call("widgets.rollback", {
                                        id: project.id,
                                        revision: h.revision,
                                        ifRevision: project.revision,
                                      }),
                                    );
                                    setText("");
                                    setSaved("");
                                    setFile("");
                                  }
                                })
                              }
                            >
                              Restore source
                            </button>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {tab === "Design" && (
                          <div className="canvas-tools">
                            <button
                              disabled={!visualPast.length}
                              onClick={() => {
                                const previous =
                                  visualPast[visualPast.length - 1]!;
                                setVisualFuture((f) => [
                                  visualDraft || project.settings,
                                  ...f,
                                ]);
                                setVisualPast((p) => p.slice(0, -1));
                                setVisualDraft(previous);
                              }}
                            >
                              Undo design
                            </button>
                            <button
                              disabled={!visualFuture.length}
                              onClick={() => {
                                setVisualPast((p) => [
                                  ...p,
                                  visualDraft || project.settings,
                                ]);
                                setVisualDraft(visualFuture[0]);
                                setVisualFuture((f) => f.slice(1));
                              }}
                            >
                              Redo design
                            </button>
                            <button
                              disabled={!visualDraft}
                              onClick={() =>
                                task("Save design", async () => {
                                  const m = await call<Project>(
                                    "widgets.settings.set",
                                    {
                                      id: project.id,
                                      settings: Object.fromEntries(
                                        Object.entries(
                                          visualDraft || {},
                                        ).filter(
                                          ([key]) =>
                                            key in (schema.properties || {}) &&
                                            ![
                                              "id",
                                              "template",
                                              "editableHtml",
                                              "customHtml",
                                            ].includes(key),
                                        ),
                                      ),
                                      ifRevision: visualRevision.current,
                                    },
                                  );
                                  ++navigation.current;
                                  setProject(m);
                                  setVisualDraft(undefined);
                                })
                              }
                            >
                              Save design
                            </button>
                          </div>
                        )}
                        <p>
                          {tab === "Events"
                            ? "Isolated fixtures · Viewer123 sends Rose ×23"
                            : "Published renderer preview · no DOM-to-source rewriting"}
                        </p>
                        {project.events.length === 0 ? (
                          <p role="alert">
                            Unsupported event combination: this template
                            declares no event handlers.
                          </p>
                        ) : preview ? (
                          tab === "Design" ? (
                            <Canvas
                              preview={preview}
                              viewport={viewport}
                              components={schema["x-visual"]?.components || []}
                              selected={selectedLayer}
                              onSelect={setSelectedLayer}
                              settings={visualDraft || project.settings}
                              onChange={visualChange}
                              session={studioSession.current}
                            />
                          ) : (
                            <iframe
                              title="Isolated widget preview"
                              sandbox="allow-scripts allow-same-origin"
                              src={
                                preview +
                                (tab === "Design" ? "&studio=design" : "")
                              }
                              style={{
                                width: Math.min(
                                  Number(viewport.split("×")[0]),
                                  900,
                                ),
                                height: Number(viewport.split("×")[1]),
                              }}
                            />
                          )
                        ) : (
                          <div className="empty-preview">
                            <h2>Preview the published build</h2>
                            <p>
                              Build validates a candidate. Publish applies it to
                              OBS. Author templates are trusted code.
                            </p>
                            <button
                              onClick={() =>
                                task("Preview", () => operation("preview"))
                              }
                            >
                              Open isolated preview
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </Panel>
                <PanelResizeHandle
                  className="resize"
                  style={narrow ? { height: 5, width: "100%" } : undefined}
                />
                <Panel defaultSize={25} minSize={16}>
                  <section className="inspector">
                    <Inspector
                      key={project.id}
                      revision={project.revision}
                      schema={
                        selectedLayer && schema["x-visual"]
                          ? {
                              ...schema,
                              properties: Object.fromEntries(
                                Object.entries(schema.properties || {}).filter(
                                  ([key]) =>
                                    schema["x-visual"].components
                                      .find((c: any) => c.id === selectedLayer)
                                      ?.properties.includes(key),
                                ),
                              ),
                            }
                          : schema
                      }
                      settings={visualDraft || project.settings}
                      onDraft={(v) => visualChange(v)}
                      onTestAudio={async (path) => {
                        const outer = document.querySelector<HTMLIFrameElement>(
                          'iframe[title="Isolated widget preview"]',
                        );
                        const inner =
                          outer?.contentDocument?.querySelector<HTMLIFrameElement>(
                            "#preview",
                          );
                        const url = new URL(
                          path,
                          inner?.contentWindow?.location.href || location.href,
                        );
                        if (
                          !path ||
                          url.origin !== location.origin ||
                          !["http:", "https:"].includes(url.protocol)
                        )
                          throw new Error(
                            "Preview a published local audio asset first.",
                          );
                        await new Audio(url.href).play();
                      }}
                      assets={files
                        .filter((f) => f.startsWith("assets/"))
                        .map(
                          (f) =>
                            "../".repeat(
                              (project.entry || "src/index.html").split("/")
                                .length - 1,
                            ) + f,
                        )}
                      onSave={async (settings, revision) => {
                        const m = await call<Project>("widgets.settings.set", {
                          id: project.id,
                          settings,
                          ifRevision: revision,
                        });
                        ++navigation.current;
                        setProject(m);
                        setVisualDraft(undefined);
                        setNotice(
                          "Appearance saved; publish to update production.",
                        );
                      }}
                    />
                  </section>
                </Panel>
              </PanelGroup>
            </>
          )}
        </main>
      </div>
    </Tooltip.Provider>
  );
}
