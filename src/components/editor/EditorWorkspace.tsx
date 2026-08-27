"use client";

import dynamic from "next/dynamic";
import {
  Aperture,
  ArrowDownToLine,
  Check,
  Clock3,
  Database,
  Eye,
  EyeOff,
  FilePlus2,
  HardDrive,
  History,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AdjustmentPanel } from "./AdjustmentPanel";
import { EmptyWorkspace } from "./EmptyWorkspace";
import { Filmstrip } from "./Filmstrip";
import { HistoryPanel } from "./HistoryPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { editorService } from "@/editor/commands/editorService";
import { formatBytes } from "@/editor/imaging/imagePipeline";
import { exportPhoto } from "@/editor/imaging/exportPhoto";
import { selectedPhotoFromState, useEditorStore } from "@/editor/state/store";

const PhotoCanvas = dynamic(() => import("./PhotoCanvas"), { ssr: false });

export function EditorWorkspace() {
  const state = useEditorStore();
  const selectedPhoto = selectedPhotoFromState(state);
  const history = selectedPhoto ? state.historyByPhoto[selectedPhoto.id] ?? [] : [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportControllerRef = useRef<AbortController | null>(null);
  const [panel, setPanel] = useState<"adjustments" | "history">("adjustments");
  const [newLibraryOpen, setNewLibraryOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const chooseFiles = useCallback(() => fileInputRef.current?.click(), []);
  const acceptFiles = useCallback((files: FileList | File[]) => {
    void editorService.importFiles(Array.from(files));
  }, []);

  useEffect(() => {
    void editorService.hydrate();
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (useEditorStore.getState().saveStatus === "saving") event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText = target?.matches("input, textarea, [contenteditable=true]");
      if (event.key === "Escape") editorService.cancelAdjustment();
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && selectedPhoto) {
        event.preventDefault();
        if (event.shiftKey) editorService.redo(selectedPhoto.id);
        else editorService.undo(selectedPhoto.id);
      }
      if (!editingText && event.key === "ArrowLeft") editorService.navigatePhoto(-1);
      if (!editingText && event.key === "ArrowRight") editorService.navigatePhoto(1);
      if (!editingText && event.key === "\\") editorService.setShowOriginal(true);
    };
    const keyUp = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches("input, textarea, [contenteditable=true]") && event.key === "\\") {
        editorService.setShowOriginal(false);
      }
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [selectedPhoto]);

  const startExport = async () => {
    if (!selectedPhoto || state.exportProgress !== null) return;
    const controller = new AbortController();
    exportControllerRef.current = controller;
    useEditorStore.setState({ exportProgress: 0, exportLabel: "Preparing original photo" });
    try {
      await exportPhoto(selectedPhoto, {
        signal: controller.signal,
        onProgress: (exportProgress, exportLabel) => useEditorStore.setState({ exportProgress, exportLabel }),
      });
      editorService.addNotice("Full-resolution edit downloaded.", "success");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        editorService.addNotice(error instanceof Error ? error.message : "The photo could not be exported.", "error");
      }
    } finally {
      exportControllerRef.current = null;
      useEditorStore.setState({ exportProgress: null, exportLabel: null });
    }
  };

  if (!state.hydrated) {
    return (
      <div className="grid h-dvh place-items-center bg-[#101010] text-zinc-500">
        <div className="flex items-center gap-3 text-xs">
          <LoaderCircle className="size-4 animate-spin text-amber-300" /> Restoring your darkroom…
        </div>
      </div>
    );
  }

  const canUndo = Boolean(selectedPhoto && selectedPhoto.historyCursor > 0);
  const canRedo = Boolean(selectedPhoto && selectedPhoto.historyCursor < history.length);
  const storagePercent = state.storageUsage && state.storageQuota ? Math.round((state.storageUsage / state.storageQuota) * 100) : null;

  return (
    <div
      className="editor-shell"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files")) setDraggingFiles(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDraggingFiles(false);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDraggingFiles(false);
        acceptFiles(event.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Aperture className="size-4" /></div>
          <span className="text-sm font-semibold tracking-[-.02em] text-zinc-100">Lumatic</span>
          <span className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.16em] text-zinc-600">Local</span>
        </div>
        <div className="topbar-divider" />
        <Button onClick={chooseFiles} size="sm" variant="secondary">
          <FilePlus2 className="size-3.5" /> Import
        </Button>
        <div className="topbar-actions">
          <div className="button-group">
            <Button aria-label="Undo" disabled={!canUndo} onClick={() => selectedPhoto && editorService.undo(selectedPhoto.id)} size="iconSm" title="Undo (⌘Z)" variant="ghost">
              <RotateCcw className="size-3.5" />
            </Button>
            <Button aria-label="Redo" disabled={!canRedo} onClick={() => selectedPhoto && editorService.redo(selectedPhoto.id)} size="iconSm" title="Redo (⇧⌘Z)" variant="ghost">
              <RotateCw className="size-3.5" />
            </Button>
          </div>
          <Button
            aria-pressed={state.showOriginal}
            disabled={!selectedPhoto}
            onClick={() => editorService.setShowOriginal(!state.showOriginal)}
            size="sm"
            variant={state.showOriginal ? "default" : "secondary"}
          >
            {state.showOriginal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {state.showOriginal ? "Viewing original" : "Before / after"}
          </Button>
          <Button disabled={!selectedPhoto || state.exportProgress !== null} onClick={() => void startExport()} size="sm">
            {state.exportProgress !== null ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDownToLine className="size-3.5" />}
            Export
          </Button>
        </div>
        <button className="storage-status" onClick={() => void editorService.refreshStorageEstimate()} title="Refresh local storage estimate" type="button">
          {state.saveStatus === "saving" ? <LoaderCircle className="size-3 animate-spin" /> : state.saveStatus === "error" ? <Clock3 className="size-3 text-red-300" /> : <Check className="size-3 text-emerald-300" />}
          <span>{state.saveStatus === "saving" ? "Saving" : state.saveStatus === "error" ? "Unsaved" : "Saved locally"}</span>
          {storagePercent !== null && <span className="text-zinc-700">{storagePercent}%</span>}
        </button>
        <Button aria-label="New library" onClick={() => setNewLibraryOpen(true)} size="iconSm" title="New library" variant="ghost">
          <Trash2 className="size-3.5" />
        </Button>
      </header>

      <input
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="sr-only"
        data-testid="file-input"
        multiple
        onChange={(event) => {
          if (event.target.files) acceptFiles(event.target.files);
          event.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />

      {selectedPhoto ? (
        <>
          <main className="workspace-main">
            <PhotoCanvas photo={selectedPhoto} showOriginal={state.showOriginal} />
          </main>
          <aside className="right-panel">
            <div className="panel-tabs" role="tablist">
              <button aria-selected={panel === "adjustments"} className={panel === "adjustments" ? "is-active" : ""} onClick={() => setPanel("adjustments")} role="tab" type="button">
                <SlidersHorizontal className="size-3.5" /> Adjust
              </button>
              <button aria-selected={panel === "history"} className={panel === "history" ? "is-active" : ""} onClick={() => setPanel("history")} role="tab" type="button">
                <History className="size-3.5" /> History <span className="tab-count">{history.length}</span>
              </button>
            </div>
            <div className="selected-photo-summary">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-zinc-200" title={selectedPhoto.name}>{selectedPhoto.name}</p>
                <p className="mt-0.5 text-[10px] text-zinc-600">{formatBytes(selectedPhoto.size)} · {selectedPhoto.width} × {selectedPhoto.height}</p>
              </div>
            </div>
            <div className="min-h-0 flex-1" role="tabpanel">
              {panel === "adjustments" ? <AdjustmentPanel photo={selectedPhoto} /> : <HistoryPanel events={history} photo={selectedPhoto} />}
            </div>
          </aside>
        </>
      ) : (
        <EmptyWorkspace onImport={chooseFiles} />
      )}

      <Filmstrip onImport={chooseFiles} photos={state.photos} selectedPhotoId={state.selectedPhotoId} />

      {draggingFiles && (
        <div className="drop-overlay">
          <div className="drop-card"><ImagePlus className="size-7 text-amber-200" /><span>Drop photos to import</span><small>JPEG and PNG stay on this device</small></div>
        </div>
      )}

      {state.isImporting && (
        <div className="progress-toast">
          <LoaderCircle className="size-4 animate-spin text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-xs text-zinc-300"><span>Building local previews</span><span>{state.importCompleted}/{state.importTotal}</span></div>
            <div className="mt-2 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-300 transition-all" style={{ width: `${(state.importCompleted / state.importTotal) * 100}%` }} /></div>
          </div>
        </div>
      )}

      {state.exportProgress !== null && (
        <div className="export-progress">
          <div className="flex items-center justify-between gap-4"><span className="text-xs font-medium text-zinc-200">{state.exportLabel}</span><span className="font-mono text-[10px] text-zinc-500">{Math.round(state.exportProgress * 100)}%</span></div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-white/10"><div className="h-full bg-amber-300 transition-all" style={{ width: `${state.exportProgress * 100}%` }} /></div>
          <button className="mt-2 text-[10px] text-zinc-500 hover:text-white" onClick={() => exportControllerRef.current?.abort()} type="button">Cancel export</button>
        </div>
      )}

      <div className="notice-stack" aria-live="polite">
        {state.notices.map((notice) => (
          <div className={`notice notice-${notice.tone}`} key={notice.id}>
            <span>{notice.message}</span>
            <button aria-label="Dismiss notification" onClick={() => editorService.dismissNotice(notice.id)} type="button"><X className="size-3.5" /></button>
          </div>
        ))}
      </div>

      <Dialog onOpenChange={setNewLibraryOpen} open={newLibraryOpen}>
        <DialogContent>
          <div className="mb-4 grid size-10 place-items-center rounded-full bg-red-400/10"><Database className="size-5 text-red-300" /></div>
          <DialogTitle>Start a new local library?</DialogTitle>
          <DialogDescription>
            This permanently removes {state.photos.length} stored {state.photos.length === 1 ? "photo" : "photos"}, their edits, and history from this browser. Download any finished work first.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
            <Button
              onClick={() => {
                void editorService.newLibrary();
                setNewLibraryOpen(false);
              }}
              variant="danger"
            >
              <Trash2 className="size-3.5" /> Clear and start over
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {state.photos.length > 0 && (
        <div className="privacy-indicator"><HardDrive className="size-3" /> Device-only library</div>
      )}
    </div>
  );
}
