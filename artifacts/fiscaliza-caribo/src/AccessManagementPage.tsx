import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  UserRoundCheck,
  UserRoundX,
  X,
} from 'lucide-react';
import { apiRequest } from './lib/auth-client';
import { useListObras } from '@workspace/api-client-react';
import type { Obra } from '@workspace/api-client-react';

type Role = 'gestor' | 'fiscal' | 'consulta' | 'cliente';
type AccessUser = {
  user_id: number;
  name: string;
  email: string;
  login_email: string;
  has_login_email: boolean;
  role: Role | null;
  role_label: string | null;
  activo: boolean;
  has_profile: boolean;
  obra_ids?: number[];
};
type AccessUsersResponse = {
  results: AccessUser[];
  total_count: number;
  offset: number;
  limit: number;
};

const LIMIT = 50;
const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'gestor', label: 'Gestor', description: 'Gere operações e acessos' },
  { value: 'fiscal', label: 'Fiscal', description: 'Regista actividade no terreno' },
  { value: 'consulta', label: 'Consulta', description: 'Acesso de leitura' },
  { value: 'cliente', label: 'Cliente', description: 'Acompanha obras atribuídas' },
];

function roleName(role: Role | null, label: string | null) {
  if (!role) return 'Sem perfil';
  return label || ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('pt-PT') || 'CS';
}

export default function AccessManagementPage() {
  const client = useQueryClient();
  const worksQuery = useListObras();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, Role>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [assignmentUser, setAssignmentUser] = useState<AccessUser | null>(null);
  const [resetUser, setResetUser] = useState<AccessUser | null>(null);
  const [resetEmail, setResetEmail] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordFormError, setPasswordFormError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const listQuery = useQuery({
    queryKey: ['access-users', offset, search],
    queryFn: () => {
      const params = new URLSearchParams({ offset: String(offset), limit: String(LIMIT) });
      if (search) params.set('query', search);
      return apiRequest<AccessUsersResponse>(`/api/access-users?${params.toString()}`);
    },
    staleTime: 20_000,
  });

  const refreshList = () => client.invalidateQueries({ queryKey: ['access-users'] });
  const createMutation = useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: Role; obra_ids?: number[] }) =>
      apiRequest<AccessUser>('/api/access-users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      setCreateOpen(false);
      refreshList();
    },
  });
  const assignMutation = useMutation({
    mutationFn: ({ userId, role, obra_ids }: { userId: number; role: Role; obra_ids?: number[] }) =>
      apiRequest<AccessUser>(`/api/access-users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, ...(obra_ids ? { obra_ids } : {}) }),
      }),
    onSuccess: refreshList,
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, role, obra_ids }: { userId: number; role: Role; obra_ids?: number[] }) =>
      apiRequest<AccessUser>(`/api/access-users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role, ...(obra_ids ? { obra_ids } : {}) }),
      }),
    onSuccess: refreshList,
  });
  const activeMutation = useMutation({
    mutationFn: ({ userId, activo }: { userId: number; activo: boolean }) =>
      apiRequest<AccessUser>(`/api/access-users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo }),
      }),
    onSuccess: refreshList,
  });
  const passwordMutation = useMutation({
    mutationFn: ({ userId, email, password }: { userId: number; email: string; password: string }) =>
      apiRequest<AccessUser>(`/api/access-users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: () => {
      setResetUser(null);
      setResetEmail('');
      setResetPassword('');
      setConfirmPassword('');
      setPasswordFormError('');
      refreshList();
    },
  });

  const data = listQuery.data;
  const page = Math.floor(offset / LIMIT) + 1;
  const pageCount = Math.max(1, Math.ceil((data?.total_count || 0) / LIMIT));
  const pendingUser = assignMutation.variables?.userId
    || roleMutation.variables?.userId
    || activeMutation.variables?.userId
    || passwordMutation.variables?.userId;
  const mutationError = createMutation.error || assignMutation.error || roleMutation.error || activeMutation.error || passwordMutation.error;
  const mutationPending = createMutation.isPending || assignMutation.isPending || roleMutation.isPending || activeMutation.isPending || passwordMutation.isPending;

  function updateSelectedRole(user: AccessUser, value: string) {
    if (value === 'gestor' || value === 'fiscal' || value === 'consulta' || value === 'cliente') {
      setSelectedRoles((current) => ({ ...current, [user.user_id]: value }));
    }
  }

  function currentRole(user: AccessUser): Role {
    return selectedRoles[user.user_id] || user.role || 'consulta';
  }

  function roleHasChanged(user: AccessUser) {
    return Boolean(user.role && selectedRoles[user.user_id] && selectedRoles[user.user_id] !== user.role);
  }

  function handleToggleActive(user: AccessUser) {
    const next = !user.activo;
    if (!next && !window.confirm(`Desativar o acesso de ${user.name || user.email}? O perfil será mantido e poderá ser reativado.`)) return;
    activeMutation.mutate({ userId: user.user_id, activo: next });
  }

  return (
    <div className="access-page" data-testid="page-access-management">
      <header className="access-heading">
        <div>
          <div className="access-eyebrow"><span className="access-eyebrow-mark" />ADMINISTRAÇÃO · EQUIPA</div>
          <h1>Perfis de acesso</h1>
          <p>Defina o que cada pessoa pode fazer na operação Caribo SJA.</p>
        </div>
        <div className="access-provider" data-testid="text-sign-in-provider">
          <LockKeyhole size={16} />
          <span><b>Conta individual</b><small>E-mail e palavra-passe</small></span>
        </div>
      </header>

      <section className="access-summary" aria-label="Resumo de utilizadores">
        <div className="access-summary-icon"><UserRoundCheck size={19} /></div>
        <div className="access-summary-copy">
          <b data-testid="text-access-total">{data ? data.total_count.toLocaleString('pt-PT') : '—'}</b>
          <span>utilizadores encontrados</span>
        </div>
        <span className="access-summary-divider" />
        <p>Os perfis definem as permissões de cada conta individual; as alterações não removem o histórico de auditoria.</p>
        <ShieldCheck className="access-summary-watermark" size={44} />
      </section>

      <section className="access-panel">
        <div className="access-panel-heading">
          <div>
            <div className="access-overline">DIRETÓRIO DE ACESSOS</div>
            <h2>Equipa e permissões</h2>
          </div>
          <div className="access-heading-actions">
            <span className="access-page-count" data-testid="text-access-page-count">
              {data ? `${data.results.length} nesta página` : 'A carregar'}
            </span>
            <button type="button" className="access-button access-button-assign" onClick={() => setCreateOpen(true)} data-testid="button-create-access-user">
              <Plus size={15} /><span>Nova conta</span>
            </button>
          </div>
        </div>

        <div className="access-toolbar">
          <label className="access-search">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Pesquisar por nome ou email"
              aria-label="Pesquisar utilizadores por nome ou email"
              data-testid="input-access-search"
            />
            {searchInput && (
              <button type="button" onClick={() => setSearchInput('')} aria-label="Limpar pesquisa" data-testid="button-clear-access-search">
                Limpar
              </button>
            )}
          </label>
          <div className="access-roles-key" aria-label="Perfis disponíveis">
            {ROLE_OPTIONS.map((role) => <span key={role.value} data-testid={`legend-role-${role.value}`}>{role.label}</span>)}
          </div>
        </div>

        {mutationError && (
          <div className="access-feedback access-feedback-error" role="alert" data-testid="status-access-mutation-error">
            <AlertCircle size={16} />
            <span>{mutationError instanceof Error ? mutationError.message : 'Não foi possível guardar a alteração.'}</span>
            <button type="button" onClick={() => { createMutation.reset(); assignMutation.reset(); roleMutation.reset(); activeMutation.reset(); passwordMutation.reset(); }} aria-label="Fechar mensagem de erro" data-testid="button-dismiss-access-error">Fechar</button>
          </div>
        )}
        {createMutation.isSuccess || assignMutation.isSuccess || roleMutation.isSuccess || activeMutation.isSuccess ? (
          <div className="access-feedback access-feedback-success" role="status" data-testid="status-access-success">
            <CheckCircle2 size={16} /><span>Alteração de acesso guardada.</span>
            <button type="button" onClick={() => { createMutation.reset(); assignMutation.reset(); roleMutation.reset(); activeMutation.reset(); }} aria-label="Fechar confirmação" data-testid="button-dismiss-access-success">Fechar</button>
          </div>
        ) : null}

        {listQuery.isLoading ? (
          <div className="access-loading" aria-label="A carregar utilizadores" data-testid="status-access-loading">
            <div className="access-skeleton access-skeleton-head" />
            {[0, 1, 2, 3].map((item) => <div className="access-skeleton access-skeleton-row" key={item}><i /><span /><b /></div>)}
          </div>
        ) : listQuery.isError ? (
          <div className="access-state access-state-error" role="alert" data-testid="status-access-load-error">
            <span className="access-state-icon"><AlertCircle size={21} /></span>
            <h3>Não foi possível carregar a equipa</h3>
            <p>{listQuery.error instanceof Error ? listQuery.error.message : 'Verifique a ligação e tente novamente.'}</p>
            <button type="button" className="access-button access-button-secondary" onClick={() => listQuery.refetch()} data-testid="button-retry-access-list">
              <RefreshCw size={15} /> Tentar novamente
            </button>
          </div>
        ) : !data?.results.length ? (
          <div className="access-state" data-testid="status-access-empty">
            <span className="access-state-icon"><UserRound size={21} /></span>
            <h3>{search ? 'Nenhum utilizador encontrado' : 'Ainda sem utilizadores'}</h3>
            <p>{search ? 'Experimente outro nome ou endereço de email.' : 'Crie uma conta individual para cada pessoa e atribua-lhe um perfil.'}</p>
            {search && <button type="button" className="access-button access-button-secondary" onClick={() => setSearchInput('')} data-testid="button-reset-access-search">Limpar pesquisa</button>}
          </div>
        ) : (
          <>
            <div className="access-table-wrap" aria-busy={listQuery.isFetching} data-testid="table-access-users">
              <table className="access-table">
                <thead><tr><th scope="col">Utilizador</th><th scope="col">Perfil atribuído</th><th scope="col">Estado</th><th scope="col" className="access-actions-heading">Ações</th></tr></thead>
                <tbody>
                  {data.results.map((user) => {
                    const isPending = mutationPending && pendingUser === user.user_id;
                    const roleChanged = roleHasChanged(user);
                    return (
                      <tr key={user.user_id} data-testid={`row-access-user-${user.user_id}`} className={!user.activo && user.has_profile ? 'access-row-inactive' : ''}>
                        <td>
                          <div className="access-user-cell">
                            <span className={`access-avatar ${user.has_profile ? '' : 'access-avatar-unassigned'}`}>{initials(user.name || user.email)}</span>
                            <span className="access-user-text">
                              <b data-testid={`text-access-name-${user.user_id}`}>{user.name || 'Nome não disponível'}</b>
                              <small data-testid={`text-access-email-${user.user_id}`}>{user.email}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="access-role-cell">
                            <span className={`access-role-dot ${user.role || 'none'}`} />
                            <div className="access-role-info">
                              <b data-testid={`text-access-role-${user.user_id}`}>{roleName(user.role, user.role_label)}</b>
                              <small>{user.has_profile ? 'Perfil de plataforma' : 'Sem perfil atribuído'}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          {user.has_profile && user.has_login_email
                            ? <span className={`access-status ${user.activo ? 'is-active' : 'is-inactive'}`} data-testid={`status-access-user-${user.user_id}`}><i />{user.activo ? 'Ativo' : 'Inativo'}</span>
                            : user.has_profile
                              ? <span className="access-status is-unassigned" data-testid={`status-access-user-${user.user_id}`}><i />E-mail pendente</span>
                            : <span className="access-status is-unassigned" data-testid={`status-access-user-${user.user_id}`}><i />Pendente</span>}
                        </td>
                        <td>
                          <div className="access-row-actions">
                            <label className="access-role-select-wrap">
                              <span className="sr-only">{user.has_profile ? 'Alterar perfil' : 'Perfil a atribuir'} de {user.name || user.email}</span>
                              <select
                                value={currentRole(user)}
                                onChange={(event) => updateSelectedRole(user, event.target.value)}
                                disabled={isPending}
                                aria-label={`${user.has_profile ? 'Alterar perfil' : 'Perfil a atribuir'} de ${user.name || user.email}`}
                                data-testid={`select-access-role-${user.user_id}`}
                              >
                                {ROLE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            {user.has_profile ? (
                              <>
                                {roleChanged && (
                                  <button
                                    type="button"
                                    className="access-button access-button-save"
                                    onClick={() => currentRole(user) === 'cliente'
                                      ? setAssignmentUser({ ...user, role: 'cliente' })
                                      : roleMutation.mutate({ userId: user.user_id, role: currentRole(user) })}
                                    disabled={isPending}
                                    data-testid={`button-save-role-${user.user_id}`}
                                  >
                                    {isPending ? <LoaderCircle size={14} className="access-spin" /> : <Check size={14} />}
                                    <span>Guardar</span>
                                  </button>
                                )}
                                  {user.role === 'cliente' && <button type="button" className="access-button access-button-edit-works" onClick={() => setAssignmentUser(user)} disabled={isPending} data-testid={`button-edit-client-works-${user.user_id}`}>Obras atribuídas</button>}
                                  <button
                                    type="button"
                                    className="access-button access-button-save"
                                    onClick={() => { setResetUser(user); setResetEmail(user.login_email); setResetPassword(''); setConfirmPassword(''); setPasswordFormError(''); passwordMutation.reset(); }}
                                    disabled={isPending}
                                    data-testid={`button-reset-password-${user.user_id}`}
                                  >
                                    <KeyRound size={14} /><span>Palavra-passe</span>
                                  </button>
                                  <button
                                  type="button"
                                  className={`access-button access-button-toggle ${user.activo ? 'deactivate' : 'reactivate'}`}
                                  onClick={() => handleToggleActive(user)}
                                  disabled={isPending}
                                    data-testid={`button-${user.activo ? 'deactivate' : 'reactivate'}-${user.user_id}`}
                                >
                                  {isPending ? <LoaderCircle size={14} className="access-spin" /> : user.activo ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                                  <span>{user.activo ? 'Desativar' : 'Reativar'}</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="access-button access-button-assign"
                                onClick={() => currentRole(user) === 'cliente'
                                  ? setAssignmentUser({ ...user, role: 'cliente' })
                                  : assignMutation.mutate({ userId: user.user_id, role: currentRole(user) })}
                                disabled={isPending}
                                data-testid={`button-assign-role-${user.user_id}`}
                              >
                                {isPending ? <LoaderCircle size={14} className="access-spin" /> : <UserRoundCheck size={14} />}
                                <span>{isPending ? 'A atribuir…' : 'Atribuir perfil'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="access-pagination">
              <span data-testid="text-access-range">
                {data.total_count === 0 ? '0 utilizadores' : `${offset + 1}–${offset + data.results.length} de ${data.total_count} utilizadores`}
              </span>
              <div className="access-pagination-controls">
                <button type="button" className="access-page-button" onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0 || listQuery.isFetching} aria-label="Página anterior" data-testid="button-access-previous">
                  <ArrowLeft size={15} /> <span>Anterior</span>
                </button>
                <span className="access-page-number" data-testid="text-access-current-page">{page} <i>/</i> {pageCount}</span>
                <button type="button" className="access-page-button" onClick={() => setOffset(offset + LIMIT)} disabled={offset + LIMIT >= data.total_count || listQuery.isFetching} aria-label="Página seguinte" data-testid="button-access-next">
                  <span>Seguinte</span> <ArrowRight size={15} />
                </button>
              </div>
            </footer>
          </>
        )}
        {listQuery.isFetching && !listQuery.isLoading && (
          <div className="access-refreshing" role="status" data-testid="status-access-refreshing"><LoaderCircle size={13} className="access-spin" /> A actualizar lista</div>
        )}
      </section>

      <aside className="access-note" data-testid="note-access-roles">
        <ShieldCheck size={17} />
        <p><b>Controlo de permissões</b><span>Desativar bloqueia o acesso sem eliminar a conta, o perfil ou o histórico de auditoria. O gestor pode criar contas e definir palavras-passe individuais.</span></p>
      </aside>
      {createOpen && <CreateUserDialog
        onClose={() => setCreateOpen(false)}
        works={worksQuery.data || []}
        worksLoading={worksQuery.isLoading}
        worksError={worksQuery.isError}
        retryWorks={() => worksQuery.refetch()}
        onSubmit={(form) => createMutation.mutate(form)}
        isPending={createMutation.isPending}
        error={createMutation.error instanceof Error ? createMutation.error.message : ''}
      />}
      {assignmentUser && <ClientAssignmentDialog
        user={assignmentUser}
        works={worksQuery.data || []}
        worksLoading={worksQuery.isLoading}
        worksError={worksQuery.isError}
        retryWorks={() => worksQuery.refetch()}
        isPending={assignMutation.isPending || roleMutation.isPending}
        error={(assignMutation.error || roleMutation.error) instanceof Error ? String((assignMutation.error || roleMutation.error)?.message) : ''}
        onClose={() => setAssignmentUser(null)}
        onSubmit={(obra_ids) => {
          const selectedRole = currentRole(assignmentUser);
          const mutation = assignmentUser.has_profile ? roleMutation : assignMutation;
          mutation.mutate({ userId: assignmentUser.user_id, role: selectedRole, obra_ids }, { onSuccess: () => setAssignmentUser(null) });
        }}
      />}
      {resetUser && <ResetPasswordDialog
        user={resetUser}
        email={resetEmail}
        password={resetPassword}
        confirmation={confirmPassword}
        error={passwordFormError || (passwordMutation.error instanceof Error ? passwordMutation.error.message : '')}
        isPending={passwordMutation.isPending}
        onEmailChange={setResetEmail}
        onPasswordChange={setResetPassword}
        onConfirmationChange={setConfirmPassword}
        onClose={() => setResetUser(null)}
        onSubmit={() => {
          setPasswordFormError('');
          if (resetPassword !== confirmPassword) {
            setPasswordFormError('As palavras-passe não coincidem.');
            return;
          }
          passwordMutation.mutate({ userId: resetUser.user_id, email: resetEmail.trim(), password: resetPassword });
        }}
      />}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  onSubmit,
  isPending,
  error,
  works,
  worksLoading,
  worksError,
  retryWorks,
}: {
  onClose: () => void;
  onSubmit: (data: { name: string; email: string; password: string; role: Role; obra_ids?: number[] }) => void;
  isPending: boolean;
  error: string;
  works: Obra[];
  worksLoading: boolean;
  worksError: boolean;
  retryWorks: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('consulta');
  const [obraIds, setObraIds] = useState<number[]>([]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-user-title">
        <header className="modal-head">
          <div><div className="eyebrow">ADMINISTRAÇÃO · EQUIPA</div><h2 id="create-user-title">Criar conta individual</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>
        <form onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name: name.trim(), email: email.trim(), password, role, ...(role === 'cliente' ? { obra_ids: obraIds } : {}) });
        }}>
          <div className="modal-fields">
            <label className="form-field"><span>Nome completo</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} autoComplete="name" required /></label>
            <label className="form-field"><span>E-mail</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" required /></label>
            <label className="form-field"><span>Palavra-passe inicial</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
            <label className="form-field"><span>Perfil de acesso</span><select value={role} onChange={(event) => setRole(event.target.value as Role)}>{ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            {role === 'cliente' && <WorkAssignmentPicker works={works} loading={worksLoading} hasError={worksError} retry={retryWorks} values={obraIds} onChange={setObraIds}/>}
          </div>
          {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="submit" disabled={isPending || (role === 'cliente' && (!obraIds.length || worksLoading || worksError))}>{isPending ? <LoaderCircle size={15} className="access-spin" /> : <Plus size={15} />}{isPending ? 'A criar…' : 'Criar conta'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function WorkAssignmentPicker({ works, loading, hasError, retry, values, onChange }: { works: Obra[]; loading: boolean; hasError: boolean; retry: () => void; values: number[]; onChange: (ids: number[]) => void }) {
  const toggle = (id: number) => onChange(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  return <fieldset className="client-assignment-picker"><legend>Obras atribuídas <i>*</i></legend><p>O cliente só poderá consultar as obras seleccionadas.</p>{loading ? <div className="assignment-loading">A carregar carteira de obras…</div> : hasError ? <div className="assignment-no-works">Não foi possível carregar as obras. <button type="button" onClick={retry}>Tentar novamente</button></div> : works.length ? <div className="assignment-work-list">{works.map(work => <label key={work.id} className="assignment-work"><input type="checkbox" checked={values.includes(work.id)} onChange={() => toggle(work.id)}/><span><b>{work.nome}</b><small>{work.referencia} · {work.municipio}, {work.provincia}</small></span></label>)}</div> : <div className="assignment-no-works">Não existem obras disponíveis para atribuição.</div>}{!loading && !hasError && works.length > 0 && !values.length && <small className="assignment-required">Seleccione pelo menos uma obra para esta conta.</small>}</fieldset>;
}

function ClientAssignmentDialog({ user, works, worksLoading, worksError, retryWorks, isPending, error, onClose, onSubmit }: { user: AccessUser; works: Obra[]; worksLoading: boolean; worksError: boolean; retryWorks: () => void; isPending: boolean; error: string; onClose: () => void; onSubmit: (ids: number[]) => void }) {
  const [selected, setSelected] = useState<number[]>(user.obra_ids || []);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal-card client-assign-modal" role="dialog" aria-modal="true" aria-labelledby="client-assignment-title">
      <header className="modal-head"><div><div className="eyebrow">ACESSO DO CLIENTE</div><h2 id="client-assignment-title">Obras atribuídas</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19}/></button></header>
      <p className="access-account">{user.name || user.email} · seleccione pelo menos uma obra.</p>
      <WorkAssignmentPicker works={works} loading={worksLoading} hasError={worksError} retry={retryWorks} values={selected} onChange={setSelected}/>
      {error&&<div className="form-error" role="alert"><AlertCircle size={16}/>{error}</div>}
      <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" type="button" disabled={isPending||worksLoading||worksError||selected.length===0} onClick={()=>onSubmit(selected)}>{isPending?<LoaderCircle size={15} className="access-spin"/>:<Check size={15}/>}Guardar atribuições</button></div>
    </section>
  </div>;
}

function ResetPasswordDialog({
  user,
  email,
  password,
  confirmation,
  error,
  isPending,
  onPasswordChange,
  onEmailChange,
  onConfirmationChange,
  onClose,
  onSubmit,
}: {
  user: AccessUser;
  email: string;
  password: string;
  confirmation: string;
  error: string;
  isPending: boolean;
  onPasswordChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <header className="modal-head">
          <div><div className="eyebrow">SEGURANÇA DA CONTA</div><h2 id="reset-password-title">Definir palavra-passe</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar"><X size={19} /></button>
        </header>
        <p className="access-account">{user.name} · {user.email}</p>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <div className="modal-fields">
            <label className="form-field"><span>E-mail de acesso</span><input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} maxLength={254} autoComplete="email" required /></label>
            <label className="form-field"><span>Nova palavra-passe</span><input type="password" value={password} onChange={(event) => onPasswordChange(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
            <label className="form-field"><span>Confirmar palavra-passe</span><input type="password" value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} minLength={8} autoComplete="new-password" required /></label>
          </div>
          {error && <div className="form-error" role="alert"><AlertCircle size={16} />{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={isPending}>{isPending ? <LoaderCircle size={15} className="access-spin" /> : <KeyRound size={15} />}{isPending ? 'A guardar…' : 'Guardar palavra-passe'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}