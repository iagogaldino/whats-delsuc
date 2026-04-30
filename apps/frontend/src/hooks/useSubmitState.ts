import { useState } from "react";

export function useSubmitState() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function withSubmit(action: () => Promise<void>, successMessage: string) {
    setLoading(true);
    setMessage(null);
    try {
      await action();
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  return { loading, message, withSubmit };
}
