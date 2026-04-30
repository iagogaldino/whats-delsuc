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
  createdAt: string;
  updatedAt: string;
};

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
      ...Object.fromEntries(getAuthHeaders().entries())
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
      ...Object.fromEntries(getAuthHeaders().entries())
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
      ...Object.fromEntries(getAuthHeaders().entries())
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
      ...Object.fromEntries(getAuthHeaders().entries())
    },
    body: JSON.stringify({ systemPrompt })
  });
}

export async function sendBulk(instanceId: string, numbers: string[], message: string): Promise<void> {
  await fetch(`${API_BASE_URL}/bulk/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(getAuthHeaders().entries())
    },
    body: JSON.stringify({ instanceId, numbers, message })
  });
}
