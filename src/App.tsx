import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Excalidraw, FONT_FAMILY } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { CustomMenu, type ImageFormat } from "./app/CustomMenu";
import { loadConfig } from "./app/config";
import { IndexedDbProvider } from "./storage/indexeddb-provider";
import type { DocumentSummary } from "./storage/types";
import { downloadFile, openLocalFile } from "./storage/local-file-provider";
import {
  applyContentsToScene,
  ARCHITECT_ROUGHNESS,
  exportJpg,
  exportPng,
  exportSvgString,
  normalizeRoughness,
  serializeScene,
  type ExcalidrawAPI,
} from "./lib/excalidraw-scene";
import { ensureExtension, stripExtension } from "./lib/filename";
import { SaveDialog } from "./ui/SaveDialog";
import { OpenDialog } from "./ui/OpenDialog";
import type { SaveDestination } from "./ui/dialog-types";

const AUTOSAVE_DELAY_MS = 800;

/** The element list Excalidraw hands `onChange` on every scene update. */
type SceneChangeElements = Parameters<
  NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>
>[0];

export default function App() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const provider = useMemo(() => new IndexedDbProvider(), []);

  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [currentName, setCurrentName] = useState("Untitled");
  const [saveOpen, setSaveOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [internalDocs, setInternalDocs] = useState<DocumentSummary[]>([]);
  const [appName, setAppName] = useState("Wimp");

  // Google Drive is wired in a later phase; sign-in is not available yet.
  const isGoogleConnected = false;
  const googleComingSoon = () =>
    window.alert("Google Drive sync arrives in a later phase.");

  useEffect(() => {
    loadConfig().then((c) => {
      setAppName(c.appName);
      document.title = c.appName;
    });
  }, []);

  // Debounced auto-save of the working document to IndexedDB.
  const autosaveTimer = useRef<number | null>(null);
  const handleChange = useCallback((elements: SceneChangeElements) => {
    // Sloppiness is locked to Architect. New elements already draw at roughness 0
    // and imports are normalized on load; this only catches pasted foreign
    // elements. The scan is cheap and updateScene runs only when a stray exists,
    // so it re-normalizes without looping.
    if (elements.some((el) => el.roughness !== ARCHITECT_ROUGHNESS)) {
      apiRef.current?.updateScene({ elements: normalizeRoughness(elements) });
    }

    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;
      // Don't persist an untouched blank scratch canvas.
      if (api.getSceneElements().length === 0 && !currentId) return;
      const saved = await provider.save({
        id: currentId,
        name: currentName,
        contents: serializeScene(api),
      });
      if (!currentId) setCurrentId(saved.id);
    }, AUTOSAVE_DELAY_MS);
  }, [provider, currentId, currentName]);

  const openSaveDialog = useCallback(() => setSaveOpen(true), []);
  const openOpenDialog = useCallback(async () => {
    setInternalDocs(await provider.list());
    setOpenOpen(true);
  }, [provider]);

  const handleSave = useCallback(
    async ({ name, destination }: { name: string; destination: SaveDestination }) => {
      setSaveOpen(false);
      const api = apiRef.current;
      if (!api) return;
      const contents = serializeScene(api);

      if (destination === "download") {
        downloadFile(ensureExtension(name, "excalidraw"), contents);
      } else if (destination === "internal") {
        const saved = await provider.save({ id: currentId, name, contents });
        setCurrentId(saved.id);
        setCurrentName(name);
      } else {
        googleComingSoon();
      }
    },
    [provider, currentId],
  );

  const handleOpenInternal = useCallback(
    async (id: string) => {
      setOpenOpen(false);
      const api = apiRef.current;
      if (!api) return;
      const doc = await provider.load(id);
      if (!doc) return;
      await applyContentsToScene(api, doc.contents);
      setCurrentId(doc.id);
      setCurrentName(doc.name);
    },
    [provider],
  );

  const handleOpenLocal = useCallback(async () => {
    setOpenOpen(false);
    const api = apiRef.current;
    if (!api) return;
    const file = await openLocalFile();
    if (!file) return;
    await applyContentsToScene(api, file.contents);
    setCurrentId(undefined);
    setCurrentName(stripExtension(file.name, "excalidraw"));
  }, []);

  const handleExport = useCallback(
    async (format: ImageFormat) => {
      const api = apiRef.current;
      if (!api) return;
      if (format === "svg") {
        downloadFile(ensureExtension(currentName, "svg"), await exportSvgString(api), "image/svg+xml");
      } else if (format === "png") {
        downloadFile(ensureExtension(currentName, "png"), await exportPng(api), "image/png");
      } else {
        downloadFile(ensureExtension(currentName, "jpg"), await exportJpg(api), "image/jpeg");
      }
    },
    [currentName],
  );

  return (
    <div style={{ position: "fixed", inset: 0 }} aria-label={appName}>
      <Excalidraw
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
        theme="light"
        onChange={handleChange}
        initialData={{
          appState: {
            currentItemRoughness: 0, // clean/precise, not hand-drawn
            currentItemFontFamily: FONT_FAMILY.Nunito, // clean sans, self-hosted
          },
        }}
      >
        <CustomMenu onOpen={openOpenDialog} onSave={openSaveDialog} onExport={handleExport} />
      </Excalidraw>

      {saveOpen && (
        <SaveDialog
          initialName={currentName}
          isGoogleConnected={isGoogleConnected}
          onConnectGoogle={googleComingSoon}
          onCancel={() => setSaveOpen(false)}
          onSave={handleSave}
        />
      )}

      {openOpen && (
        <OpenDialog
          isGoogleConnected={isGoogleConnected}
          internalDocs={internalDocs}
          onConnectGoogle={googleComingSoon}
          onCancel={() => setOpenOpen(false)}
          onOpenInternal={handleOpenInternal}
          onOpenLocal={handleOpenLocal}
          onOpenGoogle={googleComingSoon}
        />
      )}
    </div>
  );
}
