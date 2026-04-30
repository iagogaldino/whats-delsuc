import { useState } from "react";
import { SectionCard } from "../components/SectionCard";
import { useSubmitState } from "../hooks/useSubmitState";
import { sendBulk } from "../services/api";

type BulkSenderPageProps = {
  instanceId?: string;
};

export function BulkSenderPage({ instanceId }: BulkSenderPageProps) {
  const [numbersInput, setNumbersInput] = useState("");
  const [messageInput, setMessageInput] = useState("Ola! Temos uma oferta especial para voce hoje.");
  const { loading, message, withSubmit } = useSubmitState();

  return (
    <SectionCard title="Bulk Sender" subtitle="Cole uma lista de numeros (um por linha) e envie uma mensagem em massa.">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const numbers = numbersInput
            .split("\n")
            .map((number) => number.trim())
            .filter(Boolean);

          if (!instanceId) {
            return;
          }

          void withSubmit(() => sendBulk(instanceId, numbers, messageInput), "Disparo iniciado.");
        }}
      >
        {!instanceId ? (
          <p className="rounded-lg border border-amber-700/50 bg-amber-900/20 px-3 py-2 text-sm text-amber-300">
            Selecione uma instancia conectada no Dashboard para usar disparo em massa.
          </p>
        ) : null}
        <textarea
          className="min-h-36 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="+5511999999999"
          value={numbersInput}
          onChange={(event) => setNumbersInput(event.target.value)}
        />
        <textarea
          className="min-h-28 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
          placeholder="Mensagem para disparo..."
          value={messageInput}
          onChange={(event) => setMessageInput(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-slate-950 hover:bg-emerald-400"
          disabled={loading || !instanceId}
        >
          {!instanceId ? "Selecione uma instancia conectada" : loading ? "Enviando..." : "Start Campaign"}
        </button>
      </form>
      {message ? <p className="mt-4 text-sm text-slate-300">{message}</p> : null}
    </SectionCard>
  );
}
