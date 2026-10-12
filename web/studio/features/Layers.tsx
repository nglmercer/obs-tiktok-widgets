import type { VisualComponent } from "./Canvas";
export function Layers({
  components,
  selected,
  onSelect,
}: {
  components: VisualComponent[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const seen = new Set<string>();
  const branch = (parent: string | undefined, level = 1): React.ReactNode =>
    components
      .filter((c) => c.parent === parent && !seen.has(c.id))
      .map((c) => {
        seen.add(c.id);
        return (
          <div key={c.id}>
            <button
              role="treeitem"
              aria-level={level}
              aria-selected={selected === c.id}
              style={{ paddingLeft: level * 12 }}
              onClick={() => onSelect(c.id)}
            >
              {c.label}
            </button>
            {level < 16 && <div role="group">{branch(c.id, level + 1)}</div>}
          </div>
        );
      });
  const roots = branch(undefined);
  return (
    <div role="tree" aria-label="Widget layers">
      {roots}
      {components
        .filter((c) => !seen.has(c.id))
        .map((c) => (
          <button
            role="treeitem"
            aria-level={1}
            aria-selected={selected === c.id}
            key={c.id}
            onClick={() => onSelect(c.id)}
          >
            {c.label} (unresolved parent)
          </button>
        ))}
    </div>
  );
}
