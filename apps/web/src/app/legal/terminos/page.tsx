// Draft — requires legal review before publishing.
// Cada sección describe el comportamiento real del código (acceso, familia y roles, avisos, memoria de la IA,
// límite diario, compartir con profesional, eliminación); ver CLAUDE.md. Si cambia una función, actualizar acá
// y FECHA_ACTUALIZACION en lib/legal/datos.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_EMAIL, CORREO_SOPORTE, PAIS, RESPONSABLE } from "@/lib/legal/datos";
import { Documento, Lista, Seccion } from "../documento";

export const metadata: Metadata = {
  title: "Términos y Condiciones · vita",
  description: "Las reglas de uso de vita: alcance del servicio, familia y cuidadores, inteligencia artificial y límites.",
};

const enlace = "font-semibold text-primary underline-offset-2 hover:underline";

export default function TerminosPage() {
  return (
    <Documento titulo="Términos y Condiciones">
      <Seccion titulo="1. Aceptación">
        <p>
          Estos términos regulan el uso de vita, ofrecida por {RESPONSABLE}. Al crear una cuenta o usar la aplicación
          aceptás estos términos y la{" "}
          <Link href="/legal/privacidad" className={enlace}>
            Política de Privacidad
          </Link>
          . Si no estás de acuerdo, no uses el servicio.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué es vita">
        <p>vita es una aplicación de salud personal y familiar. Con ella podés:</p>
        <Lista>
          <li>Organizar tus medicamentos y tomas, con recordatorios y control de stock de pastillas.</li>
          <li>Registrar turnos médicos, mediciones (como presión o glucemia), estudios y tu perfil de salud.</li>
          <li>Conversar por texto o por voz con vita, un asistente de inteligencia artificial que puede consultar y modificar esos datos a pedido tuyo.</li>
          <li>Acompañar a familiares: compartir su cuidado con otras personas y recibir avisos sobre ellos.</li>
          <li>Usar un modo simple, pensado para personas mayores, con letra grande y una sola acción por pantalla.</li>
        </Lista>
      </Seccion>

      <Seccion titulo="3. No es consejo médico ni un servicio de emergencias">
        <p>
          vita es una herramienta de organización y acompañamiento. <strong>No es un producto médico</strong>, no
          diagnostica, no receta y no reemplaza la consulta con un profesional de la salud. Nunca cambies, suspendas ni
          retomes un tratamiento basándote solo en lo que diga la aplicación.
        </p>
        <p>
          <strong>Ante una emergencia llamá al 107 (emergencias médicas) o al 911.</strong> Cuando pedís ayuda en el
          modo simple, vita puede avisarles a tus cuidadores, pero ese aviso depende de que tengan las notificaciones
          activadas y conexión a internet: no garantiza que lo vean a tiempo ni que alguien acuda. vita no envía
          ambulancias ni se comunica con servicios de emergencia.
        </p>
      </Seccion>

      <Seccion titulo="4. Tu cuenta">
        <Lista>
          <li>
            Podés entrar con tu correo y una contraseña, con tu cuenta de Google o con un código de 6 dígitos que te
            comparte un familiar. Sos responsable de mantener seguros tu acceso y el dispositivo que usás; podés
            agregar un PIN de bloqueo en cada dispositivo.
          </li>
          <li>La información que cargás tiene que ser veraz, y es tu responsabilidad mantenerla actualizada.</li>
          <li>Tenés que ser mayor de 18 años, o contar con la autorización de tu madre, padre o tutor.</li>
          <li>No uses el servicio para fines ilícitos, ni intentes acceder a datos de otras personas o vulnerar su seguridad.</li>
        </Lista>
      </Seccion>

      <Seccion titulo="5. Familia y cuidadores">
        <p>
          Podés sumar cuidadores a tu cuenta, o cuidar a otra persona. Cada cuidador tiene uno de dos permisos, y la
          persona cuidada puede cambiarlo o quitar al cuidador en cualquier momento:
        </p>
        <Lista>
          <li><strong>Admin:</strong> ve y edita los remedios, turnos, mediciones y el perfil de salud de la persona.</li>
          <li><strong>Lector:</strong> ve esa misma información, pero no puede cambiar nada.</li>
        </Lista>
        <p>
          Los cuidadores nunca ven tus conversaciones con vita ni lo que vita recuerda de vos. Según su configuración,
          pueden recibir avisos sobre la persona que cuidan: una toma que no se confirmó, un pedido de ayuda, un turno
          al que la persona pidió ir acompañada, poco stock de un medicamento o un resumen del día.
        </p>
        <p>
          Un cuidador también puede crear un <strong>perfil gestionado</strong> para alguien que no usa celular, y
          cargar sus datos en su nombre. Al hacerlo declara que cuenta con el consentimiento de esa persona o con la
          facultad legal de representarla, y se compromete a usar sus datos solo en su beneficio. Más adelante esa
          persona puede entrar a su propia cuenta con un código y decidir quién la cuida.
        </p>
        <p>Vinculá solo a personas de tu confianza, y usá las funciones de cuidado con el consentimiento de quien cuidás.</p>
      </Seccion>

      <Seccion titulo="6. Recordatorios y avisos">
        <p>
          Los recordatorios de tomas y turnos y los avisos a la familia son una ayuda, no una garantía. Dependen de que
          las notificaciones estén permitidas en el dispositivo, de la conexión y del sistema operativo: en iPhone y
          iPad, por ejemplo, solo llegan si agregaste vita a la pantalla de inicio. Podés configurar qué avisos recibís
          y un horario de silencio nocturno. Revisá siempre tus horarios y dosis con las indicaciones de tu médico.
        </p>
      </Seccion>

      <Seccion titulo="7. Inteligencia artificial y memoria de vita">
        <Lista>
          <li>
            El asistente y las funciones de lectura de estudios y conteo de pastillas por foto usan inteligencia
            artificial, que puede cometer errores, malinterpretar tu pedido o dar información incompleta. Verificá
            siempre lo que vita te informe o registre comparándolo con el original o con tu profesional de la salud.
            Antes de guardar datos que leyó de una foto o de un estudio, vita te los muestra para que los confirmes.
          </li>
          <li>
            <strong>Memoria:</strong> vita puede recordar lo que le contás para tenerlo presente en otras
            conversaciones, y arma un resumen de lo que hablaron. Durante la noche revisa esos recuerdos para unir los
            repetidos y, si dos se contradicen, te pregunta cuál vale. La memoria viene activada: podés verla, borrar
            un recuerdo, olvidar todo o apagarla desde Perfil → Privacidad y datos → Lo que vita recuerda de vos. En el modo
            simple vita no usa memoria.
          </li>
          <li>
            Para prestar estas funciones, el contenido que escribís, dictás o subís se envía a proveedores externos de
            inteligencia artificial y de voz, como se detalla en la Política de Privacidad.
          </li>
          <li>
            Hay un límite diario de uso de la inteligencia artificial por persona. Cuando se alcanza, esas funciones
            quedan pausadas hasta la medianoche (hora de Argentina); el resto de la aplicación sigue funcionando.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="8. Lo que cargás y lo que compartís">
        <Lista>
          <li>
            Sos responsable de los archivos, fotos y datos que subís. Si cargás información de otra persona, hacelo solo
            con su consentimiento o si sos su cuidador.
          </li>
          <li>
            Desde Compartir con profesional podés generar un enlace temporal con un resumen de tu salud. Quien tenga el
            enlace puede verlo sin iniciar sesión hasta que venza o lo revoques, así que compartilo solo con quien
            corresponda.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="9. Costo">
        <p>
          Hoy vita es gratuita. Anunciamos una versión vita+ que todavía no está disponible: no cobramos nada ni
          pedimos datos de pago. Si en el futuro alguna función pasa a ser paga, te lo vamos a informar antes, junto
          con su precio, y solo se te cobrará si lo aceptás de forma expresa.
        </p>
      </Seccion>

      <Seccion titulo="10. Disponibilidad del servicio">
        <p>
          Hacemos lo razonable para que vita esté disponible, pero no garantizamos que funcione sin interrupciones ni
          errores. Algunas funciones dependen de proveedores externos y pueden dejar de estar disponibles. Podemos
          modificar, suspender o discontinuar funciones del servicio.
        </p>
      </Seccion>

      <Seccion titulo="11. Tus datos y la eliminación de tu cuenta">
        <Lista>
          <li>Podés descargar todos tus datos en cualquier momento desde Perfil → Privacidad y datos → Descargar mis datos.</li>
          <li>Podés borrar el historial de un período desde Perfil → Privacidad y datos.</li>
          <li>
            Podés eliminar tu cuenta desde Perfil → Eliminar mi cuenta. Se borran de forma permanente todos tus datos,
            incluidas tus conversaciones y recuerdos, y la acción no se puede deshacer.
          </li>
          <li>Podemos suspender o cerrar cuentas que incumplan estos términos.</li>
        </Lista>
      </Seccion>

      <Seccion titulo="12. Limitación de responsabilidad">
        <p>
          En la medida que lo permita la ley, vita se ofrece &ldquo;tal cual&rdquo; y no nos hacemos responsables por
          decisiones de salud que tomes en base a la información de la aplicación, por errores de la inteligencia
          artificial, por un recordatorio o aviso que no llegue o llegue tarde, ni por interrupciones del servicio.
          Esto no limita los derechos que la ley te reconoce como consumidor, incluida la Ley de Defensa del
          Consumidor (Ley 24.240).
        </p>
      </Seccion>

      <Seccion titulo="13. Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de {PAIS}. Cualquier controversia se resolverá ante los tribunales
          competentes de ese país, sin perjuicio de los derechos que te correspondan como consumidor.
        </p>
      </Seccion>

      <Seccion titulo="14. Cambios en los términos">
        <p>
          Podemos modificar estos términos. Cuando el cambio sea relevante te lo vamos a informar dentro de la app. Si
          seguís usando vita después del cambio, se entiende que lo aceptás; la fecha de &ldquo;Última
          actualización&rdquo; de arriba indica la versión vigente.
        </p>
      </Seccion>

      <Seccion titulo="15. Contacto">
        <p>
          Para consultas sobre estos términos: {CONTACTO_EMAIL}. Para ayuda con la aplicación: {CORREO_SOPORTE}, o
          desde Perfil → Ayuda y soporte → Reportar un problema.
        </p>
      </Seccion>
    </Documento>
  );
}
