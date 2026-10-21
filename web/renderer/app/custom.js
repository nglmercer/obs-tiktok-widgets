// Capability-limited opaque-origin containment for trusted author HTML. This
// does not certify arbitrary scripts as safe against hostile authors.
export function customDefinition() {
  return {
    id: "builtin.custom",
    version: "2.0.0",
    events: [],
    createRuntime({ settings, signal, fail }) {
      let frame;
      const receive = (event) => {
        if (
          !frame ||
          event.source !== frame.contentWindow ||
          event.origin !== "null" ||
          event.data?.channel !== "composition-widget" ||
          event.data?.session !== session ||
          event.data?.kind !== "error"
        )
          return;
        fail?.("CUSTOM_SCRIPT_FAILED");
      };
      const session = crypto.randomUUID();
      return {
        mount(container) {
          if (signal.aborted) return;
          const html = String(settings.html || "");
          if (html.length > 65536) throw new Error("CUSTOM_HTML_SIZE_LIMIT");
          window.addEventListener("message", receive);
          frame = document.createElement("iframe");
          frame.title = "Custom widget";
          frame.sandbox = "allow-scripts";
          frame.referrerPolicy = "no-referrer";
          frame.style.cssText =
            "border:0;width:100%;height:100%;background:transparent";
          const bootstrap =
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none';script-src 'unsafe-inline';style-src 'unsafe-inline';img-src data:;media-src data:;font-src data:;connect-src 'none';form-action 'none';base-uri 'none'"><script>const session=${JSON.stringify(session)},origin=${JSON.stringify(location.protocol === "file:" ? "null" : location.origin)};window.WidgetCapabilities=Object.freeze(['events.subscribe']);window.addEventListener('error',()=>parent.postMessage({channel:'composition-widget',session,kind:'error'},origin==='null'?'*':origin));window.addEventListener('unhandledrejection',()=>parent.postMessage({channel:'composition-widget',session,kind:'error'},origin==='null'?'*':origin));window.addEventListener('message',e=>{if(e.source!==parent||e.origin!==origin||e.data?.channel!=='composition-widget'||e.data?.session!==session||e.data?.kind!=='event')return;try{if(JSON.stringify(e.data.event).length>65536)return;window.dispatchEvent(new CustomEvent('universal:event',{detail:e.data.event}));}catch{}});` +
            "</" +
            "script>";
          frame.srcdoc =
            "<!doctype html><html><head>" +
            bootstrap +
            "</head><body>" +
            html +
            "</body></html>";
          container.append(frame);
          return new Promise((resolve, reject) => {
            const abort = () => {
              frame?.remove();
              reject(new Error("MOUNT_CANCELLED"));
            };
            signal.addEventListener("abort", abort, { once: true });
            frame.onload = () => {
              signal.removeEventListener("abort", abort);
              if (!signal.aborted) resolve();
            };
          });
        },
        handleEvent(event) {
          if (signal.aborted || JSON.stringify(event).length > 65536) return;
          // Opaque iframe origins require '*'; the receiving code validates the
          // source, parent origin and per-mount session before dispatching.
          frame?.contentWindow?.postMessage(
            { channel: "composition-widget", session, kind: "event", event },
            "*",
          );
        },
        update() {
          throw new Error("CUSTOM_REMOUNT_REQUIRED");
        },
        destroy() {
          window.removeEventListener("message", receive);
          if (frame) {
            frame.onload = null;
            frame.remove();
            frame = null;
          }
        },
      };
    },
  };
}
