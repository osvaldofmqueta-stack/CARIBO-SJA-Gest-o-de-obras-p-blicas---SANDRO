import { useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Building2, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "./lib/auth-client";

export function SignInPage({ onAuthenticated }: { onAuthenticated: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar sessão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <Link href="/" className="auth-back"><ArrowRight size={15} /> Voltar ao início</Link>
      <section className="auth-card surface">
        <Link href="/" className="auth-brand" aria-label="Caribo SJA — início">
          <span className="brand-mark"><Building2 size={18} strokeWidth={1.8} /></span>
          <span className="brand-copy"><b>CARIBO</b><small>SJA · Obras públicas</small></span>
        </Link>
        <div className="eyebrow">ACESSO INDIVIDUAL</div>
        <h1>Iniciar sessão</h1>
        <p className="auth-intro">Entre com o seu e-mail e a palavra-passe da sua conta.</p>
        <form className="auth-form" onSubmit={submit}>
          <label className="form-field">
            <span>E-mail</span>
            <input
              autoComplete="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              maxLength={254}
              placeholder="nome@empresa.ao"
              data-testid="input-login-email"
            />
          </label>
          <label className="form-field">
            <span>Palavra-passe</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              maxLength={1024}
              data-testid="input-login-password"
            />
          </label>
          {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="auth-spin" /> : <LockKeyhole size={16} />}
            {busy ? "A validar…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("As novas palavras-passe não coincidem.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest("/api/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a palavra-passe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <header className="modal-head">
          <div><div className="eyebrow">SEGURANÇA DA CONTA</div><h2 id="change-password-title">Alterar palavra-passe</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>
        {saved ? (
          <div className="auth-success" role="status">A palavra-passe foi alterada.</div>
        ) : (
          <form onSubmit={submit}>
            <div className="modal-fields">
              <label className="form-field"><span>Palavra-passe actual</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
              <label className="form-field"><span>Nova palavra-passe</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} required /></label>
              <label className="form-field"><span>Confirmar nova palavra-passe</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required /></label>
            </div>
            {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={15} className="auth-spin" /> : null}{busy ? "A guardar…" : "Guardar palavra-passe"}</button>
            </div>
          </form>
        )}
        {saved && <div className="modal-actions"><button className="btn btn-primary" type="button" onClick={onClose}>Concluído <ArrowRight size={15} /></button></div>}
      </section>
    </div>
  );
}