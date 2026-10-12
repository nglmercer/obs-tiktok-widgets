import { useForm } from "react-hook-form";
import { validateAppearance } from "../api/validators";
import { useEffect, useState, useRef } from "react";
export function Inspector({
  schema,
  settings,
  onSave,
  assets,
  revision,
  onDraft,
  onTestAudio,
}: {
  schema: any;
  settings: Record<string, unknown>;
  onSave: (v: Record<string, unknown>, revision: string) => Promise<void>;
  revision: string;
  assets: string[];
  onDraft?: (v: Record<string, unknown>) => void;
  onTestAudio?: (path: string) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError: setFieldError,
    clearErrors,
    formState: { isDirty, errors },
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
  useEffect(() => {
    const sub = watch((data, info) => {
      if (info.type === "change") onDraft?.({ ...settings, ...data });
    });
    return () => sub.unsubscribe();
  }, [watch, onDraft, settings]);
  const values = watch();
  function assign(key: string, value: unknown) {
    setValue(key, value, { shouldDirty: true, shouldValidate: true });
    onDraft?.({ ...settings, ...watch(), [key]: value });
  }
  const properties = Object.entries(schema.properties || {}) as [string, any][];
  const submit = handleSubmit(async (data) => {
    try {
      const validation = validateAppearance(schema, { ...settings, ...data });
      if (!validation.valid) {
        for (const issue of JSON.parse(validation.errors || "[]")) {
          const field =
            issue.instancePath?.split("/")[1] || issue.params?.missingProperty;
          if (field)
            setFieldError(field, { type: "schema", message: issue.message });
        }
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
      clearErrors();
    } catch (e) {
      const problem = e as { details?: { field?: string }; message?: string };
      if (problem.details?.field)
        setFieldError(problem.details.field, {
          type: "server",
          message: problem.message,
        });
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
          const control =
            ui.control ||
            ui.widget ||
            (/soundUrl/i.test(key)
              ? "audio"
              : /imageUrl/i.test(key)
                ? "image"
                : "");
          if (
            ui.visibleWhen &&
            values[ui.visibleWhen.field] !== ui.visibleWhen.equals
          )
            return null;
          const label = p.title || key;
          return (
            <div className="field" key={key}>
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
                <input type="checkbox" aria-label={label} {...register(key)} />
              ) : ["integer", "number"].includes(p.type) ? (
                <span className="paired-control">
                  {control === "slider" && (
                    <input
                      aria-label={`${label} slider`}
                      type="range"
                      min={p.minimum}
                      max={p.maximum}
                      step={p.type === "integer" ? 1 : "any"}
                      value={Number(values[key]) || 0}
                      onChange={(e) => assign(key, Number(e.target.value))}
                    />
                  )}
                  <input
                    aria-label={label}
                    type="number"
                    min={p.minimum}
                    max={p.maximum}
                    step={p.type === "integer" ? 1 : "any"}
                    {...register(key, {
                      valueAsNumber: true,
                      min: p.minimum,
                      max: p.maximum,
                      validate: (v) =>
                        Number.isFinite(v) || "Enter a finite number",
                    })}
                  />
                </span>
              ) : ["asset", "image", "font", "audio"].includes(control) ? (
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
                  {!!values[key] && !assets.includes(String(values[key])) && (
                    <option value={String(values[key])}>
                      {String(values[key])} (existing reference)
                    </option>
                  )}
                  {assets
                    .filter((f) =>
                      control === "image"
                        ? /\.(png|jpe?g|svg|webp|gif)$/i.test(f)
                        : control === "font"
                          ? /\.(woff2?|ttf|otf)$/i.test(f)
                          : control === "audio"
                            ? /\.(mp3|wav|ogg|m4a)$/i.test(f)
                            : true,
                    )
                    .map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                </select>
              ) : p.type === "array" && (p.items?.enum || key === "filters") ? (
                <EventOptions
                  label={label}
                  options={
                    p.items?.enum || [
                      "gift",
                      "chat",
                      "like",
                      "follow",
                      "roomUser",
                    ]
                  }
                  selected={
                    Array.isArray(values[key]) ? (values[key] as string[]) : []
                  }
                  onChange={(v) => assign(key, v)}
                />
              ) : p.type === "string" ? (
                control === "color" || /color$/i.test(key) ? (
                  <span className="paired-control">
                    <input
                      type="color"
                      aria-label={`${label} picker`}
                      value={
                        /^#[0-9a-f]{6}$/i.test(String(values[key]))
                          ? String(values[key])
                          : "#000000"
                      }
                      onChange={(e) => assign(key, e.target.value)}
                    />
                    <input
                      aria-label={label}
                      {...register(key, {
                        pattern: {
                          value: /^#[0-9a-f]{6}$/i,
                          message: "Use a six-digit hexadecimal color",
                        },
                      })}
                    />
                  </span>
                ) : ["textarea", "html", "css", "multiline"].includes(
                    control,
                  ) || /css|html/i.test(key) ? (
                  <textarea aria-label={label} rows={5} {...register(key)} />
                ) : (
                  <input aria-label={label} type="text" {...register(key)} />
                )
              ) : (
                <p>Complex value retained. Edit using widgetctl.</p>
              )}
              {(control === "audio" || /soundUrl/i.test(key)) && (
                <button
                  type="button"
                  onClick={() =>
                    onTestAudio?.(String(values[key] || "")).catch((e) =>
                      setError(String(e)),
                    )
                  }
                >
                  Test audio
                </button>
              )}
              {p.description && <small>{p.description}</small>}
              {errors[key] && (
                <small role="alert">
                  {String(errors[key]?.message || "Invalid value")}
                </small>
              )}
            </div>
          );
        })}
      <button disabled={!isDirty}>Save appearance</button>
      <p role="alert">{error}</p>
    </form>
  );
}

function EventOptions({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  return (
    <fieldset>
      <legend>{label}</legend>
      <input
        aria-label={`Search ${label}`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {options
        .filter((v) => v.toLowerCase().includes(search.toLowerCase()))
        .map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, v]
                    : selected.filter((x) => x !== v),
                )
              }
            />
            {v}
          </label>
        ))}
    </fieldset>
  );
}
