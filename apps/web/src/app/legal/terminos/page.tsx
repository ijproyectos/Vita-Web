// Draft — requires legal review before publishing.
// Las descripciones de funciones (modo cuidador, IA, eliminación de cuenta)
// reflejan el comportamiento real del código; ver CLAUDE.md.
import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_EMAIL, PAIS, RESPONSABLE } from "@/lib/legal/datos";
import { Documento, Lista, Seccion } from "../documento";

export const metadata: Metadata = {
  title: "Términos y Condiciones · vita",
  description: "Las reglas de uso de vita: alcance del servicio, responsabilidades y límites.",
};

export default function TerminosPage() {
  return (
    <Documento titulo="Términos y Condiciones">
      <Seccion titulo="1. Aceptación">
        <p>
          Estos términos regulan el uso de vita, ofrecida por {RESPONSABLE}. Al crear una cuenta o usar la aplicación
          aceptás estos términos y la{" "}
          <Link href="/legal/privacidad" className="font-semibold text-primary underline-offset-2 hover:underline">
            Política de Privacidad
          </Link>
          . Si no estás de acuerdo, no uses el servicio.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué es vita">
        <p>
          vita es una aplicación de salud personal que te ayuda a organizar tus medicamentos, turnos médicos, estudios
          y perfil de salud, e incluye un asistente de inteligencia artificial con el que podés conversar por texto o
          por voz y que puede consultar y modificar esos datos a pedido tuyo.
        </p>
      </Seccion>

      <Seccion titulo="3. No es consejo médico ni un servicio de emergencias">
        <p>
          vita es una herramienta de organización y acompañamiento. <strong>No es un producto médico</strong>, no
          diagnostica, no receta y no reemplaza la consulta con un profesional de la salud. Ante una emergencia
          llamá al servicio de emergencias de tu zona; vita no puede enviar ayuda ni avisar a terceros en tiempo real.
          Nunca cambies, suspendas ni retomes un tratamiento basándote solo en lo que diga la aplicación.
        </p>
      </Seccion>

      <Seccion titulo="4. Tu cuenta y tus responsabilidades">
        <Lista>
          <li>Iniciás sesión con tu cuenta de Google y sos responsable de mantenerla segura.</li>
          <li>La información que cargás tiene que ser veraz y es tu responsabilidad mantenerla actualizada.</li>
          <li>Tenés que ser mayor de 18 años, o contar con la autorización de tu madre, padre o tutor.</li>
          <li>No uses el servicio para fines ilícitos, ni intentes acceder a datos de otras personas o vulnerar su seguridad.</li>
          <li>
            Los recordatorios y alertas de la aplicación son una ayuda, no una garantía: revisá siempre tus horarios y
            dosis con las indicaciones de tu médico.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="5. Modo cuidador">
        <p>
          Podés vincular a otras personas como cuidadores, o actuar como cuidador de alguien. Un cuidador vinculado
          puede ver los medicamentos, la adherencia y el stock de pastillas de la persona cuidada, agregar
          medicamentos nuevos y marcar tomas como realizadas. Solo vinculá a quien cuente con tu consentimiento y, si
          sos cuidador, usá estas funciones únicamente con el consentimiento de la persona cuidada y en su beneficio.
          La persona cuidada puede revocar el vínculo en cualquier momento.
        </p>
      </Seccion>

      <Seccion titulo="6. Limitaciones de la inteligencia artificial">
        <p>
          El asistente y las funciones de extracción y conteo usan inteligencia artificial, que puede cometer errores,
          malinterpretar tu pedido o entregar información incompleta o desactualizada. Verificá siempre lo que vita te
          informe o registre, por ejemplo la cantidad de pastillas contadas a partir de una foto, o los valores
          extraídos de un estudio médico, comparándolos con el original o con tu profesional de la salud. Aplicamos un
          límite diario de uso de IA por persona, que puede impedirte usar estas funciones hasta el día siguiente.
        </p>
      </Seccion>

      <Seccion titulo="7. Disponibilidad del servicio">
        <p>
          Hacemos lo razonable para que vita esté disponible, pero no garantizamos que funcione sin interrupciones ni
          errores. Algunas funciones dependen de proveedores externos y pueden dejar de estar disponibles. Podemos
          modificar, suspender o discontinuar funciones del servicio.
        </p>
      </Seccion>

      <Seccion titulo="8. Eliminación de la cuenta">
        <p>
          Podés eliminar tu cuenta en cualquier momento desde Perfil → Privacidad y datos → Eliminar mi cuenta. Se
          borran de forma permanente todos tus datos, y la acción no se puede deshacer. Antes de hacerlo podés
          descargar tu historial desde Exportar mi historial. Podemos suspender o cerrar cuentas que incumplan estos
          términos.
        </p>
      </Seccion>

      <Seccion titulo="9. Limitación de responsabilidad">
        <p>
          En la medida que lo permita la ley, vita se ofrece &ldquo;tal cual&rdquo; y no nos hacemos responsables por
          decisiones de salud que tomes en base a la información de la aplicación, por errores de la inteligencia
          artificial, por la falta de aviso de una alerta o por interrupciones del servicio. Esto no limita los
          derechos que la ley reconoce irrenunciablemente a los consumidores.
        </p>
      </Seccion>

      <Seccion titulo="10. Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de {PAIS}. Cualquier controversia se resolverá ante los tribunales
          competentes de ese país, sin perjuicio de los derechos que te correspondan como consumidor.
        </p>
      </Seccion>

      <Seccion titulo="11. Cambios en los términos">
        <p>
          Podemos modificar estos términos. Cuando el cambio sea relevante te lo informaremos dentro de la app. Si
          seguís usando vita después del cambio, se entiende que lo aceptás; la fecha de &ldquo;Última
          actualización&rdquo; de arriba indica la versión vigente.
        </p>
      </Seccion>

      <Seccion titulo="12. Contacto">
        <p>Para consultas sobre estos términos: {CONTACTO_EMAIL}.</p>
      </Seccion>
    </Documento>
  );
}
