import {
  Play,
  Plus,
  Undo2,
  Redo2,
  Save,
  Copy,
  Trash2,
  Layers,
  SlidersHorizontal,
  LockKeyhole,
  EyeOff,
} from "lucide-react";
import { IconButton } from "../components/Action";
import { fixture, dispatchLocal } from "../../playground/engine";
import { useEffect, useRef, useState } from "react";
import { CompositionRuntime } from "../../renderer/app/CompositionRuntime.js";
import { builtinRegistry } from "../../renderer/app/builtins.js";
import {
  type Composition,
  type WidgetInstance,
  emptyComposition,
} from "../../renderer/app/composition.js";
import { call, type Project } from "../api/client";
import { t } from "../../shared/i18n";
import type { StudioController } from "./useStudioProject";

// Selection is local UI state; author data and undo checkpoints belong to the
// existing project controller. The canvas never reverse-engineers rendered DOM.
export function CompositionEditor({
  controller: c,
}: {
  controller: StudioController;
}) {
  const { project } = c;
  const [selected, select] = useState("");
  const [template, setTemplate] = useState("builtin.chat");
  const stage = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 720, height: 400 });
  useEffect(() => {
    const node = surface.current;
    if (!node) return;
    const measure = () => {
      if (node.clientWidth > 0 && node.clientHeight > 0)
        setAvailable((previous) =>
          previous.width === node.clientWidth &&
          previous.height === node.clientHeight
            ? previous
            : { width: node.clientWidth, height: node.clientHeight },
        );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [project?.id]);
  const runtime = useRef<CompositionRuntime | null>(null);
  const channel = useRef(new EventTarget());
  const settings = c.visualDraft || project?.settings || {};
  const composition = (settings.composition ||
    emptyComposition()) as Composition;
  const latestComposition = useRef(composition);
  latestComposition.current = composition;
  const chosen = composition.widgets.find((w) => w.id === selected);
  const templateName = (id: string) =>
    t(c.templates.find((item) => item.id === id)?.name || id);
  const scale = Math.min(
    1,
    available.width / composition.viewport.width,
    available.height / composition.viewport.height,
  );
  useEffect(() => {
    if (!stage.current) return;
    const renderer = new CompositionRuntime(stage.current, builtinRegistry(), {
      target: channel.current,
      preview: true,
    });
    runtime.current = renderer;
    return () => {
      renderer.destroy();
      runtime.current = null;
    };
  }, [project?.id]);
  useEffect(() => {
    runtime.current
      ?.load(composition)
      .catch((error) => c.setNotice(String(error)));
  }, [composition]);
  if (!project) return null;
  const change = (next: Composition, checkpoint = true) =>
    c.visualChange({ ...settings, composition: next }, checkpoint);
  const update = (patch: Partial<WidgetInstance>, checkpoint = true) =>
    change(
      {
        ...composition,
        widgets: composition.widgets.map((w) =>
          w.id === selected ? { ...w, ...patch } : w,
        ),
      },
      checkpoint,
    );
  const remove = () => {
    if (chosen && !chosen.locked) {
      change({
        ...composition,
        widgets: composition.widgets.filter((w) => w.id !== selected),
      });
      select("");
    }
  };
  return (
    <section className="composition-editor">
      <div className="canvas-tools">
        <IconButton
          onClick={() => {
            for (const type of ["chat", "gift", "follow", "like", "roomUser"])
              dispatchLocal(channel.current, fixture({ type }));
          }}
          title={
            t("Simulate composition") +
            " · " +
            t("Simulation stays in this canvas")
          }
          label={t("Simulate composition")}
          icon={Play}
          showLabel
        />
        <select
          aria-label={t("Widget template")}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
        >
          {[
            "builtin.chat",
            "builtin.gift-alert",
            "builtin.follow-alert",
            "builtin.likes",
            "builtin.viewers",
            "builtin.events",
            "builtin.custom",
          ].map((id) => (
            <option key={id} value={id}>
              {templateName(id)}
            </option>
          ))}
        </select>
        <IconButton
          onClick={() => {
            const id = crypto.randomUUID();
            change({
              ...composition,
              widgets: [
                ...composition.widgets,
                {
                  id,
                  template: { id: template, version: "2.0.0" },
                  enabled: true,
                  locked: false,
                  visible: true,
                  transform: {
                    x: 30,
                    y: 30,
                    width: 450,
                    height: 300,
                    rotation: 0,
                    opacity: 1,
                  },
                  zIndex: Math.min(
                    32768,
                    Math.max(0, ...composition.widgets.map((w) => w.zIndex)) +
                      1,
                  ),
                  settings: {},
                },
              ],
            });
            select(id);
          }}
          label={t("Add widget")}
          icon={Plus}
          showLabel
        />
        <IconButton
          disabled={!c.visualPast.length}
          onClick={() => {
            c.setVisualFuture((f) => [settings, ...f]);
            c.setVisualDraft(c.visualPast[c.visualPast.length - 1]);
            c.setVisualPast((p) => p.slice(0, -1));
          }}
          label={t("Undo design")}
          icon={Undo2}
        />
        <IconButton
          disabled={!c.visualFuture.length}
          onClick={() => {
            c.setVisualPast((p) => [...p, settings]);
            c.setVisualDraft(c.visualFuture[0]);
            c.setVisualFuture((f) => f.slice(1));
          }}
          label={t("Redo design")}
          icon={Redo2}
        />
        <IconButton
          disabled={!c.visualDraft || !!c.busy}
          onClick={() =>
            c.task("Save design", async () => {
              const id = project.id,
                generation = c.navigation.current;
              const saved = await call<Project>("widgets.settings.set", {
                id,
                settings: { composition },
                ifRevision: c.visualRevision.current,
              });
              if (generation !== c.navigation.current) return;
              ++c.navigation.current;
              c.setProject(saved);
              c.visualRevision.current = saved.revision;
              if (latestComposition.current === composition)
                c.setVisualDraft(undefined);
            })
          }
          title={
            t("Save design") +
            " · " +
            t("Save design, then Publish to update OBS.")
          }
          label={t("Save design")}
          icon={Save}
          showLabel
        />
      </div>
      <div className="composition-panel-bar">
        <div
          className="composition-panel-tabs"
          role="group"
          aria-label={t("Workspace panels")}
        >
          {[
            ["Preview", "Canvas"],
            ["Files", "Layers"],
            ["Inspector", "Inspector"],
          ].map(([id, label]) => (
            <button
              key={id}
              aria-pressed={c.mobilePanel === id}
              onClick={() => c.setMobilePanel(id)}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <div className="composition-layout">
        <aside className="composition-layers" aria-label={t("Layers")}>
          <h2>
            <Layers size={16} aria-hidden="true" />
            {t("Layers")}
          </h2>
          <button aria-pressed={!selected} onClick={() => select("")}>
            {t("Canvas")}
          </button>
          {[...composition.widgets]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((w) => (
              <button
                key={w.id}
                aria-pressed={selected === w.id}
                title={[
                  w.name || templateName(w.template.id),
                  w.locked ? t("Locked") : "",
                  !w.visible ? t("Hidden") : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onClick={() => select(w.id)}
              >
                {w.name || templateName(w.template.id)}
                {w.locked && <LockKeyhole size={14} aria-hidden="true" />}
                {!w.visible && <EyeOff size={14} aria-hidden="true" />}
              </button>
            ))}
        </aside>
        <div
          className="composition-scroll"
          ref={surface}
          tabIndex={0}
          aria-label={t("Composition canvas")}
          onPointerDown={(e) => {
            if (!(e.target as HTMLElement).closest(".composition-hit"))
              select("");
          }}
          onKeyDown={(e) => {
            if (!chosen || chosen.locked || e.target !== e.currentTarget)
              return;
            if (e.key === "Delete") {
              e.preventDefault();
              remove();
            }
            const offsets: Record<string, [number, number]> = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            };
            const offset = offsets[e.key];
            if (offset) {
              e.preventDefault();
              update({
                transform: {
                  ...chosen.transform,
                  x: chosen.transform.x + offset[0] * (e.shiftKey ? 10 : 1),
                  y: chosen.transform.y + offset[1] * (e.shiftKey ? 10 : 1),
                },
              });
            }
          }}
        >
          {!composition.widgets.length && (
            <p className="composition-empty">
              {t("Choose a template and select Add widget to start.")}
            </p>
          )}
          <div
            className="composition-artboard"
            style={{
              width: composition.viewport.width * scale,
              height: composition.viewport.height * scale,
              position: "relative",
            }}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                position: "absolute",
              }}
            >
              <div ref={stage} />
            </div>
            {composition.widgets
              .filter((w) => w.visible && w.enabled)
              .map((w) => (
                <div
                  key={w.id}
                  className="composition-hit"
                  data-selected={selected === w.id}
                  style={{
                    left: w.transform.x * scale,
                    top: w.transform.y * scale,
                    width: w.transform.width * scale,
                    height: w.transform.height * scale,
                    transform: `rotate(${w.transform.rotation}deg)`,
                    zIndex: w.zIndex,
                  }}
                  onPointerDown={(e) => {
                    select(w.id);
                    if (w.locked) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const startX = e.clientX,
                      startY = e.clientY,
                      element = e.currentTarget;
                    let first = true;
                    const move = (event: PointerEvent) => {
                      change(
                        {
                          ...composition,
                          widgets: composition.widgets.map((item) =>
                            item.id === w.id
                              ? {
                                  ...item,
                                  transform: {
                                    ...w.transform,
                                    x:
                                      Math.round(
                                        (w.transform.x +
                                          (event.clientX - startX) / scale) /
                                          5,
                                      ) * 5,
                                    y:
                                      Math.round(
                                        (w.transform.y +
                                          (event.clientY - startY) / scale) /
                                          5,
                                      ) * 5,
                                  },
                                }
                              : item,
                          ),
                        },
                        first,
                      );
                      first = false;
                    };
                    const end = () => {
                      element.removeEventListener("pointermove", move);
                      element.removeEventListener("pointerup", end);
                      element.removeEventListener("pointercancel", end);
                    };
                    element.addEventListener("pointermove", move);
                    element.addEventListener("pointerup", end);
                    element.addEventListener("pointercancel", end);
                  }}
                />
              ))}
          </div>
        </div>
        <aside className="composition-inspector" aria-label={t("Inspector")}>
          <h2>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t("Inspector")}
          </h2>
          {!chosen && (
            <div className="composition-geometry">
              {(["width", "height"] as const).map((key) => (
                <label key={key}>
                  {t(key === "width" ? "Canvas width" : "Canvas height")}
                  <input
                    type="number"
                    min={1}
                    max={8192}
                    value={composition.viewport[key]}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (
                        Number.isInteger(value) &&
                        value >= 1 &&
                        value <= 8192
                      )
                        change({
                          ...composition,
                          viewport: { ...composition.viewport, [key]: value },
                        });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          {chosen && (
            <>
              <label>
                {t("Name")}
                <input
                  value={chosen.name || ""}
                  onChange={(e) =>
                    update({ name: e.target.value || chosen.template.id })
                  }
                />
              </label>
              <div className="composition-geometry">
                {(
                  ["x", "y", "width", "height", "rotation", "opacity"] as const
                ).map((key) => (
                  <label key={key}>
                    {t(key)}
                    <input
                      type="number"
                      disabled={chosen.locked}
                      value={chosen.transform[key]}
                      step={key === "opacity" ? 0.1 : 1}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (Number.isFinite(value))
                          update({
                            transform: { ...chosen.transform, [key]: value },
                          });
                      }}
                    />
                  </label>
                ))}
              </div>
              <label>
                {t("Layer order")}
                <input
                  type="number"
                  value={chosen.zIndex}
                  onChange={(e) => update({ zIndex: Number(e.target.value) })}
                />
              </label>
              <label className="composition-toggle">
                <input
                  type="checkbox"
                  checked={chosen.visible}
                  onChange={(e) => update({ visible: e.target.checked })}
                />
                {t("Visible")}
              </label>
              <label className="composition-toggle">
                <input
                  type="checkbox"
                  checked={chosen.locked}
                  onChange={(e) => update({ locked: e.target.checked })}
                />
                {t("Locked")}
              </label>
              <label>
                {t("Accent color")}
                <input
                  type="color"
                  value={String(chosen.settings.color || "#ff416c")}
                  onChange={(e) =>
                    update({
                      settings: { ...chosen.settings, color: e.target.value },
                    })
                  }
                />
              </label>
              <IconButton
                onClick={() => {
                  const id = crypto.randomUUID();
                  change({
                    ...composition,
                    widgets: [
                      ...composition.widgets,
                      {
                        ...chosen,
                        id,
                        transform: {
                          ...chosen.transform,
                          x: chosen.transform.x + 20,
                          y: chosen.transform.y + 20,
                        },
                      },
                    ],
                  });
                  select(id);
                }}
                label={t("Duplicate")}
                icon={Copy}
                showLabel
              />
              <IconButton
                disabled={chosen.locked}
                onClick={remove}
                label={t("Delete")}
                icon={Trash2}
                showLabel
                danger
              />
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
