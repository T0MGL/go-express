import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted relative overflow-hidden",
        "after:absolute after:inset-0 after:translate-x-[-100%]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent",
        "after:animate-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
