// Native modal provides focus trapping, Escape and keyboard submission without blocking polling.
export function ask(message: string, initial?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement("dialog");
    dialog.className = "studio-dialog";
    const form = document.createElement("form");
    form.method = "dialog";
    const title = document.createElement("h2");
    title.id = "studio-dialog-title";
    title.textContent =
      initial === undefined ? "Confirm action" : "Enter value";
    dialog.setAttribute("aria-labelledby", title.id);
    const description = document.createElement("p");
    description.textContent = message;
    const input = document.createElement("input");
    input.value = initial || "";
    input.setAttribute("aria-label", message);
    input.autofocus = true;
    const cancel = document.createElement("button");
    cancel.type = "submit";
    cancel.value = "cancel";
    cancel.textContent = "Cancel";
    const accept = document.createElement("button");
    accept.type = "submit";
    accept.value = "accept";
    accept.textContent = initial === undefined ? "Confirm" : "Continue";
    form.append(title, description);
    if (initial !== undefined) form.append(input);
    form.append(cancel, accept);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener(
      "close",
      () => {
        const result =
          dialog.returnValue === "accept"
            ? initial === undefined
              ? "yes"
              : input.value
            : null;
        dialog.remove();
        previous?.focus();
        resolve(result);
      },
      { once: true },
    );
    dialog.showModal();
    if (initial !== undefined) input.focus();
    else cancel.focus();
  });
}
export async function confirmAction(message: string) {
  return (await ask(message)) !== null;
}
