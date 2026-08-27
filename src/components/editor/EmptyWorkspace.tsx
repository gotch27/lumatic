"use client";

import { ImagePlus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyWorkspace({ onImport }: { onImport: () => void }) {
  return (
    <main className="empty-workspace">
      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        <h1 className="text-balance text-3xl font-medium tracking-[-.035em] text-zinc-100">Shape the light. Keep every decision.</h1>
        <p className="mt-3 max-w-sm text-pretty text-sm leading-6 text-zinc-500">
          Import JPEG or PNG photos to begin a non-destructive editing session.
        </p>
        <Button className="mt-6" onClick={onImport} size="sm">
          <ImagePlus className="size-4" />
          Import photos
        </Button>
      </div>
    </main>
  );
}
