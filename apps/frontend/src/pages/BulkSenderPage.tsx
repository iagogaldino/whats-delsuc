import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { SectionCard } from "../components/SectionCard";
import {
  cancelBulkSchedule,
  createBulkSchedule,
  getBulkJob,
  listBulkJobs,
  listBulkSchedules,
  listMessageTemplates,
  getTemplateMediaBlob,
  sendBulk,
  updateBulkSchedule,
  type BulkJob,
  type BulkJobSummary,
  type MessageTemplate
} from "../services/api";

type BulkSenderPageProps = {
  instanceId?: string;
};

function formatDateTimeBr(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function toDateInputValue(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function parseDateAndTimeInput(dateInput: string, timeInput: string): Date | null {
  const dateMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeInput.match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) {
    return null;
  }
  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const [, hoursRaw, minutesRaw] = timeMatch;
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) {
    return null;
  }
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hours ||
    parsed.getMinutes() !== minutes
  ) {
    return null;
  }
  return parsed;
}

export function BulkSenderPage({ instanceId }: BulkSenderPageProps) {
  const [numbersInput, setNumbersInput] = useState("");
  const [messageInput, setMessageInput] = useState("Ola! Temos uma oferta especial para voce hoje.");
  const [captionInput, setCaptionInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [bulkJob, setBulkJob] = useState<BulkJob | null>(null);
  const [jobHistory, setJobHistory] = useState<BulkJobSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [expandedJobDetail, setExpandedJobDetail] = useState<BulkJob | null>(null);
  const [expandedJobLoading, setExpandedJobLoading] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [sendMode, setSendMode] = useState<"now" | "schedule">("now");
  const [scheduledDateInput, setScheduledDateInput] = useState("");
  const [scheduledTimeInput, setScheduledTimeInput] = useState("");
  const [scheduleHistory, setScheduleHistory] = useState<BulkJobSummary[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingScheduleDateInput, setEditingScheduleDateInput] = useState("");
  const [editingScheduleTimeInput, setEditingScheduleTimeInput] = useState("");
  const now = new Date();
  const minDateInput = toDateInputValue(now);
  const minTimeInputForToday = toTimeInputValue(now);

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

  const loadSchedules = useCallback(async () => {
    setScheduleLoading(true);
    try {
      const items = await listBulkSchedules({ limit: 50 });
      setScheduleHistory(items);
    } catch {
      setScheduleHistory([]);
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    void loadJobHistory();
  }, [loadJobHistory]);

  useEffect(() => {
    void listMessageTemplates()
      .then((items) => setTemplates(items))
      .catch(() => {
        setTemplates([]);
      });
  }, []);

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

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      setSelectedImagePreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    setSelectedImagePreviewUrl((previous) => {
      if (previous) {
        URL.revokeObjectURL(previous);
      }
      return nextUrl;
    });

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [selectedFile]);

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
    if (!selectedFile && messageInput.trim().length === 0) {
      setFeedbackMessage("Informe uma mensagem para envio de texto.");
      return;
    }
    if (selectedFile && selectedFile.size > 16 * 1024 * 1024) {
      setFeedbackMessage("Arquivo acima do limite de 16MB.");
      return;
    }
    if (captionInput.length > 200) {
      setFeedbackMessage("Legenda deve ter no maximo 200 caracteres.");
      return;
    }

    setLoading(true);
    setFeedbackMessage(null);
    try {
      if (sendMode === "schedule") {
        if (!scheduledDateInput || !scheduledTimeInput) {
          setFeedbackMessage("Escolha data e hora para agendar.");
          return;
        }
        const localDate = parseDateAndTimeInput(scheduledDateInput, scheduledTimeInput);
        if (!localDate || localDate.getTime() <= Date.now()) {
          setFeedbackMessage("Informe uma data/hora futura.");
          return;
        }
        const scheduledJob = await createBulkSchedule({
          instanceId,
          numbers,
          message: messageInput,
          caption: captionInput,
          file: selectedFile ?? undefined,
          scheduledAt: localDate.toISOString()
        });
        setBulkJob(scheduledJob);
        setFeedbackMessage("Campanha agendada com sucesso (BRT).");
        void loadSchedules();
      } else {
        const createdJob = await sendBulk({
          instanceId,
          numbers,
          message: messageInput,
          caption: captionInput,
          file: selectedFile ?? undefined
        });
        setBulkJob(createdJob);
        setFeedbackMessage("Disparo iniciado em background. Aguardando processamento...");
        void loadJobHistory();
      }
    } catch (error) {
      setFeedbackMessage(error instanceof Error ? error.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  function formatBrt(value?: string): string {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }

  return (
    <SectionCard title="Disparo em massa" subtitle="Cole uma lista de numeros (um por linha) e envie uma mensagem em massa.">
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
        <div className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Opcional: anexe um arquivo para enviar o mesmo documento a todos (max 16MB).</p>
          <input
            type="file"
            className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200 hover:file:bg-slate-600"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          <input
            type="text"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Legenda opcional do arquivo (ate 200 caracteres)"
            maxLength={200}
            value={captionInput}
            onChange={(event) => setCaptionInput(event.target.value)}
          />
          {selectedFile ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Arquivo: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
              {selectedImagePreviewUrl ? (
                <img
                  src={selectedImagePreviewUrl}
                  alt={`Preview ${selectedFile.name}`}
                  className="max-h-52 rounded-md border border-slate-700 object-contain"
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="radio"
              checked={sendMode === "now"}
              onChange={() => setSendMode("now")}
              name="send-mode"
            />
            Enviar agora
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="radio"
              checked={sendMode === "schedule"}
              onChange={() => setSendMode("schedule")}
              name="send-mode"
            />
            Agendar
          </label>
          {sendMode === "schedule" ? (
            <>
              <input
                type="date"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                min={minDateInput}
                value={scheduledDateInput}
                onChange={(event) => setScheduledDateInput(event.target.value)}
              />
              <input
                type="time"
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                step={60}
                min={scheduledDateInput === minDateInput ? minTimeInputForToday : undefined}
                value={scheduledTimeInput}
                onChange={(event) => setScheduledTimeInput(event.target.value)}
              />
              {scheduledDateInput && scheduledTimeInput ? (
                <span className="text-xs text-slate-400">
                  Selecionado:{" "}
                  {formatDateTimeBr(
                    parseDateAndTimeInput(scheduledDateInput, scheduledTimeInput) ?? new Date()
                  )}
                </span>
              ) : null}
            </>
          ) : null}
          <select
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
          >
            <option value="">Selecionar template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
            disabled={!selectedTemplateId}
            onClick={() => {
              const selected = templates.find((item) => item.id === selectedTemplateId);
              if (selected) {
                setMessageInput(selected.content);
              }
              if (!selected) {
                return;
              }
              if (!selected.media) {
                setSelectedFile(null);
                setCaptionInput("");
                return;
              }
              void (async () => {
                try {
                  const blob = await getTemplateMediaBlob(selected.id);
                  const file = new File([blob], selected.media?.fileName ?? "template-file", {
                    type: selected.media?.mimeType || blob.type || "application/octet-stream"
                  });
                  setSelectedFile(file);
                } catch (error) {
                  setFeedbackMessage(
                    error instanceof Error ? error.message : "Nao foi possivel carregar o arquivo do template."
                  );
                }
              })();
            }}
          >
            Aplicar template
          </button>
        </div>
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
                : sendMode === "schedule"
                  ? "Agendar campanha"
                  : "Start Campaign"}
        </button>
      </form>
      {feedbackMessage ? <p className="mt-4 text-sm text-slate-300">{feedbackMessage}</p> : null}
      {bulkJob ? (
        <div className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
          <div className="space-y-1">
            <p>Status: {bulkJob.status}</p>
            <p>Tipo: {bulkJob.deliveryType === "MEDIA" ? "Arquivo" : "Texto"}</p>
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
          {bulkJob.deliveryType === "MEDIA" ? (
            <div className="space-y-1">
              <p>Arquivo: {bulkJob.mediaFileName ?? "arquivo"}</p>
              <p>Legenda: {bulkJob.mediaCaption && bulkJob.mediaCaption.length > 0 ? bulkJob.mediaCaption : "-"}</p>
            </div>
          ) : (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">Texto enviado</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-slate-700/80 bg-slate-950/50 p-2 text-xs text-slate-300">
                {bulkJob.message}
              </pre>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-10 border-t border-slate-700 pt-6">
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-100">Agendamentos (BRT)</h3>
            <button
              type="button"
              className="rounded-md border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void loadSchedules()}
              disabled={scheduleLoading}
            >
              {scheduleLoading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
          {scheduleHistory.length === 0 && !scheduleLoading ? (
            <p className="text-sm text-slate-500">Nenhum agendamento encontrado.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {scheduleHistory.map((row) => {
                const canManage = row.scheduleStatus === "SCHEDULED";
                return (
                  <li key={`schedule-${row.id}`} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-slate-200">
                        {row.scheduleStatus ?? "N/A"} · {formatBrt(row.scheduledAt)}
                      </p>
                      {canManage ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                            onClick={() => {
                              setEditingScheduleId(row.id);
                              const sourceDate = row.scheduledAt ? new Date(row.scheduledAt) : new Date();
                              setEditingScheduleDateInput(toDateInputValue(sourceDate));
                              setEditingScheduleTimeInput(toTimeInputValue(sourceDate));
                            }}
                          >
                            Editar horario
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-rose-600 px-2 py-1 text-xs text-rose-300 hover:bg-rose-900/30"
                            onClick={() => {
                              void cancelBulkSchedule(row.id)
                                .then(() => {
                                  setFeedbackMessage("Agendamento cancelado.");
                                  void loadSchedules();
                                })
                                .catch((error) =>
                                  setFeedbackMessage(error instanceof Error ? error.message : "Erro ao cancelar.")
                                );
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </div>
                    {editingScheduleId === row.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs"
                          min={minDateInput}
                          value={editingScheduleDateInput}
                          onChange={(event) => setEditingScheduleDateInput(event.target.value)}
                        />
                        <input
                          type="time"
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs"
                          step={60}
                          min={editingScheduleDateInput === minDateInput ? minTimeInputForToday : undefined}
                          value={editingScheduleTimeInput}
                          onChange={(event) => setEditingScheduleTimeInput(event.target.value)}
                        />
                        <button
                          type="button"
                          className="rounded-md border border-emerald-600 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
                          onClick={() => {
                            const nextDate = parseDateAndTimeInput(editingScheduleDateInput, editingScheduleTimeInput);
                            if (!nextDate || nextDate.getTime() <= Date.now()) {
                              setFeedbackMessage("Informe uma data/hora futura.");
                              return;
                            }
                            void updateBulkSchedule(row.id, nextDate.toISOString())
                              .then(() => {
                                setFeedbackMessage("Agendamento atualizado.");
                                setEditingScheduleId(null);
                                setEditingScheduleDateInput("");
                                setEditingScheduleTimeInput("");
                                void loadSchedules();
                              })
                              .catch((error) =>
                                setFeedbackMessage(error instanceof Error ? error.message : "Erro ao atualizar.")
                              );
                          }}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                          onClick={() => {
                            setEditingScheduleId(null);
                            setEditingScheduleDateInput("");
                            setEditingScheduleTimeInput("");
                          }}
                        >
                          Fechar
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
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
          <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
            {jobHistory.map((row) => (
              <li key={row.id} className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString()}</p>
                    <p className="text-slate-200">
                      <span className="text-emerald-400/90">{row.status}</span> · {row.sentCount} enviados ·{" "}
                      {row.failedCount} falhas · {row.total} contatos
                    </p>
                    {row.deliveryType === "MEDIA" ? (
                      <div className="mt-2 space-y-1 text-xs text-slate-300">
                        <p className="text-slate-400">Envio com arquivo</p>
                        <p>Arquivo: {row.mediaFileName ?? "arquivo"}</p>
                        <p>Legenda: {row.mediaCaption && row.mediaCaption.length > 0 ? row.mediaCaption : "-"}</p>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium text-slate-400">Mensagem enviada</p>
                        <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded border border-slate-700/60 bg-slate-950/60 p-2 text-xs text-slate-300">
                          {row.message}
                        </pre>
                      </div>
                    )}
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
