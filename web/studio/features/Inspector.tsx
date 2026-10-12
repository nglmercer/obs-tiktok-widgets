import { useForm } from "react-hook-form";
import { validateAppearance } from "../api/validators";
import { useEffect, useState, useRef } from "react";
export function Inspector({
  schema,
  settings,
  onSave,
  assets,
  revision,
}: {
  schema: any;
  settings: Record<string, unknown>;
  onSave: (v: Record<string, unknown>, revision: string) => Promise<void>;
  revision: string;
  assets: string[];
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty },
  } = useForm({ defaultValues: settings });
  const [error, setError] = useState("");
  const baseRevision = useRef(revision);
  useEffect(() => {
    if (isDirty && baseRevision.current !== revision) {
      setError(
        "External settings change detected. Draft retained; save will require conflict resolution.",
      );
      return;
    }
    if (!isDirty) {
      reset(settings);
      baseRevision.current = revision;
    }
  }, [settings, revision]);
  const values = watch();
  const properties = Object.entries(schema.properties || {}) as [string, any][];
  const submit = handleSubmit(async (data) => {
    try {
      const validation = validateAppearance(schema, { ...settings, ...data });
      if (!validation.valid) {
        setError(validation.errors);
        return;
      }
      await onSave(
        Object.fromEntries(
          Object.entries(data).filter(
            ([key]) =>
              key in (schema.properties || {}) &&
              !["id", "template", "customHtml", "editableHtml"].includes(key),
          ),
        ),
        baseRevision.current,
      );
      reset(data);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  });
  return (
    <form onSubmit={submit}>
      <h2>Appearance</h2>
      {properties
        .filter(
          ([key]) =>
            !["id", "template", "name", "editableHtml", "customHtml"].includes(
              key,
            ),
        )
        .map(([key, p]) => {
          const ui = p["x-ui"] || {};
          if (
            ui.visibleWhen &&
            values[ui.visibleWhen.field] !== ui.visibleWhen.equals
          )
            return null;
          const label = p.title || key;
          return (
            <label className="field" key={key} title={p.description}>
              {ui.group && <small>{ui.group}</small>}
              <span>{label}</span>
              {p.enum ? (
                <select
                  aria-label={label}
                  {...register(key, {
                    setValueAs: (v) =>
                      p.type === "integer" || p.type === "number"
                        ? Number(v)
                        : p.type === "boolean"
                          ? v === "true"
                          : v,
                  })}
                >
                  {p.enum.map((v: any) => (
                    <option value={String(v)} key={String(v)}>
                      {String(v)}
                    </option>
                  ))}
                </select>
              ) : p.type === "boolean" ? (
                <input type="checkbox" {...register(key)} />
              ) : ["integer", "number"].includes(p.type) ? (
                <input
                  aria-label={label}
                  type={ui.control === "slider" ? "range" : "number"}
                  min={p.minimum}
                  max={p.maximum}
                  step={p.type === "integer" ? 1 : "any"}
                  {...register(key, { valueAsNumber: true })}
                />
              ) : ui.control === "asset" ? (
                <select
                  aria-label={label}
                  {...register(key, {
                    setValueAs: (v) =>
                      p.type === "integer" || p.type === "number"
                        ? Number(v)
                        : p.type === "boolean"
                          ? v === "true"
                          : v,
                  })}
                >
                  <option value="">None</option>
                  {assets.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              ) : p.type === "string" ? (
                <input
                  aria-label={label}
                  type={
                    ui.control === "color" || /color$/i.test(key)
                      ? "color"
                      : "text"
                  }
                  {...register(key)}
                />
              ) : (
                <p>Complex value retained. Edit using widgetctl.</p>
              )}
              {p.description && <small>{p.description}</small>}
            </label>
          );
        })}
      <button disabled={!isDirty}>Save appearance</button>
      <p role="alert">{error}</p>
    </form>
  );
}
