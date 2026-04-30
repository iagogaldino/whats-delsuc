import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { SectionCard } from "../components/SectionCard";
import { createInstance, listInstances, startInstance } from "../services/api";
import type { PublicInstance } from "../services/api";

const QR_REFRESH_SECONDS = 25;

function toQrImageSrc(qrCode: string): string {
  if (qrCode.startsWith("data:image")) {
    return qrCode;
  }

  return `data:image/png;base64,${qrCode}`;
}

async function toDisplayQrImageSrc(qrCode: string): Promise<string> {
  if (qrCode.startsWith("data:image")) {
    return qrCode;
  }

  // Pairing payloads can come as raw QR text instead of PNG/base64 bytes.
  if (qrCode.includes(",")) {
    return QRCode.toDataURL(qrCode, { errorCorrectionLevel: "M", margin: 1, width: 320 });
  }

  return toQrImageSrc(qrCode);
}

type DashboardPageProps = {
  onOpenInstance: (instance: PublicInstance) => void;
};

export function DashboardPage({ onOpenInstance }: DashboardPageProps) {
  const [instances, setInstances] = useState<PublicInstance[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [qrByInstanceId, setQrByInstanceId] = useState<Record<string, string>>({});
  const [qrCountdownByInstanceId, setQrCountdownByInstanceId] = useState<Record<string, number>>({});
  const [pairingMessages, setPairingMessages] = useState<Record<string, string | null>>({});
  const [connectingInstanceId, setConnectingInstanceId] = useState<string | null>(null);
  const [autoRefreshingInstanceId, setAutoRefreshingInstanceId] = useState<string | null>(null);
  const [activeQrInstanceId, setActiveQrInstanceId] = useState<string | null>(null);

  const loadInstances = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await listInstances();
      setInstances(data);
    } catch (error) {
      setListError(error instanceof Error ? error.message : "Erro ao carregar instancias.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInstances();
  }, [loadInstances]);

  useEffect(() => {
    setQrByInstanceId((previous) => {
      const connectedIds = new Set(
        instances.filter((instance) => instance.status === "CONNECTED").map((instance) => instance.instanceId)
      );
      if (connectedIds.size === 0) {
        return previous;
      }

      const next = { ...previous };
      let changed = false;
      for (const instanceId of connectedIds) {
        if (next[instanceId]) {
          delete next[instanceId];
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [instances]);

  const refreshQrForInstance = useCallback(
    async (instanceId: string, mode: "manual" | "auto") => {
      if (mode === "manual") {
        setConnectingInstanceId(instanceId);
      } else {
        setAutoRefreshingInstanceId(instanceId);
      }

      setPairingMessages((previous) => ({ ...previous, [instanceId]: null }));
      try {
        const result = await startInstance(instanceId);
        if (result.connected) {
          setQrByInstanceId((previous) => {
            const next = { ...previous };
            delete next[instanceId];
            return next;
          });
          setActiveQrInstanceId((current) => (current === instanceId ? null : current));
          setQrCountdownByInstanceId((previous) => ({ ...previous, [instanceId]: QR_REFRESH_SECONDS }));
          setInstances((previous) =>
            previous.map((item) =>
              item.instanceId === instanceId ? { ...item, status: "CONNECTED" } : item
            )
          );
          setPairingMessages((previous) => ({
            ...previous,
            [instanceId]: "Instancia conectada com sucesso."
          }));
          return;
        }

        if (!result.qrCode) {
          throw new Error("QR Code nao retornado pela API.");
        }

        const qrImageSrc = await toDisplayQrImageSrc(result.qrCode);
        setQrByInstanceId((previous) => ({ ...previous, [instanceId]: qrImageSrc }));
        setQrCountdownByInstanceId((previous) => ({ ...previous, [instanceId]: QR_REFRESH_SECONDS }));
        setActiveQrInstanceId(instanceId);
        setInstances((previous) =>
          previous.map((item) =>
            item.instanceId === instanceId ? { ...item, status: "DISCONNECTED" } : item
          )
        );
        setPairingMessages((previous) => ({
          ...previous,
          [instanceId]: "Escaneie o QR Code abaixo com o WhatsApp no celular."
        }));
      } catch (error) {
        setPairingMessages((previous) => ({
          ...previous,
          [instanceId]: error instanceof Error ? error.message : "Erro ao obter QR Code."
        }));
      } finally {
        if (mode === "manual") {
          setConnectingInstanceId(null);
        } else {
          setAutoRefreshingInstanceId(null);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!activeQrInstanceId) {
      return;
    }

    const currentInstance = instances.find((item) => item.instanceId === activeQrInstanceId);
    if (currentInstance?.status === "CONNECTED") {
      setPairingMessages((previous) => ({
        ...previous,
        [activeQrInstanceId]: "Instancia conectada com sucesso."
      }));
      setActiveQrInstanceId(null);
      return;
    }

    const timer = window.setInterval(() => {
      setQrCountdownByInstanceId((previous) => {
        const currentSeconds = previous[activeQrInstanceId] ?? QR_REFRESH_SECONDS;
        if (currentSeconds <= 1) {
          void refreshQrForInstance(activeQrInstanceId, "auto");
          return { ...previous, [activeQrInstanceId]: QR_REFRESH_SECONDS };
        }

        return { ...previous, [activeQrInstanceId]: currentSeconds - 1 };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeQrInstanceId, instances, refreshQrForInstance]);

  useEffect(() => {
    if (!activeQrInstanceId) {
      return;
    }

    const interval = window.setInterval(() => {
      void listInstances()
        .then((data) => setInstances(data))
        .catch(() => {
          // silent background refresh
        });
    }, 15000);

    return () => window.clearInterval(interval);
  }, [activeQrInstanceId]);

  return (
    <SectionCard
      title="Dashboard de Instancias"
      subtitle="Crie uma instancia no WhatsApp Connect com um clique e conecte escaneando o QR Code quando estiver pronto."
    >
      <div className="space-y-4">
        <button
          type="button"
          className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          disabled={createLoading || listLoading}
          onClick={async () => {
            setCreateLoading(true);
            setCreateMessage(null);
            try {
              const created = await createInstance();
              setInstances((prev) =>
                prev.some((item) => item.instanceId === created.instanceId) ? prev : [created, ...prev]
              );
              setCreateMessage("Instancia criada com sucesso.");
            } catch (error) {
              setCreateMessage(error instanceof Error ? error.message : "Erro ao criar instancia.");
            } finally {
              setCreateLoading(false);
            }
          }}
        >
          {createLoading ? "Criando..." : "Criar instancia"}
        </button>

        {createMessage ? <p className="text-sm text-slate-300">{createMessage}</p> : null}

        {listLoading ? (
          <p className="text-sm text-slate-400">Carregando instancias...</p>
        ) : null}

        {listError ? (
          <p className="text-sm text-red-400">{listError}</p>
        ) : null}

        {!listLoading && !listError && instances.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma instancia ainda. Clique em Criar instancia.</p>
        ) : null}

        <div className="flex flex-col gap-3">
          {instances.map((instance) => (
            <div
              key={instance.id}
              role={instance.status === "CONNECTED" ? "button" : undefined}
              tabIndex={instance.status === "CONNECTED" ? 0 : -1}
              onClick={() => {
                if (instance.status === "CONNECTED") {
                  onOpenInstance(instance);
                }
              }}
              onKeyDown={(event) => {
                if (instance.status === "CONNECTED" && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onOpenInstance(instance);
                }
              }}
              className={`rounded-lg border p-4 shadow-inner sm:p-5 ${
                instance.status === "CONNECTED"
                  ? "cursor-pointer border-emerald-700 bg-emerald-900/20 transition hover:border-emerald-500"
                  : "border-slate-700 bg-slate-950/60"
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-white">
                    {instance.displayName || "Instancia sem nome"}
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                    {instance.status}
                  </p>
                </div>
                {instance.status !== "CONNECTED" ? (
                  <button
                    type="button"
                    className="mt-3 shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-400 disabled:opacity-50 sm:mt-0"
                    disabled={connectingInstanceId === instance.instanceId}
                    onClick={() => void refreshQrForInstance(instance.instanceId, "manual")}
                  >
                    {connectingInstanceId === instance.instanceId ? "Gerando QR..." : "Conectar com o WhatsApp"}
                  </button>
                ) : null}
              </div>

              {pairingMessages[instance.instanceId] ? (
                <p className="mt-3 text-sm text-slate-300">{pairingMessages[instance.instanceId]}</p>
              ) : null}

              {instance.status !== "CONNECTED" && qrByInstanceId[instance.instanceId] ? (
                <div className="mt-4 rounded-lg border border-slate-700 bg-white p-4">
                  <p className="mb-3 text-center text-sm font-medium text-slate-700">QR Code</p>
                  <img
                    src={toQrImageSrc(qrByInstanceId[instance.instanceId])}
                    alt="QR Code WhatsApp"
                    className="mx-auto h-60 w-60"
                  />
                  <p className="mt-3 text-center text-xs text-slate-500">
                    {autoRefreshingInstanceId === instance.instanceId
                      ? "Atualizando QR automaticamente..."
                      : `Atualiza em ${qrCountdownByInstanceId[instance.instanceId] ?? QR_REFRESH_SECONDS}s`}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}
