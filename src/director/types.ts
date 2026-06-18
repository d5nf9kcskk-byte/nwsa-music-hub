export interface Ensemble {
  id: string;
  name: string;
  order: number;
}

export interface Student {
  id: string;
  name: string;
  ensembleIds: string[];
  instrument: string;
  section?: string;
  grade?: string;
  status: 'Active' | 'Inactive' | 'Graduated';
  email?: string;
  parentEmail?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  ensembleId: string;
  date: string; // YYYY-MM-DD
  status: 'Absent' | 'Late' | 'Excused';
  reason?: string;
  notes?: string;
}

export interface Rehearsal {
  id: string;
  ensembleId: string;
  date: string; // YYYY-MM-DD
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  notes?: string;
  repertoire?: string;
}

export interface ProgressNote {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  content: string;
  category?: string;
}

export type AttendanceStatus = 'Absent' | 'Late' | 'Excused';
export type Tab = 'roll' | 'roster' | 'rehearsals' | 'notes';
