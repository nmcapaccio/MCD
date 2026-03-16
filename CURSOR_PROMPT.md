# MiHistorial — Cursor AI Agent Prompt

> Este archivo es el punto de entrada para un agente de IA en Cursor.
> Contiene todo el contexto del proyecto: intención, problema, solución, arquitectura, flujos, convenciones y estructura de archivos.
> El agente debe leer este archivo completo antes de escribir una sola línea de código.

---

## 1. Intención del proyecto

Construir **MiHistorial**, una aplicación móvil centrada en el paciente que resuelve la fragmentación de la historia clínica en Argentina.

El paciente es el dueño y portador de su propio historial médico. Lo lleva en su teléfono. Durante una consulta, le muestra un QR al médico. El médico escanea el QR desde su teléfono (sin instalar nada, sin registrarse) y accede a la historia clínica completa desde el browser. Al terminar la consulta, el médico puede agregar notas, diagnósticos y prescripciones. El historial crece con cada consulta.

---

## 2. El problema que resolvemos

En Argentina, la información médica de los pacientes está dispersa entre hospitales, clínicas, laboratorios, médicos y papeles físicos. Como consecuencia:

- Los médicos toman decisiones clínicas sin acceso a diagnósticos o tratamientos anteriores.
- La continuidad del cuidado es difícil o imposible.
- Los estudios médicos se repiten innecesariamente.
- El sistema de salud pierde eficiencia para profesionales y pacientes.

La causa raíz no es tecnológica — es que ningún sistema centralizado logró adopción masiva porque requiere que las instituciones integren sus sistemas. Nuestra solución evita ese cuello de botella: **el paciente es el eje de integración**.

---

## 3. Cómo lo resolvemos

La clave del modelo es simple:

- El teléfono del paciente **es** el expediente clínico.
- El paciente carga sus estudios (PDF, foto, imagen) desde la app.
- El médico accede vía QR temporal — sin app, sin cuenta, solo browser.
- Cada consulta agrega un registro al historial cronológico.
- El paciente controla quién accede, cuándo y por cuánto tiempo.

No dependemos de integración con hospitales ni laboratorios. El sistema funciona desde el día uno con lo que el paciente ya tiene: fotos de sus análisis, PDFs de estudios, y los médicos que lo atienden.

---

## 4. Stack tecnológico

| Capa | Tecnología |
|---|---|
| App móvil | React Native (Expo) — iOS y Android |
| Vista web médico | React (web app, sin framework de backend) |
| Backend | Supabase (Auth, PostgreSQL, Storage, Edge Functions, Realtime) |
| Seguridad de datos | Encriptación AES-256 en reposo, TLS 1.3 en tránsito |
| QR de acceso | JWT firmado con HS256, validado por Edge Function de Supabase |
| Almacenamiento de archivos | Supabase Storage (buckets privados, URLs firmadas temporales) |
| Notificaciones | Expo Push Notifications |
| CI/CD | GitHub Actions |

**Restricciones importantes:**
- El agente debe usar Supabase como única fuente de verdad para datos y autenticación.
- No usar librerías de terceros innecesarias. Priorizar el ecosistema oficial de Expo y Supabase.
- Todo el código debe estar en TypeScript con tipos estrictos (`strict: true`).
- Los archivos de un módulo no deben exceder 300 líneas. Si lo hacen, dividir en submódulos.

---

## 5. Arquitectura del sistema

### 5.1 Modelo de datos (PostgreSQL en Supabase)

```sql
-- Pacientes
CREATE TABLE patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  Obra_Social TEXT NOT NULL,
  dni TEXT UNIQUE NOT NULL,
  cuil TEXT,
  birth_date DATE NOT NULL,
  blood_type TEXT CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Condiciones crónicas y alergias (datos críticos)
CREATE TABLE patient_critical_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('allergy', 'chronic_condition', 'vaccine')),
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('mild','moderate','severe')),
  recorded_at TIMESTAMPTZ DEFAULT now()
);

-- Consultas médicas
CREATE TABLE consultations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  doctor_name TEXT NOT NULL,
  doctor_specialty TEXT,
  consultation_date TIMESTAMPTZ NOT NULL,
  reason TEXT,
  diagnosis TEXT,
  diagnosis_code TEXT, -- CIE-10
  diagnosis_type TEXT CHECK (diagnosis_type IN ('confirmed','presumptive','ruled_out')),
  notes TEXT,
  next_control TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- firma: nombre declarado + timestamp + IP (no verificado en MVP)
  doctor_declared_name TEXT,
  access_token_id UUID -- referencia al token QR usado
);

-- Prescripciones (vinculadas a una consulta)
CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id UUID REFERENCES consultations(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  medication TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  duration TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Estudios y documentos médicos
CREATE TABLE medical_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lab','imaging','report','other')),
  title TEXT,
  document_date DATE,
  storage_path TEXT NOT NULL, -- path en Supabase Storage
  file_size_bytes INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tokens QR de acceso médico
CREATE TABLE access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, -- hash del JWT, no el JWT en sí
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ, -- null = activo
  created_at TIMESTAMPTZ DEFAULT now(),
  scope TEXT DEFAULT 'read', -- 'read' en MVP
  allowed_sections TEXT[] -- null = todo, o ['critical','consultations','documents']
);

-- Audit log de accesos médicos
CREATE TABLE access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token_id UUID REFERENCES access_tokens(id),
  patient_id UUID REFERENCES patients(id),
  accessed_at TIMESTAMPTZ DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  doctor_declared_name TEXT,
  action TEXT CHECK (action IN ('view','add_note'))
);
```

**Row Level Security (RLS) — reglas críticas:**

```sql
-- Pacientes solo ven sus propios datos
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patients_own_data" ON patients
  FOR ALL USING (auth.uid() = user_id);

-- Médicos con token válido ven datos del paciente dueño del token
-- Esto se implementa via Edge Function que genera un JWT de sesión anónima
-- con patient_id embebido, y las políticas verifican ese claim:
CREATE POLICY "doctor_read_via_token" ON consultations
  FOR SELECT USING (
    patient_id = (current_setting('app.current_patient_id', true))::UUID
  );
-- Aplicar el mismo patrón a: medical_documents, prescriptions, patient_critical_data
```

### 5.2 Edge Functions de Supabase

#### `validate-qr-token`
Recibe el JWT del QR, lo verifica (firma + expiración + no revocado), registra el acceso en `access_logs`, y devuelve un token de sesión anónima de corta duración con `patient_id` embebido como claim.

```typescript
// supabase/functions/validate-qr-token/index.ts
// Input: { token: string, doctorName: string, ipAddress: string }
// Output: { sessionToken: string, patientId: string, expiresAt: string } | { error: string }

// Lógica:
// 1. Verificar firma JWT con SUPABASE_JWT_SECRET
// 2. Verificar que expires_at no haya pasado
// 3. Buscar token_hash en access_tokens, verificar que revoked_at IS NULL
// 4. Insertar en access_logs
// 5. Generar y devolver sessionToken firmado con patient_id como claim
```

#### `generate-qr-token`
Autenticado (solo el paciente). Genera un JWT con expiración configurable, guarda el hash en `access_tokens`, y devuelve el JWT para que la app genere el QR.

```typescript
// supabase/functions/generate-qr-token/index.ts
// Input: { expiresInMinutes: 30 | 120 | 480 | 1440, allowedSections?: string[] }
// Output: { token: string, qrUrl: string, expiresAt: string }
// URL del QR: https://mihistorial.app/acceso?token=<JWT>
```

#### `revoke-qr-token`
Autenticado. Marca `revoked_at = now()` en el token especificado.

### 5.3 Almacenamiento de archivos

- Bucket privado: `medical-documents`
- Path de cada archivo: `{patient_id}/{year}/{uuid}.{ext}`
- Las URLs de acceso son siempre **firmadas y temporales** (máximo 1 hora), generadas server-side.
- Nunca se exponen URLs directas al bucket.
- Compresión de imágenes en el cliente antes de subir: máximo 2048px de ancho, calidad JPEG 85%. PDFs sin comprimir.
- Tamaño máximo por archivo: 20 MB.

### 5.4 QR de acceso — flujo técnico detallado

```
Paciente abre app → toca "Generar QR"
  → llama a Edge Function generate-qr-token
  → recibe JWT firmado
  → app renderiza QR con la URL: https://mihistorial.app/acceso?token=<JWT>
  → QR visible en pantalla con countdown de expiración

Médico escanea QR con cámara
  → browser abre https://mihistorial.app/acceso?token=<JWT>
  → página web llama a Edge Function validate-qr-token
  → si válido: recibe sessionToken + carga historial del paciente
  → si inválido/expirado: pantalla de error clara con instrucción

Durante la sesión del médico:
  → todas las queries usan el sessionToken de la Edge Function
  → RLS garantiza acceso solo a los datos de ese patient_id
  → al agregar nota: se guarda en consultations con access_token_id
  → paciente recibe push notification: "El Dr. X accedió a tu historial"

Al expirar el token:
  → las queries empiezan a fallar (sessionToken expiró)
  → UI muestra "Sesión expirada"
  → acceso cortado automáticamente
```

---

## 6. Estructura de carpetas del proyecto

```
mihistorial/
├── CURSOR_PROMPT.md          ← este archivo
├── LESSONS.md                ← decisiones, errores y aprendizajes
├── .gitignore
├── README.md
│
├── apps/
│   ├── mobile/               ← React Native (Expo)
│   │   ├── CHANGELOG.md
│   │   ├── MODULE.md
│   │   ├── app/              ← Expo Router file-based routing
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── register.tsx
│   │   │   ├── (tabs)/
│   │   │   │   ├── historial.tsx
│   │   │   │   ├── estudios.tsx
│   │   │   │   ├── qr.tsx
│   │   │   │   └── perfil.tsx
│   │   │   └── _layout.tsx
│   │   ├── components/
│   │   │   ├── ui/           ← componentes base (Button, Card, Tag, etc.)
│   │   │   ├── historial/    ← TimelineItem, ConsultationCard, etc.
│   │   │   ├── estudios/     ← DocumentCard, UploadSheet, etc.
│   │   │   └── qr/           ← QRDisplay, CountdownTimer, etc.
│   │   ├── hooks/
│   │   ├── lib/
│   │   │   ├── supabase.ts   ← cliente Supabase inicializado
│   │   │   └── qr.ts         ← lógica de generación de QR
│   │   ├── stores/           ← Zustand stores
│   │   └── types/
│   │
│   └── web-doctor/           ← Vista web del médico (React)
│       ├── CHANGELOG.md
│       ├── MODULE.md
│       ├── src/
│       │   ├── pages/
│       │   │   ├── ValidatingToken.tsx
│       │   │   ├── PatientRecord.tsx  ← vista principal
│       │   │   ├── AddNote.tsx
│       │   │   └── TokenExpired.tsx
│       │   ├── components/
│       │   │   ├── CriticalAlerts.tsx
│       │   │   ├── MedicationList.tsx
│       │   │   ├── ConsultationHistory.tsx
│       │   │   ├── DocumentList.tsx
│       │   │   └── AddNoteForm.tsx
│       │   ├── lib/
│       │   │   └── session.ts  ← manejo del sessionToken
│       │   └── types/
│       └── index.html
│
├── supabase/
│   ├── CHANGELOG.md
│   ├── MODULE.md
│   ├── functions/
│   │   ├── validate-qr-token/
│   │   │   ├── index.ts
│   │   │   └── MODULE.md
│   │   ├── generate-qr-token/
│   │   │   ├── index.ts
│   │   │   └── MODULE.md
│   │   └── revoke-qr-token/
│   │       ├── index.ts
│   │       └── MODULE.md
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seed.sql              ← datos de prueba para desarrollo
│
├── packages/
│   └── shared-types/         ← tipos TypeScript compartidos entre apps
│       ├── MODULE.md
│       └── index.ts
│
└── docs/
    ├── architecture.md
    ├── security.md
    └── argentina-compliance.md
```

---

## 7. Convenciones de código

### TypeScript
- `strict: true` en todos los `tsconfig.json`.
- Sin `any`. Si el tipo es desconocido, usar `unknown` y narrowing.
- Interfaces para shapes de datos, types para uniones y aliases.
- Nombrar archivos: `kebab-case.ts`, componentes React: `PascalCase.tsx`.

### React Native (Expo)
- Routing con Expo Router (file-based, similar a Next.js App Router).
- Estado global con Zustand. Sin Redux.
- Estilos con StyleSheet de React Native. Sin styled-components ni NativeWind en MVP.
- Formularios con react-hook-form + zod para validación.
- Queries y mutaciones con TanStack Query (react-query) sobre el cliente de Supabase.

### Vista web del médico
- Vite + React + TypeScript.
- Sin framework de UI externo — componentes custom minimalistas.
- Mobile-first obligatorio. La mayoría de médicos abren esto en su teléfono.
- Sin cookies, sin localStorage. El sessionToken vive solo en memoria (variable de módulo o React state). Si el médico recarga la página, necesita escanear el QR de nuevo. Esto es intencional por seguridad.

### Supabase / Edge Functions
- Deno runtime. Usar los tipos de `@supabase/supabase-js`.
- Cada Edge Function maneja sus propios errores y devuelve siempre `{ data, error }`.
- Los secrets se inyectan como variables de entorno. Nunca hardcodear keys.

### Commits y branches
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`.
- Branch por feature: `feat/qr-generation`, `feat/doctor-web-view`, etc.
- No pushear directamente a `main`.

---

## 8. Archivos de documentación por módulo

Cada módulo importante del proyecto debe tener:

### `MODULE.md`
Describe el módulo. Estructura sugerida:
```markdown
# Nombre del módulo

## Propósito
Qué problema resuelve este módulo dentro del sistema.

## Qué hace
Lista de responsabilidades concretas.

## Cómo lo hace
Descripción técnica breve: patterns usados, dependencias clave, decisiones de diseño.

## Interfaces públicas
Exports principales, props de componentes clave, signatures de funciones importantes.

## Lo que NO hace
Límites explícitos del módulo. Qué resuelve otro módulo.

## Dependencias
Otros módulos o librerías de los que depende.
```

### `CHANGELOG.md`
Registro de cambios por versión. Formato:
```markdown
# Changelog

## [Unreleased]
### Added
- Descripción del cambio

## [0.1.0] — YYYY-MM-DD
### Added
- Primera versión funcional del módulo
```

---

## 9. Flujos de usuario detallados

### Flujo del paciente — carga de estudio

1. El paciente abre la app y va a la pestaña "Estudios".
2. Toca el botón `+`.
3. El sistema presenta tres opciones: Cámara / Galería / Compartir desde otra app.
4. El paciente selecciona el origen y elige el archivo.
5. Si es imagen: la app aplica corrección de perspectiva automática y comprime (máximo 2048px, JPEG 85%).
6. Si es PDF: se sube sin comprimir.
7. La app muestra la pantalla de metadatos:
   - Tipo (Laboratorio / Imagen / Informe / Otro) — selector visual, requerido.
   - Fecha — auto-detectada del PDF si es posible, editable, requerida.
   - Título — campo de texto, opcional.
8. El paciente confirma.
9. La app encripta localmente y sube a Supabase Storage.
10. Muestra barra de progreso durante la subida.
11. Al confirmar: el estudio aparece en el historial cronológico con badge de tipo y fecha.

### Flujo del paciente — generación de QR

1. El paciente va a la pestaña "QR".
2. Toca "Generar QR para consulta".
3. Selecciona duración: 30 min / 2 horas / 8 horas / 24 horas.
4. Opcionalmente: selecciona qué secciones compartir (todo / solo críticos / solo estudios).
5. La app llama a la Edge Function `generate-qr-token`.
6. El QR aparece en pantalla, grande y legible, con un countdown visible.
7. El paciente muestra el teléfono al médico.
8. El médico escanea.
9. El paciente recibe push notification: "Dr. [nombre declarado] accedió a tu historial".
10. En el log de accesos de la app, aparece el registro del acceso.

### Flujo del médico — acceso vía QR

1. El médico escanea el QR con la cámara de su teléfono.
2. El browser abre: `https://mihistorial.app/acceso?token=<JWT>`
3. La página muestra un spinner mientras valida el token contra la Edge Function.
4. Si el token expiró o fue revocado: pantalla de error con texto "Este acceso expiró. Pedile al paciente que genere un nuevo QR desde su app." Sin tecnicismos.
5. Si es válido: carga la vista del historial del paciente.

**Orden de la vista del médico (de arriba a abajo):**
- Nombre, edad, sexo, grupo sanguíneo.
- Badge "Solo lectura" + tiempo restante de la sesión.
- Alergias documentadas (si existen, con borde de color danger).
- Condiciones crónicas activas.
- Medicación activa.
- Últimas consultas (máximo 5, con botón "Ver historial completo").
- Estudios recientes (máximo 5, con botón "Ver todos").
- Botón "Agregar nota de consulta".

**Formulario de nota médica:**
- Nombre y especialidad del médico (texto libre, requerido, no verificado).
- Motivo de consulta (texto libre, opcional).
- Diagnóstico (texto libre + campo CIE-10 opcional).
- Tipo de diagnóstico: Confirmado / Presuntivo / Descartado.
- Indicaciones / tratamiento (textarea, opcional).
- Próximo control (texto libre, opcional).
- Botón "Guardar nota en el historial".
- Al guardar: el paciente recibe notificación push.

---

## 10. Seguridad y compliance

### Principios
- El paciente es el único propietario de sus datos.
- Ningún dato de salud se procesa fuera del sistema sin consentimiento explícito.
- Los médicos acceden con sesiones anónimas de corta duración. No se crean cuentas para ellos en MVP.
- El acceso del médico siempre queda registrado en audit log con timestamp e IP.

### Ley 25.326 — Protección de Datos Personales (Argentina)
- Los datos de salud son datos sensibles según la ley argentina.
- El usuario debe dar consentimiento explícito durante el registro para el tratamiento de sus datos.
- El usuario tiene derecho a exportar todos sus datos (botón "Exportar mi historial" en perfil).
- El usuario tiene derecho a eliminar todos sus datos (botón "Eliminar mi cuenta y datos" en perfil).
- Ambas funcionalidades deben estar implementadas antes del lanzamiento público.

### Encriptación
- Datos en reposo: Supabase cifra el storage con AES-256.
- Datos en tránsito: TLS 1.3 obligatorio.
- El JWT del QR se firma con `HS256` usando `SUPABASE_JWT_SECRET` como clave.
- Los archivos médicos nunca se exponen con URLs directas — solo con signed URLs de corta duración generadas server-side.

### Lo que NO hacemos en MVP
- No integramos con PAMI, OSDE, Swiss Medical ni ninguna obra social.
- No integramos con sistemas hospitalarios (HIS/EMR).
- No implementamos firma digital con validez legal (eso requiere AFIP o CAME — es V2).
- No verificamos la matrícula del médico.

---

## 11. MVP — alcance exacto

El MVP valida una hipótesis: **¿El paciente usa activamente la app para llevar su historial a consultas?**

### En scope para MVP

**App del paciente:**
- Registro con email/password (Supabase Auth).
- Perfil médico: nombre, DNI, CUIL, fecha de nacimiento, grupo sanguíneo, alergias, condiciones crónicas.
- Carga de estudios (cámara, galería, compartir).
- Historial cronológico de consultas y estudios.
- Generación de QR temporal (duración configurable).
- Log de accesos médicos.
- Revocación de QR activos.
- Notificaciones push cuando un médico accede.
- Exportar historial (requisito legal).
- Eliminar cuenta y datos (requisito legal).

**Vista web del médico:**
- Acceso por QR sin registro.
- Vista del historial completo del paciente.
- Formulario para agregar nota de consulta.
- Responsive, mobile-first.

**Supabase/Backend:**
- Schema completo con RLS.
- Edge Functions: `generate-qr-token`, `validate-qr-token`, `revoke-qr-token`.
- Storage con buckets privados y signed URLs.
- Audit log de accesos.

### Fuera de scope en MVP
- Integración con laboratorios o sistemas externos.
- Firma digital con validez legal.
- App dedicada para médicos.
- Módulo de turnos.
- Historial familiar.
- Modo sin conexión (offline).
- Panel de administración.

---

## 12. Variables de entorno requeridas

```bash
# .env.local (mobile)
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# .env.local (web-doctor)
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_BASE_URL=https://mihistorial.app

# Supabase Edge Functions (secrets, no en .env)
SUPABASE_JWT_SECRET=<secret>
SUPABASE_SERVICE_ROLE_KEY=<key>
```

---

## 13. Instrucciones para el agente de Cursor

Lee esto antes de comenzar a trabajar:

1. **Leer este archivo completo** antes de escribir código.
2. **Nunca mezclar responsabilidades entre módulos.** La lógica de negocio va en hooks y stores, no en componentes de UI.
3. **Actualizar `CHANGELOG.md` del módulo** cada vez que se agrega o modifica funcionalidad.
4. **Actualizar `LESSONS.md`** cada vez que se tome una decisión técnica relevante, se encuentre un bug no trivial, o se cambie un approach.
5. **Crear `MODULE.md`** al inicializar cada módulo nuevo.
6. **Toda función que toque la base de datos** debe manejar errores explícitamente y nunca asumir que la operación fue exitosa.
7. **Los tipos compartidos** entre la app mobile y la web-doctor van en `packages/shared-types/index.ts`.
8. **No instalar dependencias nuevas** sin justificarlo en un comentario en el código y en `LESSONS.md`.
9. **El agente no debe asumir que el entorno está configurado.** Si falta una variable de entorno, debe fallar con un mensaje claro, no silenciosamente.
10. **Mobile-first siempre** en la vista web del médico.

---

## 14. Orden de implementación sugerido

Implementar en este orden para tener algo funcional lo antes posible:

```
Fase 1 — Fundamentos (sin UI)
  [ ] Schema SQL completo + migraciones en Supabase
  [ ] RLS policies
  [ ] Edge Function: generate-qr-token
  [ ] Edge Function: validate-qr-token
  [ ] Edge Function: revoke-qr-token
  [ ] shared-types/index.ts con todos los tipos del dominio

Fase 2 — App del paciente (core)
  [ ] Inicializar Expo + Expo Router
  [ ] Autenticación (login/registro con Supabase Auth)
  [ ] Pantalla de perfil médico (datos básicos)
  [ ] Generación y visualización de QR
  [ ] Historial cronológico (solo lectura)

Fase 3 — Vista web del médico
  [ ] Inicializar Vite + React
  [ ] Página de validación de token
  [ ] Vista del historial del paciente
  [ ] Formulario de nota médica
  [ ] Página de token expirado

Fase 4 — Carga de estudios
  [ ] Picker de archivos (cámara + galería + share)
  [ ] Compresión de imágenes
  [ ] Upload a Supabase Storage
  [ ] Visualización de estudios en historial

Fase 5 — Cierre de MVP
  [ ] Push notifications
  [ ] Log de accesos en app del paciente
  [ ] Exportar historial (PDF o JSON)
  [ ] Eliminar cuenta y datos
  [ ] Pruebas E2E del flujo QR completo
```
