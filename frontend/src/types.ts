export type Status = 'ok' | 'warn' | 'err';
export type FetchPhase = 'idle' | 'download' | 'prepare' | 'upload' | 'done';

export interface HistoryRecord {
  puzzle_date: string;
  fetched_at: string;
  status: 'success' | 'error';
  error?: string;
  size_bytes?: number;
  filename?: string;
}

export interface ScheduleConfig {
  days: string[];
  time: string;
  timezone: string;
  enabled: boolean;
}

export interface Settings {
  remarkable_folder: string;
  file_pattern: string;
}

export interface FetchState {
  phase: FetchPhase;
  progress: number;
  log: { ts: string; msg: string; kind?: string }[];
  puzzle_date?: string;
}

export interface HealthNyt {
  status: 'ok' | 'expired' | 'not_configured';
  cookie_age_days: number | null;
}

export interface HealthRemarkable {
  status: 'ok' | 'disconnected' | 'not_installed';
  folder: string;
}

export type CellState = 'ok' | 'err' | 'none' | 'future-scheduled' | 'future';
