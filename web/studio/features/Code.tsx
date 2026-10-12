import { useEffect, useRef } from "react";
import { EditorState, Annotation, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
} from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
const externalChange = Annotation.define<boolean>();
const separators = new Compartment();
const cachedStates = new Map<string, EditorState>();
export default function Code({
  file,
  text,
  onChange,
  command,
  location,
}: {
  file: string;
  text: string;
  onChange: (v: string) => void;
  command?: { id: string; serial: number };
  location?: { line: number; column: number; serial: number };
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | undefined>(undefined);
  const states = useRef(cachedStates);
  const callback = useRef(onChange);
  callback.current = onChange;
  useEffect(() => {
    const language = file.endsWith(".html")
      ? html()
      : file.endsWith(".css")
        ? css()
        : javascript({
            typescript: /\.tsx?$/.test(file),
            jsx: /\.[jt]sx$/.test(file),
          });
    const editor = new EditorView({
      parent: host.current!,
      state:
        states.current.get(file)?.sliceDoc() === text
          ? states.current.get(file)!
          : EditorState.create({
              doc: text,
              extensions: [
                separators.of(
                  EditorState.lineSeparator.of(
                    text.includes("\r\n") ? "\r\n" : "\n",
                  ),
                ),
                lineNumbers(),
                history(),
                highlightActiveLine(),
                highlightSelectionMatches(),
                keymap.of([
                  ...defaultKeymap,
                  ...historyKeymap,
                  ...searchKeymap,
                ]),
                language,
                syntaxHighlighting(defaultHighlightStyle),
                EditorView.contentAttributes.of({
                  "aria-label": "Source editor",
                }),
                EditorView.updateListener.of((u) => {
                  if (
                    u.docChanged &&
                    !u.transactions.some((t) => t.annotation(externalChange))
                  )
                    callback.current(u.state.sliceDoc());
                }),
                EditorView.theme({
                  "&": {
                    height: "100%",
                    background: "#101827",
                    color: "#dce6f6",
                  },
                  ".cm-content": { fontFamily: "monospace" },
                  ".cm-scroller": { overflow: "auto" },
                  ".cm-gutters": { background: "#172137", color: "#98a8c0" },
                }),
              ],
            }),
    });
    view.current = editor;
    return () => {
      if (states.current.size >= 100 && !states.current.has(file))
        states.current.delete(states.current.keys().next().value!);
      states.current.set(file, editor.state);
      editor.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (view.current && text !== view.current.state.sliceDoc())
      view.current.dispatch({
        annotations: externalChange.of(true),
        effects: separators.reconfigure(
          EditorState.lineSeparator.of(text.includes("\r\n") ? "\r\n" : "\n"),
        ),
        changes: { from: 0, to: view.current.state.doc.length, insert: text },
      });
  }, [text]);
  useEffect(() => {
    if (view.current && command)
      (command.id === "undo" ? undo : redo)(view.current);
  }, [command]);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !location) return;
    const line = editor.state.doc.line(
      Math.max(1, Math.min(location.line, editor.state.doc.lines)),
    );
    const pos = Math.min(line.to, line.from + Math.max(0, location.column - 1));
    editor.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: "center" }),
    });
    editor.focus();
  }, [file, location]);
  return <div className="code-editor" ref={host} />;
}
