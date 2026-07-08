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

import { loadConfig } from "./app/config";
import { getSloppiness, setSloppiness, getUnits, setUnits } from "./app/preferences";
import { type Unit } from "./lib/units";
import { IndexedDbProvider } from "./storage/indexeddb-provider";
import type { DocumentSummary } from "./storage/types";
import { downloadFile, openLocalFile } from "./storage/local-file-provider";
import {
  applyContentsToScene,
  exportJpg,
  exportPng,
  exportSvgString,
  normalizeRoughness,
  serializeScene,
  type ExcalidrawAPI,
  type ImageFormat,
} from "./lib/excalidraw-scene";
import { type Sloppiness } from "./lib/roughness";
import {
  resetZoom,
  toggleGrid,
  zoomIn,
  zoomOut,
  zoomToFit,
} from "./lib/view-actions";
import { ensureExtension, stripExtension } from "./lib/filename";
import { FLOW_DOCS_URL, FLOW_ISSUES_URL } from "./lib/links";
import { MenuBar } from "./ui/menubar/MenuBar";
import { PanelsRoot } from "./ui/panels/PanelsRoot";
import { SaveDialog } from "./ui/SaveDialog";
import { OpenDialog } from "./ui/OpenDialog";
import { PreferencesDialog } from "./ui/PreferencesDialog";
import { AboutDialog } from "./ui/AboutDialog";
import type { SaveDestination } from "./ui/dialog-types";

const AUTOSAVE_DELAY_MS = 800;

/** The element list Excalidraw hands `onChange` on every scene update. */
type SceneChangeElements = Parameters<
  NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>
>[0];

export default function App() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  // Also mirrored in state so the panels re-render once the API is ready.
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawAPI | null>(null);
  const provider = useMemo(() => new IndexedDbProvider(), []);

  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [currentName, setCurrentName] = useState("Untitled");
  const [saveOpen, setSaveOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [internalDocs, setInternalDocs] = useState<DocumentSummary[]>([]);
  const [appName, setAppName] = useState("Flow");

  // App-wide sloppiness preference. `sloppinessRef` mirrors it so the stable
  // onChange handler and async import paths read the current value without
  // stale closures or re-registering the Excalidraw onChange prop.
  const [sloppiness, setSloppinessState] = useState<Sloppiness>(() => getSloppiness());
  const sloppinessRef = useRef(sloppiness);
  sloppinessRef.current = sloppiness;

  // Preferred display unit for length controls (stroke width etc.).
  const [units, setUnitsState] = useState<Unit>(() => getUnits());
  const handleChangeUnits = useCallback((next: Unit) => {
    setUnitsState(next);
    setUnits(next);
  }, []);

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
    // New elements draw at the preference and imports are normalized on load;
    // this only catches stray pasted foreign elements. Cheap scan, and
    // updateScene runs only when a stray exists, so it can't loop.
    const target = sloppinessRef.current;
    if (elements.some((el) => el.roughness !== target)) {
      apiRef.current?.updateScene({ elements: normalizeRoughness(elements, target) });
    }

    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;
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
      await applyContentsToScene(api, doc.contents, sloppinessRef.current);
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
    await applyContentsToScene(api, file.contents, sloppinessRef.current);
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

  const handleNew = useCallback(() => {
    apiRef.current?.resetScene();
    setCurrentId(undefined);
    setCurrentName("Untitled");
  }, []);

  const handleClearCanvas = useCallback(() => {
    apiRef.current?.updateScene({ elements: [] });
  }, []);

  const handleChangeSloppiness = useCallback((next: Sloppiness) => {
    setSloppinessState(next);
    setSloppiness(next);
    const api = apiRef.current;
    if (!api) return;
    api.updateScene({
      elements: normalizeRoughness(api.getSceneElements(), next),
      appState: { currentItemRoughness: next },
    });
  }, []);

  const handleShowShortcuts = useCallback(() => {
    setPrefsOpen(false);
    apiRef.current?.updateScene({ appState: { openDialog: { name: "help" } } });
  }, []);

  const openExternal = (url: string) =>
    window.open(url, "_blank", "noopener,noreferrer");

  const withApi = (fn: (api: ExcalidrawAPI) => void) => () => {
    const api = apiRef.current;
    if (api) fn(api);
  };

  return (
    <div style={{ position: "fixed", inset: 0 }} aria-label={appName}>
      <MenuBar
        onNew={handleNew}
        onOpen={openOpenDialog}
        onSave={openSaveDialog}
        onExport={handleExport}
        onPreferences={() => setPrefsOpen(true)}
        onClearCanvas={handleClearCanvas}
        onEditAction={(name) => apiRef.current?.executeAction(name)}
        onZoomIn={withApi(zoomIn)}
        onZoomOut={withApi(zoomOut)}
        onZoomToFit={withApi(zoomToFit)}
        onResetZoom={withApi(resetZoom)}
        onToggleGrid={withApi(toggleGrid)}
        onAbout={() => setAboutOpen(true)}
        onDocumentation={() => openExternal(FLOW_DOCS_URL)}
        onSubmitIssue={() => openExternal(FLOW_ISSUES_URL)}
        onShowShortcuts={handleShowShortcuts}
      />

      <div
        style={{
          position: "fixed",
          inset: "var(--flow-menubar-h) var(--flow-panel-reserved, 0px) 0 0",
        }}
      >
        <Excalidraw
          excalidrawAPI={(instance) => {
            // `executeAction` exists at runtime (fork addition) but not yet in the
            // vendor .d.ts, so narrow the handle to flow's augmented type here.
            const api = instance as ExcalidrawAPI;
            apiRef.current = api;
            setExcalidrawApi(api);
          }}
          theme="light"
          onChange={handleChange}
          initialData={{
            appState: {
              currentItemRoughness: sloppiness,
              currentItemFontFamily: FONT_FAMILY.Nunito,
            },
          }}
        />
        <PanelsRoot api={excalidrawApi} units={units} />
      </div>

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

      {prefsOpen && (
        <PreferencesDialog
          sloppiness={sloppiness}
          onChangeSloppiness={handleChangeSloppiness}
          units={units}
          onChangeUnits={handleChangeUnits}
          onShowShortcuts={handleShowShortcuts}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {aboutOpen && <AboutDialog appName={appName} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
