export type Uuid = string;

export type BloodType = "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-";

export type CriticalDataType = "allergy" | "chronic_condition" | "vaccine";
export type Severity = "mild" | "moderate" | "severe";

export interface Patient {
  id: Uuid;
  userId: Uuid;
  fullName: string;
  obraSocial: string;
  dni: string;
  cuil?: string | null;
  birthDate: string; // ISO date (YYYY-MM-DD)
  bloodType?: BloodType | null;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface PatientCriticalData {
  id: Uuid;
  patientId: Uuid;
  type: CriticalDataType;
  description: string;
  severity?: Severity | null;
  recordedAt: string; // ISO datetime
}

export type DiagnosisType = "confirmed" | "presumptive" | "ruled_out";

export interface Consultation {
  id: Uuid;
  patientId: Uuid;
  doctorName: string;
  doctorSpecialty?: string | null;
  consultationDate: string; // ISO datetime
  reason?: string | null;
  diagnosis?: string | null;
  diagnosisCode?: string | null; // CIE-10
  diagnosisType?: DiagnosisType | null;
  notes?: string | null;
  nextControl?: string | null;
  createdAt: string; // ISO datetime
  doctorDeclaredName?: string | null;
  accessTokenId?: Uuid | null;
}

export interface Prescription {
  id: Uuid;
  consultationId: Uuid;
  patientId: Uuid;
  medication: string;
  dose?: string | null;
  frequency?: string | null;
  duration?: string | null;
  isActive: boolean;
  createdAt: string; // ISO datetime
}

export type MedicalDocumentType = "lab" | "imaging" | "report" | "other";

export interface MedicalDocument {
  id: Uuid;
  patientId: Uuid;
  type: MedicalDocumentType;
  title?: string | null;
  documentDate?: string | null; // ISO date
  storagePath: string;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  createdAt: string; // ISO datetime
}

export type AccessTokenScope = "read";
export type AllowedSection = "critical" | "consultations" | "documents" | "prescriptions";

export interface AccessToken {
  id: Uuid;
  patientId: Uuid;
  tokenHash: string;
  expiresAt: string; // ISO datetime
  revokedAt?: string | null;
  createdAt: string; // ISO datetime
  scope: AccessTokenScope;
  allowedSections?: AllowedSection[] | null;
}

export type AccessLogAction = "view" | "add_note";

export interface AccessLog {
  id: Uuid;
  accessTokenId?: Uuid | null;
  patientId?: Uuid | null;
  accessedAt: string; // ISO datetime
  ipAddress?: string | null;
  userAgent?: string | null;
  doctorDeclaredName?: string | null;
  action: AccessLogAction;
}

