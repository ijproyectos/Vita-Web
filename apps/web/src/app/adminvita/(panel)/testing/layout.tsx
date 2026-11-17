import { Encabezado } from "../_componentes/ui";
import { TabsTesting } from "./_componentes/tabs";

export default function TestingLayout({ children }: LayoutProps<"/adminvita/testing">) {
  return (
    <>
      <Encabezado titulo="Testing" />
      <p className="-mt-2 mb-4 max-w-2xl px-1 text-sm text-slate-brand">
        El plan de pruebas de la app, las rondas, los bugs y lo que cuentan los testers. Solo lo ven los administradores del panel.
      </p>
      <TabsTesting />
      {children}
    </>
  );
}
