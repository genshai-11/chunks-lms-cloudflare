export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; [key: string]: unknown };

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint}`;
    const token = localStorage.getItem('chunks_auth_token');
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const json = (await res.json()) as ApiResponse<T>;
    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export const apiClient = {
  // Auth
  login: (identifier: string) =>
    request<{
      token: string;
      user: {
        id: string;
        displayName: string;
        email: string | null;
        username: string | null;
        roles: string[];
      };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    }),

  // Workspace
  getWorkspaceSnapshot: (organizationId: string, role?: string, userId?: string) => {
    const query = new URLSearchParams({ organizationId });
    return request<{
      organizationId: string;
      revision: number;
      courses: unknown[];
      classes: unknown[];
      enrollments: unknown[];
      users: unknown[];
      learningSessions: unknown[];
      scheduledSessions: unknown[];
    }>(`/api/workspace/snapshot?${query.toString()}`, {
      headers: {
        ...(role ? { 'X-User-Role': role } : {}),
        ...(userId ? { 'X-User-Id': userId } : {}),
      },
    });
  },

  syncWorkspaceAtomic: (payload: {
    organizationId: string;
    expectedRevision?: number;
    roster?: unknown;
    scheduling?: unknown;
  }) =>
    request<{ newRevision: number }>('/api/workspace/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Tests & Standalone runs
  getStandaloneTestRunBundle: (runId?: string, assignmentId?: string) => {
    const query = new URLSearchParams();
    if (runId) query.set('runId', runId);
    if (assignmentId) query.set('assignmentId', assignmentId);
    return request<unknown>(`/api/standalone-tests/bundle?${query.toString()}`);
  },

  recordProvisionalResult: (payload: {
    attemptId: string;
    resultColor: string;
    probeCount: number;
    enteredProbeFlow: boolean;
  }) =>
    request<{ ok: boolean }>('/api/standalone-tests/provisional-result', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Guest features
  createGuestToken: (payload: {
    assignmentId: string;
    learnerId: string;
    createdByUserId: string;
    guestName?: string;
    expiryHours?: number;
  }) =>
    request<{ token: string; expiresAt: string; evalUrl: string }>(
      '/api/guest/create-token',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    ),

  verifyGuestToken: (token: string) =>
    request<{
      valid: boolean;
      token: string;
      guestName: string | null;
      learner: { id: string; displayName: string };
      assignment: unknown;
      status: string;
    }>(`/api/guest/verify/${encodeURIComponent(token)}`),

  submitGuestEvaluation: (
    token: string,
    payload: { guestAssessorName: string; runId?: string },
  ) =>
    request<{ message: string }>(`/api/guest/submit/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getGuestSandboxSampleTest: () =>
    request<{
      package: unknown;
      sections: unknown[];
      items: unknown[];
      mockLearner: { id: string; displayName: string };
    }>('/api/guest/sandbox/sample-test'),
};
