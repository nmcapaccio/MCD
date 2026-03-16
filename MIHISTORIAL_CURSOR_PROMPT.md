# MiHistorial — Cursor AI Agent Project Prompt

> Este archivo es el punto de entrada para el agente de IA en Cursor.
> Contiene todo lo necesario para comenzar a construir el proyecto desde cero:
> intención, problema, solución, arquitectura, módulos, convenciones y reglas de trabajo.

---

## Índice

1. [Intención del proyecto](#1-intención-del-proyecto)
2. [Problema que resolvemos](#2-problema-que-resolvemos)
3. [Solución propuesta](#3-solución-propuesta)
4. [Stack tecnológico](#4-stack-tecnológico)
5. [Arquitectura del sistema](#5-arquitectura-del-sistema)
6. [Módulos y estructura de carpetas](#6-módulos-y-estructura-de-carpetas)
7. [Modelo de datos (Supabase / PostgreSQL)](#7-modelo-de-datos-supabase--postgresql)
8. [Autenticación y seguridad](#8-autenticación-y-seguridad)
9. [Sistema QR de acceso médico](#9-sistema-qr-de-acceso-médico)
10. [Flujos principales](#10-flujos-principales)
11. [Convenciones del proyecto](#11-convenciones-del-proyecto)
12. [Archivos de documentación por módulo](#12-archivos-de-documentación-por-módulo)
13. [LESSONS.md — instrucciones](#13-lessonsmd--instrucciones)
14. [CHANGELOG — instrucciones](#14-changelog--instrucciones)
15. [.gitignore](#15-gitignore)
16. [MVP — scope inicial](#16-mvp--scope-inicial)
17. [Lo que NO está en el MVP](#17-lo-que-no-está-en-el-mvp)

---

## 1. Intención del proyecto

Construir **MiHistorial**: una aplicación móvil desarrollada en React Native donde el paciente es el dueño y custodio de su propia historia clínica digital.

El paciente lleva su historial médico en su teléfono. Durante una consulta, genera un código QR que le da acceso temporal al médico para consultar el historial y agregar notas, diagnósticos y prescripciones. El acceso expira automáticamente.

**Principio rector:** el teléfono del paciente es el expediente clínico.

---

## 2. Problema que resolvemos

En Argentina, la información médica de los pacientes está altamente fragmentada:

- Los datos de salud están distribuidos entre múltiples sistemas, instituciones, médicos, laboratorios y registros en papel.
- La mayoría de los pacientes no tienen una historia clínica completa, accesible y consolidada.
- Los médicos toman decisiones clínicas sin acceso a diagnósticos previos, tratamientos anteriores ni estudios realizados.
- La continuidad de atención es difícil o imposible entre distintos profesionales.
- Los estudios médicos se repiten innecesariamente porque el médico no sabe que ya fueron realizados.
- El sistema de salud se vuelve ineficiente tanto para profesionales como para pacientes.

---

## 3. Solución propuesta

Una aplicación móvil centrada en el paciente con las siguientes características clave:

- **El paciente tiene una historia clínica digital personal en su teléfono.**
- Durante una consulta, el médico puede revisar el historial del paciente escaneando un QR.
- Después de la consulta, el médico puede agregar notas, diagnósticos y prescripciones.
- El paciente puede cargar estudios médicos: resultados de laboratorio, imágenes, informes en PDF.
- Toda la información está organizada cronológicamente en una historia clínica unificada.
- El paciente controla quién accede, cuándo y puede revocar el acceso en cualquier momento.

Esto crea un registro médico portable, centrado en el paciente, que mejora la toma de decisiones médicas y la continuidad de atención.

---

## 4. Stack tecnológico

| Capa | Tecnología | Motivo |
|---|---|---|
| Mobile app | React Native (Expo) | Cross-platform iOS + Android |
| Backend | Supabase | Auth, DB, Storage, Edge Functions, Realtime |
| Base de datos | PostgreSQL (vía Supabase) | Relacional, RLS nativo |
| Almacenamiento archivos | Supabase Storage | PDFs, imágenes médicas |
| Funciones server-side | Supabase Edge Functions (Deno) | Validación QR, tokens, notificaciones |
| Vista web médico | React (web, sin framework pesado) | Acceso sin app ni login |
| Autenticación | Supabase Auth (email + magic link) | Sin contraseñas para pacientes |
| QR | JWT firmado con HS256 | Token temporal autocontenido |
| Encriptación datos | AES-256 (Supabase + TLS 1.3) | Datos médicos sensibles |
| Notificaciones push | Expo Notifications | Alertas de acceso al historial |
| Lenguaje | TypeScript (todo el proyecto) | Tipado estricto obligatorio |

---

## 5. Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTES                            │
│                                                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  App Paciente    │  │  Vista Web Médico           │  │
│  │  React Native    │  │  React (browser, sin login) │  │
│  │  (iOS + Android) │  │  Acceso vía QR token        │  │
│  └────────┬─────────┘  └──────────────┬──────────────┘  │
└───────────┼──────────────────────────┼──────────────────┘
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────┐
│                SUPABASE (Backend)                        │
│                                                         │
│  Auth · REST API · Realtime · RLS · Edge Functions      │
│                                                         │
│  ┌──────────────┐ ┌────────────────┐ ┌───────────────┐  │
│  │  PostgreSQL  │ │Supabase Storage│ │ Edge Functions│  │
│  │  (con RLS)   │ │PDFs, imágenes  │ │QR tokens, push│  │
│  └──────────────┘ └────────────────┘ └───────────────┘  │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│            SEGURIDAD Y COMPLIANCE                        │
│  AES-256 · TLS 1.3 · Ley 25.326 · Audit log inmutable  │
└─────────────────────────────────────────────────────────┘
```

### Flujo del QR (detalle técnico)

1. El paciente toca "Generar QR" en la app.
2. La app llama a la Edge Function `generate-access-token`.
3. La Edge Function crea un JWT firmado con HS256 que contiene:
   ```json
   {
     "patient_id": "uuid",
     "iat": 1710000000,
     "exp": 1710007200,
     "scope": "read",
     "allowed_sections": ["all"]
   }
   ```
4. El JWT se codifica en una URL: `https://mihistorial.app/acceso?token=<jwt>`
5. La app renderiza esa URL como QR.
6. El médico escanea con la cámara → el browser abre la URL.
7. La Edge Function `validate-access-token` verifica firma y expiración.
8. Si es válido: genera una sesión anónima de Supabase con RLS restringida al `patient_id`.
9. Si es inválido o expirado: devuelve página de error legible.
10. Se registra el acceso en la tabla `access_logs` (timestamp, IP, nombre declarado del médico).
11. El paciente recibe una push notification informando el acceso.

---

## 6. Módulos y estructura de carpetas

```
mihistorial/
│
├── CURSOR_PROMPT.md          ← este archivo
├── LESSONS.md                ← registro de decisiones y aprendizajes
├── .gitignore
│
├── apps/
│   ├── mobile/               ← App React Native (Expo)
│   │   ├── CHANGELOG.md
│   │   ├── MODULE.md
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── onboarding.tsx
│   │   │   ├── (patient)/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── history/
│   │   │   │   ├── studies/
│   │   │   │   ├── qr/
│   │   │   │   └── settings/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   │
│   └── web-doctor/           ← Vista web del médico (React)
│       ├── CHANGELOG.md
│       ├── MODULE.md
│       ├── src/
│       │   ├── pages/
│       │   │   ├── AccessExpired.tsx
│       │   │   ├── PatientView.tsx
│       │   │   └── AddNote.tsx
│       │   ├── components/
│       │   └── lib/
│
├── packages/
│   ├── shared-types/         ← Tipos TypeScript compartidos
│   │   ├── CHANGELOG.md
│   │   ├── MODULE.md
│   │   └── src/
│   │       ├── patient.ts
│   │       ├── medical-record.ts
│   │       ├── access-token.ts
│   │       └── index.ts
│   │
│   └── supabase-client/      ← Cliente Supabase configurado
│       ├── CHANGELOG.md
│       ├── MODULE.md
│       └── src/
│
├── supabase/
│   ├── CHANGELOG.md
│   ├── MODULE.md
│   ├── migrations/           ← SQL migrations versionadas
│   ├── functions/            ← Edge Functions (Deno/TypeScript)
│   │   ├── generate-access-token/
│   │   │   ├── index.ts
│   │   │   └── CHANGELOG.md
│   │   ├── validate-access-token/
│   │   │   ├── index.ts
│   │   │   └── CHANGELOG.md
│   │   └── send-push-notification/
│   │       ├── index.ts
│   │       └── CHANGELOG.md
│   └── seed/
│
└── docs/
    ├── architecture.md
    ├── data-model.md
    └── security.md
```

---

## 7. Modelo de datos (Supabase / PostgreSQL)

### Tabla: `patients`

```sql
CREATE TABLE patients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  dni           TEXT UNIQUE,
  cuil          TEXT,
  birth_date    DATE,
  blood_type    TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  sex           TEXT CHECK (sex IN ('M','F','X')),
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: el paciente solo puede ver y editar su propio registro
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients_self" ON patients
  USING (auth.uid() = user_id);
```

### Tabla: `allergies`

```sql
CREATE TABLE allergies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id) ON DELETE CASCADE,
  substance     TEXT NOT NULL,
  severity      TEXT CHECK (severity IN ('leve','moderada','grave')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE allergies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allergies_owner" ON allergies
  USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    OR current_setting('app.qr_patient_id', true) = patient_id::text
  );
```

### Tabla: `chronic_conditions`

```sql
CREATE TABLE chronic_conditions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    UUID REFERENCES patients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  cie10_code    TEXT,
  diagnosed_at  DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: `medical_events`

```sql
-- Consultas médicas, diagnósticos, internaciones
CREATE TABLE medical_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
  event_type      TEXT CHECK (event_type IN ('consulta','internacion','urgencia','cirugia','control')),
  event_date      DATE NOT NULL,
  specialty       TEXT,
  doctor_name     TEXT,
  doctor_declared TEXT,               -- nombre declarado vía QR (sin cuenta)
  chief_complaint TEXT,               -- motivo de consulta
  diagnosis       TEXT,
  diagnosis_type  TEXT CHECK (diagnosis_type IN ('confirmado','presuntivo','descartado')),
  cie10_code      TEXT,
  treatment       TEXT,
  next_followup   TEXT,
  notes           TEXT,
  is_qr_entry     BOOLEAN DEFAULT FALSE, -- true si fue cargado por médico vía QR
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: `prescriptions`

```sql
CREATE TABLE prescriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
  medical_event_id UUID REFERENCES medical_events(id),
  medication_name TEXT NOT NULL,
  dose            TEXT,
  frequency       TEXT,
  duration        TEXT,
  instructions    TEXT,
  prescribed_by   TEXT,
  prescribed_at   DATE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: `medical_studies`

```sql
-- Laboratorio, imágenes, informes subidos por el paciente
CREATE TABLE medical_studies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
  study_type      TEXT CHECK (study_type IN ('laboratorio','imagen','informe','otro')),
  title           TEXT,
  study_date      DATE,
  file_path       TEXT NOT NULL,   -- path en Supabase Storage
  file_size_kb    INTEGER,
  mime_type       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: `access_tokens`

```sql
-- Registro de QRs generados
CREATE TABLE access_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,   -- hash del JWT (no el JWT en sí)
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,     -- null si aún activo
  duration_hours  INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabla: `access_logs`

```sql
-- Audit log inmutable de accesos médicos
CREATE TABLE access_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id),
  token_id        UUID REFERENCES access_tokens(id),
  doctor_declared TEXT,            -- nombre que declaró el médico
  ip_address      TEXT,
  user_agent      TEXT,
  accessed_at     TIMESTAMPTZ DEFAULT NOW(),
  action          TEXT CHECK (action IN ('view','add_note','add_prescription'))
);

-- La tabla access_logs no tiene UPDATE ni DELETE permitido (append-only)
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_insert_only" ON access_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "logs_owner_read" ON access_logs FOR SELECT
  USING (patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid()));
```

### Tabla: `vaccinations`

```sql
CREATE TABLE vaccinations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID REFERENCES patients(id) ON DELETE CASCADE,
  vaccine_name    TEXT NOT NULL,
  dose            TEXT,
  administered_at DATE,
  administered_by TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Autenticación y seguridad

### Paciente (Supabase Auth)

- Login con **magic link por email** (sin contraseña). Es el método principal.
- Opcionalmente: OTP por SMS para el mercado argentino donde el email es menos usado.
- Sesión persistente en el dispositivo con refresh token.
- Biometría (Face ID / huella) como segundo factor para abrir la app (implementado con `expo-local-authentication`, no reemplaza la sesión de Supabase).

### Médico (sesión anónima temporal)

- El médico **no tiene cuenta en el sistema**.
- Al validar el QR, la Edge Function crea una sesión temporal usando `supabase.auth.signInAnonymously()` con metadata del `patient_id` permitido.
- Esta sesión tiene RLS que limita todas las queries al `patient_id` del token.
- La sesión expira junto con el JWT del QR.

### Row Level Security (RLS) — reglas generales

```sql
-- Variable de contexto para sesiones QR
-- Se setea al crear la sesión anónima del médico
-- SET app.qr_patient_id = '<patient_uuid>';

-- Política genérica para tablas del paciente:
-- El paciente accede a sus datos por user_id
-- El médico (sesión anónima) accede por app.qr_patient_id
CREATE POLICY "owner_or_qr" ON <tabla>
  USING (
    patient_id IN (SELECT id FROM patients WHERE user_id = auth.uid())
    OR current_setting('app.qr_patient_id', true)::uuid = patient_id
  );
```

### Almacenamiento de archivos

- Bucket privado en Supabase Storage: `medical-studies`.
- Ningún archivo tiene URL pública.
- El acceso a archivos se hace siempre mediante **signed URLs** generadas server-side con expiración corta (15 minutos).
- Los archivos se organizan por: `{patient_id}/{year}/{study_id}.{ext}`

### Compliance

- Cumplimiento con la **Ley 25.326** de Protección de Datos Personales de Argentina.
- Los datos nunca se venden ni comparten con terceros.
- El paciente puede exportar todos sus datos (formato JSON + archivos ZIP).
- El paciente puede solicitar la eliminación total de su cuenta y datos.
- Toda operación sobre datos sensibles queda en el `access_logs`.

---

## 9. Sistema QR de acceso médico

### Edge Function: `generate-access-token`

```typescript
// supabase/functions/generate-access-token/index.ts
// POST /functions/v1/generate-access-token
// Body: { duration_hours: 2 }
// Auth: Bearer token del paciente autenticado

import { create } from "https://deno.land/x/djwt/mod.ts";

Deno.serve(async (req) => {
  const { duration_hours } = await req.json();
  const patient_id = /* extraído del JWT del usuario autenticado */;

  const exp = Math.floor(Date.now() / 1000) + (duration_hours * 3600);

  const payload = {
    patient_id,
    iat: Math.floor(Date.now() / 1000),
    exp,
    scope: "read",
    allowed_sections: ["all"],
  };

  const secret = Deno.env.get("QR_JWT_SECRET");
  const token = await create({ alg: "HS256", typ: "JWT" }, payload, secret);

  // Guardar hash del token en access_tokens
  const token_hash = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(token)
  );

  // INSERT en access_tokens...

  const qr_url = `${Deno.env.get("WEB_DOCTOR_URL")}/acceso?token=${token}`;

  return new Response(JSON.stringify({ qr_url, expires_at: new Date(exp * 1000) }));
});
```

### Edge Function: `validate-access-token`

```typescript
// supabase/functions/validate-access-token/index.ts
// GET /functions/v1/validate-access-token?token=<jwt>
// Devuelve: sesión anónima temporal de Supabase

import { verify } from "https://deno.land/x/djwt/mod.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  try {
    const secret = Deno.env.get("QR_JWT_SECRET");
    const payload = await verify(token, secret, "HS256");

    // Verificar que el token no fue revocado
    // SELECT revoked_at FROM access_tokens WHERE token_hash = hash(token)

    // Crear sesión anónima con contexto del paciente
    const { data } = await supabaseAdmin.auth.admin.createUser({
      user_metadata: { qr_patient_id: payload.patient_id },
    });

    // Registrar en access_logs
    // INSERT INTO access_logs ...

    return new Response(JSON.stringify({
      session_token: data.session.access_token,
      patient_id: payload.patient_id,
      expires_at: payload.exp,
    }));

  } catch (e) {
    return new Response(JSON.stringify({ error: "Token inválido o expirado" }), {
      status: 401,
    });
  }
});
```

### Duración del QR — opciones para el paciente

```typescript
export const QR_DURATIONS = [
  { label: "30 minutos", hours: 0.5 },
  { label: "2 horas",    hours: 2   },
  { label: "8 horas",    hours: 8   },  // internación
  { label: "24 horas",   hours: 24  },
] as const;
```

---

## 10. Flujos principales

### Flujo del paciente

```
Registro (DNI, CUIL, datos básicos)
  → Perfil médico (sangre, alergias, condiciones crónicas)
  → Carga estudios (foto/galería/share desde app)
  → Genera QR de acceso (duración configurable)
  → Médico escanea el QR
  → Post-consulta: médico agrega notas → paciente recibe notificación
  → El historial crece con cada consulta
  → (loop)
```

### Flujo de carga de estudios

```
El paciente tiene un estudio para subir.
Opciones de origen:
  a) Foto con cámara del teléfono (caso más común en Argentina — papel impreso)
     → Corrección de perspectiva automática
     → Conversión a PDF
  b) Desde galería o archivos del teléfono (PDF o imagen existente)
  c) "Compartir con MiHistorial" desde WhatsApp, Gmail, portal del laboratorio

En todos los casos:
  → Pantalla de metadatos mínimos:
       - Tipo: Laboratorio / Imagen / Informe / Otro
       - Fecha (autodetectada del PDF si es posible, o EXIF de foto)
       - Título (opcional)
  → Compresión automática si es imagen (sin perder legibilidad)
  → Encriptación en dispositivo
  → Subida a Supabase Storage (bucket privado)
  → El estudio aparece inmediatamente en el historial cronológico
```

### Flujo del médico (vista web QR)

```
El paciente muestra el QR en pantalla.
El médico escanea con su cámara (cualquier teléfono, cualquier cámara).
  → Browser abre: https://mihistorial.app/acceso?token=<jwt>
  → Edge Function valida el JWT:
       - Si inválido/expirado → pantalla de error con instrucción clara
       - Si válido → sesión anónima, carga vista web
  → La vista web muestra (en este orden de prioridad):
       1. Nombre, edad, sexo, grupo sanguíneo
       2. Alertas críticas: alergias documentadas
       3. Condiciones crónicas
       4. Medicación activa
       5. Últimas consultas (cronológico, más reciente primero)
       6. Estudios recientes (con botón "Abrir" para ver PDF)
       7. Botón "Agregar nota de consulta"
  → Si el médico agrega nota:
       - Ingresa nombre y especialidad (declarado, no verificado en MVP)
       - Motivo de consulta
       - Diagnóstico (texto libre + tipo: confirmado/presuntivo/descartado)
       - Indicaciones y tratamiento
       - Próximo control
       - Guardar → INSERT en medical_events con is_qr_entry = true
       - El paciente recibe push notification
  → El acceso expira automáticamente al vencer el JWT
  → El paciente puede revocar el acceso manualmente en cualquier momento
```

---

## 11. Convenciones del proyecto

### TypeScript

- `strict: true` en todos los tsconfig.
- No usar `any`. Si es necesario temporalmente, agregar `// TODO: tipado pendiente`.
- Todos los tipos compartidos van en `packages/shared-types`.
- Nombrar tipos con PascalCase: `MedicalEvent`, `AccessToken`, `Patient`.
- Nombrar funciones y variables con camelCase.
- Nombrar archivos con kebab-case: `medical-event.ts`, `qr-generator.tsx`.

### React Native / Expo

- Usar **Expo Router** para navegación (file-based routing).
- Todos los componentes en `components/` son puros y reutilizables.
- La lógica de negocio va en `hooks/` (custom hooks).
- Las llamadas a Supabase van en `lib/api/` (nunca directamente en componentes).
- Usar `react-query` (TanStack Query) para fetching y caching.

### Supabase

- Toda interacción con la DB se hace a través del cliente Supabase tipado.
- Las migrations van en `supabase/migrations/` con timestamp: `20260314_create_patients.sql`.
- Nunca hacer queries directas en componentes — siempre a través de `lib/api/`.
- Habilitar RLS en todas las tablas desde el inicio.

### Nomenclatura de rutas API (Edge Functions)

- `POST /generate-access-token` — genera JWT para QR
- `GET  /validate-access-token` — valida JWT, devuelve sesión
- `POST /send-push-notification` — envía push al paciente

### Variables de entorno

```bash
# .env.local (mobile)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# .env (edge functions / server)
SUPABASE_SERVICE_ROLE_KEY=
QR_JWT_SECRET=
WEB_DOCTOR_URL=
EXPO_PUSH_TOKEN_SERVER=
```

---

## 12. Archivos de documentación por módulo

Cada módulo importante del proyecto debe tener dos archivos en su raíz:

### `MODULE.md` — descripción del módulo

Cada módulo tiene un `MODULE.md` con esta estructura:

```markdown
# Nombre del módulo

## Qué es
Una sola oración que describe qué es este módulo.

## Qué hace
Lista de responsabilidades concretas. Qué produce, qué expone, qué consume.

## Cómo lo hace
Descripción técnica breve. Stack, patrones usados, dependencias clave.

## Propósito en el sistema
Por qué existe este módulo. Qué problema resuelve en el contexto del sistema.

## Dependencias
- Qué otros módulos necesita
- Qué servicios externos usa

## Lo que NO hace (límites)
Qué cosas están explícitamente fuera del scope de este módulo.
```

### `CHANGELOG.md` — historial de cambios

Cada módulo tiene un `CHANGELOG.md` con este formato:

```markdown
# Changelog — [Nombre del módulo]

Todos los cambios significativos de este módulo se documentan aquí.
Formato: [version] — YYYY-MM-DD

## [Unreleased]

## [0.1.0] — 2026-03-14
### Added
- Descripción de lo que se agregó

### Changed
- Descripción de lo que cambió

### Fixed
- Descripción de lo que se corrigió

### Removed
- Descripción de lo que se eliminó
```

---

## 13. LESSONS.md — instrucciones

En la raíz del proyecto existe un archivo `LESSONS.md`. Su propósito es registrar, en lenguaje simple y directo, qué decisiones se tomaron, por qué, y qué salió bien o mal.

**No es un log técnico.** Es un diario de aprendizajes del proyecto, escrito para que cualquier persona (humana o agente de IA) pueda entender el contexto rápidamente.

### Estructura de una entrada en `LESSONS.md`

```markdown
## [YYYY-MM-DD] — Título corto de la lección

**Qué pasó:**
Descripción en 2-3 oraciones de qué ocurrió.

**Por qué:**
La razón detrás de la decisión o problema.

**Qué aprendimos / cómo lo resolvemos:**
La conclusión práctica. Qué hacer o no hacer a futuro.

**Archivos afectados:**
- ruta/al/archivo.ts
```

### Cuándo agregar una entrada

Agregar una entrada en `LESSONS.md` cuando:
- Se toma una decisión arquitectónica importante (y no obvia).
- Se encuentra y resuelve un bug significativo.
- Se cambia de enfoque o tecnología y vale la pena recordar por qué.
- Se descubre una limitación de una librería o servicio.
- Se implementa algo de una forma no estándar y hay que explicar por qué.

---

## 14. CHANGELOG — instrucciones

Además del `CHANGELOG.md` por módulo, existe un `CHANGELOG.md` raíz que agrega los cambios más importantes del sistema completo, siguiendo el mismo formato.

El agente de IA debe actualizar el `CHANGELOG.md` del módulo correspondiente cada vez que:
- Se agrega una feature nueva.
- Se modifica el comportamiento de una función existente.
- Se corrige un bug.
- Se elimina algo.

---

## 15. .gitignore

El proyecto usa el siguiente `.gitignore`:

```gitignore
# Dependencias
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.expo/
.next/
out/

# Variables de entorno (NUNCA commitear)
.env
.env.local
.env.development
.env.production
.env.test
*.env

# Supabase local
supabase/.branches
supabase/.temp

# Sistema operativo
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
Thumbs.db
ehthumbs.db
Desktop.ini

# IDEs y editores
.vscode/settings.json
.idea/
*.swp
*.swo
*~
.cursor/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Cache
.cache/
.turbo/
.eslintcache

# TypeScript
*.tsbuildinfo

# Testing
coverage/
.nyc_output/

# React Native / Expo
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/
android/
ios/

# Archivos temporales
*.tmp
*.temp
*.bak
```

---

## 16. MVP — scope inicial

El MVP valida una hipótesis central: **¿El paciente usa activamente la app para llevar su historial a consultas?**

### Incluido en el MVP

**Para el paciente (app mobile):**
- [ ] Registro con email (magic link) + datos básicos (nombre, DNI, CUIL, fecha de nacimiento)
- [ ] Perfil médico: grupo sanguíneo, alergias, condiciones crónicas
- [ ] Carga de estudios: PDF desde galería, foto con corrección de perspectiva, share desde otra app
- [ ] Historial cronológico de eventos médicos y estudios
- [ ] Generación de QR con duración configurable (30min / 2hs / 8hs / 24hs)
- [ ] Revocación manual del QR activo
- [ ] Log de accesos (quién accedió, cuándo)
- [ ] Push notifications al recibir acceso médico
- [ ] Caché offline del historial (lectura sin internet)

**Para el médico (vista web):**
- [ ] Acceso sin registro, solo con QR
- [ ] Vista del historial con jerarquía: alertas críticas primero
- [ ] Acceso a estudios (PDFs con signed URL temporal)
- [ ] Formulario para agregar nota de consulta (nombre declarado, diagnóstico, prescripción)
- [ ] Pantalla de error clara cuando el QR expira

**Backend / Infraestructura:**
- [ ] Todas las tablas listadas en el modelo de datos
- [ ] RLS habilitado en todas las tablas
- [ ] Edge Functions: `generate-access-token`, `validate-access-token`, `send-push-notification`
- [ ] Bucket privado de Supabase Storage con signed URLs
- [ ] Audit log append-only en `access_logs`

---

## 17. Lo que NO está en el MVP

Estas features están identificadas pero deliberadamente fuera del MVP. No implementar hasta que el MVP esté validado.

- **Integración con laboratorios o sistemas hospitalarios** (HAPI FHIR, HL7) — V2
- **Firma digital con validez legal** (integración con AFIP / RENAPER) — V2
- **Verificación de matrícula médica** — V2
- **Módulo de turnos y agenda** — V2
- **App dedicada para médicos** (con cuenta propia, panel de pacientes) — V2
- **Modo familiar** (un adulto gestiona historial de otros) — V2
- **Exportación FHIR / interoperabilidad** — V2
- **Integración con obras sociales / prepagagas** — V3
- **Soporte DICOM** para imágenes de diagnóstico por imágenes — V2
- **Análisis o sugerencias con IA sobre el historial** — V3

---

## Instrucciones para el agente de IA (Cursor)

Al trabajar en este proyecto, el agente debe:

1. **Leer este archivo completo** antes de comenzar cualquier tarea.
2. **Mantener los archivos de documentación actualizados**: si se modifica un módulo, actualizar su `CHANGELOG.md` y `MODULE.md`.
3. **Agregar entradas a `LESSONS.md`** cuando se toma una decisión no obvia o se resuelve un problema complejo.
4. **Respetar el scope del MVP**: no implementar features de V2+ a menos que se indique explícitamente.
5. **Usar TypeScript estricto** en todo el proyecto. Nunca usar `any`.
6. **Habilitar RLS** en toda tabla nueva que se cree en Supabase.
7. **Nunca exponer el `SUPABASE_SERVICE_ROLE_KEY`** en el cliente. Solo en Edge Functions server-side.
8. **Preguntar antes de cambiar la estructura de carpetas** definida en este documento.
9. **Crear signed URLs** para todos los archivos de Supabase Storage. Nunca URLs públicas.
10. **Testear el flujo QR completo** (generación → validación → expiración → revocación) ante cualquier cambio en las Edge Functions.
