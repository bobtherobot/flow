import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { loadConfig } from "./app/config";
import {
  getSloppiness, setSloppiness, getUnits, setUnits,
  getToolbarState, setToolbarState,
  getShapebarState, setShapebarState,
  getQuickbarState, setQuickbarState,
  getBottombarState, setBottombarState,
  getBindingMode, setBindingMode,
  getLaserColor, setLaserColor,
  getSelectionMode, setSelectionMode,
  getPastePosition, setPastePosition,
  getGridSize, setGridSize,
  getGridColor, setGridColor,
  resetFactorySettings,
} from "./app/preferences";
import { type Unit } from "./lib/units";
import { type BindingMode, isBindingActive, toggledBindingMode } from "./lib/binding-mode";
import { type SelectionMode } from "./lib/selection-mode";
import { type PastePosition } from "./lib/paste-position";
import { clampGridSize, DEFAULT_GRID_COLOR, boldGridColor } from "./lib/grid";
import { scrubHex } from "./lib/color-palettes";
import { flowSeedAppState } from "./lib/flow-app-state";
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
  zoomIn,
  zoomOut,
  zoomToFit,
} from "./lib/view-actions";
import { ensureExtension, stripExtension } from "./lib/filename";
import { FLOW_DOCS_URL, FLOW_ISSUES_URL } from "./lib/links";
import { MenuBar } from "./ui/menubar/MenuBar";
import { PanelsRoot } from "./ui/panels/PanelsRoot";
import { ToolRails } from "./ui/toolbar/ToolRails";
import { ShapeHandles } from "./ui/shapes/ShapeHandles";
import { railGutter } from "./ui/toolbar/rail-layout";
import { DEFAULT_TOOLBAR_STATE, DEFAULT_SHAPEBAR_STATE, type ToolbarState } from "./ui/toolbar/toolbar-state";
import { QuickBar } from "./ui/quickbar/QuickBar";
import { DEFAULT_QUICKBAR_STATE, type QuickbarState } from "./ui/quickbar/quickbar-state";
import { BottomBar } from "./ui/bottombar/BottomBar";
import { DEFAULT_BOTTOMBAR_STATE, type BottombarState } from "./ui/bottombar/bottombar-state";
import { type SearchSignal } from "./ui/panels/SearchPanel";
import { SaveDialog } from "./ui/SaveDialog";
import { OpenDialog } from "./ui/OpenDialog";
import { PreferencesDialog } from "./ui/PreferencesDialog";
import { PropertiesDialog } from "./ui/PropertiesDialog";
import { AboutDialog } from "./ui/AboutDialog";
import type { SaveDestination } from "./ui/dialog-types";
import { useStyleMemory } from "./ui/useStyleMemory";
import { useToolOverride } from "./ui/toolbar/useToolOverride";

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

  // Per-category style memory: adopts the last selected/edited element's style
  // and applies it to the next element drawn in that category. Renders
  // nothing, but returns a handle useToolOverride's release-time reload uses
  // below — see useStyleMemory.ts's StyleMemoryHandle doc.
  const styleMemory = useStyleMemory(excalidrawApi);

  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [currentName, setCurrentName] = useState("Untitled");
  const [saveOpen, setSaveOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
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

  // Tool-rail layout/config. App owns it so the View menu can read visibility;
  // ToolRails mutates it via onChange. Persisted to flow.toolbar.
  const [toolbar, setToolbar] = useState<ToolbarState>(() => getToolbarState());
  useEffect(() => {
    setToolbarState(toolbar);
  }, [toolbar]);

  // Shapebar layout/config. Same ownership pattern as the tool rail: App owns it
  // so the View menu can read visibility. Persisted to flow.shapebar.
  const [shapebar, setShapebar] = useState<ToolbarState>(() => getShapebarState());
  useEffect(() => {
    setShapebarState(shapebar);
  }, [shapebar]);

  // Quick-actions-bar layout/config. Same ownership pattern as the tool rail:
  // App owns it so the View menu can read visibility. Persisted to flow.quickbar.
  const [quickbar, setQuickbar] = useState<QuickbarState>(() => getQuickbarState());
  useEffect(() => {
    setQuickbarState(quickbar);
  }, [quickbar]);

  // Bottom bar (grid/zen/zoom/background/search). Same ownership pattern; App
  // owns it so the View menu can read visibility. Persisted to flow.bottombar.
  const [bottombar, setBottombar] = useState<BottombarState>(() => getBottombarState());
  useEffect(() => {
    setBottombarState(bottombar);
  }, [bottombar]);

  // Restore the factory layout: every bar shown, docked, and its drag position /
  // per-item config memory wiped (fresh copies so a later detach starts from the
  // default spot rather than wherever it was last dragged).
  const handleResetLayout = () => {
    setToolbar({ ...DEFAULT_TOOLBAR_STATE, hiddenTools: [...DEFAULT_TOOLBAR_STATE.hiddenTools] });
    setShapebar({ ...DEFAULT_SHAPEBAR_STATE, hiddenTools: [...DEFAULT_SHAPEBAR_STATE.hiddenTools] });
    setQuickbar({ ...DEFAULT_QUICKBAR_STATE, hiddenItems: [...DEFAULT_QUICKBAR_STATE.hiddenItems] });
    setBottombar({ ...DEFAULT_BOTTOMBAR_STATE, hiddenItems: [...DEFAULT_BOTTOMBAR_STATE.hiddenItems] });
  };

  // Drives the Search sub-panel in the controls dock. Bumping `nonce` opens the
  // panel; a string `query` is adopted + run (bottom-bar search), `null` just
  // opens + focuses it (Ctrl/Cmd+F). Not persisted — search is transient.
  const [search, setSearch] = useState<SearchSignal>({ query: "", nonce: 0 });
  const runSearch = (query: string) => setSearch((s) => ({ query, nonce: s.nonce + 1 }));

  // Repoint Ctrl/Cmd+F to flow's Search panel (capture phase, before Excalidraw's
  // own search-menu shortcut fires).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "f" || e.key === "F")) {
        e.preventDefault();
        e.stopPropagation();
        setSearch((s) => ({ query: null, nonce: s.nonce + 1 }));
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // Persistent arrow-binding lock. Applied to Excalidraw's appState below so the
  // fork's isBindingEnabled selector honors it over the transient per-input flag.
  const [bindingMode, setBindingModeState] = useState<BindingMode>(() => getBindingMode());
  const handleSetBindingMode = useCallback((next: BindingMode) => {
    setBindingModeState(next);
    setBindingMode(next);
  }, []);
  // Push the mode into appState whenever it changes or the API becomes ready
  // (covers the initial apply and every toggle). bindingMode isn't in the vendor
  // .d.ts yet (fork addition, types flow-side augmented) so cast the arg.
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { bindingMode },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, bindingMode]);

  // Illustrator-style Cmd/Ctrl-hold override + the permanently-on tool lock.
  useToolOverride(excalidrawApi, styleMemory);

  const [laserColor, setLaserColorState] = useState<string>(() => getLaserColor());
  const handleChangeLaserColor = useCallback((next: string) => {
    setLaserColorState(next);
    setLaserColor(next);
  }, []);
  // Push the color into appState whenever it changes or the API becomes ready.
  // laserColor isn't in the vendor .d.ts yet (fork addition) so cast the arg.
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { laserColor },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, laserColor]);

  // Marquee (drag-selection) mode: enclose vs touch. Applied to appState so the
  // fork's getElementsWithinSelection honors it at the box-select call site.
  const [selectionMode, setSelectionModeState] = useState<SelectionMode>(() =>
    getSelectionMode(),
  );
  const handleChangeSelectionMode = useCallback((next: SelectionMode) => {
    setSelectionModeState(next);
    setSelectionMode(next);
  }, []);
  // selectionMode isn't in the vendor .d.ts yet (fork addition) so cast the arg.
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { selectionMode },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, selectionMode]);

  // Paste position: where a clipboard paste of elements lands. Applied to
  // appState so the fork's clipboard paste path reads it at the one call site
  // that inserts pasted elements.
  const [pastePosition, setPastePositionState] = useState<PastePosition>(() =>
    getPastePosition(),
  );
  const handleChangePastePosition = useCallback((next: PastePosition) => {
    setPastePositionState(next);
    setPastePosition(next);
  }, []);
  // pastePosition isn't in the vendor .d.ts yet (fork addition) so cast the arg.
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { pastePosition },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, pastePosition]);

  // Grid size: flow's app-wide grid-cell size (px). Native appState field, so
  // no cast is needed (unlike selectionMode/bindingMode/laserColor above).
  const [gridSize, setGridSizeState] = useState<number>(() => getGridSize());
  const handleChangeGridSize = useCallback((next: number) => {
    // Round-to-step + range clamp here so the stored value, the live appState,
    // and what the input reflects on blur all agree (the dialog commits a
    // range-clamped value; clampGridSize also snaps it to the grid step).
    const clamped = clampGridSize(next);
    setGridSizeState(clamped);
    setGridSize(clamped);
  }, []);
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({ appState: { gridSize } });
  }, [excalidrawApi, gridSize]);

  // Grid color: flow's app-wide gridline color. Fork appState fields (absent
  // from the vendor .d.ts) so updateScene needs the same cast as selectionMode
  // and laserColor. Only gridColor is stored — gridColorBold is derived on every
  // write, so the pair cannot drift.
  const [gridColor, setGridColorState] = useState<string>(() => getGridColor());
  const handleChangeGridColor = useCallback((next: string) => {
    // Normalize via scrubHex (not just validate) so live appState always
    // matches what setGridColor persists — otherwise a valid-but-non-canonical
    // hex (e.g. 8-digit with alpha) would sit in state verbatim while the
    // stored value gets normalized, splitting the two until reload.
    const color = scrubHex(next) ?? DEFAULT_GRID_COLOR;
    setGridColorState(color);
    setGridColor(color);
  }, []);
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { gridColor, gridColorBold: boldGridColor(gridColor) },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, gridColor]);

  // The app-wide preferences that get seeded into appState, gathered in one
  // place. `initialData` reads it at mount; File ▸ New re-seeds from the ref
  // (its callback is stable, and the values must be current at click time).
  const appStatePrefs = {
    sloppiness,
    bindingMode,
    laserColor,
    selectionMode,
    pastePosition,
    gridSize,
    gridColor,
  };
  const appStatePrefsRef = useRef(appStatePrefs);
  appStatePrefsRef.current = appStatePrefs;

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

  // Wipe every stored preference, then reload. A reload rather than an in-place
  // re-render because the settings this clears are read once at mount by a dozen
  // independent surfaces (both tool rails, the quick bar, the bottom bar, the
  // panel dock, the palette store); pushing new values into all of them by hand
  // would leave whichever one was missed showing its old state, and a *partial*
  // factory reset reads as a bug rather than an omission. Saved documents live
  // in IndexedDB and are untouched — including the working scene, which the
  // autosave above has already written there.
  const handleRestoreDefaults = useCallback(() => {
    resetFactorySettings();
    window.location.reload();
  }, []);

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
    const api = apiRef.current;
    if (!api) return;
    api.resetScene();
    // resetScene replaces appState wholesale with Excalidraw's defaults, which
    // drops every flow preference seeded at mount. Re-seed the same values, or
    // the new document silently draws with Excalidraw's roughness, round
    // corners, snapping off and binding unlocked — and the roughness mismatch
    // alone breaks drawing outright (see flowSeedAppState).
    api.updateScene({
      appState: flowSeedAppState(appStatePrefsRef.current),
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
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
        onProperties={() => setPropsOpen(true)}
        onClearCanvas={handleClearCanvas}
        onEditAction={(name) => apiRef.current?.executeAction(name)}
        onZoomIn={withApi(zoomIn)}
        onZoomOut={withApi(zoomOut)}
        onZoomToFit={withApi(zoomToFit)}
        onResetZoom={withApi(resetZoom)}
        api={excalidrawApi}
        isArrowBindingOn={isBindingActive(bindingMode)}
        onToggleArrowBinding={() => handleSetBindingMode(toggledBindingMode(bindingMode))}
        isToolbarVisible={toolbar.visible}
        onToggleToolbar={() => setToolbar((s) => ({ ...s, visible: !s.visible }))}
        isToolbarFloating={toolbar.floating}
        onDockToolbar={() => setToolbar((s) => ({ ...s, floating: false }))}
        isShapebarVisible={shapebar.visible}
        onToggleShapebar={() => setShapebar((s) => ({ ...s, visible: !s.visible }))}
        isShapebarFloating={shapebar.floating}
        onDockShapebar={() => setShapebar((s) => ({ ...s, floating: false }))}
        isQuickbarVisible={quickbar.visible}
        onToggleQuickbar={() => setQuickbar((s) => ({ ...s, visible: !s.visible }))}
        isQuickbarFloating={quickbar.floating}
        onDockQuickbar={() => setQuickbar((s) => ({ ...s, floating: false }))}
        isBottombarVisible={bottombar.visible}
        onToggleBottombar={() => setBottombar((s) => ({ ...s, visible: !s.visible }))}
        isBottombarFloating={bottombar.floating}
        onDockBottombar={() => setBottombar((s) => ({ ...s, floating: false }))}
        onResetLayout={handleResetLayout}
        onAbout={() => setAboutOpen(true)}
        onDocumentation={() => openExternal(FLOW_DOCS_URL)}
        onSubmitIssue={() => openExternal(FLOW_ISSUES_URL)}
        onShowShortcuts={handleShowShortcuts}
      />

      <div
        style={{
          position: "fixed",
          inset:
            "var(--flow-menubar-h) var(--flow-panel-reserved, 0px) 0 var(--flow-toolbar-reserved, 0px)",
        }}
      >
        <Excalidraw
          // Upstream renamed this prop from `excalidrawAPI` to `onExcalidrawAPI`
          // and dropped the old one entirely — silently, since an unknown prop
          // is simply ignored. Under the old name flow's api handle stayed null
          // forever, so every control that drives the canvas through it became a
          // no-op. It can now be called with null on unmount.
          onExcalidrawAPI={(instance) => {
            // `executeAction` exists at runtime (fork addition) but not yet in the
            // vendor .d.ts, so narrow the handle to flow's augmented type here.
            const api = instance as ExcalidrawAPI | null;
            apiRef.current = api;
            setExcalidrawApi(api);
          }}
          theme="light"
          onChange={handleChange}
          initialData={{
            // Shared with File ▸ New — see flowSeedAppState.
            appState: flowSeedAppState(appStatePrefs),
          } as ComponentProps<typeof Excalidraw>["initialData"]}
        />
        <PanelsRoot api={excalidrawApi} units={units} search={search} />
      </div>

      <ToolRails
        api={excalidrawApi}
        toolbar={toolbar}
        onToolbarChange={setToolbar}
        shapebar={shapebar}
        onShapebarChange={setShapebar}
      />

      <ShapeHandles api={excalidrawApi} />

      <QuickBar
        api={excalidrawApi}
        state={quickbar}
        onChange={setQuickbar}
        bindingMode={bindingMode}
        onSetBindingMode={handleSetBindingMode}
      />

      <BottomBar
        api={excalidrawApi}
        state={bottombar}
        onChange={setBottombar}
        onSearch={runSearch}
        toolbarReserved={railGutter(toolbar, shapebar)}
      />

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
          selectionMode={selectionMode}
          onChangeSelectionMode={handleChangeSelectionMode}
          pastePosition={pastePosition}
          onChangePastePosition={handleChangePastePosition}
          gridSize={gridSize}
          onChangeGridSize={handleChangeGridSize}
          gridColor={gridColor}
          onChangeGridColor={handleChangeGridColor}
          laserColor={laserColor}
          onChangeLaserColor={handleChangeLaserColor}
          onShowShortcuts={handleShowShortcuts}
          onRestoreDefaults={handleRestoreDefaults}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {aboutOpen && <AboutDialog appName={appName} onClose={() => setAboutOpen(false)} />}

      {propsOpen && (
        <PropertiesDialog
          appName={appName}
          sceneName={currentName}
          api={excalidrawApi}
          provider={provider}
          onClose={() => setPropsOpen(false)}
        />
      )}
    </div>
  );
}
