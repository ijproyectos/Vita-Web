import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary p-6">
      <Card className="flex w-full max-w-sm flex-col items-center gap-4 p-8 text-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-6" strokeWidth={1.6} />
        </div>
        <h1 className="text-xl font-semibold">No se pudo iniciar sesión</h1>
        <p className="text-sm text-muted-foreground">
          Hubo un problema al completar el inicio de sesión con Google.
          Intentá de nuevo.
        </p>
        <Button nativeButton={false} render={<Link href="/login" />}>
          Reintentar
        </Button>
      </Card>
    </div>
  );
}
