-- MiHistorial — Initial schema (MVP)
-- Source of truth: CURSOR_PROMPT.md

-- Extensions (Supabase usually includes pgcrypto; keep idempotent)
create extension if not exists "pgcrypto";

-- Patients
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  obra_social text not null,
  dni text unique not null,
  cuil text,
  birth_date date not null,
  blood_type text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Critical data (allergies, chronic conditions, vaccines)
create table if not exists patient_critical_data (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  type text not null check (type in ('allergy', 'chronic_condition', 'vaccine')),
  description text not null,
  severity text check (severity in ('mild','moderate','severe')),
  recorded_at timestamptz default now()
);

-- Consultations
create table if not exists consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  doctor_name text not null,
  doctor_specialty text,
  consultation_date timestamptz not null,
  reason text,
  diagnosis text,
  diagnosis_code text,
  diagnosis_type text check (diagnosis_type in ('confirmed','presumptive','ruled_out')),
  notes text,
  next_control text,
  created_at timestamptz default now(),
  doctor_declared_name text,
  access_token_id uuid
);

-- Prescriptions
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid references consultations(id) on delete cascade,
  patient_id uuid references patients(id) on delete cascade,
  medication text not null,
  dose text,
  frequency text,
  duration text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Medical documents
create table if not exists medical_documents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  type text not null check (type in ('lab','imaging','report','other')),
  title text,
  document_date date,
  storage_path text not null,
  file_size_bytes integer,
  mime_type text,
  created_at timestamptz default now()
);

-- Access tokens (QR)
create table if not exists access_tokens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz default now(),
  scope text default 'read',
  allowed_sections text[]
);

-- Access logs (audit)
create table if not exists access_logs (
  id uuid primary key default gen_random_uuid(),
  access_token_id uuid references access_tokens(id),
  patient_id uuid references patients(id),
  accessed_at timestamptz default now(),
  ip_address text,
  user_agent text,
  doctor_declared_name text,
  action text check (action in ('view','add_note'))
);

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────

alter table patients enable row level security;
create policy "patients_own_data" on patients
  for all using (auth.uid() = user_id);

-- Doctor QR sessions:
-- A short-lived JWT (minted by `validate-qr-token`) includes the claim `patient_id`.
-- RLS uses that claim to allow read-only access to that specific patient.
--
-- NOTE: `auth.jwt()` is Supabase-specific and returns the JWT claims as JSON.
-- This avoids relying on `current_setting(...)` which requires per-request SQL config.

create policy "patients_doctor_read_via_token" on patients
  for select using (
    id = (auth.jwt() ->> 'patient_id')::uuid
  );

alter table patient_critical_data enable row level security;
create policy "patient_critical_data_owner" on patient_critical_data
  for select using (
    patient_id in (select id from patients where user_id = auth.uid())
    or patient_id = (auth.jwt() ->> 'patient_id')::uuid
  );
create policy "patient_critical_data_owner_write" on patient_critical_data
  for insert with check (patient_id in (select id from patients where user_id = auth.uid()));
create policy "patient_critical_data_owner_update" on patient_critical_data
  for update using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "patient_critical_data_owner_delete" on patient_critical_data
  for delete using (patient_id in (select id from patients where user_id = auth.uid()));

alter table consultations enable row level security;
create policy "consultations_owner" on consultations
  for select using (
    patient_id in (select id from patients where user_id = auth.uid())
    or patient_id = (auth.jwt() ->> 'patient_id')::uuid
  );
create policy "consultations_owner_write" on consultations
  for insert with check (patient_id in (select id from patients where user_id = auth.uid()));
create policy "consultations_owner_update" on consultations
  for update using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "consultations_owner_delete" on consultations
  for delete using (patient_id in (select id from patients where user_id = auth.uid()));

alter table prescriptions enable row level security;
create policy "prescriptions_owner" on prescriptions
  for select using (
    patient_id in (select id from patients where user_id = auth.uid())
    or patient_id = (auth.jwt() ->> 'patient_id')::uuid
  );
create policy "prescriptions_owner_write" on prescriptions
  for insert with check (patient_id in (select id from patients where user_id = auth.uid()));
create policy "prescriptions_owner_update" on prescriptions
  for update using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "prescriptions_owner_delete" on prescriptions
  for delete using (patient_id in (select id from patients where user_id = auth.uid()));

alter table medical_documents enable row level security;
create policy "medical_documents_owner" on medical_documents
  for select using (
    patient_id in (select id from patients where user_id = auth.uid())
    or patient_id = (auth.jwt() ->> 'patient_id')::uuid
  );
create policy "medical_documents_owner_write" on medical_documents
  for insert with check (patient_id in (select id from patients where user_id = auth.uid()));
create policy "medical_documents_owner_update" on medical_documents
  for update using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "medical_documents_owner_delete" on medical_documents
  for delete using (patient_id in (select id from patients where user_id = auth.uid()));

alter table access_tokens enable row level security;
create policy "access_tokens_owner_select" on access_tokens
  for select using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "access_tokens_owner_write" on access_tokens
  for insert with check (patient_id in (select id from patients where user_id = auth.uid()));
create policy "access_tokens_owner_update" on access_tokens
  for update using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "access_tokens_owner_delete" on access_tokens
  for delete using (patient_id in (select id from patients where user_id = auth.uid()));

alter table access_logs enable row level security;
create policy "access_logs_owner_read" on access_logs
  for select using (patient_id in (select id from patients where user_id = auth.uid()));
create policy "access_logs_insert_any" on access_logs
  for insert with check (true);

