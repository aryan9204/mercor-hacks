import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The catch symbol: shown only when the checker actually caught the case (c.caught === true). */
export function CatchBadge({ className, label = "Caught" }) {
  return (
    <Badge variant="outline" className={cn("h-6 gap-1.5 border-good/60 bg-good/15 px-2.5 text-[11px] font-semibold text-[#8ee08e]", className)}>
      <ShieldCheck className="size-3.5" strokeWidth={2.5} aria-hidden />
      {label}
    </Badge>
  );
}
