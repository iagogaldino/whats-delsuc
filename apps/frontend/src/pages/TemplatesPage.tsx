import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  listMessageTemplates,
  updateMessageTemplate,
  type MessageTemplate
} from "../services/api";

export function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    setError(null);
    try {
      const data = await listMessageTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTemplates();
  }, []);

  const detectedPlaceholders = useMemo(() => {
    const matches = contentInput.match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) ?? [];
    return Array.from(new Set(matches.map((item) => item.replace(/[{}\s]/g, "").toLowerCase())));
  }, [contentInput]);

  return (
    <SectionCard
      title="Templates de Mensagens"
      subtitle="Crie mensagens reutilizaveis com placeholders como {{telefone}}, {{mensagem}} e {{instanciaId}}."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameInput.trim() || !contentInput.trim()) {
            return;
          }

          setSaving(true);
          const payload = {
            name: nameInput.trim(),
            content: contentInput.trim()
          };

          const action = editingId
            ? updateMessageTemplate(editingId, payload)
            : createMessageTemplate(payload);

          void action
            .then(() => {
              setNameInput("");
              setContentInput("");
              setEditingId(null);
              return loadTemplates();
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Erro ao salvar template."))
            .finally(() => setSaving(false));
        }}
      >
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="Nome do template"
          value={nameInput}
          onChange={(event) => setNameInput(event.target.value)}
        />
        <textarea
          className="min-h-32 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="Conteudo da mensagem..."
          value={contentInput}
          onChange={(event) => setContentInput(event.target.value)}
        />
        {detectedPlaceholders.length > 0 ? (
          <p className="text-xs text-slate-400">Placeholders detectados: {detectedPlaceholders.join(", ")}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !nameInput.trim() || !contentInput.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {saving ? "Salvando..." : editingId ? "Atualizar template" : "Criar template"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={() => {
                setEditingId(null);
                setNameInput("");
                setContentInput("");
              }}
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      <div className="mt-6 space-y-3">
        {loading ? <p className="text-sm text-slate-400">Carregando templates...</p> : null}
        {!loading && templates.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum template cadastrado.</p>
        ) : null}
        {templates.map((template) => (
          <div key={template.id} className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-100">{template.name}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{template.content}</p>
                {template.placeholders.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-400">Placeholders: {template.placeholders.join(", ")}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  onClick={() => {
                    setEditingId(template.id);
                    setNameInput(template.name);
                    setContentInput(template.content);
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="rounded-md border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-950/50"
                  onClick={() => {
                    void deleteMessageTemplate(template.id)
                      .then(() => loadTemplates())
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : "Erro ao excluir template.")
                      );
                  }}
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

