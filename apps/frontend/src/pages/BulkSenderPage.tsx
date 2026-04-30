import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SectionCard } from "../components/SectionCard";
import { getBulkJob, listBulkJobs, sendBulk, type BulkJob, type BulkJobSummary } from "../services/api";

type BulkSenderPageProps = {
  instanceId?: string;
};

export function BulkSenderPage({ instanceId }: BulkSenderPageProps) {
  const [numbersInput, setNumbersInput] = useState("");
  const [messageInput, setMessageInput] = useState("Ola! Temos uma oferta especial para voce hoje.");
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null);
  const [jobHistory, setJobHistory] = useState<BulkJobSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedJobDetail, setExpandedJobDetail] = useState<BulkJob | null>(null);
  const [expandedJobLoading, setExpandedJobLoading] = useState(false);

  const loadJobHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const items = await listBulkJobs({ limit: 50 });
      setJobHistory(items);
    } catch {
      // silencioso: historico é opcional; erro de rede não bloqueia o formulario
      setJobHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobHistory();
  }, [loadJobHistory]);

  const isJobRunning = bulkJob ? bulkJob.status === "QUEUED" || bulkJob.status === "PROCESSING" : false;

  useEffect(() => {
    if (!bulkJob || !isJobRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      void getBulkJob(bulkJob.id)
        .then((job) => {
          setBulkJob(job);
          if (job.status !== "QUEUED" && job.status !== "PROCESSING") {
            setFeedbackMessage(
              job.failedCount > 0
                ? `Disparo finalizado com falhas (${job.sentCount}/${job.total} enviados).`
                : `Disparo finalizado com sucesso (${job.sentCount}/${job.total} enviados).`
            );
            void loadJobHistory();
          }
        })
        .catch((error) => {
          setFeedbackMessage(error instanceof Error ? error.message : "Erro ao consultar andamento do disparo.");
        });
    }, 1500);

    return () => window.clearInterval(timer);
  }, [bulkJob, isJobRunning, loadJobHistory]);

  const failedItemsPreview = useMemo(
    () => (bulkJob?.items ?? []).filter((item) => item.status === "FAILED").slice(0, 5),
    [bulkJob]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!instanceId) {
      return;
    }

    const numbers = numbersInput
      .split(/[\n,;]+/)
      .map((number) => number.trim())
      .filter(Boolean);

    if (numbers.length === 0) {
      setFeedbackMessage("Informe ao menos um numero valido.");
      return;
    }

    setLoading(true);
    setFeedbackMessage(null);
    try {
      const createdJob = await sendBulk(instanceId, numbers, messageInput);
      setBulkJob(createdJob);
      setFeedbackMessage("Disparo iniciado em background. Aguardando processamento...");
      void loadJobHistory();
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard title="Bulk Sender" subtitle="Cole uma lista de numeros (um por linha) e envie uma mensagem em massa.">
      <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
        {!instanceId ? (
          <p className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
            Selecione uma instancia conectada no Dashboard para usar disparo em massa.
          </p>
        ) : null}
        <textarea
          className="min-h-36 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="+5511999999999"
          value={numbersInput}
          onChange={(event) => setNumbersInput(event.target.value)}
        />
        <textarea
          className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="Mensagem para disparo..."
          value={messageInput}
          onChange={(event) => setMessageInput(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400"
          disabled={loading || !instanceId || isJobRunning}
        >
          {!instanceId
            ? "Selecione uma instancia conectada"
            : loading
              ? "Enviando..."
              : isJobRunning
                ? "Processando campanha..."
                : "Start Campaign"}
        </button>
      </form>
      {feedbackMessage ? <p className="mt-4 text-sm text-slate-300">{feedbackMessage}</p> : null}
      {bulkJob ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
          <div className="space-y-1">
            <p>Status: {bulkJob.status}</p>
            <p>
              Progresso: {bulkJob.sentCount + bulkJob.failedCount}/{bulkJob.total} ({bulkJob.sentCount} enviados,{" "}
              {bulkJob.failedCount} falhas)
            </p>
            {failedItemsPreview.length > 0 ? (
              <p>
                Falhas (amostra):{" "}
                {failedItemsPreview.map((item) => `${item.number}: ${item.error ?? "erro no envio"}`).join(" | ")}
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-slate-400">Texto enviado</p>
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-slate-700/80 bg-slate-950/50 p-2 text-xs text-slate-300">
              {bulkJob.message}
            </pre>
          </div>
        </div>
      ) : null}

      <div className="mt-10 border-t border-slate-700 pt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-100">Historico de disparos</h3>
          <button
            type="button"
            className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void loadJobHistory()}
            disabled={historyLoading}
          >
            {historyLoading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Cada campanha fica gravada no banco com a mensagem e o resultado por destinatario (consultavel abaixo).
        </p>
        {jobHistory.length === 0 && !historyLoading ? (
          <p className="text-sm text-slate-500">Nenhum disparo registrado ainda.</p>
        ) : (
          <ul className="space-y-3">
            {jobHistory.map((row) => (
              <li key={row.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-slate-500">
                      {new Date(row.createdAt).toLocaleString()} ·{" "}
                      <span className="text-slate-400">instancia</span> {row.instanceId}
                    </p>
                    <p className="text-slate-200">
                      Status: <span className="text-emerald-400/90">{row.status}</span> · {row.sentCount} enviados ·{" "}
                      {row.failedCount} falhas · {row.total} contatos
                    </p>
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-medium text-slate-400">Mensagem enviada</p>
                      <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-slate-700/60 bg-slate-950/60 p-2 text-xs text-slate-300">
                        {row.message}
                      </pre>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    onClick={() => {
                      if (expandedJobId === row.id) {
                        setExpandedJobId(null);
                        setExpandedJobDetail(null);
                        return;
                      }
                      setExpandedJobId(row.id);
                      setExpandedJobLoading(true);
                      setExpandedJobDetail(null);
                      void getBulkJob(row.id)
                        .then((detail) => setExpandedJobDetail(detail))
                        .finally(() => setExpandedJobLoading(false));
                    }}
                  >
                    {expandedJobId === row.id ? "Ocultar destinatarios" : "Ver destinatarios"}
                  </button>
                </div>
                {expandedJobId === row.id ? (
                  <div className="mt-3 border-t border-slate-700/80 pt-3">
                    {expandedJobLoading ? (
                      <p className="text-xs text-slate-500">Carregando lista...</p>
                    ) : expandedJobDetail ? (
                      <ul className="max-h-48 space-y-1 overflow-auto text-xs text-slate-400">
                        {expandedJobDetail.items.map((item) => (
                          <li key={`${expandedJobDetail.id}-${item.number}`}>
                            <span className={item.status === "SENT" ? "text-emerald-400" : undefined}>
                              {item.number}
                            </span>{" "}
                            ({item.status}
                            {item.error ? `: ${item.error}` : ""})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-slate-500">Sem detalhes.</p>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
