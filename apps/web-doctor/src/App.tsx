import React, { useEffect, useMemo, useState } from "react";
import { validateQrToken } from "./lib/edge";
import { createDoctorClient } from "./lib/supabase";
import { isSupabaseConfigured } from "./lib/env";

type ViewState =
  | { kind: "validating" }
  | { kind: "error"; message: string }
  | { kind: "demo" }
  | { kind: "ready"; sessionToken: string; patientId: string; expiresAt: string };

type PatientRow = {
  id: string;
  full_name: string;
  obra_social: string;
  dni: string;
  cuil: string | null;
  birth_date: string;
  blood_type: string | null;
};

type CriticalRow = {
  id: string;
  type: "allergy" | "chronic_condition" | "vaccine";
  description: string;
  severity: "mild" | "moderate" | "severe" | null;
  recorded_at: string;
};

type ConsultationRow = {
  id: string;
  consultation_date: string;
  doctor_name: string;
  doctor_specialty: string | null;
  reason: string | null;
  diagnosis: string | null;
  diagnosis_type: "confirmed" | "presumptive" | "ruled_out" | null;
};

type DocumentRow = {
  id: string;
  type: "lab" | "imaging" | "report" | "other";
  title: string | null;
  document_date: string | null;
  created_at: string;
};

function getTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  return url.searchParams.get("token");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function demoData() {
  const patient: PatientRow = {
    id: "demo-patient",
    full_name: "Paciente Demo",
    obra_social: "OSDE (demo)",
    dni: "12345678",
    cuil: "20-12345678-3",
    birth_date: "1990-01-01",
    blood_type: "O+",
  };

  const critical: CriticalRow[] = [
    {
      id: "c1",
      type: "allergy",
      description: "Penicilina",
      severity: "severe",
      recorded_at: nowPlusMinutes(-60 * 24 * 120),
    },
    {
      id: "c2",
      type: "chronic_condition",
      description: "Asma (leve)",
      severity: "mild",
      recorded_at: nowPlusMinutes(-60 * 24 * 365),
    },
  ];

  const consultations: ConsultationRow[] = [
    {
      id: "k1",
      consultation_date: nowPlusMinutes(-60 * 24 * 10),
      doctor_name: "Dra. López",
      doctor_specialty: "Clínica",
      reason: "Fiebre y malestar",
      diagnosis: "Síndrome gripal",
      diagnosis_type: "presumptive",
    },
    {
      id: "k2",
      consultation_date: nowPlusMinutes(-60 * 24 * 90),
      doctor_name: "Dr. García",
      doctor_specialty: "Neumonología",
      reason: "Control",
      diagnosis: "Asma controlada",
      diagnosis_type: "confirmed",
    },
  ];

  const documents: DocumentRow[] = [
    {
      id: "d1",
      type: "lab",
      title: "Hemograma",
      document_date: "2026-02-10",
      created_at: nowPlusMinutes(-60 * 24 * 10),
    },
    {
      id: "d2",
      type: "imaging",
      title: "Radiografía de tórax",
      document_date: "2025-12-01",
      created_at: nowPlusMinutes(-60 * 24 * 90),
    },
  ];

  return { patient, critical, consultations, documents };
}

export function App() {
  const [state, setState] = useState<ViewState>({ kind: "validating" });
  const token = useMemo(() => getTokenFromUrl(), []);

  const [patient, setPatient] = useState<PatientRow | null>(null);
  const [critical, setCritical] = useState<CriticalRow[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!isSupabaseConfigured() || !token) {
        setState({ kind: "demo" });
        return;
      }

      const validated = await validateQrToken({ token });
      if (cancelled) return;
      if (validated.error || !validated.data) {
        setState({ kind: "demo" });
        return;
      }

      setState({
        kind: "ready",
        sessionToken: validated.data.sessionToken,
        patientId: validated.data.patientId,
        expiresAt: validated.data.expiresAt,
      });
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (state.kind !== "ready") return;

      let sb: ReturnType<typeof createDoctorClient>;
      try {
        sb = createDoctorClient(state.sessionToken);
      } catch (e) {
        if (!cancelled) setState({ kind: "demo" });
        return;
      }

      const [p, c, cons, docs] = await Promise.all([
        sb.from("patients")
          .select("id, full_name, obra_social, dni, cuil, birth_date, blood_type")
          .eq("id", state.patientId)
          .single(),
        sb.from("patient_critical_data")
          .select("id, type, description, severity, recorded_at")
          .eq("patient_id", state.patientId)
          .order("recorded_at", { ascending: false }),
        sb.from("consultations")
          .select("id, consultation_date, doctor_name, doctor_specialty, reason, diagnosis, diagnosis_type")
          .eq("patient_id", state.patientId)
          .order("consultation_date", { ascending: false })
          .limit(20),
        sb.from("medical_documents")
          .select("id, type, title, document_date, created_at")
          .eq("patient_id", state.patientId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (cancelled) return;

      if (p.error) {
        setState({ kind: "error", message: p.error.message });
        return;
      }
      setPatient(p.data);
      setCritical(c.data ?? []);
      setConsultations(cons.data ?? []);
      setDocuments(docs.data ?? []);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state.kind === "validating") {
    return (
      <Shell>
        <TopBar mode="loading" />
        <CenteredMessage title="Validando acceso…" subtitle="Un momento, por favor." />
      </Shell>
    );
  }

  if (state.kind === "demo") {
    const demo = demoData();
    return (
      <Shell>
        <TopBar mode="demo" />
        <MainLayout>
          <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }}>
            <Card>
              <SectionHeader
                title={demo.patient.full_name}
                subtitle="Datos del paciente"
                badge="Modo demo"
                badgeTone="neutral"
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                <KeyValue label="Obra social" value={demo.patient.obra_social} />
                <KeyValue label="DNI" value={demo.patient.dni} />
                <KeyValue label="CUIL" value={demo.patient.cuil ?? "—"} />
                <KeyValue label="Nacimiento" value={demo.patient.birth_date} />
                <KeyValue label="Grupo sanguíneo" value={demo.patient.blood_type ?? "—"} />
              </div>
            </Card>

            <Card>
              <SectionHeader
                title="Datos críticos"
                subtitle="Alertas que tenés que mirar primero"
              />
              <CriticalList items={demo.critical} />
            </Card>
          </section>

          <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }}>
            <Card>
              <SectionHeader
                title="Consultas recientes"
                subtitle="Vista rápida de las últimas atenciones"
              />
              <ConsultationList items={demo.consultations} />
            </Card>

            <Card>
              <SectionHeader
                title="Estudios y documentos"
                subtitle="Análisis, imágenes e informes recientes"
              />
              <DocumentsList items={demo.documents} />
            </Card>
          </section>
        </MainLayout>
      </Shell>
    );
  }

  if (state.kind === "error") {
    return (
      <Shell>
        <TopBar mode="error" />
        <CenteredMessage
          title="No se pudo abrir el historial"
          subtitle={state.message}
          tone="danger"
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <TopBar mode="live" expiresAt={state.expiresAt} />
      <MainLayout>
        {patient && (
          <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }}>
            <Card>
              <SectionHeader
                title={patient.full_name}
                subtitle="Datos del paciente"
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                <KeyValue label="Obra social" value={patient.obra_social} />
                <KeyValue label="DNI" value={patient.dni} />
                <KeyValue label="CUIL" value={patient.cuil ?? "—"} />
                <KeyValue label="Nacimiento" value={patient.birth_date} />
                <KeyValue label="Grupo sanguíneo" value={patient.blood_type ?? "—"} />
              </div>
            </Card>
          </section>
        )}

        <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }}>
          <Card>
            <SectionHeader
              title="Datos críticos"
              subtitle="Revisá siempre estas alertas primero"
            />
            <CriticalList items={critical} />
          </Card>
        </section>

        <section style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }}>
          <Card>
            <SectionHeader
              title="Consultas recientes"
              subtitle="Máximo 20, de la más nueva a la más antigua"
            />
            <ConsultationList items={consultations} />
          </Card>

          <Card>
            <SectionHeader
              title="Estudios y documentos"
              subtitle="Laboratorio, imágenes e informes"
            />
            <DocumentsList items={documents} />
          </Card>
        </section>
      </MainLayout>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
        background: "#f3f4f6",
        minHeight: "100vh",
        padding: 16,
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

type TopBarProps =
  | { mode: "loading" | "demo" | "error"; expiresAt?: undefined }
  | { mode: "live"; expiresAt: string };

function TopBar(props: TopBarProps) {
  const isLive = props.mode === "live";
  const tone =
    props.mode === "error" ? "#b91c1c" : props.mode === "demo" ? "#0f766e" : "#4b5563";

  const right = (() => {
    if (props.mode === "loading") return "Validando acceso…";
    if (props.mode === "error") return "Error de acceso";
    if (props.mode === "demo") return "Modo demo · Sin Supabase / sin QR";
    return `Solo lectura · Expira: ${formatDate(props.expiresAt ?? "")}`;
  })();

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: "999px", backgroundColor: isLive ? "#16a34a" : "#9ca3af" }} />
        <div style={{ fontSize: 18, fontWeight: 800 }}>MiHistorial — Acceso médico</div>
      </div>
      <div style={{ fontSize: 12, color: tone, fontWeight: 600, textAlign: "right" }}>
        {right}
      </div>
    </div>
  );
}

function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8, marginBottom: 24 }}>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "white",
        borderRadius: 16,
        padding: 16,
        border: "1px solid #e5e7eb",
        boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
      }}
    >
      {children}
    </section>
  );
}

function SectionHeader(props: {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: "neutral" | "danger";
}) {
  const badgeColor =
    props.badgeTone === "danger"
      ? { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" }
      : { bg: "#ecfdf5", border: "#bbf7d0", text: "#166534" };

  return (
    <header style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{props.title}</div>
        {props.subtitle ? <div style={{ fontSize: 12, color: "#6b7280" }}>{props.subtitle}</div> : null}
      </div>
      {props.badge && (
        <span
          style={{
            alignSelf: "flex-start",
            fontSize: 11,
            padding: "4px 8px",
            borderRadius: 999,
            border: `1px solid ${badgeColor.border}`,
            backgroundColor: badgeColor.bg,
            color: badgeColor.text,
            fontWeight: 600,
          }}
        >
          {props.badge}
        </span>
      )}
    </header>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
      <div style={{ color: "#6b7280", fontSize: 13 }}>{label}</div>
      <div style={{ fontWeight: 600, textAlign: "right", fontSize: 13 }}>{value}</div>
    </div>
  );
}

function CriticalList({ items }: { items: CriticalRow[] }) {
  if (items.length === 0) {
    return <MutedText>No hay datos críticos registrados.</MutedText>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((x) => {
        const isSevere = x.severity === "severe";
        const chipColor = isSevere ? "#b91c1c" : "#0f766e";
        const chipBg = isSevere ? "#fef2f2" : "#ecfdf5";

        return (
          <div
            key={x.id}
            style={{
              padding: 10,
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              backgroundColor: "#f9fafb",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{x.description}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDate(x.recorded_at)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
                  borderRadius: 999,
                  backgroundColor: chipBg,
                  color: chipColor,
                  fontWeight: 600,
                }}
              >
                {x.type === "allergy" ? "Alergia" : x.type === "chronic_condition" ? "Crónica" : "Vacuna"}
              </span>
              {x.severity && (
                <span style={{ fontSize: 11, color: "#6b7280" }}>Severidad: {x.severity}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConsultationList({ items }: { items: ConsultationRow[] }) {
  if (items.length === 0) {
    return <MutedText>No hay consultas registradas.</MutedText>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((c) => (
        <div
          key={c.id}
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{formatDate(c.consultation_date)}</div>
            {c.diagnosis_type && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 999,
                  backgroundColor: "#eff6ff",
                  color: "#1d4ed8",
                  fontWeight: 600,
                }}
              >
                {c.diagnosis_type === "confirmed"
                  ? "Confirmado"
                  : c.diagnosis_type === "presumptive"
                  ? "Presuntivo"
                  : "Descartado"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>
            {c.doctor_name}
            {c.doctor_specialty ? ` — ${c.doctor_specialty}` : ""}
          </div>
          {c.diagnosis ? (
            <div style={{ fontSize: 13, color: "#111827", marginTop: 4 }}>
              <strong>Dx:</strong> {c.diagnosis}
            </div>
          ) : null}
          {c.reason ? (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Motivo: {c.reason}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DocumentsList({ items }: { items: DocumentRow[] }) {
  if (items.length === 0) {
    return <MutedText>No hay estudios/documentos.</MutedText>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((d) => (
        <div
          key={d.id}
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.title ?? "Documento"}</div>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                backgroundColor: "#eef2ff",
                color: "#4f46e5",
                fontWeight: 600,
              }}
            >
              {d.type === "lab"
                ? "Laboratorio"
                : d.type === "imaging"
                ? "Imágenes"
                : d.type === "report"
                ? "Informe"
                : "Otro"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
            {d.document_date ? `Fecha estudio: ${d.document_date} · ` : ""}
            Subido: {formatDate(d.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

function MutedText({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
      {children}
    </p>
  );
}

function CenteredMessage(props: { title: string; subtitle: string; tone?: "default" | "danger" }) {
  const color = props.tone === "danger" ? "#b91c1c" : "#111827";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          backgroundColor: "white",
          borderRadius: 16,
          padding: 20,
          border: "1px solid #e5e7eb",
          boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 8 }}>{props.title}</div>
        <div style={{ fontSize: 13, color: "#4b5563" }}>{props.subtitle}</div>
      </div>
    </div>
  );
}

