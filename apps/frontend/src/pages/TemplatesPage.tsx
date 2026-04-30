import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import {
  createMessageTemplate,
  deleteMessageTemplate,
  getTemplateMediaObjectUrl,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

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

  useEffect(() => {
    const imageTemplates = templates.filter((item) => item.media?.mimeType.startsWith("image/"));
    if (imageTemplates.length === 0) {
      setPreviewUrls((previous) => {
        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
      return;
    }

    let disposed = false;
    void Promise.all(
      imageTemplates.map(async (template) => {
        try {
          const objectUrl = await getTemplateMediaObjectUrl(template.id);
          return { id: template.id, objectUrl };
        } catch {
          return { id: template.id, objectUrl: "" };
        }
      })
    ).then((entries) => {
      if (disposed) {
        entries.forEach((entry) => {
          if (entry.objectUrl) {
            URL.revokeObjectURL(entry.objectUrl);
          }
        });
        return;
      }
      setPreviewUrls((previous) => {
        Object.values(previous).forEach((url) => URL.revokeObjectURL(url));
        const next: Record<string, string> = {};
        entries.forEach((entry) => {
          if (entry.objectUrl) {
            next[entry.id] = entry.objectUrl;
          }
        });
        return next;
      });
    });

    return () => {
      disposed = true;
    };
  }, [templates]);

  useEffect(() => {
    return () => {
      Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

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
          if (selectedFile && selectedFile.size > 16 * 1024 * 1024) {
            setError("Arquivo acima do limite de 16MB.");
            return;
          }

          setSaving(true);
          setError(null);
          const payload = {
            name: nameInput.trim(),
            content: contentInput.trim(),
            file: selectedFile ?? undefined
          };

          const action = editingId
            ? updateMessageTemplate(editingId, payload)
            : createMessageTemplate(payload);

          void action
            .then(() => {
              setNameInput("");
              setContentInput("");
              setSelectedFile(null);
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
        <div className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-400">Opcional: anexe arquivo ao template (max 16MB).</p>
          <input
            type="file"
            className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-slate-200 hover:file:bg-slate-600"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <div className="space-y-2">
              <p className="text-xs text-slate-400">
                Arquivo selecionado: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
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
                setSelectedFile(null);
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
                {template.media ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-slate-400">
                      Arquivo: {template.media.fileName} ({(template.media.sizeBytes / (1024 * 1024)).toFixed(2)} MB)
                    </p>
                    {template.media.mimeType.startsWith("image/") && previewUrls[template.id] ? (
                      <img
                        src={previewUrls[template.id]}
                        alt={`Preview ${template.media.fileName}`}
                        className="max-h-48 rounded-md border border-slate-700 object-contain"
                      />
                    ) : null}
                  </div>
                ) : null}
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
                    setSelectedFile(null);
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

