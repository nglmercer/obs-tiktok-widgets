import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../../shared/i18n";

/** Static catalog artwork: hovering never executes template code or creates a project. */
export function TemplatePreview({ src, name }: { src: string; name: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
  }>();
  function show() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(420, innerWidth - 24);
    const height = Math.min(260, innerHeight - 24);
    setPosition({
      width,
      left: Math.max(
        12,
        Math.min(
          innerWidth - width - 12,
          rect.left + rect.width / 2 - width / 2,
        ),
      ),
      top: Math.max(12, Math.min(innerHeight - height - 12, rect.bottom + 8)),
    });
  }
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(undefined);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", escape);
    };
  }, [position]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="thumbnail template-preview-trigger"
        aria-label={t("Preview {name}", { name })}
        aria-describedby={position ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={(event) => {
          if (
            !(event.relatedTarget instanceof Node) ||
            !document.getElementById(id)?.contains(event.relatedTarget)
          )
            setPosition(undefined);
        }}
        onFocus={show}
        onBlur={() => setPosition(undefined)}
        onClick={show}
        onKeyDown={(event) => {
          if (event.key === "Escape") setPosition(undefined);
        }}
      >
        <img src={src} alt={name} loading="lazy" />
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="template-hover-preview"
            onMouseLeave={() => setPosition(undefined)}
            style={position}
          >
            <img src={src} alt="" />
            <strong>{name}</strong>
          </div>,
          document.body,
        )}
    </>
  );
}
