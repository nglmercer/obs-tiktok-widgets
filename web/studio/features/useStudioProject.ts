import {
  getLocale,
  getTheme,
  setLocale,
  setTheme,
  subscribe,
  type Locale,
  type Theme,
  t as tr,
} from "../../shared/i18n";

import { ask, confirmAction } from "../components/Dialog";

import { DraftManager } from "./drafts";
import { useEffect, useState, useRef } from "react";

import {
  call,
  ApiError,
  requestedWidget,
  type Project,
  type Template,
} from "../api/client";

import { usePreferences } from "../components/Preferences";
function previewEvent(events: string[]) {
  const types = events
    .map((type) => (type.startsWith("tiktok.") ? type.slice(7) : type))
    .map((type) => (type === "room_stats" ? "roomUser" : type));
  return types.includes("gift")
    ? "gift"
    : types.find((type) =>
        ["chat", "like", "follow", "roomUser"].includes(type),
      );
}

export function useStudioProject() {
  usePreferences();
  useEffect(() => {
    let closed = false,
      applying = false,
      pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const preferences = await call<{ locale: Locale; theme: Theme }>(
          "studio.preferences.get",
        );
        if (closed) return;
        applying = true;
        if (
          ["en", "es"].includes(preferences.locale) &&
          preferences.locale !== getLocale()
        )
          setLocale(preferences.locale);
        if (
          ["dark", "light", "system"].includes(preferences.theme) &&
          preferences.theme !== getTheme()
        )
          setTheme(preferences.theme);
      } catch {
        /* Browser-only preferences remain available if the adapter cannot save. */
      } finally {
        applying = false;
        pending = false;
      }
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    const unsubscribe = subscribe(() => {
      if (!applying && !closed)
        call("studio.preferences.set", {
          locale: getLocale(),
          theme: getTheme(),
        }).catch((e) => {
          if (!closed) setNotice(e instanceof Error ? e.message : String(e));
        });
    });
    return () => {
      closed = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  const [mobilePanel, setMobilePanel] = useState("Preview");
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
              tr(
                "Validated package preview: {report}\nImport this trusted package?",
                { report: JSON.stringify(report) },
              ),
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
      tr("Scene name: {scenes}", {
        scenes: scenes
          .map((s) => (typeof s === "string" ? s : s.name))
          .join(", "),
      }),
      "",
    );
    if (
      scene &&
      (await confirmAction(tr("Add this widget to {scene}?", { scene })))
    )
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
      setNotice(
        e instanceof ApiError
          ? e.code + ": " + tr(e.message)
          : tr(e instanceof Error ? e.message : String(e)),
      );
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
    try {
      const result = await call<{ url: string }>("widgets.preview", {
        id: p.id,
        event: previewEvent(p.events),
        user: "Viewer123",
        gift: "Rose",
        count: "23",
      });
      if (generation === navigation.current) setPreview(result.url);
    } catch {
      /* No published release: leave explicit publish/preview flow intact. */
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
        event: previewEvent(project.events),
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
        tr("Delete {file}? A source snapshot is retained.", { file: target }),
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
  return {
    mobilePanel,
    setMobilePanel,
    nav,
    setNav,
    templates,
    setTemplates,
    projects,
    setProjects,
    search,
    setSearch,
    project,
    setProject,
    files,
    setFiles,
    file,
    setFile,
    text,
    setText,
    saved,
    setSaved,
    fileRevision,
    setFileRevision,
    remote,
    setRemote,
    remoteRevision,
    setRemoteRevision,
    tab,
    setTab,
    schema,
    setSchema,
    preview,
    setPreview,
    viewport,
    setViewport,
    busy,
    setBusy,
    notice,
    setNotice,
    editorLocation,
    setEditorLocation,
    compilerLocations,
    setCompilerLocations,
    history,
    setHistory,
    editorCommand,
    setEditorCommand,
    drafts,
    active,
    navigation,
    upload,
    exportProject,
    fileUndo,
    setFileUndo,
    reverseFile,
    dirty,
    visualDraft,
    setVisualDraft,
    visualPast,
    setVisualPast,
    visualFuture,
    setVisualFuture,
    studioSession,
    visualRevision,
    visualChange,
    selectedLayer,
    setSelectedLayer,
    obsReady,
    setObsReady,
    addScene,
    task,
    discover,
    open,
    read,
    save,
    operation,
    fileOp,
    disabled,
  };
}
export type StudioController = ReturnType<typeof useStudioProject>;
