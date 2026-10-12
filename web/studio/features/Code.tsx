import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
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
export default function Code({
  file,
  text,
  onChange,
  command,
}: {
  file: string;
  text: string;
  onChange: (v: string) => void;
  command?: { id: string; serial: number };
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | undefined>(undefined);
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
      state: EditorState.create({
        doc: text,
        extensions: [
          lineNumbers(),
          history(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
          language,
          syntaxHighlighting(defaultHighlightStyle),
          EditorView.contentAttributes.of({ "aria-label": "Source editor" }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callback.current(u.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%", background: "#101827", color: "#dce6f6" },
            ".cm-content": { fontFamily: "monospace" },
            ".cm-scroller": { overflow: "auto" },
            ".cm-gutters": { background: "#172137", color: "#98a8c0" },
          }),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
  }, [file]);
  useEffect(() => {
    if (view.current && text !== view.current.state.doc.toString())
      view.current.dispatch({
        changes: { from: 0, to: view.current.state.doc.length, insert: text },
      });
  }, [text]);
  useEffect(() => {
    if (view.current && command)
      (command.id === "undo" ? undo : redo)(view.current);
  }, [command]);
  return <div className="code-editor" ref={host} />;
}
