import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import {
  getMcpServersConfig,
  getOpenAiSettings,
  type McpServerConfig,
  testMcpServerConfig,
  type McpServerTestResult,
  updateMcpServersConfig,
  updateOpenAiSettings
} from "../services/api";

export function AiSettingsPage() {
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openAiKeyInput, setOpenAiKeyInput] = useState("");
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpForm, setMcpForm] = useState<McpServerConfig>({
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    args: [],
    env: {},
    cwd: "",
    url: "",
    headers: {}
  });
  const [mcpArgsInput, setMcpArgsInput] = useState("[]");
  const [mcpEnvInput, setMcpEnvInput] = useState("{}");
  const [mcpHeadersInput, setMcpHeadersInput] = useState("{}");
  const [mcpFeedback, setMcpFeedback] = useState<string | null>(null);
  const [mcpTestResult, setMcpTestResult] = useState<McpServerTestResult | null>(null);
  const { loading, message, withSubmit } = useSubmitState();

  useEffect(() => {
    setLoadError(null);
    void getOpenAiSettings()
      .then((data) => {
        setHasOpenAiKey(data.hasOpenAiKey);
        setLoaded(true);
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Erro ao carregar.");
        setLoaded(true);
      });

    void getMcpServersConfig()
      .then((items) => setMcpServers(items))
      .catch(() => {
        setMcpServers([]);
      });
  }, []);

  return (
    <SectionCard
      title="Chave IA (OpenAI)"
      subtitle="Uma chave para todas as suas instâncias ao usar o modo IA na auto-resposta."
    >
      {!loaded ? <p className="text-sm text-slate-400">Carregando...</p> : null}
      {loadError ? <p className="text-sm text-red-300">{loadError}</p> : null}
      {loaded && !loadError ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-300">
            Status:{" "}
            <span className={hasOpenAiKey ? "font-medium text-emerald-400" : "font-medium text-amber-400"}>
              {hasOpenAiKey ? "Chave cadastrada na sua conta" : "Nenhuma chave cadastrada"}
            </span>
          </p>
          <p className="text-xs text-slate-400">
            Opcionalmente o servidor pode ainda usar <code className="text-slate-300">OPENAI_API_KEY</code> como
            fallback quando ninguém configurou uma chave aqui.
          </p>
          <input
            type="password"
            autoComplete="off"
            className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
            placeholder="Cole sua chave (sk-…)"
            value={openAiKeyInput}
            disabled={loading}
            onChange={(event) => setOpenAiKeyInput(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              disabled={loading || openAiKeyInput.trim().length === 0}
              onClick={() => {
                void withSubmit(async () => {
                  const data = await updateOpenAiSettings({
                    type: "set",
                    openaiApiKey: openAiKeyInput.trim()
                  });
                  setHasOpenAiKey(data.hasOpenAiKey);
                  setOpenAiKeyInput("");
                }, "Chave salva com sucesso.");
              }}
            >
              {loading ? "Salvando..." : "Salvar chave"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              disabled={loading || !hasOpenAiKey}
              onClick={() => {
                void withSubmit(async () => {
                  const data = await updateOpenAiSettings({ type: "clear" });
                  setHasOpenAiKey(data.hasOpenAiKey);
                  setOpenAiKeyInput("");
                }, "Chave removida da sua conta.");
              }}
            >
              Remover chave
            </button>
          </div>
          <hr className="border-slate-800" />
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-200">Servidores MCP (via UI)</h4>
            <p className="text-xs text-slate-400">
              Configure servidores MCP para sua conta. Esses IDs aparecem na Auto resposta para seleção por
              instância.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="id (ex: filesystem)"
                value={mcpForm.id}
                disabled={loading}
                onChange={(event) => setMcpForm((prev) => ({ ...prev, id: event.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                placeholder="nome (ex: Arquivos locais)"
                value={mcpForm.name}
                disabled={loading}
                onChange={(event) => setMcpForm((prev) => ({ ...prev, name: event.target.value }))}
              />
              <select
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                value={mcpForm.transport}
                disabled={loading}
                onChange={(event) =>
                  setMcpForm((prev) => ({ ...prev, transport: event.target.value as "stdio" | "http" }))
                }
              >
                <option value="stdio">stdio (processo local)</option>
                <option value="http">http (endpoint MCP)</option>
              </select>
              {mcpForm.transport === "stdio" ? (
                <>
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                placeholder="command (ex: npx)"
                value={mcpForm.command ?? ""}
                disabled={loading}
                onChange={(event) => setMcpForm((prev) => ({ ...prev, command: event.target.value }))}
              />
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                placeholder='args (JSON array), ex: ["-y","@modelcontextprotocol/server-filesystem","C:\\\\path"]'
                value={mcpArgsInput}
                disabled={loading}
                onChange={(event) => {
                  setMcpArgsInput(event.target.value);
                }}
              />
              <input
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                placeholder="cwd (opcional), ex: C:\\Users\\iago_\\Desktop\\Projects\\WhatsDelsuc"
                value={mcpForm.cwd ?? ""}
                disabled={loading}
                onChange={(event) => setMcpForm((prev) => ({ ...prev, cwd: event.target.value }))}
              />
              <textarea
                className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                placeholder='env (JSON object), ex: {"API_KEY":"abc","NODE_ENV":"production"}'
                value={mcpEnvInput}
                disabled={loading}
                onChange={(event) => {
                  setMcpEnvInput(event.target.value);
                }}
              />
                </>
              ) : (
                <>
                  <input
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                    placeholder="URL do catálogo tools (ex: http://localhost:3000/tools)"
                    value={mcpForm.url ?? ""}
                    disabled={loading}
                    onChange={(event) => setMcpForm((prev) => ({ ...prev, url: event.target.value }))}
                  />
                  <textarea
                    className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
                    placeholder='headers (JSON object), ex: {"Authorization":"Bearer token"}'
                    value={mcpHeadersInput}
                    disabled={loading}
                    onChange={(event) => setMcpHeadersInput(event.target.value)}
                  />
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                disabled={
                  loading ||
                  !mcpForm.id.trim() ||
                  !mcpForm.name.trim() ||
                  (mcpForm.transport === "stdio" ? !(mcpForm.command ?? "").trim() : !(mcpForm.url ?? "").trim())
                }
                onClick={() => {
                  let parsedArgs: string[] = [];
                  let parsedEnv: Record<string, string> = {};
                  let parsedHeaders: Record<string, string> = {};
                  try {
                    if (mcpForm.transport === "stdio") {
                      const rawArgs = JSON.parse(mcpArgsInput) as unknown;
                      if (!Array.isArray(rawArgs) || rawArgs.some((item) => typeof item !== "string")) {
                        setMcpFeedback("`args` precisa ser um JSON array de strings.");
                        return;
                      }
                      parsedArgs = rawArgs;
                      const rawEnv = JSON.parse(mcpEnvInput) as unknown;
                      if (typeof rawEnv !== "object" || rawEnv === null || Array.isArray(rawEnv)) {
                        setMcpFeedback("`env` precisa ser um JSON object.");
                        return;
                      }
                      parsedEnv = Object.fromEntries(
                        Object.entries(rawEnv as Record<string, unknown>).map(([key, value]) => [key, String(value)])
                      );
                    } else {
                      const rawHeaders = JSON.parse(mcpHeadersInput) as unknown;
                      if (typeof rawHeaders !== "object" || rawHeaders === null || Array.isArray(rawHeaders)) {
                        setMcpFeedback("`headers` precisa ser um JSON object.");
                        return;
                      }
                      parsedHeaders = Object.fromEntries(
                        Object.entries(rawHeaders as Record<string, unknown>).map(([key, value]) => [key, String(value)])
                      );
                    }
                  } catch {
                    setMcpFeedback("JSON inválido nos campos da configuração MCP.");
                    return;
                  }
                  const next = {
                    ...mcpForm,
                    id: mcpForm.id.trim(),
                    name: mcpForm.name.trim(),
                    command: mcpForm.transport === "stdio" ? (mcpForm.command ?? "").trim() : undefined,
                    args: parsedArgs,
                    env: parsedEnv,
                    cwd: mcpForm.transport === "stdio" ? mcpForm.cwd?.trim() || undefined : undefined,
                    url: mcpForm.transport === "http" ? (mcpForm.url ?? "").trim() : undefined,
                    headers: mcpForm.transport === "http" ? parsedHeaders : undefined
                  };
                  setMcpServers((prev) => [...prev.filter((item) => item.id !== next.id), next]);
                  setMcpForm({
                    id: "",
                    name: "",
                    transport: "stdio",
                    command: "",
                    args: [],
                    env: {},
                    cwd: "",
                    url: "",
                    headers: {}
                  });
                  setMcpArgsInput("[]");
                  setMcpEnvInput("{}");
                  setMcpHeadersInput("{}");
                  setMcpTestResult(null);
                  setMcpFeedback("Servidor adicionado/atualizado localmente. Clique em Salvar MCPs.");
                }}
              >
                Adicionar/atualizar servidor
              </button>
              <button
                type="button"
                className="rounded-lg border border-indigo-500 bg-indigo-900/20 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-50"
                disabled={
                  loading ||
                  !mcpForm.id.trim() ||
                  !mcpForm.name.trim() ||
                  (mcpForm.transport === "stdio" ? !(mcpForm.command ?? "").trim() : !(mcpForm.url ?? "").trim())
                }
                onClick={() => {
                  void withSubmit(async () => {
                    let parsedArgs: string[] = [];
                    let parsedEnv: Record<string, string> = {};
                    let parsedHeaders: Record<string, string> = {};
                    try {
                      if (mcpForm.transport === "stdio") {
                        const rawArgs = JSON.parse(mcpArgsInput) as unknown;
                        if (!Array.isArray(rawArgs) || rawArgs.some((item) => typeof item !== "string")) {
                          throw new Error("`args` precisa ser um JSON array de strings.");
                        }
                        parsedArgs = rawArgs;
                        const rawEnv = JSON.parse(mcpEnvInput) as unknown;
                        if (typeof rawEnv !== "object" || rawEnv === null || Array.isArray(rawEnv)) {
                          throw new Error("`env` precisa ser um JSON object.");
                        }
                        parsedEnv = Object.fromEntries(
                          Object.entries(rawEnv as Record<string, unknown>).map(([key, value]) => [key, String(value)])
                        );
                      } else {
                        const rawHeaders = JSON.parse(mcpHeadersInput) as unknown;
                        if (typeof rawHeaders !== "object" || rawHeaders === null || Array.isArray(rawHeaders)) {
                          throw new Error("`headers` precisa ser um JSON object.");
                        }
                        parsedHeaders = Object.fromEntries(
                          Object.entries(rawHeaders as Record<string, unknown>).map(([key, value]) => [key, String(value)])
                        );
                      }
                    } catch (error) {
                      throw new Error(error instanceof Error ? error.message : "JSON inválido em args/env.");
                    }
                    const result = await testMcpServerConfig({
                      id: mcpForm.id.trim(),
                      name: mcpForm.name.trim(),
                      transport: mcpForm.transport,
                      command: mcpForm.transport === "stdio" ? (mcpForm.command ?? "").trim() : undefined,
                      args: parsedArgs,
                      env: parsedEnv,
                      cwd: mcpForm.transport === "stdio" ? mcpForm.cwd?.trim() || undefined : undefined,
                      url: mcpForm.transport === "http" ? (mcpForm.url ?? "").trim() : undefined,
                      headers: mcpForm.transport === "http" ? parsedHeaders : undefined
                    });
                    setMcpTestResult(result);
                    setMcpFeedback(`Conexão OK. ${result.toolCount} tool(s) disponível(is).`);
                  }, "Teste de conexão MCP executado.");
                }}
              >
                Testar conexão MCP
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                disabled={loading}
                onClick={() => {
                  void withSubmit(async () => {
                    const items = await updateMcpServersConfig(mcpServers);
                    setMcpServers(items);
                    setMcpFeedback(null);
                  }, "Servidores MCP salvos.");
                }}
              >
                Salvar MCPs
              </button>
            </div>
            {mcpFeedback ? <p className="text-xs text-slate-300">{mcpFeedback}</p> : null}
            {mcpTestResult ? (
              <p className="text-xs text-emerald-300">
                Tools encontradas:{" "}
                {mcpTestResult.toolNames.length > 0 ? mcpTestResult.toolNames.join(", ") : "nenhuma"}
              </p>
            ) : null}
            <div className="space-y-1">
              {mcpServers.length === 0 ? <p className="text-xs text-slate-500">Nenhum servidor MCP configurado.</p> : null}
              {mcpServers.map((server) => (
                <div key={server.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-xs">
                  <span className="text-slate-300">
                    <strong>{server.name}</strong> ({server.id}) -{" "}
                    {server.transport === "http" ? server.url : server.command}
                    {server.cwd ? ` | cwd: ${server.cwd}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-red-300 hover:text-red-200"
                    disabled={loading}
                    onClick={() => setMcpServers((prev) => prev.filter((item) => item.id !== server.id))}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </div>
          {message ? <p className="text-sm text-slate-300">{message}</p> : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
