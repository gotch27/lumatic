import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:pointer-events-none disabled:opacity-35",
  {
    variants: {
      variant: {
        default: "border border-white/10 bg-zinc-100 text-zinc-950 hover:bg-white",
        secondary: "border border-white/[0.09] bg-white/[0.045] text-zinc-200 hover:bg-white/[0.08]",
        ghost: "text-zinc-400 hover:bg-white/[0.055] hover:text-zinc-100",
        danger: "border border-red-400/20 bg-red-400/10 text-red-200 hover:bg-red-400/20",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        icon: "size-9",
        iconSm: "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
