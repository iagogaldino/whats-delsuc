const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";
const ACCESS_TOKEN_KEY = "whatsdelsuc_access_token";

type AuthResponse = {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type PublicInstance = {
  id: string;
  instanceId: string;
  displayName?: string;
  status: string;
  autoReplyEnabled: boolean;
  autoReplyMode: "fixed" | "ai";
  fixedReplyMessage: string;
  fixedReplyTemplateId?: string;
  autoReplyAllowedNumbers: string[];
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type MessageTemplate = {
  id: string;
  name: string;
  content: string;
  media?: {
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
  placeholders: string[];
  createdAt: string;
  updatedAt: string;
};

export type BulkJobItem = {
  number: string;
  status: "PENDING" | "SENT" | "FAILED";
  error?: string;
  sentAt?: string;
  updatedAt: string;
};

export type BulkJob = {
  id: string;
  instanceId: string;
  message: string;
  deliveryType: "TEXT" | "MEDIA";
  mediaFileName?: string;
  mediaCaption?: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  total: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  scheduledAt?: string;
  timezone?: "BRT";
  cancelledAt?: string;
  scheduleUpdatedAt?: string;
  scheduleStatus?: "SCHEDULED" | "RUNNING" | "EXECUTED" | "CANCELLED";
  items: BulkJobItem[];
};

/** Registro salvo no servidor (histórico); sem lista de destinatários — use `getBulkJob(id)` para detalhe. */
export type BulkJobSummary = Omit<BulkJob, "items">;

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text) as { error?: string };
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {
    // plain text response
  }
  return text || "Request failed.";
}

function getAuthHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

function authHeadersAsObject(): Record<string, string> {
  const headers = getAuthHeaders();
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function logout(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Falha no cadastro.");
  }

  const payload = (await response.json()) as AuthResponse;
  localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
  return payload;
}

export async function login(input: { email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Falha no login.");
  }

  const payload = (await response.json()) as AuthResponse;
  localStorage.setItem(ACCESS_TOKEN_KEY, payload.accessToken);
  return payload;
}

export async function listInstances(): Promise<PublicInstance[]> {
  const response = await fetch(`${API_BASE_URL}/instances`, {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<PublicInstance[]>;
}

export async function createInstance(input?: { name?: string }): Promise<PublicInstance> {
  const response = await fetch(`${API_BASE_URL}/instances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeadersAsObject()
    },
    body: JSON.stringify(input ?? {})
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<PublicInstance>;
}

export async function startInstance(
  instanceId: string
): Promise<{ instanceId: string; qrCode?: string; connected?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/instances/${instanceId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeadersAsObject()
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<{ instanceId: string; qrCode?: string; connected?: boolean }>;
}

export async function updatePrompt(instanceId: string, systemPrompt: string): Promise<void> {
  await fetch(`${API_BASE_URL}/instances/${instanceId}/prompt`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeadersAsObject()
    },
    body: JSON.stringify({ systemPrompt })
  });
}

export async function updateInstanceAutoReply(
  instanceId: string,
  input: {
    autoReplyEnabled: boolean;
    autoReplyMode: "fixed" | "ai";
    fixedReplyMessage?: string;
    fixedReplyTemplateId?: string;
    autoReplyAllowedNumbers?: string[];
    systemPrompt?: string;
  }
): Promise<PublicInstance> {
  const response = await fetch(`${API_BASE_URL}/instances/${instanceId}/auto-reply`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeadersAsObject()
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<PublicInstance>;
}

export async function listMessageTemplates(): Promise<MessageTemplate[]> {
  const response = await fetch(`${API_BASE_URL}/message-templates`, {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<MessageTemplate[]>;
}

export async function createMessageTemplate(input: {
  name: string;
  content: string;
  file?: File;
}): Promise<MessageTemplate> {
  const hasFile = Boolean(input.file);
  const headers = getAuthHeaders();
  let body: BodyInit;
  if (hasFile) {
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("content", input.content);
    formData.append("file", input.file as File);
    body = formData;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input);
  }

  const response = await fetch(`${API_BASE_URL}/message-templates`, {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<MessageTemplate>;
}

export async function updateMessageTemplate(
  templateId: string,
  input: { name: string; content: string; file?: File }
): Promise<MessageTemplate> {
  const hasFile = Boolean(input.file);
  const headers = getAuthHeaders();
  let body: BodyInit;
  if (hasFile) {
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("content", input.content);
    formData.append("file", input.file as File);
    body = formData;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({ name: input.name, content: input.content });
  }

  const response = await fetch(`${API_BASE_URL}/message-templates/${templateId}`, {
    method: "PUT",
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<MessageTemplate>;
}

export function getTemplateMediaUrl(templateId: string): string {
  return `${API_BASE_URL}/message-templates/${templateId}/media`;
}

export async function getTemplateMediaBlob(templateId: string): Promise<Blob> {
  const response = await fetch(getTemplateMediaUrl(templateId), {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.blob();
}

export async function getTemplateMediaObjectUrl(templateId: string): Promise<string> {
  const blob = await getTemplateMediaBlob(templateId);
  return URL.createObjectURL(blob);
}

export async function deleteMessageTemplate(templateId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/message-templates/${templateId}`, {
    method: "DELETE",
    headers: {
      ...authHeadersAsObject()
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function sendBulk(input: {
  instanceId: string;
  numbers: string[];
  message?: string;
  caption?: string;
  file?: File;
}): Promise<BulkJob> {
  const hasFile = Boolean(input.file);
  const headers = getAuthHeaders();
  let body: BodyInit;

  if (hasFile) {
    const formData = new FormData();
    formData.append("instanceId", input.instanceId);
    formData.append("numbers", JSON.stringify(input.numbers));
    if (input.message && input.message.trim().length > 0) {
      formData.append("message", input.message.trim());
    }
    if (input.caption && input.caption.trim().length > 0) {
      formData.append("caption", input.caption.trim());
    }
    formData.append("file", input.file as File);
    body = formData;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({
      instanceId: input.instanceId,
      numbers: input.numbers,
      message: input.message ?? ""
    });
  }

  const response = await fetch(`${API_BASE_URL}/bulk/send`, {
    method: "POST",
    headers,
    body
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<BulkJob>;
}

export async function listBulkJobs(params?: {
  limit?: number;
  instanceId?: string;
}): Promise<BulkJobSummary[]> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  if (params?.instanceId) {
    search.set("instanceId", params.instanceId);
  }
  const query = search.toString();
  const response = await fetch(`${API_BASE_URL}/bulk/jobs${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as { items: BulkJobSummary[] };
  return payload.items;
}

export async function getBulkJob(jobId: string): Promise<BulkJob> {
  const response = await fetch(`${API_BASE_URL}/bulk/jobs/${jobId}`, {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<BulkJob>;
}

export async function createBulkSchedule(input: {
  instanceId: string;
  numbers: string[];
  message?: string;
  caption?: string;
  file?: File;
  scheduledAt: string;
}): Promise<BulkJob> {
  const hasFile = Boolean(input.file);
  const headers = getAuthHeaders();
  let body: BodyInit;

  if (hasFile) {
    const formData = new FormData();
    formData.append("instanceId", input.instanceId);
    formData.append("numbers", JSON.stringify(input.numbers));
    formData.append("scheduledAt", input.scheduledAt);
    if (input.message && input.message.trim().length > 0) {
      formData.append("message", input.message.trim());
    }
    if (input.caption && input.caption.trim().length > 0) {
      formData.append("caption", input.caption.trim());
    }
    formData.append("file", input.file as File);
    body = formData;
  } else {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify({
      instanceId: input.instanceId,
      numbers: input.numbers,
      message: input.message ?? "",
      caption: input.caption ?? "",
      scheduledAt: input.scheduledAt
    });
  }

  const response = await fetch(`${API_BASE_URL}/bulk/schedules`, {
    method: "POST",
    headers,
    body
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<BulkJob>;
}

export async function listBulkSchedules(params?: { limit?: number }): Promise<BulkJobSummary[]> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const query = search.toString();
  const response = await fetch(`${API_BASE_URL}/bulk/schedules${query ? `?${query}` : ""}`, {
    method: "GET",
    headers: {
      ...authHeadersAsObject()
    }
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const payload = (await response.json()) as { items: BulkJobSummary[] };
  return payload.items;
}

export async function updateBulkSchedule(jobId: string, scheduledAt: string): Promise<BulkJob> {
  const response = await fetch(`${API_BASE_URL}/bulk/schedules/${jobId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeadersAsObject()
    },
    body: JSON.stringify({ scheduledAt })
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<BulkJob>;
}

export async function cancelBulkSchedule(jobId: string): Promise<BulkJob> {
  const response = await fetch(`${API_BASE_URL}/bulk/schedules/${jobId}`, {
    method: "DELETE",
    headers: {
      ...authHeadersAsObject()
    }
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<BulkJob>;
}
