// Draft — requires legal review before publishing.
// El contenido describe lo que hace el código (verificado contra el repo):
// ver lib/exportar, lib/cuenta, lib/inventario/contar.ts, lib/voz,
// lib/estudios, lib/chat, lib/uso-ia y supabase/migrations. Si cambia el
// tratamiento de datos, actualizar acá y FECHA_ACTUALIZACION.
import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_EMAIL, PAIS, RESPONSABLE } from "@/lib/legal/datos";
import { Documento, Lista, Seccion } from "../documento";

export const metadata: Metadata = {
  title: "Política de Privacidad · vita",
  description: "Qué datos recolecta y usa vita, para qué, con quién se comparten y cuáles son tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <Documento titulo="Política de Privacidad">
      <Seccion titulo="1. Quién es responsable de tus datos">
        <p>
          vita es una aplicación de salud personal. El responsable del tratamiento de tus datos es {RESPONSABLE}, con
          domicilio en {PAIS}. Para cualquier consulta sobre esta política podés escribir a {CONTACTO_EMAIL}.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué datos recolectamos">
        <Lista>
          <li>
            <strong>Cuenta:</strong> al iniciar sesión con Google recibimos tu nombre, tu email y tu foto de perfil.
            No recibimos tu contraseña de Google.
          </li>
          <li>
            <strong>Perfil de salud:</strong> lo que vos cargás o le contás a vita: fecha de nacimiento o rango de
            edad, género, grupo sanguíneo, altura, peso, obra social y número de afiliado, condiciones de salud,
            alergias y contacto de emergencia.
          </li>
          <li>
            <strong>Medicamentos y tomas:</strong> medicamentos, dosis, horarios, indicaciones, stock de pastillas, y
            el historial de qué dosis confirmaste y cuándo.
          </li>
          <li>
            <strong>Turnos médicos:</strong> especialidad, profesional, lugar, fecha, hora, motivo y notas.
          </li>
          <li>
            <strong>Estudios médicos:</strong> la foto que subís se guarda en un almacenamiento privado, al que solo
            accedés vos. Además guardamos los datos que la inteligencia artificial extrae de la imagen (tipo de
            estudio, fecha, resumen y valores).
          </li>
          <li>
            <strong>Fotos de blísters de pastillas:</strong> la foto se envía a un servicio de inteligencia
            artificial para contar las pastillas y <strong>no se guarda</strong> en vita. Solo se conserva la
            cantidad que confirmás.
          </li>
          <li>
            <strong>Conversaciones con vita:</strong> los mensajes que intercambiás con el asistente se guardan para
            que puedas retomar tus conversaciones. Podés borrar el historial desde el chat.
          </li>
          <li>
            <strong>Voz:</strong> si usás el modo voz, el audio de tu micrófono se envía a un servicio externo para
            transcribirlo a texto. vita <strong>no guarda el audio</strong>; el texto resultante entra al chat como
            cualquier otro mensaje y se guarda como tal. Las respuestas de vita en voz se generan a partir del texto
            de la respuesta, y tampoco se guardan.
          </li>
          <li>
            <strong>Cuidado compartido:</strong> las invitaciones y vínculos entre cuidadores y personas cuidadas
            (incluido el email invitado y los códigos de vinculación temporales), y los perfiles en borrador que un
            cuidador arma para otra persona antes de que ella tenga cuenta, con sus medicamentos.
          </li>
          <li>
            <strong>Contadores de uso de IA:</strong> por día, cantidad de llamadas y de tokens consumidos, para
            aplicar un límite diario de uso por persona.
          </li>
          <li>
            <strong>Datos técnicos de sesión:</strong> usamos cookies estrictamente necesarias para mantener tu sesión
            iniciada. No usamos cookies publicitarias ni herramientas de analítica o seguimiento.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="3. Para qué usamos tus datos">
        <Lista>
          <li>Mostrarte y gestionar tu rutina de medicamentos, turnos, estudios y perfil de salud.</li>
          <li>Que vita pueda responderte, y leer o modificar esos datos cuando se lo pedís.</li>
          <li>Extraer información de tus estudios y contar pastillas a partir de fotos, a pedido tuyo.</li>
          <li>Permitir que las personas que vos autorices vean tu adherencia y te ayuden con tu medicación.</li>
          <li>Mantener la seguridad del servicio y aplicar el límite diario de uso de IA.</li>
        </Lista>
        <p>No vendemos tus datos ni los usamos para publicidad.</p>
      </Seccion>

      <Seccion titulo="4. Con quién compartimos tus datos">
        <p>
          Para funcionar, vita usa proveedores externos que procesan datos por cuenta nuestra. Cada uno recibe solo lo
          necesario para su función:
        </p>
        <Lista>
          <li>
            <strong>Supabase</strong> (base de datos, autenticación y almacenamiento de archivos): guarda toda tu
            información. Los servidores están en la región us-west-2, en Estados Unidos.
          </li>
          <li>
            <strong>Anthropic</strong> (inteligencia artificial): recibe tus mensajes del chat y los datos de salud que
            vita consulta para responderte, las fotos de estudios médicos para extraer su contenido, el texto que
            escribís o dictás en el onboarding conversacional y las fotos de blísters para contar pastillas.
          </li>
          <li>
            <strong>Groq</strong> (transcripción de voz): recibe el audio que grabás en modo voz para convertirlo en
            texto.
          </li>
          <li>
            <strong>Deepgram</strong> (síntesis de voz): recibe el texto de las respuestas de vita, sin emojis, para
            convertirlo en audio.
          </li>
          <li>
            <strong>Netlify</strong> (alojamiento): aloja la aplicación y por lo tanto procesa el tráfico entre tu
            dispositivo y vita.
          </li>
          <li>
            <strong>Google</strong> (inicio de sesión): te autentica y nos informa tu nombre, email y foto.
          </li>
        </Lista>
        <p>
          vita también tiene construido, pero <strong>desactivado</strong>, el envío de alertas por email mediante
          Resend. Mientras siga desactivado, no se envía ningún email ni se comparten datos con ese proveedor. Si se
          activa en el futuro, actualizaremos esta política antes.
        </p>
        <p>
          Además, si vinculás a un cuidador, esa persona puede ver tus medicamentos, tu adherencia y tu stock de
          pastillas, y puede agregar medicamentos y marcar tomas, según se describe en los Términos y Condiciones.
        </p>
        <p>
          <strong>Transferencia internacional:</strong> varios de estos proveedores tratan datos fuera de {PAIS}
          , en particular en Estados Unidos. Al aceptar esta política, consentís expresamente esa transferencia. Los
          proveedores tienen sus propias políticas de privacidad y de retención, que no controlamos.
        </p>
      </Seccion>

      <Seccion titulo="5. Datos de salud y consentimiento">
        <p>
          Los datos de salud son datos sensibles según la Ley 25.326 de Protección de los Datos Personales. Los
          tratamos únicamente con tu consentimiento expreso, que das al aceptar esta política y al cargar esa
          información. Nadie puede obligarte a proporcionar datos sensibles: cargá solo lo que quieras compartir, y
          podés retirar tu consentimiento en cualquier momento eliminando tus datos o tu cuenta.
        </p>
        <p>
          vita no es un producto médico ni reemplaza el consejo, diagnóstico o tratamiento de un profesional de la
          salud.
        </p>
      </Seccion>

      <Seccion titulo="6. Cuánto tiempo conservamos tus datos">
        <p>
          Conservamos tus datos mientras tengas tu cuenta. Cuando eliminás tu cuenta (Perfil → Privacidad y datos →
          Eliminar mi cuenta) se borran de forma permanente tu perfil, medicamentos, historial de tomas, turnos,
          estudios y sus fotos, conversaciones, vínculos de cuidado y contadores de uso. Esta acción no se puede
          deshacer. Los proveedores mencionados pueden conservar copias de seguridad o registros por el tiempo que
          establezcan sus propias políticas.
        </p>
      </Seccion>

      <Seccion titulo="7. Tus derechos">
        <Lista>
          <li>
            <strong>Acceso:</strong> podés ver tus datos en la app y descargarlos desde Perfil → Privacidad y datos →
            Exportar mi historial, en PDF o en JSON.
          </li>
          <li>
            <strong>Rectificación:</strong> podés corregir tu perfil, medicamentos y turnos desde la app, o pedírselo
            a vita.
          </li>
          <li>
            <strong>Supresión:</strong> podés borrar tu historial de chat, quitar registros puntuales o eliminar tu
            cuenta completa.
          </li>
        </Lista>
        <p>
          Según el artículo 14 de la Ley 25.326, el derecho de acceso se puede ejercer en forma gratuita a intervalos
          no inferiores a seis meses, salvo que acredites un interés legítimo. También podés escribirnos a{" "}
          {CONTACTO_EMAIL} para ejercer tus derechos.
        </p>
        <p>
          La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de la Ley 25.326 y tiene la
          atribución de atender las denuncias y reclamos de quienes se vean afectados en sus derechos por
          incumplimiento de las normas de protección de datos personales.
        </p>
      </Seccion>

      <Seccion titulo="8. Seguridad">
        <p>
          Aplicamos medidas razonables para proteger tu información: cada persona accede únicamente a sus propios
          datos mediante reglas de seguridad a nivel de fila en la base de datos, las fotos de estudios se guardan en
          un almacenamiento privado y la comunicación viaja cifrada por HTTPS. Ningún sistema es completamente
          infalible; si detectás un problema de seguridad, avisanos por el medio de contacto indicado.
        </p>
      </Seccion>

      <Seccion titulo="9. Menores de edad">
        <p>
          vita está pensada para personas mayores de 18 años. Si sos menor de edad, solo podés usarla con el
          consentimiento y la supervisión de tu madre, padre o tutor. Si tomamos conocimiento de datos de un menor
          cargados sin esa autorización, los eliminaremos.
        </p>
      </Seccion>

      <Seccion titulo="10. Cambios en esta política">
        <p>
          Podemos actualizar esta política. Cuando el cambio sea relevante te lo vamos a informar dentro de la app, y
          la fecha de &ldquo;Última actualización&rdquo; de arriba siempre indica la versión vigente.
        </p>
      </Seccion>

      <Seccion titulo="11. Contacto">
        <p>
          Para consultas sobre privacidad o para ejercer tus derechos: {CONTACTO_EMAIL}. Las condiciones de uso del
          servicio están en los{" "}
          <Link href="/legal/terminos" className="font-semibold text-primary underline-offset-2 hover:underline">
            Términos y Condiciones
          </Link>
          .
        </p>
      </Seccion>
    </Documento>
  );
}
