import { useEffect, useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import { getOpenAiSettings, updateOpenAiSettings } from "../services/api";

export function AiSettingsPage() {
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [openAiKeyInput, setOpenAiKeyInput] = useState("");
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
          {message ? <p className="text-sm text-slate-300">{message}</p> : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
