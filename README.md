# MiHistorial

Aplicación centrada en el paciente para llevar su historia clínica en el teléfono y compartirla temporalmente con un médico vía QR.

## Stack

- Mobile: React Native (Expo) + TypeScript
- Web médico: React (Vite) + TypeScript
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)

## Estructura

Ver `CURSOR_PROMPT.md` para la especificación completa del MVP, modelo de datos, convenciones y orden sugerido de implementación.

## Variables de entorno (resumen)

- Mobile (`apps/mobile/.env.local`):
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Web doctor (`apps/web-doctor/.env.local`):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_APP_BASE_URL`

## Estado del repo

Este repositorio se inicializa desde documentación. El primer hito es:

- `supabase/migrations/001_initial_schema.sql`
- Edge Functions de QR en `supabase/functions/*`
- Tipos compartidos en `packages/shared-types/`

