import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import {
  getTemplateMediaObjectUrl,
  listMcpServersCatalog,
  listMessageTemplates,
  scanInstanceMcpTools,
  updateInstanceAutoReply
} from "../services/api";
import type { MessageTemplate, McpScanServerResult, McpServerMeta, PublicInstance } from "../services/api";

type PromptEditorPageProps = {
  instanceId?: string;
  instance?: PublicInstance;
  onInstanceUpdated?: (instance: PublicInstance) => void;
};

export function PromptEditorPage({ instanceId: fixedInstanceId, instance, onInstanceUpdated }: PromptEditorPageProps) {
  const [instanceId] = useState(fixedInstanceId ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    instance?.systemPrompt ?? "Voce e um atendente virtual de pizzaria, educado e objetivo."
  );
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(instance?.autoReplyEnabled ?? false);
  const [autoReplyMode, setAutoReplyMode] = useState<"fixed" | "ai">(instance?.autoReplyMode ?? "ai");
  const [fixedReplyMessage, setFixedReplyMessage] = useState(instance?.fixedReplyMessage ?? "");
  const [fixedReplyTemplateId, setFixedReplyTemplateId] = useState(instance?.fixedReplyTemplateId ?? "");
  const [autoReplyAllowedNumbersInput, setAutoReplyAllowedNumbersInput] = useState(
    (instance?.autoReplyAllowedNumbers ?? []).join("\n")
  );
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateImagePreviewUrl, setTemplateImagePreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [mcpCatalog, setMcpCatalog] = useState<McpServerMeta[]>([]);
  const [aiMcpEnabled, setAiMcpEnabled] = useState(instance?.aiMcpEnabled ?? false);
  const [aiMcpAllowedServerIds, setAiMcpAllowedServerIds] = useState<string[]>(
    instance?.aiMcpAllowedServerIds ?? []
  );
  const [aiMcpAllowedToolKeys, setAiMcpAllowedToolKeys] = useState<string[]>(
    instance?.aiMcpAllowedToolKeys ?? []
  );
  const [mcpScanResult, setMcpScanResult] = useState<McpScanServerResult[] | null>(null);
  const [mcpScanLoading, setMcpScanLoading] = useState(false);
  const [mcpScanMessage, setMcpScanMessage] = useState<string | null>(null);
  const [aiMcpMaxSteps, setAiMcpMaxSteps] = useState(instance?.aiMcpMaxSteps ?? 4);
  const { loading, message, withSubmit } = useSubmitState();

  function allPrefixedKeysFromScan(servers: McpScanServerResult[]): string[] {
    return servers.flatMap((s) => s.tools.map((t) => t.prefixedKey));
  }

  function isMcpToolChecked(prefixedKey: string): boolean {
    if (aiMcpAllowedToolKeys.length === 0) {
      return true;
    }
    return aiMcpAllowedToolKeys.includes(prefixedKey);
  }

  function setToolKeyChecked(prefixedKey: string, checked: boolean): void {
    const allKeys = mcpScanResult ? allPrefixedKeysFromScan(mcpScanResult) : [];
    setAiMcpAllowedToolKeys((prev) => {
      if (prev.length === 0 && !checked) {
        return allKeys.filter((k) => k !== prefixedKey);
      }
      if (checked) {
        if (prev.includes(prefixedKey)) {
          return prev;
        }
        const next = [...prev, prefixedKey];
        if (allKeys.length > 0 && next.length === allKeys.length) {
          return [];
        }
        return next;
      }
      return prev.filter((k) => k !== prefixedKey);
    });
  }

  function selectAllToolsForServer(server: McpScanServerResult): void {
    const serverKeys = server.tools.map((t) => t.prefixedKey);
    const allKeys = mcpScanResult ? allPrefixedKeysFromScan(mcpScanResult) : [];
    setAiMcpAllowedToolKeys((prev) => {
      if (prev.length === 0) {
        return [];
      }
      const merged = new Set([...prev, ...serverKeys]);
      const next = [...merged];
      if (allKeys.length > 0 && next.length === allKeys.length) {
        return [];
      }
      return next;
    });
  }

  function deselectAllToolsForServer(server: McpScanServerResult): void {
    const serverKeys = new Set(server.tools.map((t) => t.prefixedKey));
    const allKeys = mcpScanResult ? allPrefixedKeysFromScan(mcpScanResult) : [];
    setAiMcpAllowedToolKeys((prev) => {
      const base = prev.length === 0 ? allKeys : prev;
      return base.filter((k) => !serverKeys.has(k));
    });
  }

  useEffect(() => {
    void listMessageTemplates()
      .then((items) => setTemplates(items))
      .catch(() => {
        setTemplates([]);
      });
  }, []);

  useEffect(() => {
    void listMcpServersCatalog()
      .then((items) => setMcpCatalog(items))
      .catch(() => {
        setMcpCatalog([]);
      });
  }, []);

  useEffect(() => {
    if (!instance) {
      return;
    }
    setSystemPrompt(instance.systemPrompt);
    setAutoReplyEnabled(instance.autoReplyEnabled);
    setAutoReplyMode(instance.autoReplyMode);
    setFixedReplyMessage(instance.fixedReplyMessage);
    setFixedReplyTemplateId(instance.fixedReplyTemplateId ?? "");
    setAutoReplyAllowedNumbersInput((instance.autoReplyAllowedNumbers ?? []).join("\n"));
    setAiMcpEnabled(instance.aiMcpEnabled);
    setAiMcpAllowedServerIds([...instance.aiMcpAllowedServerIds]);
    setAiMcpAllowedToolKeys([...instance.aiMcpAllowedToolKeys]);
    setAiMcpMaxSteps(instance.aiMcpMaxSteps);
  }, [instance]);

  useEffect(() => {
    const selected = templates.find((item) => item.id === fixedReplyTemplateId);
    if (!selected?.media?.mimeType.startsWith("image/")) {
      setTemplateImagePreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
      return;
    }

    let disposed = false;
    void getTemplateMediaObjectUrl(selected.id)
      .then((objectUrl) => {
        if (disposed) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setTemplateImagePreviewUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return objectUrl;
        });
      })
      .catch(() => {
        setTemplateImagePreviewUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return null;
        });
      });

    return () => {
      disposed = true;
    };
  }, [fixedReplyTemplateId, templates]);

  useEffect(() => {
    return () => {
      if (templateImagePreviewUrl) {
        URL.revokeObjectURL(templateImagePreviewUrl);
      }
    };
  }, [templateImagePreviewUrl]);

  return (
    <SectionCard
      title="Auto resposta"
      subtitle="Defina como as respostas automáticas devem funcionar para esta instância."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const targetInstanceId = fixedInstanceId ?? instanceId;
          if (!targetInstanceId) {
            return;
          }
          if (autoReplyMode === "fixed" && fixedReplyMessage.trim().length === 0) {
            setValidationError("Informe a mensagem fixa para esse modo.");
            return;
          }
          if (autoReplyMode === "ai" && systemPrompt.trim().length === 0) {
            setValidationError("Informe o prompt da IA para esse modo.");
            return;
          }
          if (autoReplyMode === "ai" && aiMcpEnabled && mcpCatalog.length > 0 && aiMcpAllowedServerIds.length === 0) {
            setValidationError("Selecione ao menos uma integração permitida.");
            return;
          }
          setValidationError(null);
          const autoReplyAllowedNumbers = autoReplyAllowedNumbersInput
            .split(/[\n,;]+/)
            .map((item) => item.trim())
            .filter(Boolean);
          void withSubmit(
            () =>
              updateInstanceAutoReply(targetInstanceId, {
                autoReplyEnabled,
                autoReplyMode,
                fixedReplyMessage,
                fixedReplyTemplateId: fixedReplyTemplateId || undefined,
                autoReplyAllowedNumbers,
                systemPrompt,
                aiMcpEnabled,
                aiMcpAllowedServerIds,
                aiMcpAllowedToolKeys,
                aiMcpMaxSteps
              }).then((updated) => {
                onInstanceUpdated?.(updated);
              }),
            "Configuracao de auto-resposta atualizada com sucesso."
          );
        }}
      >
        {!fixedInstanceId ? (
          <p className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
            Selecione uma instancia conectada no Dashboard para editar o prompt.
          </p>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={autoReplyEnabled}
            onChange={(event) => setAutoReplyEnabled(event.target.checked)}
          />
          Ativar resposta automatica
        </label>
        <label className="block space-y-1 text-sm text-slate-300">
          <span>Modo de resposta</span>
          <select
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={autoReplyMode}
            onChange={(event) => setAutoReplyMode(event.target.value as "fixed" | "ai")}
          >
            <option value="ai">IA com prompt</option>
            <option value="fixed">Mensagem fixa</option>
          </select>
        </label>
        {autoReplyMode === "ai" ? (
          <p className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-400">
            A chave da IA é única para a sua conta e vale para todas as instâncias. Configure em{" "}
            <span className="font-medium text-slate-300">Chave IA</span> na barra lateral.
          </p>
        ) : null}
        {autoReplyMode === "ai" ? (
          <div className="space-y-2 rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-3">
            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={aiMcpEnabled}
                disabled={mcpCatalog.length === 0 || loading}
                onChange={(event) => setAiMcpEnabled(event.target.checked)}
              />
              Permitir integrações na auto-resposta
            </label>
            {mcpCatalog.length === 0 ? (
              <p className="text-xs text-amber-400">
                Nenhuma integração cadastrada na conta. Configure em{" "}
                <span className="font-medium text-slate-300">Integracoes IA</span> no menu lateral.
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                Escolha quais integrações esta instância pode usar nas respostas automáticas.
              </p>
            )}
            {aiMcpEnabled && mcpCatalog.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-300">Integrações permitidas</p>
                <div className="flex flex-col gap-2">
                  {mcpCatalog.map((server) => (
                    <label key={server.id} className="flex items-center gap-2 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={aiMcpAllowedServerIds.includes(server.id)}
                        disabled={loading}
                        onChange={() => {
                          setAiMcpAllowedServerIds((previous) =>
                            previous.includes(server.id)
                              ? previous.filter((id) => id !== server.id)
                              : [...previous, server.id]
                          );
                        }}
                      />
                      <span>{server.name}</span>
                    </label>
                  ))}
                </div>
                <label className="block space-y-1 text-sm text-slate-300">
                  <span>Nível de uso das integrações (1–10)</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                    value={aiMcpMaxSteps}
                    disabled={loading}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isNaN(next)) {
                        return;
                      }
                      setAiMcpMaxSteps(Math.min(10, Math.max(1, next)));
                    }}
                  />
                </label>
                <div className="space-y-2 border-t border-slate-700/60 pt-3">
                  <p className="text-xs text-slate-400">
                    Se não marcar opções específicas, todas as opções das integrações selecionadas serão usadas.
                  </p>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    disabled={
                      loading ||
                      mcpScanLoading ||
                      !fixedInstanceId ||
                      aiMcpAllowedServerIds.length === 0
                    }
                    onClick={() => {
                      if (!fixedInstanceId || aiMcpAllowedServerIds.length === 0) {
                        return;
                      }
                      setMcpScanLoading(true);
                      setMcpScanMessage(null);
                      void scanInstanceMcpTools(fixedInstanceId, aiMcpAllowedServerIds)
                        .then((result) => {
                          setMcpScanResult(result.servers);
                          setMcpScanMessage(null);
                        })
                        .catch((error: unknown) => {
                          setMcpScanMessage(error instanceof Error ? error.message : "Falha ao carregar opções.");
                        })
                        .finally(() => {
                          setMcpScanLoading(false);
                        });
                    }}
                  >
                    {mcpScanLoading ? "Carregando..." : "Carregar opções"}
                  </button>
                  {mcpScanMessage ? <p className="text-xs text-red-300">{mcpScanMessage}</p> : null}
                  {mcpScanResult && mcpScanResult.length > 0 ? (
                    <div className="space-y-4">
                      {mcpScanResult.map((server) => (
                        <div key={server.id} className="rounded-md border border-slate-700/80 bg-slate-950/50 p-2">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-300">
                              {server.name}
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs text-blue-400 hover:underline"
                                onClick={() => selectAllToolsForServer(server)}
                              >
                                Marcar todas
                              </button>
                              <button
                                type="button"
                                className="text-xs text-slate-400 hover:underline"
                                onClick={() => deselectAllToolsForServer(server)}
                              >
                                Desmarcar todas
                              </button>
                            </div>
                          </div>
                          {server.tools.length === 0 ? (
                            <p className="text-xs text-slate-500">Nenhuma opção disponível.</p>
                          ) : (
                            <ul className="space-y-2">
                              {server.tools.map((tool) => (
                                <li key={tool.prefixedKey}>
                                  <label className="flex cursor-pointer gap-2 text-sm text-slate-300">
                                    <input
                                      type="checkbox"
                                      className="mt-0.5 shrink-0"
                                      checked={isMcpToolChecked(tool.prefixedKey)}
                                      disabled={loading}
                                      onChange={(event) =>
                                        setToolKeyChecked(tool.prefixedKey, event.target.checked)
                                      }
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="font-medium text-slate-200">{tool.name}</span>
                                      {tool.description ? (
                                        <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                          {tool.description}
                                        </span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        <label className="block space-y-1 text-sm text-slate-300">
          <span>Responder automaticamente apenas para estes numeros (opcional)</span>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            placeholder="+5511999999999 (um por linha ou separados por virgula)"
            value={autoReplyAllowedNumbersInput}
            onChange={(event) => setAutoReplyAllowedNumbersInput(event.target.value)}
          />
          <span className="text-xs text-slate-400">
            Se vazio, responde para qualquer numero. Se preenchido, responde apenas para os listados.
          </span>
        </label>
        {autoReplyMode === "ai" ? (
          <textarea
            className="min-h-44 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Descreva o comportamento da IA."
          />
        ) : (
          <div className="space-y-2">
            <label className="block space-y-1 text-sm text-slate-300">
              <span>Template salvo (opcional)</span>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
                value={fixedReplyTemplateId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setFixedReplyTemplateId(nextId);
                  const selected = templates.find((item) => item.id === nextId);
                  if (selected) {
                    setFixedReplyMessage(selected.content);
                  }
                }}
              >
                <option value="">Sem template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </label>
            {templateImagePreviewUrl ? (
              <div className="space-y-1 rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
                <p className="text-xs text-slate-400">Preview da imagem do template</p>
                <img
                  src={templateImagePreviewUrl}
                  alt="Preview da imagem do template"
                  className="max-h-56 rounded-md border border-slate-700 object-contain"
                />
              </div>
            ) : null}
            <textarea
              className="min-h-44 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              value={fixedReplyMessage}
              onChange={(event) => setFixedReplyMessage(event.target.value)}
              placeholder="Mensagem enviada automaticamente ao cliente."
            />
          </div>
        )}
        <button
          type="submit"
          className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-400"
          disabled={loading || !fixedInstanceId}
        >
          {loading ? "Salvando..." : "Salvar configuracao"}
        </button>
      </form>
      {validationError ? <p className="mt-4 text-sm text-red-300">{validationError}</p> : null}
      {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
    </SectionCard>
  );
}
