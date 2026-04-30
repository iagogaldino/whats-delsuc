import { env } from "../lib/env.js";

type SendTextInput = {
  instanceId: string;
  token: string;
  number: string;
  text: string;
};

type StartInstanceInput = {
  instanceId: string;
  token: string;
};

type CreateInstanceV1Input = {
  name: string;
};

type CreateInstanceV1Result = {
  instanceId: string;
  name?: string;
};

type WhatsAppConnectionStatus = "CONNECTED" | "DISCONNECTED";

type CreateAccessTokenResult = {
  id: string;
  key: string;
};

type AuthSessionInput = {
  email: string;
  password: string;
};

export class WhatsappService {
  private buildAuthHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      ...(env.WHATSAPP_CONNECT_API_KEY ? { "x-api-key": env.WHATSAPP_CONNECT_API_KEY } : {})
    };
  }

  private buildHeaders(token: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...this.buildAuthHeaders(token)
    };
  }

  private extractQrFromPayload(payload: Record<string, unknown>): string | null {
    const qrValue =
      payload.qrCode ??
      payload.qr ??
      payload.base64 ??
      (payload.data as Record<string, unknown> | undefined)?.qrCode ??
      (payload.data as Record<string, unknown> | undefined)?.qr;

    return typeof qrValue === "string" && qrValue.length > 0 ? qrValue : null;
  }

  private extractSaaSInstanceId(payload: Record<string, unknown>): string | null {
    const asId = (value: unknown): string | null => {
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
      if (value && typeof value === "object") {
        const oid = (value as { $oid?: unknown }).$oid;
        if (typeof oid === "string" && oid.length > 0) {
          return oid;
        }
      }
      return null;
    };

    for (const key of ["id", "_id", "instanceId"] as const) {
      const found = asId(payload[key]);
      if (found) {
        return found;
      }
    }

    const data = payload.data as Record<string, unknown> | undefined;
    if (data) {
      for (const key of ["id", "_id", "instanceId"] as const) {
        const found = asId(data[key]);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }

  async sendText(input: SendTextInput): Promise<void> {
    const response = await fetch(`${env.WHATSAPP_CONNECT_BASE_URL}/message/sendText`, {
      method: "POST",
      headers: this.buildHeaders(input.token),
      body: JSON.stringify({
        instanceId: input.instanceId,
        number: input.number,
        text: input.text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp Connect error (${response.status}): ${errorText}`);
    }
  }

  async createInstanceV1(token: string, input: CreateInstanceV1Input): Promise<CreateInstanceV1Result> {
    const response = await fetch(`${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/instances`, {
      method: "POST",
      headers: this.buildHeaders(token),
      body: JSON.stringify({ name: input.name })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp Connect create instance failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const instanceId = this.extractSaaSInstanceId(payload);
    if (!instanceId) {
      throw new Error("WhatsApp Connect create instance response missing id.");
    }

    const nameField = payload.name;
    const name =
      typeof nameField === "string" && nameField.length > 0 ? nameField : undefined;

    return { instanceId, name };
  }

  async startWhatsAppPairingV1(instanceId: string, token: string): Promise<void> {
    const url = `${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/instances/${encodeURIComponent(instanceId)}/whatsapp/pairing/start`;
    const response = await fetch(url, {
      method: "POST",
      headers: this.buildHeaders(token),
      body: JSON.stringify({})
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp pairing start failed (${response.status}): ${errorText}`);
    }
  }

  async getWhatsAppQrV1(instanceId: string, token: string): Promise<string | null> {
    const url = `${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/instances/${encodeURIComponent(instanceId)}/whatsapp/qr`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildAuthHeaders(token)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp QR fetch failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return this.extractQrFromPayload(payload);
  }

  async startInstanceAndGetQrCode(input: StartInstanceInput): Promise<string | null> {
    await this.startWhatsAppPairingV1(input.instanceId, input.token);
    return this.getWhatsAppQrV1(input.instanceId, input.token);
  }

  async getWhatsAppConnectionStatusV1(instanceId: string, token: string): Promise<WhatsAppConnectionStatus> {
    const url = `${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/instances/${encodeURIComponent(instanceId)}/whatsapp/status`;
    const response = await fetch(url, {
      method: "GET",
      headers: this.buildAuthHeaders(token)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp status fetch failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const candidateKeys = new Set([
      "connected",
      "isConnected",
      "status",
      "connection",
      "state",
      "session",
      "phase"
    ]);

    const inferFromValue = (value: unknown): WhatsAppConnectionStatus | null => {
      if (typeof value === "boolean") {
        return value ? "CONNECTED" : "DISCONNECTED";
      }

      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (
          ["connected", "open", "online", "ready", "authenticated", "paired", "active"].includes(
            normalized
          )
        ) {
          return "CONNECTED";
        }
        if (
          ["disconnected", "close", "closed", "offline", "qr", "pairing", "pending", "connecting"].includes(
            normalized
          )
        ) {
          return "DISCONNECTED";
        }
      }

      return null;
    };

    const visit = (node: unknown): WhatsAppConnectionStatus | null => {
      const direct = inferFromValue(node);
      if (direct) {
        return direct;
      }

      if (Array.isArray(node)) {
        for (const item of node) {
          const nested = visit(item);
          if (nested) {
            return nested;
          }
        }
        return null;
      }

      if (!node || typeof node !== "object") {
        return null;
      }

      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (candidateKeys.has(key)) {
          const match = inferFromValue(value);
          if (match) {
            return match;
          }
        }
      }

      for (const value of Object.values(record)) {
        const nested = visit(value);
        if (nested) {
          return nested;
        }
      }

      return null;
    };

    return visit(payload) ?? "DISCONNECTED";
  }

  async createAccessTokenFromSessionJwt(sessionJwt: string, name: string): Promise<CreateAccessTokenResult> {
    const response = await fetch(`${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionJwt}`
      },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WhatsApp token creation failed (${response.status}): ${errorText}`);
    }

    const payload = (await response.json()) as { id?: string; key?: string };
    if (!payload.id || !payload.key) {
      throw new Error("WhatsApp token response is missing id/key.");
    }

    return {
      id: payload.id,
      key: payload.key
    };
  }

  async getSessionJwt(input: AuthSessionInput): Promise<string> {
    const loginResponse = await fetch(`${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    if (loginResponse.ok) {
      const payload = (await loginResponse.json()) as { token?: string };
      if (payload.token) {
        return payload.token;
      }
    }

    const registerResponse = await fetch(`${env.WHATSAPP_CONNECT_BASE_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });

    if (!registerResponse.ok) {
      const loginError = await loginResponse.text();
      const registerError = await registerResponse.text();
      throw new Error(
        `WhatsApp auth failed. Login: (${loginResponse.status}) ${loginError}; Register: (${registerResponse.status}) ${registerError}`
      );
    }

    const registerPayload = (await registerResponse.json()) as { token?: string };
    if (!registerPayload.token) {
      throw new Error("WhatsApp auth response is missing token.");
    }

    return registerPayload.token;
  }
}
