import { useState } from "react";
import { signup } from "../services/api";

type SignupPageProps = {
  onSignedUp: () => void;
  onSwitchToLogin: () => void;
};

export function SignupPage({ onSignedUp, onSwitchToLogin }: SignupPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold text-slate-100">Cadastro</h2>
      <p className="mt-1 text-sm text-slate-400">
        O servidor usa as credenciais do WhatsAppConnect configuradas na aplicacao (.env) para gerar o
        token `otp_...` automaticamente ao cadastrar.
      </p>
      <form
        className="mt-5 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await signup({ name, email, password });
            onSignedUp();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erro no cadastro");
          } finally {
            setLoading(false);
          }
        }}
      >
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
          placeholder="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <input
          type="password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-400"
          disabled={loading}
        >
          {loading ? "Criando..." : "Criar Conta"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <button
        type="button"
        className="mt-4 text-sm text-emerald-300 underline"
        onClick={onSwitchToLogin}
      >
        Ja tenho conta
      </button>
    </div>
  );
}
