import { useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import { updatePrompt } from "../services/api";

type PromptEditorPageProps = {
  instanceId?: string;
};

export function PromptEditorPage({ instanceId: fixedInstanceId }: PromptEditorPageProps) {
  const [instanceId] = useState(fixedInstanceId ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    "Voce e um atendente virtual de pizzaria, educado e objetivo."
  );
  const { loading, message, withSubmit } = useSubmitState();

  return (
    <SectionCard
      title="Prompt Editor"
      subtitle="Defina a personalidade da IA que sera usada no webhook de auto-resposta."
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const targetInstanceId = fixedInstanceId ?? instanceId;
          if (!targetInstanceId) {
            return;
          }
          void withSubmit(
            () => updatePrompt(targetInstanceId, systemPrompt),
            "Prompt atualizado com sucesso."
          );
        }}
      >
        {!fixedInstanceId ? (
          <p className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
            Selecione uma instancia conectada no Dashboard para editar o prompt.
          </p>
        ) : null}
        <textarea
          className="min-h-44 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-400"
          disabled={loading || !fixedInstanceId}
        >
          {loading ? "Salvando..." : "Salvar Prompt"}
        </button>
      </form>
      {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
    </SectionCard>
  );
}
