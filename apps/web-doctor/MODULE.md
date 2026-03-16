# apps/web-doctor

## Propósito

Web app del médico (React, mobile-first) accesible solo mediante QR temporal.

## Qué hace

- Valida token QR llamando a Edge Function.
- Renderiza el historial del paciente bajo sesión temporal.
- Permite agregar una nota de consulta (MVP).

## Qué NO hace

- No persiste sesión (sin cookies ni localStorage).
- No requiere cuenta de médico en MVP.

