import { useState } from "react";
import { BulkSenderPage } from "./BulkSenderPage";
import { PromptEditorPage } from "./PromptEditorPage";
import type { PublicInstance } from "../services/api";

type InstanceWorkspacePageProps = {
  instance: PublicInstance;
  onBack: () => void;
};

type InstanceFeature = "prompt" | "bulk";

export function InstanceWorkspacePage({ instance, onBack }: InstanceWorkspacePageProps) {
  const [selectedFeature, setSelectedFeature] = useState<InstanceFeature | null>(null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-700/60 bg-emerald-900/20 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-emerald-300">
              {instance.displayName || "Instancia conectada"}
            </h2>
            <p className="mt-1 text-xs uppercase tracking-wide text-emerald-300">Status: {instance.status}</p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Funcionalidades</p>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setSelectedFeature("prompt")}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                selectedFeature === "prompt"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-950/50 text-slate-300 hover:bg-slate-800"
              }`}
            >
              Prompt Editor
            </button>
            <button
              type="button"
              onClick={() => setSelectedFeature("bulk")}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                selectedFeature === "bulk"
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-950/50 text-slate-300 hover:bg-slate-800"
              }`}
            >
              Bulk Sender
            </button>
          </div>
        </aside>

        <section className="min-h-40">
          {selectedFeature === null ? (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-300">
              Escolha uma funcionalidade no menu lateral para comecar.
            </div>
          ) : null}
          {selectedFeature === "prompt" ? <PromptEditorPage instanceId={instance.instanceId} /> : null}
          {selectedFeature === "bulk" ? <BulkSenderPage instanceId={instance.instanceId} /> : null}
        </section>
      </div>
    </div>
  );
}
