// Local-system file operations: download a drawing/export, or open one via the
// browser file picker. These are thin DOM side-effect helpers.

export function downloadFile(
  filename: string,
  data: Blob | string,
  mime = "application/json",
): void {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface OpenedFile {
  name: string;
  contents: string;
}

/**
 * Opens the OS file picker and resolves with the chosen file's text, or `null`
 * if the user makes no selection.
 */
export function openLocalFile(
  accept = ".excalidraw,application/json",
): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, contents: await file.text() });
    });
    input.click();
  });
}
