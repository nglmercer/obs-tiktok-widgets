export interface Draft {
  base: string;
  local: string;
  revision: string;
  remote?: string;
  remoteRevision?: string;
}
// Three-way line merge deliberately refuses overlapping changes.
export function mergeDraft(
  base: string,
  local: string,
  remote: string,
): string | undefined {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;
  const b = base.split("\n"),
    l = local.split("\n"),
    r = remote.split("\n");
  if (b.length !== l.length || b.length !== r.length) return undefined;
  const result: string[] = [];
  for (let i = 0; i < b.length; i++) {
    if (l[i] !== b[i] && r[i] !== b[i] && l[i] !== r[i]) return undefined;
    result.push(l[i] !== b[i] ? l[i] : r[i]);
  }
  return result.join("\n");
}
export class DraftManager {
  private drafts = new Map<string, Draft>();
  constructor(
    private storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  ) {}
  private key(id: string, file: string) {
    return `studio-draft-v2:${id}:${file}`;
  }
  open(id: string, file: string, text: string, revision: string): Draft {
    const key = this.key(id, file);
    let draft = this.drafts.get(key);
    if (!draft) {
      try {
        const data = JSON.parse(this.storage?.getItem(key) || "null");
        if (
          data &&
          typeof data.base === "string" &&
          typeof data.local === "string" &&
          typeof data.revision === "string"
        )
          draft = data;
      } catch {
        /* unavailable storage or obsolete draft */
      }
      draft ||= { base: text, local: text, revision };
      this.drafts.set(key, draft);
    }
    if (draft.local === draft.base)
      Object.assign(draft, {
        base: text,
        local: text,
        revision,
        remote: undefined,
        remoteRevision: undefined,
      });
    else if (text !== draft.base)
      Object.assign(draft, { remote: text, remoteRevision: revision });
    else
      Object.assign(draft, {
        revision,
        remote: undefined,
        remoteRevision: undefined,
      }); // unrelated file/settings changes do not conflict
    this.persist(key, draft);
    return draft;
  }
  edit(id: string, file: string, draft: Draft) {
    const key = this.key(id, file);
    this.drafts.set(key, { ...draft });
    this.persist(key, draft);
  }
  private persist(key: string, draft: Draft) {
    try {
      if (draft.local === draft.base) this.storage?.removeItem(key);
      else this.storage?.setItem(key, JSON.stringify(draft));
    } catch {
      /* quota/private mode must not discard in-memory drafts */
    }
  }
}
