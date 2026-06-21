export interface Ensemble {
  id: string;
  name: string;
  order: number;
  color?: string;
  defaultLocation?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  meetingDays?: number[];
}

export interface Student {
  id: string;
  name: string;
  ensembleIds: string[];
  instrument: string;
  section?: string;
  grade?: string;
  status: 'Active' | 'Inactive' | 'Graduated';
}

export interface StudentContact {
  id: string;
  email?: string;
  parentEmail?: string;
  phone?: string;
}

export type EventType = 'Rehearsal' | 'Concert' | 'Sectional' | 'Event';
export type EventStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface CalendarEvent {
  id: string;
  type: EventType;
  ensembleIds: string[];
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  title?: string;
  repertoire?: string;
  pieceIds?: string[];
  status: EventStatus;
  notes?: string;
}

export type OverrideScope = 'event' | 'range';

export interface RosterOverride {
  id: string;
  studentId: string;
  ensembleId: string;
  action: 'add' | 'remove';
  scope: OverrideScope;
  eventId?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  ensembleId: string;
  date: string;
  status: 'Absent' | 'Late' | 'Excused';
  reason?: string;
  notes?: string;
}

export interface ProgressNote {
  id: string;
  studentId: string;
  date: string;
  content: string;
  category?: string;
}

export interface Announcement {
  id: string;
  ensembleId: string | null;
  title: string;
  body?: string;
  createdAt: number;
  pinned?: boolean;
  expiresOn?: string;
}

export interface PieceMovement {
  title: string;
  duration?: number;
}

export interface PiecePartLink {
  instrument: string;
  url: string;
}

export interface RepertoirePiece {
  id: string;
  ensembleId: string;
  title: string;
  fullTitle?: string;
  composer?: string;
  composerDates?: string;
  arranger?: string;
  catalogNumber?: string;
  year?: string;
  instrumentation?: string;
  duration?: number;
  movements?: PieceMovement[];
  programNotes?: string;
  programNotesUrl?: string;
  imslpUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  partsLinks?: PiecePartLink[];
  partsSharedUrl?: string;
  partsUrl?: string;
  notes?: string;
  eventIds?: string[];
  order: number;
  aiStatus?: 'pending' | 'enriched' | null;
}

export type AttendanceStatus = 'Absent' | 'Late' | 'Excused';
export type Tab = 'roll' | 'roster' | 'schedule' | 'notes' | 'assignments';

export type AssignmentType = 'Playing Exam' | 'Written Test' | 'Performance' | 'Other';
export type AssignmentResultStatus = 'Pending' | 'Pass' | 'Fail' | 'Exempt';

export interface Assignment {
  id: string;
  title: string;
  type: AssignmentType;
  description?: string;
  dueDate: string;
  ensembleIds: string[];
  createdAt: number;
}

export interface AssignmentResult {
  id: string;
  assignmentId: string;
  studentId: string;
  status: AssignmentResultStatus;
  score?: string;
  notes?: string;
  gradedAt?: string;
}
