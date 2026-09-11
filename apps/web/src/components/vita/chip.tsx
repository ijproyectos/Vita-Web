import { cn } from "@/lib/utils";
import type { ColorChip } from "@/lib/perfil/tipos";

const CLASES_COLOR: Record<ColorChip, string> = {
  teal: "bg-chip-teal-bg text-chip-teal-ink",
  violet: "bg-chip-violet-bg text-chip-violet-ink",
  amber: "bg-chip-amber-bg text-chip-amber-ink",
  rose: "bg-chip-rose-bg text-chip-rose-ink",
};

export function Chip({
  color = "teal",
  className,
  children,
}: {
  color?: ColorChip;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold",
        CLASES_COLOR[color],
        className
      )}
    >
      {children}
    </span>
  );
}
