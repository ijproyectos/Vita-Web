-- Seed del módulo Testing del panel: los 75 casos de prueba del plan (vita_plan_de_pruebas.xlsx, portados de vita-track).
-- Correr a mano DESPUÉS de migrations/063_track_testing.sql, con psql. Idempotente: no duplica si se corre de nuevo.
--   psql "<conexión>" -f supabase/seeds/track_casos.sql
-- Es contenido de producto (sin datos de personas), por eso va aparte de la migración.


insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-01$t$, $t$Acceso$t$, $t$Crear cuenta$t$, $t$Alta$t$, $t$Mail nuevo, sin sesión$t$, $t$1. Ir a /login
2. Crear cuenta con nombre y mail
3. Completar el código de 6 cajas$t$, $t$Entra y va a 'Para quién'. El nombre aparece con mayúscula en la app.$t$, 10)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-02$t$, $t$Acceso$t$, $t$Entrar con Google$t$, $t$Alta$t$, $t$Cuenta de Google$t$, $t$1. /login → Google
2. Elegir cuenta$t$, $t$Vuelve a la app con sesión abierta, sin errores.$t$, 20)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-03$t$, $t$Acceso$t$, $t$Olvidé / link por mail$t$, $t$Media$t$, $t$Cuenta existente$t$, $t$1. /login → Olvidé
2. Abrir el mail$t$, $t$Llega el mail y el link abre sesión.$t$, 30)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-04$t$, $t$Acceso$t$, $t$Código incorrecto$t$, $t$Media$t$, $t$$t$, $t$1. Escribir un código inventado de 6 dígitos$t$, $t$Mensaje genérico 'Código incorrecto o vencido'. Tras ~10 intentos, frena.$t$, 40)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-05$t$, $t$Acceso$t$, $t$Cerrar sesión$t$, $t$Alta$t$, $t$Con sesión$t$, $t$1. Perfil → Cerrar sesión → confirmar$t$, $t$Vuelve a /login. Atrás del navegador no muestra datos.$t$, 50)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-06$t$, $t$Onboarding$t$, $t$Charla inicial (para mí)$t$, $t$Alta$t$, $t$Cuenta nueva$t$, $t$1. Para quién → Yo
2. Responder fecha de nacimiento, condiciones, alergias, 2 remedios con horario, un turno, mediciones$t$, $t$Todo queda guardado en Perfil / Mis medicamentos / Mis turnos. No repregunta lo ya respondido.$t$, 60)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-07$t$, $t$Onboarding$t$, $t$Charla para otra persona$t$, $t$Alta$t$, $t$Cuenta nueva$t$, $t$1. Para quién → Cuido a alguien
2. Cargar nombre y datos de la persona$t$, $t$Se crea un perfil a cargo con color. Aparece en el selector de perfil.$t$, 70)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-08$t$, $t$Onboarding$t$, $t$Terminar después / recargar$t$, $t$Media$t$, $t$Charla a medias$t$, $t$1. Responder 2 preguntas
2. Recargar la página$t$, $t$Retoma donde quedó, sin perder lo respondido.$t$, 80)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-09$t$, $t$Onboarding$t$, $t$Omitir$t$, $t$Baja$t$, $t$Cuenta nueva$t$, $t$1. Para quién → Omitir$t$, $t$Va a la app y muestra el tour una vez.$t$, 90)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-10$t$, $t$Onboarding$t$, $t$Tour primera vez$t$, $t$Media$t$, $t$Recién terminó onboarding$t$, $t$1. Recorrer o saltear el tour
2. Recargar /app$t$, $t$El tour no vuelve a aparecer en ese celular.$t$, 100)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-11$t$, $t$Medicamentos$t$, $t$Alta de medicamento$t$, $t$Alta$t$, $t$Con sesión$t$, $t$1. + → Medicamento
2. Elegir 'Forxiga' de la lista
3. Forma, cantidad por toma, 2 horarios, días, stock
4. Guardar$t$, $t$Aparece en Rutina en los 2 momentos. Droga 'Dapagliflozina' en letra chica (si 056 aplicada).$t$, 110)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-12$t$, $t$Medicamentos$t$, $t$Selector de hora y momento$t$, $t$Media$t$, $t$Alta abierta$t$, $t$1. Elegir Mañana con 06:30
2. Cambiar a Noche$t$, $t$06:30 se respeta con Mañana; al pasar a Noche la hora salta a ~21:00 y se limpia la comida que no corresponde.$t$, 120)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-13$t$, $t$Medicamentos$t$, $t$Editar medicamento$t$, $t$Alta$t$, $t$Medicamento cargado$t$, $t$1. Mis medicamentos → editar
2. Cambiar horario y guardar$t$, $t$Rutina refleja el horario nuevo.$t$, 130)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-14$t$, $t$Medicamentos$t$, $t$Eliminar medicamento$t$, $t$Media$t$, $t$Medicamento cargado$t$, $t$1. Detalle → Eliminar → confirmar$t$, $t$Desaparece de Rutina y de Mis medicamentos.$t$, 140)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-15$t$, $t$Medicamentos$t$, $t$Contar pastillas con foto$t$, $t$Media$t$, $t$Medicamento con stock$t$, $t$1. Mis medicamentos → fila → cámara
2. Foto del blíster (frente y dorso)
3. Corregir y guardar$t$, $t$Muestra un número editable; nunca guarda solo. Stock actualizado.$t$, 150)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-16$t$, $t$Medicamentos$t$, $t$Stock baja al tomar$t$, $t$Alta$t$, $t$Stock = 6$t$, $t$1. Marcar tomada
2. Desmarcar$t$, $t$Baja a 5 y vuelve a 6. Doble toque no descuenta dos veces.$t$, 160)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-17$t$, $t$Medicamentos$t$, $t$Aviso de stock bajo$t$, $t$Media$t$, $t$Stock = 5$t$, $t$1. Marcar tomada (queda 4)$t$, $t$Badge 'Quedan 4' y banner en Inicio.$t$, 170)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-18$t$, $t$Rutina$t$, $t$Hoy: marcar tomada$t$, $t$Alta$t$, $t$Remedios de hoy$t$, $t$1. Rutina → Hoy → tocar el check$t$, $t$Queda tomada; el anillo de Inicio sube.$t$, 180)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-19$t$, $t$Rutina$t$, $t$Marcar todas$t$, $t$Media$t$, $t$Varias del mismo momento$t$, $t$1. 'Ya tomé las N'$t$, $t$Todas tomadas. Sin conexión: avisa y revierte.$t$, 190)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-20$t$, $t$Rutina$t$, $t$Próximos e Historial$t$, $t$Media$t$, $t$Datos de días previos$t$, $t$1. Pestañas Próximos / Historial$t$, $t$Próximos lista turnos y tomas futuras; Historial muestra calendario con lo tomado.$t$, 200)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-21$t$, $t$Rutina$t$, $t$Toma vencida$t$, $t$Media$t$, $t$Remedio con hora pasada sin tomar$t$, $t$1. Abrir Rutina$t$, $t$Se ve como vencida/'Se pasó'.$t$, 210)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-22$t$, $t$Turnos$t$, $t$Alta de turno$t$, $t$Alta$t$, $t$Con sesión$t$, $t$1. + → Turno
2. Especialidad, día, hora, lugar, qué llevar
3. Guardar$t$, $t$Aparece en Rutina y Mis turnos. El mapa muestra el lugar.$t$, 220)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-23$t$, $t$Turnos$t$, $t$Editar turno$t$, $t$Alta$t$, $t$Turno cargado$t$, $t$1. Detalle → Editar
2. Cambiar hora → Guardar$t$, $t$El botón Guardar se ve (sin barra de abajo). Guarda el cambio y conserva lo tildado de 'qué llevar'.$t$, 230)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-24$t$, $t$Turnos$t$, $t$Voy a ir acompañado$t$, $t$Media$t$, $t$Tener un cuidador aceptado$t$, $t$1. Crear turno con 'Voy a ir acompañado'$t$, $t$Cuidadores (y uno mismo) reciben aviso 'X pidió compañía'.$t$, 240)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-25$t$, $t$Turnos$t$, $t$Aviso turno del mismo día$t$, $t$Alta$t$, $t$Avisos activados$t$, $t$1. Crear un turno para hoy dentro de unas horas$t$, $t$Llega aviso 'Hoy a las X tenés turno' al guardar.$t$, 250)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-26$t$, $t$Turnos$t$, $t$Aviso noche anterior$t$, $t$Alta$t$, $t$Avisos activados$t$, $t$1. Crear turno para mañana
2. Esperar 20-23 h$t$, $t$Llega aviso el día anterior a la noche.$t$, 260)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-27$t$, $t$Avisos$t$, $t$Activar notificaciones$t$, $t$Alta$t$, $t$Celular (en iPhone, app instalada en inicio)$t$, $t$1. Perfil → Activar notificaciones → Permitir$t$, $t$Queda activado. En iPhone sin instalar, explica cómo agregar a inicio.$t$, 270)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-28$t$, $t$Avisos$t$, $t$Aviso a la hora del remedio$t$, $t$Alta$t$, $t$Remedio en 10 min, avisos activos$t$, $t$1. Esperar la hora$t$, $t$Push 'Es hora de…' con botones 'Ya la tomé' / 'En 15 min'.$t$, 280)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-29$t$, $t$Avisos$t$, $t$Botón 'Ya la tomé' del push$t$, $t$Alta$t$, $t$Push recibido$t$, $t$1. Tocar 'Ya la tomé'$t$, $t$La toma queda marcada en Rutina.$t$, 290)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-30$t$, $t$Avisos$t$, $t$Posponer 15 min$t$, $t$Media$t$, $t$Push recibido$t$, $t$1. Tocar 'En 15 min'$t$, $t$Vuelve a avisar ~15 min después.$t$, 300)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-31$t$, $t$Avisos$t$, $t$Segundo aviso$t$, $t$Media$t$, $t$No marcar la toma$t$, $t$1. Esperar 30-60 min$t$, $t$Llega un segundo aviso.$t$, 310)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-32$t$, $t$Avisos$t$, $t$Aviso al cuidador por dosis no tomada$t$, $t$Alta$t$, $t$Persona con cuidador$t$, $t$1. No marcar la toma
2. Esperar la espera configurada (30 min)$t$, $t$El cuidador recibe 'X todavía no tomó…'.$t$, 320)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-33$t$, $t$Avisos$t$, $t$Centro de avisos$t$, $t$Media$t$, $t$Avisos recibidos$t$, $t$1. Inicio → campana
2. Filtro Todos/Persona/Vos
3. Marcar todo leído$t$, $t$Lista Hoy/Antes, el punto de no leído se apaga.$t$, 330)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-34$t$, $t$Avisos$t$, $t$Configuración y silencio nocturno$t$, $t$Media$t$, $t$$t$, $t$1. Avisos → Configuración
2. Apagar turnos, prender silencio 23-07$t$, $t$Respeta los toggles; las tomas sin confirmar suenan igual.$t$, 340)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-35$t$, $t$Mi Salud$t$, $t$Subir estudio (PDF)$t$, $t$Alta$t$, $t$PDF de un análisis$t$, $t$1. Mi Salud → estudio → Subir
2. Revisar nombre/fecha/lugar → Guardar$t$, $t$Extrae tipo, fecha, valores. Se ve el original.$t$, 350)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-36$t$, $t$Mi Salud$t$, $t$Estudio con foto$t$, $t$Media$t$, $t$Celular$t$, $t$1. Sacar foto$t$, $t$Se analiza. HEIC: avisa formato no soportado.$t$, 360)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-37$t$, $t$Mi Salud$t$, $t$Cargar medición$t$, $t$Alta$t$, $t$$t$, $t$1. + → Medición → Presión 130/85$t$, $t$Aparece en Monitoreo y en el feed con etiqueta MANUAL.$t$, 370)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-38$t$, $t$Mi Salud$t$, $t$Plan de monitoreo$t$, $t$Media$t$, $t$Migración 053 aplicada$t$, $t$1. Nuevo monitoreo → Presión 2 horarios$t$, $t$Filas 'Medir…' en Rutina y push 'Hora de medir'.$t$, 380)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-39$t$, $t$Mi Salud$t$, $t$Eliminar y compartir estudio$t$, $t$Baja$t$, $t$Estudio cargado$t$, $t$1. Detalle → Compartir / Eliminar$t$, $t$Funcionan; eliminar pide confirmación.$t$, 390)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-40$t$, $t$Perfil$t$, $t$Editar perfil$t$, $t$Alta$t$, $t$$t$, $t$1. Perfil → Editar
2. Cambiar obra social, grupo sanguíneo, contacto de emergencia
3. Guardar$t$, $t$Resumen muestra los datos nuevos.$t$, 400)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-41$t$, $t$Perfil$t$, $t$Condiciones y alergias$t$, $t$Media$t$, $t$$t$, $t$1. Agregar y quitar una condición$t$, $t$Se ve en Perfil y Mi Salud.$t$, 410)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-42$t$, $t$Perfil$t$, $t$PIN de bloqueo$t$, $t$Media$t$, $t$$t$, $t$1. Seguridad → PIN
2. Cerrar y abrir la app$t$, $t$Pide el PIN.$t$, 420)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-43$t$, $t$Perfil$t$, $t$Para tu médico (PDF y link)$t$, $t$Media$t$, $t$Datos cargados$t$, $t$1. Compartir → PDF
2. Crear link 7 días y abrirlo en incógnito
3. Revocar$t$, $t$PDF y link muestran remedios, adherencia, estudios. Link revocado no abre.$t$, 430)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-44$t$, $t$Perfil$t$, $t$Descargar mis datos$t$, $t$Baja$t$, $t$$t$, $t$1. Privacidad → Descargar$t$, $t$Baja un JSON con los datos.$t$, 440)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-45$t$, $t$Perfil$t$, $t$Reportar un problema$t$, $t$Baja$t$, $t$$t$, $t$1. Ayuda → Reportar$t$, $t$Llega el mail a soporte con la versión.$t$, 450)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-46$t$, $t$Perfil$t$, $t$Eliminar cuenta$t$, $t$Media$t$, $t$Cuenta de prueba descartable$t$, $t$1. Privacidad → Eliminar cuenta → confirmar$t$, $t$Se cierra sesión y no se puede volver a entrar con esos datos.$t$, 460)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-47$t$, $t$Familia$t$, $t$Crear perfil a cargo$t$, $t$Alta$t$, $t$$t$, $t$1. Familia → Crear perfil
2. Nombre → 'Cargar sus remedios'$t$, $t$Se activa esa persona y abre el alta. Nombre repetido: rechaza.$t$, 470)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-48$t$, $t$Familia$t$, $t$Cambiar de perfil$t$, $t$Alta$t$, $t$Perfil a cargo creado$t$, $t$1. Tocar el nombre arriba → elegir a la persona$t$, $t$Inicio, Rutina y Mi Salud muestran SUS datos, con su color.$t$, 480)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-49$t$, $t$Familia$t$, $t$Invitar cuidador$t$, $t$Alta$t$, $t$Segunda cuenta de prueba$t$, $t$1. Ficha → Invitar a un cuidador (mail)
2. Con la otra cuenta abrir /c/<código>$t$, $t$El invitado ve 'Vas a cuidar a X'; al aceptar, a quien invitó le llega 'X ya cuida a Y'.$t$, 490)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-50$t$, $t$Familia$t$, $t$Rol Lector (solo mirar)$t$, $t$Alta$t$, $t$Cuidador con rol Lector$t$, $t$1. Entrar como el Lector$t$, $t$Ve la vista de solo mirar, sin barra; no puede editar ni entrar a otras rutas.$t$, 500)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-51$t$, $t$Familia$t$, $t$Cambiar rol / quitar cuidador$t$, $t$Media$t$, $t$Cuidador aceptado$t$, $t$1. Te cuidan → cambiar a Lector → quitar$t$, $t$El otro pierde permisos al instante.$t$, 510)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-52$t$, $t$Familia$t$, $t$Conectar su celular$t$, $t$Media$t$, $t$Perfil a cargo$t$, $t$1. Ficha → Conectar su celular
2. En otro celular entrar con el código$t$, $t$Entra como esa persona (en modo simple).$t$, 520)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-53$t$, $t$Familia$t$, $t$Hoy en la ficha + Recordarle$t$, $t$Media$t$, $t$Admin, dosis sin tomar$t$, $t$1. Ficha → Hoy → Recordarle$t$, $t$La persona recibe push 'Tu familiar te recuerda…'. Máx 1 cada 15 min.$t$, 530)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-54$t$, $t$Modo simple$t$, $t$Entrar y quedar en modo simple$t$, $t$Alta$t$, $t$Perfil con remedios$t$, $t$1. Activar modo simple
2. Cerrar y abrir la app, intentar ir a /app/perfil$t$, $t$Siempre vuelve a modo simple.$t$, 540)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-55$t$, $t$Modo simple$t$, $t$Tomar la dosis$t$, $t$Alta$t$, $t$Dosis ahora$t$, $t$1. 'Ya tomé'$t$, $t$¡Listo!; 'Me equivoqué' deshace.$t$, 550)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-56$t$, $t$Modo simple$t$, $t$No la tomé$t$, $t$Media$t$, $t$Migración 057 aplicada$t$, $t$1. Tocar 'No la tomé'$t$, $t$Deja de avisar; el cuidador lo ve en el resumen de las 21 h.$t$, 560)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-57$t$, $t$Modo simple$t$, $t$Rutina de hoy$t$, $t$Media$t$, $t$Varias tomas$t$, $t$1. 'Ver rutina completa'$t$, $t$Lista por momentos con estados; turnos y mediciones intercalados.$t$, 570)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-58$t$, $t$Modo simple$t$, $t$Charla por voz$t$, $t$Media$t$, $t$Micrófono$t$, $t$1. '¿Qué me toca?' / '¿Ya tomé?'
2. Pregunta libre$t$, $t$Responde corto; voz argentina; 'sí/no' entendido.$t$, 580)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-59$t$, $t$Modo simple$t$, $t$Botón Ayuda$t$, $t$Alta$t$, $t$Cuidador aceptado$t$, $t$1. Ayuda → esperar la cuenta de 5 s$t$, $t$'Ya les avisé' y botón 'Llamar a…'. Cancelar en la cuenta no avisa.$t$, 590)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-60$t$, $t$Modo simple$t$, $t$Anotar medición$t$, $t$Media$t$, $t$Plan de monitoreo$t$, $t$1. 'Anotar ahora' → teclado grande$t$, $t$Guarda con la hora actual.$t$, 600)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-61$t$, $t$Modo simple$t$, $t$Salir del modo simple$t$, $t$Media$t$, $t$$t$, $t$1. Ajustes → Salir$t$, $t$Vuelve a la app normal.$t$, 610)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-62$t$, $t$Chat vita$t$, $t$Preguntar el día$t$, $t$Alta$t$, $t$Datos cargados$t$, $t$1. FAB → 'Contame mi día'$t$, $t$Responde con remedios y turnos reales.$t$, 620)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-63$t$, $t$Chat vita$t$, $t$Agregar remedio por chat$t$, $t$Alta$t$, $t$$t$, $t$1. 'Agregá ibuprofeno 400 a las 9 y 21'$t$, $t$Tarjeta de confirmación; aparece en Rutina.$t$, 630)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-64$t$, $t$Chat vita$t$, $t$Cambiar/borrar turno por chat$t$, $t$Media$t$, $t$Turno cargado$t$, $t$1. 'Pasá el turno de cardiología a las 11'$t$, $t$Pide confirmar; al confirmar, cambia.$t$, 640)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-65$t$, $t$Chat vita$t$, $t$Para otra persona$t$, $t$Media$t$, $t$Perfil a cargo$t$, $t$1. 'Agregale a mamá enalapril'$t$, $t$Pregunta/confirmación antes de guardar en la otra persona.$t$, 650)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-66$t$, $t$Chat vita$t$, $t$Modo voz$t$, $t$Media$t$, $t$Micrófono$t$, $t$1. Micrófono → hablar → esperar$t$, $t$Transcribe, responde y habla por oraciones.$t$, 660)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-67$t$, $t$Chat vita$t$, $t$Silenciar vita$t$, $t$Baja$t$, $t$$t$, $t$1. Parlante del header$t$, $t$Solo texto, mic deshabilitado.$t$, 670)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-68$t$, $t$Chat vita$t$, $t$Memoria$t$, $t$Baja$t$, $t$$t$, $t$1. 'Acordate que no tomo lácteos'
2. Privacidad → Memoria$t$, $t$Aparece el recuerdo; se puede borrar.$t$, 680)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-69$t$, $t$Chat vita$t$, $t$Límite de consultas$t$, $t$Media$t$, $t$$t$, $t$1. Mandar 15 mensajes en el día$t$, $t$Muestra 'Te quedan N' y al llegar a 0 deshabilita enviar.$t$, 690)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-70$t$, $t$Chat vita$t$, $t$Tiempo de respuesta$t$, $t$Alta$t$, $t$$t$, $t$1. Hacer 5 preguntas y medir$t$, $t$Anotar segundos y si aparece 'Se me hizo largo'.$t$, 700)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-71$t$, $t$vita+$t$, $t$Canjear código$t$, $t$Media$t$, $t$Código VITA-… (046 aplicada)$t$, $t$1. vita+ → Tengo un código$t$, $t$Muestra 'Sos vita+ · hasta <fecha>'. Código inválido: mensaje genérico.$t$, 710)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-72$t$, $t$vita+$t$, $t$Suscripción Mercado Pago$t$, $t$Baja$t$, $t$044 aplicada + credenciales$t$, $t$1. Suscribirme → confirmar monto → pagar$t$, $t$Vuelve a 'gracias' y queda activo. Sin credenciales: 'Muy pronto'.$t$, 720)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-73$t$, $t$General$t$, $t$Sin conexión$t$, $t$Alta$t$, $t$$t$, $t$1. Modo avión
2. Intentar marcar una toma$t$, $t$Avisa 'Sin conexión' / 'No pudimos guardar' y no pierde el estado.$t$, 730)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-74$t$, $t$General$t$, $t$Actualizar versión$t$, $t$Baja$t$, $t$Deploy nuevo$t$, $t$1. Dejar la app abierta durante un deploy$t$, $t$Ofrece 'Actualizar'.$t$, 740)
on conflict (codigo) do nothing;

insert into public.track_casos (codigo, area, funcionalidad, prioridad, precondicion, pasos, esperado, posicion)
values ($t$T-75$t$, $t$General$t$, $t$Celulares y tamaños$t$, $t$Alta$t$, $t$iPhone y Android$t$, $t$1. Recorrer Inicio, Rutina, alta, chat en ambos$t$, $t$Nada cortado, botones visibles sobre la barra de inicio del iPhone.$t$, 750)
on conflict (codigo) do nothing;
