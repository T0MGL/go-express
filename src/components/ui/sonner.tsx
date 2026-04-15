import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ position, ...props }: ToasterProps) => {
  const isMobile = useIsMobile();
  const resolvedPosition = position ?? (isMobile ? "top-center" : "bottom-right");
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position={resolvedPosition}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/70 group-[.toaster]:shadow-premium-lg group-[.toaster]:rounded-xl group-[.toaster]:text-[13px]",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-[12px]",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-lg group-[.toast]:text-[12px] group-[.toast]:font-medium",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-lg group-[.toast]:text-[12px]",
          success: "group-[.toaster]:!border-success/20",
          error: "group-[.toaster]:!border-destructive/20",
          warning: "group-[.toaster]:!border-warning/20",
          info: "group-[.toaster]:!border-primary/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
