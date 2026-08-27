"use client";

import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn("relative flex h-5 w-full touch-none select-none items-center", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-px w-full grow overflow-hidden bg-white/20">
      <SliderPrimitive.Range className="absolute h-full bg-amber-300" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block size-3.5 rounded-full border border-zinc-950 bg-zinc-100 shadow-[0_1px_6px_rgba(0,0,0,.7)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;
