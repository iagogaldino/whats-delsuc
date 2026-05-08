import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import {
  getMcpServersConfig,
  testMcpServerConfig,
  type McpServerConfig,
  type McpServerTestResult,
  updateMcpServersConfig
} from "../services/api";

type HttpMcpForm = {
  name: string;
  url: string;
  headersInput: string;
};

const EMPTY_HTTP_FORM: HttpMcpForm = {
  name: "",
  url: "",
  headersInput: "{}"
};

function parseHeaders(headersInput: string): Record<string, string> {
  const rawHeaders = JSON.parse(headersInput) as unknown;
  if (typeof rawHeaders !== "object" || rawHeaders === null || Array.isArray(rawHeaders)) {
    throw new Error("Preencha os dados adicionais em formato valido.");
  }
  return Object.fromEntries(
    Object.entries(rawHeaders as Record<string, unknown>).map(([key, value]) => [key, String(value)])
  );
}

function toSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAutoId(name: string, url: string): string {
  const baseFromName = toSlug(name);
  if (baseFromName.length > 0) {
    return baseFromName;
  }
  const baseFromUrl = toSlug(url);
  if (baseFromUrl.length > 0) {
    return baseFromUrl;
  }
  return "mcp-http";
}

export function McpServersPage() {
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpForm, setMcpForm] = useState<HttpMcpForm>(EMPTY_HTTP_FORM);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<McpServerTestResult | null>(null);
  const { loading, message, withSubmit } = useSubmitState();

  useEffect(() => {
    void getMcpServersConfig()
      .then((items) => setMcpServers(items.filter((item) => item.transport === "http")))
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : "Erro ao carregar servidores MCP.");
        setMcpServers([]);
      });
  }, []);

  const canSubmit = mcpForm.name.trim().length > 0 && mcpForm.url.trim().length > 0;

  return (
    <SectionCard
      title="Integracoes IA"
      subtitle="Conecte serviços externos para ampliar o que a IA pode fazer."
    >
      <div className="space-y-3">
        <p className="rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2 text-xs text-slate-300">
          Adicione suas integrações para usar recursos extras nas respostas automáticas.
        </p>
        {loadError ? <p className="text-sm text-red-300">{loadError}</p> : null}
        <div className="grid gap-2 md:grid-cols-2">
          <input
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
            placeholder="Nome da integração"
            value={mcpForm.name}
            disabled={loading}
            onChange={(event) => setMcpForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <input
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
            placeholder="Endereço da integração"
            value={mcpForm.url}
            disabled={loading}
            onChange={(event) => setMcpForm((prev) => ({ ...prev, url: event.target.value }))}
          />
          <textarea
            className="min-h-24 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm md:col-span-2"
            placeholder='Dados adicionais (opcional)'
            value={mcpForm.headersInput}
            disabled={loading}
            onChange={(event) => setMcpForm((prev) => ({ ...prev, headersInput: event.target.value }))}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            disabled={loading || !canSubmit}
            onClick={() => {
              let parsedHeaders: Record<string, string>;
              try {
                parsedHeaders = parseHeaders(mcpForm.headersInput);
              } catch (error) {
                setFeedback(error instanceof Error ? error.message : "Nao foi possivel validar os dados adicionais.");
                return;
              }

              const baseId = editingServerId ?? buildAutoId(mcpForm.name, mcpForm.url);
              const alreadyExists = mcpServers.some(
                (item) => item.id === baseId && item.id !== editingServerId && item.url !== mcpForm.url.trim()
              );
              const nextId = alreadyExists ? `${baseId}-${Date.now().toString().slice(-4)}` : baseId;
              const next: McpServerConfig = {
                id: nextId,
                name: mcpForm.name.trim(),
                transport: "http",
                url: mcpForm.url.trim(),
                headers: parsedHeaders
              };
              setMcpServers((prev) => [...prev.filter((item) => item.id !== next.id), next]);
              setMcpForm(EMPTY_HTTP_FORM);
              setEditingServerId(null);
              setTestResult(null);
              setFeedback(
                editingServerId
                  ? "Integracao atualizada localmente. Clique em Salvar alteracoes."
                  : "Integracao adicionada localmente. Clique em Salvar alteracoes."
              );
            }}
          >
            {editingServerId ? "Salvar edicao local" : "Adicionar integracao"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-indigo-500 bg-indigo-900/20 px-4 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-50"
            disabled={loading || !canSubmit}
            onClick={() => {
              void withSubmit(async () => {
                const parsedHeaders = parseHeaders(mcpForm.headersInput);
                const generatedId = editingServerId ?? buildAutoId(mcpForm.name, mcpForm.url);
                const result = await testMcpServerConfig({
                  id: generatedId,
                  name: mcpForm.name.trim(),
                  transport: "http",
                  url: mcpForm.url.trim(),
                  headers: parsedHeaders
                });
                setTestResult(result);
                setFeedback(`Conexao validada. ${result.toolCount} recurso(s) disponivel(is).`);
              }, "Teste de conexao concluido.");
            }}
          >
            Testar conexao
          </button>
          {editingServerId ? (
            <button
              type="button"
              className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              disabled={loading}
              onClick={() => {
                setEditingServerId(null);
                setMcpForm(EMPTY_HTTP_FORM);
                setTestResult(null);
                setFeedback(null);
              }}
            >
              Cancelar edicao
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
            disabled={loading}
            onClick={() => {
              void withSubmit(async () => {
                const items = await updateMcpServersConfig(mcpServers);
                setMcpServers(items.filter((item) => item.transport === "http"));
                setFeedback(null);
              }, "Integracoes salvas.");
            }}
          >
            Salvar alteracoes
          </button>
        </div>
        {feedback ? <p className="text-xs text-slate-300">{feedback}</p> : null}
        {testResult ? (
          <p className="text-xs text-emerald-300">Conexao pronta para uso.</p>
        ) : null}
        <div className="space-y-1">
          {mcpServers.length === 0 ? <p className="text-xs text-slate-500">Nenhuma integracao configurada.</p> : null}
          {mcpServers.map((server) => (
            <div key={server.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-xs">
              <span className="text-slate-300">
                <strong>{server.name}</strong> - {server.url}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-emerald-300 hover:text-emerald-200"
                  disabled={loading}
                  onClick={() => {
                    setEditingServerId(server.id);
                    setMcpForm({
                      name: server.name,
                      url: server.url ?? "",
                      headersInput: JSON.stringify(server.headers ?? {}, null, 2)
                    });
                    setFeedback(`Editando integracao "${server.name}".`);
                    setTestResult(null);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="text-red-300 hover:text-red-200"
                  disabled={loading}
                  onClick={() => {
                    const nextServers = mcpServers.filter((item) => item.id !== server.id);
                    void withSubmit(async () => {
                      const items = await updateMcpServersConfig(nextServers);
                      setMcpServers(items.filter((item) => item.transport === "http"));
                      setFeedback(`Integracao "${server.name}" removida com sucesso.`);
                      if (editingServerId === server.id) {
                        setEditingServerId(null);
                        setMcpForm(EMPTY_HTTP_FORM);
                      }
                    }, "Integracao removida.");
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
        {message ? <p className="text-sm text-slate-300">{message}</p> : null}
      </div>
    </SectionCard>
  );
}
