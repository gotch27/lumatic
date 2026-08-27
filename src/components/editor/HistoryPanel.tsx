"use client";

import { Blend, History, RotateCcw, SlidersHorizontal } from "lucide-react";

import { ADJUSTMENT_BY_KEY } from "@/editor/domain/adjustments";
import type { AdjustmentKey, HistoryEvent, RuntimePhoto } from "@/editor/domain/types";

function eventLabel(event: HistoryEvent): string {
  if (event.type === "adjustments.reset") return "Reset all adjustments";
  if (event.type === "mask.created") return event.payload.label ?? "Gradient created";
  if (event.type === "mask.geometry.changed") return event.payload.label ?? "Gradient moved";
  if (event.type === "mask.deleted") return event.payload.label ?? "Gradient deleted";
  if (event.type === "mask.adjustment.changed" && event.payload.label) return event.payload.label;
  if (event.payload.label) return event.payload.label;
  if (!event.payload.property) return "Adjustment changed";
  const property = ADJUSTMENT_BY_KEY[event.payload.property as AdjustmentKey]?.label ?? event.payload.property;
  return event.type === "mask.adjustment.changed" ? `${event.payload.maskName ?? "Gradient"} · ${property}` : property;
}

function eventValue(event: HistoryEvent): string {
  if (event.type === "adjustments.reset") return "Defaults";
  if (event.type === "mask.created") return "Added";
  if (event.type === "mask.geometry.changed") return "Moved";
  if (event.type === "mask.deleted") return "Removed";
  if (event.payload.nextValue === undefined) return "Defaults";
  const value = event.payload.nextValue ?? 0;
  return `${value > 0 ? "+" : ""}${value}`;
}

export function HistoryPanel({ photo, events }: { photo: RuntimePhoto; events: HistoryEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.03]">
          <History className="size-5 text-zinc-500" />
        </div>
        <p className="text-sm font-medium text-zinc-300">No edits yet</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">Every committed adjustment will appear here in order.</p>
      </div>
    );
  }

  return (
    <div className="panel-scroll px-3 py-3" data-testid="history-panel">
      <div className="history-line" />
      <ol className="relative space-y-1">
        <li className="history-row">
          <div className="history-dot bg-zinc-500" />
          <div>
            <p className="text-xs font-medium text-zinc-300">Original</p>
            <p className="text-[10px] text-zinc-600">Imported image</p>
          </div>
        </li>
        {events.map((event, index) => {
          const applied = index < photo.historyCursor;
          const Icon = event.type === "adjustments.reset"
            ? RotateCcw
            : event.type.startsWith("mask.")
              ? Blend
              : SlidersHorizontal;
          return (
            <li className={`history-row ${applied ? "" : "opacity-35"}`} key={event.id}>
              <div className={`history-dot ${applied ? "bg-zinc-200" : "bg-zinc-600"}`} />
              <Icon className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium text-zinc-300">{eventLabel(event)}</p>
                  <span className="font-mono text-[10px] tabular-nums text-zinc-500">{eventValue(event)}</span>
                </div>
                <p className="text-[10px] text-zinc-600">
                  {event.actor === "user" ? "You" : "Agent"} · {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
