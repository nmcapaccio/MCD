import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { validateQrToken } from "./lib/edge";
import { createDoctorClient } from "./lib/supabase";
import { isSupabaseConfigured } from "./lib/env";
function getTokenFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get("token");
}
function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return iso;
    return d.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
}
function nowPlusMinutes(minutes) {
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
function demoData() {
    const patient = {
        id: "demo-patient",
        full_name: "Paciente Demo",
        obra_social: "OSDE (demo)",
        dni: "12345678",
        cuil: "20-12345678-3",
        birth_date: "1990-01-01",
        blood_type: "O+",
    };
    const critical = [
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
    const consultations = [
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
    const documents = [
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
    const [state, setState] = useState({ kind: "validating" });
    const token = useMemo(() => getTokenFromUrl(), []);
    const [patient, setPatient] = useState(null);
    const [critical, setCritical] = useState([]);
    const [consultations, setConsultations] = useState([]);
    const [documents, setDocuments] = useState([]);
    useEffect(() => {
        let cancelled = false;
        async function run() {
            if (!isSupabaseConfigured() || !token) {
                setState({ kind: "demo" });
                return;
            }
            const validated = await validateQrToken({ token });
            if (cancelled)
                return;
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
            if (state.kind !== "ready")
                return;
            let sb;
            try {
                sb = createDoctorClient(state.sessionToken);
            }
            catch (e) {
                if (!cancelled)
                    setState({ kind: "demo" });
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
            if (cancelled)
                return;
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
        return (_jsxs(Shell, { children: [_jsx(TopBar, { mode: "loading" }), _jsx(CenteredMessage, { title: "Validando acceso\u2026", subtitle: "Un momento, por favor." })] }));
    }
    if (state.kind === "demo") {
        const demo = demoData();
        return (_jsxs(Shell, { children: [_jsx(TopBar, { mode: "demo" }), _jsxs(MainLayout, { children: [_jsxs("section", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }, children: [_jsxs(Card, { children: [_jsx(SectionHeader, { title: demo.patient.full_name, subtitle: "Datos del paciente", badge: "Modo demo", badgeTone: "neutral" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }, children: [_jsx(KeyValue, { label: "Obra social", value: demo.patient.obra_social }), _jsx(KeyValue, { label: "DNI", value: demo.patient.dni }), _jsx(KeyValue, { label: "CUIL", value: demo.patient.cuil ?? "—" }), _jsx(KeyValue, { label: "Nacimiento", value: demo.patient.birth_date }), _jsx(KeyValue, { label: "Grupo sangu\u00EDneo", value: demo.patient.blood_type ?? "—" })] })] }), _jsxs(Card, { children: [_jsx(SectionHeader, { title: "Datos cr\u00EDticos", subtitle: "Alertas que ten\u00E9s que mirar primero" }), _jsx(CriticalList, { items: demo.critical })] })] }), _jsxs("section", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }, children: [_jsxs(Card, { children: [_jsx(SectionHeader, { title: "Consultas recientes", subtitle: "Vista r\u00E1pida de las \u00FAltimas atenciones" }), _jsx(ConsultationList, { items: demo.consultations })] }), _jsxs(Card, { children: [_jsx(SectionHeader, { title: "Estudios y documentos", subtitle: "An\u00E1lisis, im\u00E1genes e informes recientes" }), _jsx(DocumentsList, { items: demo.documents })] })] })] })] }));
    }
    if (state.kind === "error") {
        return (_jsxs(Shell, { children: [_jsx(TopBar, { mode: "error" }), _jsx(CenteredMessage, { title: "No se pudo abrir el historial", subtitle: state.message, tone: "danger" })] }));
    }
    return (_jsxs(Shell, { children: [_jsx(TopBar, { mode: "live", expiresAt: state.expiresAt }), _jsxs(MainLayout, { children: [patient && (_jsx("section", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }, children: _jsxs(Card, { children: [_jsx(SectionHeader, { title: patient.full_name, subtitle: "Datos del paciente" }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }, children: [_jsx(KeyValue, { label: "Obra social", value: patient.obra_social }), _jsx(KeyValue, { label: "DNI", value: patient.dni }), _jsx(KeyValue, { label: "CUIL", value: patient.cuil ?? "—" }), _jsx(KeyValue, { label: "Nacimiento", value: patient.birth_date }), _jsx(KeyValue, { label: "Grupo sangu\u00EDneo", value: patient.blood_type ?? "—" })] })] }) })), _jsx("section", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }, children: _jsxs(Card, { children: [_jsx(SectionHeader, { title: "Datos cr\u00EDticos", subtitle: "Revis\u00E1 siempre estas alertas primero" }), _jsx(CriticalList, { items: critical })] }) }), _jsxs("section", { style: { display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 2fr)" }, children: [_jsxs(Card, { children: [_jsx(SectionHeader, { title: "Consultas recientes", subtitle: "M\u00E1ximo 20, de la m\u00E1s nueva a la m\u00E1s antigua" }), _jsx(ConsultationList, { items: consultations })] }), _jsxs(Card, { children: [_jsx(SectionHeader, { title: "Estudios y documentos", subtitle: "Laboratorio, im\u00E1genes e informes" }), _jsx(DocumentsList, { items: documents })] })] })] })] }));
}
function Shell({ children }) {
    return (_jsx("div", { style: {
            fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
            background: "#f3f4f6",
            minHeight: "100vh",
            padding: 16,
        }, children: _jsx("div", { style: { maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }, children: children }) }));
}
function TopBar(props) {
    const isLive = props.mode === "live";
    const tone = props.mode === "error" ? "#b91c1c" : props.mode === "demo" ? "#0f766e" : "#4b5563";
    const right = (() => {
        if (props.mode === "loading")
            return "Validando acceso…";
        if (props.mode === "error")
            return "Error de acceso";
        if (props.mode === "demo")
            return "Modo demo · Sin Supabase / sin QR";
        return `Solo lectura · Expira: ${formatDate(props.expiresAt ?? "")}`;
    })();
    return (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }, children: [_jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [_jsx("div", { style: { width: 10, height: 10, borderRadius: "999px", backgroundColor: isLive ? "#16a34a" : "#9ca3af" } }), _jsx("div", { style: { fontSize: 18, fontWeight: 800 }, children: "MiHistorial \u2014 Acceso m\u00E9dico" })] }), _jsx("div", { style: { fontSize: 12, color: tone, fontWeight: 600, textAlign: "right" }, children: right })] }));
}
function MainLayout({ children }) {
    return (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 16, marginTop: 8, marginBottom: 24 }, children: children }));
}
function Card({ children }) {
    return (_jsx("section", { style: {
            background: "white",
            borderRadius: 16,
            padding: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 10px 30px rgba(15,23,42,0.06)",
        }, children: children }));
}
function SectionHeader(props) {
    const badgeColor = props.badgeTone === "danger"
        ? { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" }
        : { bg: "#ecfdf5", border: "#bbf7d0", text: "#166534" };
    return (_jsxs("header", { style: { display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 700, fontSize: 15 }, children: props.title }), props.subtitle ? _jsx("div", { style: { fontSize: 12, color: "#6b7280" }, children: props.subtitle }) : null] }), props.badge && (_jsx("span", { style: {
                    alignSelf: "flex-start",
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: `1px solid ${badgeColor.border}`,
                    backgroundColor: badgeColor.bg,
                    color: badgeColor.text,
                    fontWeight: 600,
                }, children: props.badge }))] }));
}
function KeyValue({ label, value }) {
    return (_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, padding: "4px 0" }, children: [_jsx("div", { style: { color: "#6b7280", fontSize: 13 }, children: label }), _jsx("div", { style: { fontWeight: 600, textAlign: "right", fontSize: 13 }, children: value })] }));
}
function CriticalList({ items }) {
    if (items.length === 0) {
        return _jsx(MutedText, { children: "No hay datos cr\u00EDticos registrados." });
    }
    return (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: items.map((x) => {
            const isSevere = x.severity === "severe";
            const chipColor = isSevere ? "#b91c1c" : "#0f766e";
            const chipBg = isSevere ? "#fef2f2" : "#ecfdf5";
            return (_jsxs("div", { style: {
                    padding: 10,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#f9fafb",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: x.description }), _jsx("div", { style: { fontSize: 12, color: "#6b7280" }, children: formatDate(x.recorded_at) })] }), _jsxs("div", { style: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }, children: [_jsx("span", { style: {
                                    fontSize: 11,
                                    padding: "3px 8px",
                                    borderRadius: 999,
                                    backgroundColor: chipBg,
                                    color: chipColor,
                                    fontWeight: 600,
                                }, children: x.type === "allergy" ? "Alergia" : x.type === "chronic_condition" ? "Crónica" : "Vacuna" }), x.severity && (_jsxs("span", { style: { fontSize: 11, color: "#6b7280" }, children: ["Severidad: ", x.severity] }))] })] }, x.id));
        }) }));
}
function ConsultationList({ items }) {
    if (items.length === 0) {
        return _jsx(MutedText, { children: "No hay consultas registradas." });
    }
    return (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: items.map((c) => (_jsxs("div", { style: {
                padding: 10,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
            }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: formatDate(c.consultation_date) }), c.diagnosis_type && (_jsx("span", { style: {
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                backgroundColor: "#eff6ff",
                                color: "#1d4ed8",
                                fontWeight: 600,
                            }, children: c.diagnosis_type === "confirmed"
                                ? "Confirmado"
                                : c.diagnosis_type === "presumptive"
                                    ? "Presuntivo"
                                    : "Descartado" }))] }), _jsxs("div", { style: { fontSize: 13, color: "#374151", marginTop: 2 }, children: [c.doctor_name, c.doctor_specialty ? ` — ${c.doctor_specialty}` : ""] }), c.diagnosis ? (_jsxs("div", { style: { fontSize: 13, color: "#111827", marginTop: 4 }, children: [_jsx("strong", { children: "Dx:" }), " ", c.diagnosis] })) : null, c.reason ? (_jsxs("div", { style: { fontSize: 12, color: "#6b7280", marginTop: 2 }, children: ["Motivo: ", c.reason] })) : null] }, c.id))) }));
}
function DocumentsList({ items }) {
    if (items.length === 0) {
        return _jsx(MutedText, { children: "No hay estudios/documentos." });
    }
    return (_jsx("div", { style: { display: "flex", flexDirection: "column", gap: 8 }, children: items.map((d) => (_jsxs("div", { style: {
                padding: 10,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                backgroundColor: "#f9fafb",
            }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13 }, children: d.title ?? "Documento" }), _jsx("span", { style: {
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                backgroundColor: "#eef2ff",
                                color: "#4f46e5",
                                fontWeight: 600,
                            }, children: d.type === "lab"
                                ? "Laboratorio"
                                : d.type === "imaging"
                                    ? "Imágenes"
                                    : d.type === "report"
                                        ? "Informe"
                                        : "Otro" })] }), _jsxs("div", { style: { fontSize: 12, color: "#6b7280", marginTop: 4 }, children: [d.document_date ? `Fecha estudio: ${d.document_date} · ` : "", "Subido: ", formatDate(d.created_at)] })] }, d.id))) }));
}
function MutedText({ children }) {
    return (_jsx("p", { style: { margin: 0, fontSize: 13, color: "#6b7280" }, children: children }));
}
function CenteredMessage(props) {
    const color = props.tone === "danger" ? "#b91c1c" : "#111827";
    return (_jsx("div", { style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
        }, children: _jsxs("div", { style: {
                maxWidth: 420,
                textAlign: "center",
                backgroundColor: "white",
                borderRadius: 16,
                padding: 20,
                border: "1px solid #e5e7eb",
                boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
            }, children: [_jsx("div", { style: { fontSize: 16, fontWeight: 700, color, marginBottom: 8 }, children: props.title }), _jsx("div", { style: { fontSize: 13, color: "#4b5563" }, children: props.subtitle })] }) }));
}
