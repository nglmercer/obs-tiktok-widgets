import { useRef, useState, useEffect } from "react";
export interface VisualComponent {
  id: string;
  label: string;
  parent?: string;
  properties: string[];
  bindings?: { x: string; y: string; width: string; height: string };
}
export function Canvas({
  preview,
  viewport,
  components,
  selected,
  onSelect,
  settings,
  onChange,
  session,
}: {
  preview: string;
  viewport: string;
  components: VisualComponent[];
  selected: string;
  onSelect: (id: string) => void;
  settings: Record<string, unknown>;
  onChange: (v: Record<string, unknown>, checkpoint?: boolean) => void;
  session: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(1),
    [snap, setSnap] = useState(true);
  const [width, height] = viewport.split("×").map(Number);
  const send = () =>
    frame.current?.contentWindow?.postMessage(
      {
        channel: "tiktok-studio-draft",
        version: 1,
        session,
        config: Object.fromEntries(
          Object.entries(settings).filter(
            ([k, v]) =>
              !/secret|token|cookie|session|credential|password|signing|__proto__|constructor|prototype|customHtml|editableHtml|^id$|^template$/i.test(
                k,
              ) &&
              (["string", "number", "boolean"].includes(typeof v) ||
                Array.isArray(v)),
          ),
        ),
      },
      location.origin,
    );
  useEffect(() => {
    send();
    const timer = setInterval(send, 750);
    return () => clearInterval(timer);
  }, [settings, session]);
  const gesture = useRef<
    | {
        x: number;
        y: number;
        values: Record<string, unknown>;
        bindings: NonNullable<VisualComponent["bindings"]>;
        resize: boolean;
      }
    | undefined
  >(undefined);
  const change = (x: number, y: number) => {
    const g = gesture.current;
    if (!g) return;
    const quant = (n: number) => (snap ? Math.round(n / 8) * 8 : Math.round(n));
    const dx = (x - g.x) / zoom,
      dy = (y - g.y) / zoom;
    onChange(
      {
        ...g.values,
        [g.resize ? g.bindings.width : g.bindings.x]: Math.max(
          g.resize ? 16 : 0,
          quant(
            Number(g.values[g.resize ? g.bindings.width : g.bindings.x] || 0) +
              dx,
          ),
        ),
        [g.resize ? g.bindings.height : g.bindings.y]: Math.max(
          g.resize ? 16 : 0,
          quant(
            Number(g.values[g.resize ? g.bindings.height : g.bindings.y] || 0) +
              dy,
          ),
        ),
      },
      false,
    );
  };
  return (
    <>
      <div className="canvas-tools">
        <label>
          Zoom{" "}
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.5, 0.75, 1, 1.5].map((n) => (
              <option key={n} value={n}>
                {n * 100}%
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap}
            onChange={(e) => setSnap(e.target.checked)}
          />{" "}
          Snap to 8px grid
        </label>
      </div>
      <div className="canvas-scroll">
        <div
          className="visual-canvas"
          style={{ width: width * zoom, height: height * zoom }}
        >
          <div
            style={{
              width,
              height,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              position: "relative",
            }}
          >
            <iframe
              ref={frame}
              title="Isolated widget preview"
              sandbox="allow-scripts allow-same-origin"
              src={preview + "&studio=design&studioSession=" + session}
              onLoad={send}
              style={{ width, height, border: 0 }}
            />
            {components
              .filter((c) => c.bindings)
              .map((c) => {
                const b = c.bindings!;
                return (
                  <div
                    key={c.id}
                    role="button"
                    aria-label={`Select ${c.label}`}
                    tabIndex={0}
                    className={
                      "visual-component " +
                      (selected === c.id ? "selected" : "")
                    }
                    style={{
                      left: Number(settings[b.x] || 0),
                      top: Number(settings[b.y] || 0),
                      width: Number(settings[b.width] || 240),
                      height: Number(settings[b.height] || 120),
                    }}
                    onFocus={() => onSelect(c.id)}
                    onKeyDown={(e) => {
                      const delta = e.shiftKey ? 8 : 1;
                      const axis =
                        e.key === "ArrowLeft" || e.key === "ArrowRight"
                          ? b.x
                          : b.y;
                      const direction =
                        e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
                      if (e.key.startsWith("Arrow")) {
                        e.preventDefault();
                        onChange({
                          ...settings,
                          [axis]: Math.max(
                            0,
                            Number(settings[axis] || 0) + delta * direction,
                          ),
                        });
                      }
                    }}
                    onPointerDown={(e) => {
                      onSelect(c.id);
                      e.currentTarget.setPointerCapture(e.pointerId);
                      gesture.current = {
                        x: e.clientX,
                        y: e.clientY,
                        values: { ...settings },
                        bindings: b,
                        resize:
                          (e.target as HTMLElement).dataset.resize === "true",
                      };
                    }}
                    onPointerMove={(e) => {
                      if (e.currentTarget.hasPointerCapture(e.pointerId))
                        change(e.clientX, e.clientY);
                    }}
                    onPointerUp={(e) => {
                      gesture.current = undefined;
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }}
                    onPointerCancel={() => {
                      gesture.current = undefined;
                    }}
                  >
                    <span>{c.label}</span>
                    <button
                      type="button"
                      data-resize="true"
                      aria-label={`Resize ${c.label}`}
                      className="resize-handle"
                    />
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      {!components.some((c) => c.bindings) && (
        <p>
          This template has no declared position/size bindings. Edit its source
          in Code mode.
        </p>
      )}
    </>
  );
}
