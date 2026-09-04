"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCheck } from "lucide-react";
import { marcarTodosTomadosAction } from "./actions";

export function MarcarTodosButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pendiente}
      onClick={() =>
        startTransition(async () => {
          await marcarTodosTomadosAction();
          router.refresh();
        })
      }
    >
      <CheckCheck className="size-4" />
      {pendiente ? "Marcando…" : "Marcar todos tomados"}
    </Button>
  );
}
