import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary border border-primary/15",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/50",
        destructive:
          "bg-destructive/8 text-destructive border border-destructive/12",
        success:
          "bg-success/8 text-success border border-success/12",
        warning:
          "bg-warning/8 text-warning border border-warning/12",
        muted:
          "bg-muted text-muted-foreground border border-border/50",
        outline:
          "text-foreground border border-border/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
