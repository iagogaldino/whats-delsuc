import { useState } from "react";
import { login } from "../services/api";

type LoginPageProps = {
  onLoggedIn: () => void;
  onSwitchToSignup: () => void;
};

export function LoginPage({ onLoggedIn, onSwitchToSignup }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-2xl font-bold text-slate-100">Login</h2>
      <p className="mt-1 text-sm text-slate-400">Acesse sua conta do painel.</p>
      <form
        className="mt-5 space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setLoading(true);
          setError(null);
          try {
            await login({ email, password });
            onLoggedIn();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Erro no login");
          } finally {
            setLoading(false);
          }
        }}
      >
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
          className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-400"
          disabled={loading}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      <button
        type="button"
        className="mt-4 text-sm text-emerald-300 underline"
        onClick={onSwitchToSignup}
      >
        Criar nova conta
      </button>
    </div>
  );
}
