import { useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import { updateInstanceAutoReply } from "../services/api";
import type { PublicInstance } from "../services/api";

type PromptEditorPageProps = {
  instanceId?: string;
  instance?: PublicInstance;
};

export function PromptEditorPage({ instanceId: fixedInstanceId, instance }: PromptEditorPageProps) {
  const [instanceId] = useState(fixedInstanceId ?? "");
  const [systemPrompt, setSystemPrompt] = useState(
    instance?.systemPrompt ?? "Voce e um atendente virtual de pizzaria, educado e objetivo."
  );
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(instance?.autoReplyEnabled ?? false);
  const [autoReplyMode, setAutoReplyMode] = useState<"fixed" | "ai">(instance?.autoReplyMode ?? "ai");
  const [fixedReplyMessage, setFixedReplyMessage] = useState(instance?.fixedReplyMessage ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
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
          if (autoReplyMode === "fixed" && fixedReplyMessage.trim().length === 0) {
            setValidationError("Informe a mensagem fixa para esse modo.");
            return;
          }
          if (autoReplyMode === "ai" && systemPrompt.trim().length === 0) {
            setValidationError("Informe o prompt da IA para esse modo.");
            return;
          }
          setValidationError(null);
          void withSubmit(
            () =>
              updateInstanceAutoReply(targetInstanceId, {
                autoReplyEnabled,
                autoReplyMode,
                fixedReplyMessage,
                systemPrompt
              }).then(() => undefined),
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
          <textarea
            className="min-h-44 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder="Descreva o comportamento da IA."
          />
        ) : (
          <textarea
            className="min-h-44 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
            value={fixedReplyMessage}
            onChange={(event) => setFixedReplyMessage(event.target.value)}
            placeholder="Mensagem enviada automaticamente ao cliente."
          />
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
