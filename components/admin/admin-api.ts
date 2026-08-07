import { getUiPreviewData, isUiPreviewActive, uiPreviewWriteError } from "@/lib/preview/ui-preview";

export type UserRole = "LEARNER" | "SENIOR" | "COUNSELOR" | "ADMIN";
export type AccountStatus = "ACTIVE" | "ARCHIVED";
export type SubmissionStatus = "NOT_STARTED" | "DRAFT" | "SUBMITTED";

export interface AdminIdentity {
  id?: string;
  userId?: string;
  accountCode: string;
  displayName: string;
  email?: string | null;
  role: "ADMIN";
  protectedSystemAdmin?: boolean;
  isSystemInitialAdmin?: boolean;
}

export interface EventSettings {
  version: number;
  day1Open: boolean;
  day3Open: boolean;
  authoringEnabled: boolean;
  allowEditing: boolean;
  showName: boolean;
  fullProfileVisible: boolean;
  seniorCanBrowseAll: boolean;
}

export interface CompletionMetric {
  submitted: number;
  eligible: number;
  percentage: number;
}

export interface DashboardData {
  phase: string;
  lastSyncedAt: string | null;
  provisionedAccountCount: number;
  completion: { day1: CompletionMetric; day3: CompletionMetric };
  settings: EventSettings;
}

export interface AdminAccount {
  id: string;
  accountCode: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  groupId: string | null;
  groupName: string | null;
  status: AccountStatus;
  day1Status: SubmissionStatus;
  day3Status: SubmissionStatus;
  lastLoginAt: string | null;
  version: number;
  anonymousId?: string | null;
  oidcBound?: boolean;
  externalSubject?: string | null;
  protectedSystemAdmin?: boolean;
  isSystemInitialAdmin?: boolean;
}

export interface AccountPage {
  items: AdminAccount[];
  nextCursor: string | null;
  groups: Array<{ id: string; name: string; memberCount: number }>;
}

export interface Credential {
  displayName: string;
  accountCode: string;
  initialPassword: string;
}

export interface ImportResult {
  credentials: Credential[];
  createdCount: number;
}

export interface BulkResultItem {
  accountId: string;
  ok: boolean;
  message?: string;
}

export interface BulkResult {
  succeeded: number;
  failed: number;
  results: BulkResultItem[];
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorLabel: string;
  action: string;
  targetType: string;
  targetLabel: string;
  summary: string;
  requestId: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
  actionOptions?: string[];
}

interface ApiFailure {
  error?: { code?: string; message?: string; details?: Record<string, unknown> } | string;
  requestId?: string;
}

export class AdminApiError extends Error {
  status: number;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiFailure) {
    const error = body.error;
    const message = typeof error === "string" ? error : error?.message || `请求失败（HTTP ${status}）`;
    super(`${message}${body.requestId ? ` · ${body.requestId.slice(-8)}` : ""}`);
    this.name = "AdminApiError";
    this.status = status;
    this.code = typeof error === "object" && error?.code ? error.code : "UNKNOWN_ERROR";
    this.requestId = body.requestId;
    this.details = typeof error === "object" ? error?.details : undefined;
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (isUiPreviewActive()) {
    if (init?.method && init.method !== "GET") throw new AdminApiError(403, { error: { code: "PREVIEW_READ_ONLY", message: uiPreviewWriteError().message } });
    const preview = getUiPreviewData(path);
    if (preview !== undefined) return preview as T;
  }
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Idempotency-Key")) {
    try {
      const parsed = JSON.parse(String(init.body)) as { idempotencyKey?: unknown };
      if (typeof parsed.idempotencyKey === "string" && parsed.idempotencyKey) {
        headers.set("Idempotency-Key", parsed.idempotencyKey);
      }
    } catch {
      // Non-JSON bodies do not carry Admin write idempotency metadata.
    }
  }
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = (await response.json().catch(() => ({}))) as ApiFailure & { data?: T };
  if (!response.ok) throw new AdminApiError(response.status, body);
  return (body.data ?? body) as T;
}

export function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(`/api/v1/admin${path}`, init);
}

export function authApi<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequest<T>(`/api/v1/auth${path}`, init);
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isProtectedInitialAdmin(account: Pick<AdminAccount, "displayName" | "email" | "protectedSystemAdmin" | "isSystemInitialAdmin">): boolean {
  return Boolean(
    account.protectedSystemAdmin ||
    account.isSystemInitialAdmin ||
      (account.displayName === "SophiaXu" && account.email?.toLowerCase() === "sophiaxu@moonshotacademy.cn"),
  );
}
