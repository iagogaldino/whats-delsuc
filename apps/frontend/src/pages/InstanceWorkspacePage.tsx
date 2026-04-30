import { BulkSenderPage } from "./BulkSenderPage";
import { PromptEditorPage } from "./PromptEditorPage";
import type { PublicInstance } from "../services/api";

type InstanceWorkspacePageProps = {
  instance: PublicInstance;
  onBack: () => void;
};

export function InstanceWorkspacePage({ instance, onBack }: InstanceWorkspacePageProps) {
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

      <PromptEditorPage instanceId={instance.instanceId} />
      <BulkSenderPage instanceId={instance.instanceId} />
    </div>
  );
}
