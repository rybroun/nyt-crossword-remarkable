import type { HistoryRecord, ScheduleConfig, Settings, FetchState, HealthNyt, HealthRemarkable, HealthLibgen, BookResult, BookSendRecord } from './types';

const BASE = '/api';

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path}: ${r.status}`);
  return r.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT ${path}: ${r.status}`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`POST ${path}: ${r.status}`);
  return r.json();
}

export const api = {
  health: {
    nyt: () => get<HealthNyt>('/health/nyt'),
    remarkable: () => get<HealthRemarkable>('/health/remarkable'),
    libgen: () => get<HealthLibgen>('/health/libgen'),
  },
  history: (year: number) => get<HistoryRecord[]>(`/history?year=${year}`),
  fetch: {
    trigger: (date: string) => post<{ status: string }>('/fetch', { date }),
    status: () => get<FetchState>('/fetch/status'),
  },
  schedule: {
    get: () => get<ScheduleConfig>('/schedule'),
    update: (s: ScheduleConfig) => put<{ status: string }>('/schedule', s),
    pause: () => post<{ status: string }>('/schedule/pause', {}),
  },
  settings: {
    get: () => get<Settings>('/settings'),
    update: (s: Settings) => put<{ status: string }>('/settings', s),
  },
  auth: {
    nytLogin: (email: string, password: string) =>
      post<{ status: string; error?: string }>('/auth/nyt/login', { email, password }),
    nytCookie: (cookie: string) =>
      post<{ status: string }>('/auth/nyt/cookie', { cookie }),
    remarkablePair: (code: string) =>
      post<{ status: string; error?: string }>('/auth/remarkable/pair', { code }),
  },
  library: {
    search: (query: string, format: string) =>
      post<{ status: string; results: BookResult[]; error?: string }>('/library/search', { query, format }),
    send: (book: BookResult) =>
      post<{ status: string; title?: string }>('/library/send', { book }),
    recent: () => get<BookSendRecord[]>('/library/recent'),
    resetMirror: () =>
      post<{ status: string; mirror: string; ping_ms: number | null }>('/library/reset-mirror', {}),
  },
};
