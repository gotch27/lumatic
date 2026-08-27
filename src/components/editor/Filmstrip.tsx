"use client";

import { ChevronLeft, ChevronRight, ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { editorService } from "@/editor/commands/editorService";
import { isEdited } from "@/editor/domain/adjustments";
import type { RuntimePhoto } from "@/editor/domain/types";

export function Filmstrip({ photos, selectedPhotoId, onImport }: { photos: RuntimePhoto[]; selectedPhotoId: string | null; onImport: () => void }) {
  const selectedIndex = photos.findIndex((photo) => photo.id === selectedPhotoId);
  return (
    <footer className="filmstrip">
      <div className="flex w-24 shrink-0 items-center gap-1 border-r border-white/[0.06] px-2">
        <Button
          aria-label="Previous photo"
          disabled={selectedIndex <= 0}
          onClick={() => editorService.navigatePhoto(-1)}
          size="iconSm"
          variant="ghost"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          aria-label="Next photo"
          disabled={selectedIndex < 0 || selectedIndex >= photos.length - 1}
          onClick={() => editorService.navigatePhoto(1)}
          size="iconSm"
          variant="ghost"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="filmstrip-scroll">
        {photos.map((photo, index) => (
          <button
            aria-label={`Open ${photo.name}`}
            aria-pressed={photo.id === selectedPhotoId}
            className={`filmstrip-item ${photo.id === selectedPhotoId ? "is-selected" : ""}`}
            data-testid={`filmstrip-photo-${index}`}
            key={photo.id}
            onClick={() => editorService.selectPhoto(photo.id)}
            type="button"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" draggable={false} src={photo.thumbnailUrl} />
            {isEdited(photo.editState.adjustments) && <span className="edited-dot" title="Edited" />}
            <span className="filmstrip-index">{index + 1}</span>
          </button>
        ))}
        <button className="filmstrip-add" onClick={onImport} type="button">
          <ImagePlus className="size-4" />
          <span>Add</span>
        </button>
      </div>
      <div className="flex w-24 shrink-0 items-center justify-end border-l border-white/[0.06] px-3 text-[11px] text-zinc-500">
        {photos.length} {photos.length === 1 ? "photo" : "photos"}
      </div>
    </footer>
  );
}
