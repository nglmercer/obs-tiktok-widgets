import { useState } from "react";
import { Folder, FileCode2 } from "lucide-react";
import { Search, EmptyState } from "../components/UI";
import { t } from "../../shared/i18n";
export function FileExplorer({
  files,
  selected,
  onSelect,
}: {
  files: string[];
  selected: string;
  onSelect: (file: string) => void;
}) {
  const [query, setQuery] = useState("");
  const folders = new Map<string, string[]>();
  for (const file of files.filter((f) =>
    f.toLowerCase().includes(query.toLowerCase()),
  )) {
    const folder = file.slice(0, file.lastIndexOf("/")) || ".";
    folders.set(folder, [...(folders.get(folder) || []), file]);
  }
  return (
    <div className="file-explorer">
      <Search
        label="Search files"
        placeholder="Search files"
        value={query}
        onChange={setQuery}
      />
      {!folders.size && <EmptyState title="No source files" />}
      {[...folders]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([folder, items]) => (
          <details key={folder} open>
            <summary>
              <Folder size={14} aria-hidden="true" />
              {folder}
            </summary>
            <div role="group" aria-label={folder}>
              {items.sort().map((file) => (
                <button
                  key={file}
                  aria-label={file}
                  className={file === selected ? "selected" : ""}
                  aria-pressed={file === selected}
                  onClick={() => onSelect(file)}
                >
                  <FileCode2 size={14} aria-hidden="true" />
                  <span>{file.slice(file.lastIndexOf("/") + 1)}</span>
                </button>
              ))}
            </div>
          </details>
        ))}
    </div>
  );
}
