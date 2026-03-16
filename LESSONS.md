# Lessons — MiHistorial

> Este archivo registra decisiones técnicas, errores encontrados y cambios de approach.
> El propósito es que cualquier persona (o agente de IA) que trabaje en el proyecto entienda
> por qué las cosas están como están, sin tener que leer toda la historia de commits.
>
> Formato: una entrada por lección. Fecha, qué pasó, por qué se decidió así.

---

## Cómo escribir una lección

```
## [YYYY-MM-DD] Título corto y descriptivo

**Qué pasó:** Una oración describiendo el problema o decisión.
**Por qué:** La razón técnica o de producto detrás de la decisión.
**Consecuencia:** Qué cambió en el código o en el approach.
```

---

## [2026-03-14] El médico no tiene cuenta — diseño intencional

**Qué pasó:** Se decidió que los médicos accedan al historial sin registrarse ni instalar nada.
**Por qué:** Cualquier fricción adicional (crear cuenta, instalar app) mata la adopción. El médico tiene 10 minutos para atender a un paciente. Si tiene que crear una cuenta, no lo hace.
**Consecuencia:** La vista del médico es una web app pública que solo funciona con un JWT válido en la URL. Las sesiones son anónimas y de corta duración. No hay persistencia de datos del médico en el sistema.

---

## [2026-03-14] El JWT del QR no se guarda completo en la base de datos

**Qué pasó:** En la tabla `access_tokens` se guarda el `token_hash` (hash del JWT), no el JWT en sí.
**Por qué:** Si la base de datos fuera comprometida, los tokens no serían utilizables. El JWT solo existe en el dispositivo del paciente y en la URL del QR mientras está activo.
**Consecuencia:** La Edge Function `validate-qr-token` hashea el JWT recibido y lo compara contra `token_hash`. Nunca almacena el token original.

---

## [2026-03-14] No usamos localStorage en la vista web del médico

**Qué pasó:** El sessionToken del médico se guarda solo en memoria (React state), no en localStorage ni cookies.
**Por qué:** Si el médico deja el browser abierto y otra persona agarra el teléfono, no debería poder seguir viendo el historial. Al recargar la página, la sesión se pierde. Esto es una feature de seguridad, no un bug.
**Consecuencia:** Si el médico recarga la página, necesita escanear el QR de nuevo. La UI debe dejar esto claro con un mensaje apropiado en la pantalla de sesión expirada.

---

## [2026-03-14] Supabase como única fuente de verdad — sin backend propio

**Qué pasó:** Se decidió no construir un backend custom (Node/Express/etc.). Supabase maneja auth, base de datos, storage y lógica de negocio simple via Edge Functions.
**Por qué:** Para el MVP, un backend custom agrega complejidad de infraestructura sin beneficio real. Supabase cubre todos los casos de uso necesarios. Reducir superficie de código = menos bugs = más velocidad.
**Consecuencia:** Toda la lógica de negocio que no puede vivir en el cliente va en Edge Functions de Supabase (Deno runtime). Si en el futuro necesitamos algo que Supabase no puede hacer, migramos esa función específica a un backend propio sin reescribir todo.

---

## [2026-03-14] RLS como primera línea de defensa, no la única

**Qué pasó:** Se configuró Row Level Security en todas las tablas con datos de pacientes.
**Por qué:** Las políticas RLS garantizan que incluso si hay un bug en el código del cliente, los datos de un paciente no son accesibles por otro. Es seguridad en profundidad: el código hace lo correcto, pero la base de datos también lo garantiza.
**Consecuencia:** Cada tabla tiene sus políticas. Cada vez que se agrega una tabla nueva con datos sensibles, agregar RLS es obligatorio antes de hacer deploy. Documentado en `supabase/MODULE.md`.

---

## [2026-03-14] Compresión de imágenes en el cliente, no en el servidor

**Qué pasó:** Las imágenes de estudios médicos se comprimen en el dispositivo del paciente antes de subirse.
**Por qué:** Procesar imágenes en el servidor agrega latencia y costo. El paciente puede tener una foto de 10 MB de un análisis en papel. Comprimir en el cliente ahorra ancho de banda, reduce tiempo de carga y costo de almacenamiento.
**Consecuencia:** La app mobile implementa compresión antes del upload (máximo 2048px de ancho, JPEG 85%). Los PDFs no se comprimen para no perder calidad de texto.

---

## [2026-03-14] La firma del médico es declarativa, no verificada en MVP

**Qué pasó:** El médico ingresa su nombre y especialidad en texto libre al agregar una nota. No se verifica contra ningún registro de matrícula.
**Por qué:** Integrar con el registro de matrículas médicas (CSMN, colegios provinciales) es complejo y está fuera del alcance del MVP. Sin embargo, el nombre queda registrado en el audit log con timestamp e IP, lo que genera responsabilidad implícita suficiente para el MVP.
**Consecuencia:** Las notas médicas en el MVP son informativas, no documentos con validez legal. En V2, se puede agregar verificación de matrícula contra APIs del Ministerio de Salud.

---

## [2026-03-14] Expo Router en lugar de React Navigation

**Qué pasó:** Se eligió Expo Router (file-based routing) en lugar de React Navigation con configuración manual.
**Por qué:** Expo Router reduce el boilerplate de navegación, es el approach recomendado por Expo actualmente, y el paradigma de rutas basadas en archivos es familiar para cualquier desarrollador que venga de Next.js.
**Consecuencia:** La estructura de carpetas dentro de `app/` define las rutas. Los grupos `(auth)` y `(tabs)` permiten layouts diferenciados sin afectar las URLs.

---

## [2026-03-14] shared-types como paquete separado

**Qué pasó:** Los tipos TypeScript compartidos entre la app mobile y la vista web del médico viven en `packages/shared-types/`.
**Por qué:** Duplicar tipos es una fuente garantizada de bugs cuando el schema cambia. Un tipo centralizado actualizado en un lugar se refleja en todos los consumidores.
**Consecuencia:** Cualquier tipo que se use en más de un módulo va en `shared-types`. Los tipos locales a un módulo permanecen en ese módulo.

---

<!-- Agregar nuevas lecciones arriba de esta línea -->
