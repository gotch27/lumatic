"use client";

import { ImagePlus, LockKeyhole, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyWorkspace({ onImport }: { onImport: () => void }) {
  return (
    <main className="empty-workspace">
      <div className="empty-aura" />
      <div className="relative z-10 flex max-w-lg flex-col items-center text-center">
        <div className="mb-7 grid size-16 place-items-center rounded-2xl border border-amber-200/20 bg-amber-300/[0.07] shadow-[0_0_70px_rgba(252,211,77,.08)]">
          <Sparkles className="size-7 text-amber-200" />
        </div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.28em] text-amber-200/70">Your digital darkroom</p>
        <h1 className="text-balance text-4xl font-medium tracking-[-.04em] text-zinc-50">Shape the light. Keep every decision.</h1>
        <p className="mt-4 max-w-md text-pretty text-sm leading-6 text-zinc-500">
          Import JPEG or PNG photos to begin a local, non-destructive editing session. Your originals and edits stay in this browser.
        </p>
        <Button className="mt-8 h-10 px-5" onClick={onImport}>
          <ImagePlus className="size-4" />
          Import photos
        </Button>
        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-zinc-600">
          <LockKeyhole className="size-3" />
          Stored privately on this device
        </div>
      </div>
      <div className="drop-hint">or drop photos anywhere</div>
    </main>
  );
}
