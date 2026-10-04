import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import {
  AlertCircle, AlertTriangle, ArrowRight,
  Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardCheck,
  Clock3, Coins, FileBarChart2, Filter, LayoutDashboard, MapPin,
  KeyRound, Menu, Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, TrendingUp,
  X, CircleDot, Pencil, Trash2, Users,
} from 'lucide-react';
import {
  useGetDashboard, getGetDashboardQueryKey, useListObras, getListObrasQueryKey,
  useCreateObra, useGetObra, getGetObraQueryKey, useUpdateObra, useDeleteObra,
  useListFiscalizacoes, getListFiscalizacoesQueryKey, useCreateFiscalizacao,
  useUpdateFiscalizacao, useDeleteFiscalizacao, useListOcorrencias,
  getListOcorrenciasQueryKey, useCreateOcorrencia, useUpdateOcorrencia,
  useDeleteOcorrencia,
} from '@workspace/api-client-react';
import { ClientWorksPage, ClientWorkDetail, StaffProgressSection } from './ClientWorks';
import ReportsPage from './ReportsPage';
import AccessManagementPage from './AccessManagementPage';
import { ChangePasswordDialog, SignInPage } from './AuthPages';
import { apiRequest, ApiRequestError, type AuthSession } from './lib/auth-client';
const qc = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

type Role = 'gestor' | 'fiscal' | 'consulta' | 'cliente';
type AccessProfile = {
  role: Role;
  role_label: string;
  can_manage_works: boolean;
  can_write_field_records: boolean;
  can_delete_field_records: boolean;
  can_publish_updates: boolean;
  is_client: boolean;
};
const AccessContext = createContext<AccessProfile | null>(null);
type SessionContextValue = {
  session?: AuthSession;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<SessionContextValue | null>(null);
function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('A sessão não está disponível.');
  return session;
}
function useAccess() {
  const access = useContext(AccessContext);
  if (!access) throw new Error('O perfil de acesso não está disponível.');
  return access;
}

type Obra = { id:number; referencia:string; nome:string; descricao:string; provincia:string; municipio:string; empreiteiro:string; valor_contrato:number; valor_pago:number; progresso:number; estado:string; data_inicio:string; prazo_conclusao:string; criado_em:string };
type Fiscalizacao = { id:number; obra_id:number; obra_nome:string; inspector:string; data_visita:string; progresso:number; qualidade:string; observacoes:string; proxima_visita:string|null; criado_em:string };
type Ocorrencia = { id:number; obra_id:number; obra_nome:string; titulo:string; descricao:string; gravidade:string; estado:string; data_registo:string; prazo_resolucao:string|null; criado_em:string };

const navItems = [
  { href:'/', label:'Visão geral', icon:LayoutDashboard },
  { href:'/obras', label:'Obras', icon:Building2 },
  { href:'/fiscalizacoes', label:'Fiscalizações', icon:ClipboardCheck },
  { href:'/ocorrencias', label:'Ocorrências', icon:ShieldAlert },
  { href:'/relatorios', label:'Relatórios', icon:FileBarChart2 },
];
const money = (v:number) => new Intl.NumberFormat('pt-AO',{style:'currency',currency:'AOA',maximumFractionDigits:0}).format(v).replace('AOA','Kz');
const date = (v?:string|null) => v ? new Intl.DateTimeFormat('pt-AO',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${v.slice(0,10)}T00:00:00`)) : '—';
const today = () => new Date().toISOString().slice(0,10);
const statusText:Record<string,string> = { ativa:'Em curso', em_curso:'Em curso', em_execucao:'Em curso', concluida:'Concluída', atrasada:'Atrasada', suspensa:'Suspensa', planeada:'Planeada', aberta:'Aberta', em_resolucao:'Em resolução', resolvida:'Resolvida', conforme:'Conforme', atencao:'Atenção', nao_conforme:'Não conforme', baixa:'Baixa', media:'Média', alta:'Alta', critica:'Crítica' };

function Layout({children}:{children:ReactNode}) {
  const [location] = useLocation();
  const [mobileOpen,setMobileOpen] = useState(false);
  const access=useAccess();
  const {session,signOut}=useSession();
  const [passwordDialogOpen,setPasswordDialogOpen]=useState(false);
  const visibleNavItems = access.role === 'cliente'
    ? [{ href:'/', label:'As minhas obras', icon:Building2 }]
    : access.role === 'gestor'
      ? [...navItems, { href:'/acessos', label:'Acessos', icon:Users }]
      : navItems;
  const fullName=session?.user?.name||session?.user?.email||'Utilizador';
  const initials=fullName.split(/[ .@_-]+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'CS';
  const active = visibleNavItems.find(n => n.href === location)?.label ?? (location.startsWith('/obras/') ? 'Obras' : '');
  return <div className="app-frame">
    <aside className={`sidebar ${mobileOpen?'sidebar-open':''}`}>
      <Link href="/" className="brand" data-testid="link-brand"><span className="brand-mark"><Building2 size={18} strokeWidth={1.8}/></span><span className="brand-copy"><b>CARIBO</b><small>SJA · Obras públicas</small></span></Link>
      <div className="side-overline">{access.role === 'cliente' ? 'PORTAL DO CLIENTE' : 'CENTRO DE OPERAÇÕES'}</div>
      <nav className="side-nav">{visibleNavItems.map(({href,label,icon:Icon})=><Link key={href} href={href} onClick={()=>setMobileOpen(false)} className={`nav-link ${active===label?'active':''}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ','-')}`}><Icon size={18}/><span>{label}</span>{label==='Ocorrências'&&<span className="nav-alert"><CircleDot size={7}/></span>}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="operation-status"><span className="pulse-dot"/><span><b>{access.role === 'cliente' ? 'Acesso protegido' : 'Operação activa'}</b><small>Luanda · Angola</small></span></div><div className="sidebar-foot">PLATAFORMA DE GESTÃO<br/>Versão operacional 1.0</div></div>
    </aside>
    {mobileOpen&&<button className="mobile-scrim" onClick={()=>setMobileOpen(false)} aria-label="Fechar menu"/>}
    <main className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Abrir menu"><Menu size={20}/></button><div className="crumb"><span>Caribo SJA</span><span className="crumb-slash">/</span><b>{active||'Visão geral'}</b></div><div className="topbar-right"><span className="date-chip"><CalendarDays size={15}/>{new Intl.DateTimeFormat('pt-AO',{weekday:'short',day:'2-digit',month:'long',year:'numeric'}).format(new Date())}</span><span className="profile-chip"><span className="avatar">{initials}</span><span><b>{fullName}</b><small>{access.role_label}</small></span></span><button className="change-password-button" onClick={()=>setPasswordDialogOpen(true)}><KeyRound size={14}/>Senha</button><button className="signout-button" onClick={()=>void signOut()}>Sair</button></div></header>
      <div className="page-wrap">{children}</div>
      <footer className="page-footer"><span>CARIBO SJA <i>·</i> Gestão de obras públicas</span><span>Angola <i>·</i> AOA / Kz</span></footer>
    </main>
    {passwordDialogOpen&&<ChangePasswordDialog onClose={()=>setPasswordDialogOpen(false)}/>}
  </div>;
}

function Heading({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
}
function Button({children,onClick,variant='primary',type='button',disabled=false}:{children:ReactNode;onClick?:()=>void;variant?:'primary'|'secondary'|'quiet'|'danger';type?:'button'|'submit';disabled?:boolean}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant}`} data-testid={`button-${String(children).replace(/[^a-zA-Z]+/g,'-').toLowerCase()}`}>{children}</button>;
}
function QueryState({loading,error,retry,children}:{loading:boolean;error:boolean;retry:()=>void;children:ReactNode}) {
  if(loading) return <div className="skeleton-stack" aria-label="A carregar"><div className="skeleton sk-wide"/><div className="skeleton sk-mid"/><div className="skeleton sk-table"/><div className="skeleton sk-table"/></div>;
  if(error) return <div className="state-panel error-panel"><span className="state-icon"><AlertCircle/></span><h3>Não foi possível carregar os dados</h3><p>Verifique a ligação ao serviço e tente novamente.</p><Button variant="secondary" onClick={retry}><RefreshCw size={15}/> Tentar novamente</Button></div>;
  return <>{children}</>;
}
function Empty({title,copy,action}:{title:string;copy:string;action?:ReactNode}) {
  return <div className="empty-state"><span className="empty-mark"><Building2 size={23}/></span><h3>{title}</h3><p>{copy}</p>{action}</div>;
}
function Badge({value}:{value:string}) {
  const cls = value==='critica'||value==='alta'||value==='atrasada'||value==='nao_conforme'?'red':value==='media'||value==='atencao'||value==='em_resolucao'?'amber':value==='resolvida'||value==='conforme'||value==='concluida'?'green':'neutral';
  return <span className={`badge badge-${cls}`}><span className="badge-dot"/>{statusText[value]||value}</span>;
}
function Progress({value}:{value:number}) { return <div className="progress-wrap"><div className="progress-track"><span style={{width:`${Math.min(value,100)}%`}}/></div><b>{value}%</b></div>; }
function DashboardPage() {
  const {can_manage_works}=useAccess();
  const q=useGetDashboard(); const d=q.data;
  const cards=d?[{label:'Obras registadas',value:d.total_obras,sub:`${d.obras_ativas} em curso`,icon:Building2,tone:'teal'},{label:'Com atraso',value:d.obras_atrasadas,sub:'Necessitam de atenção',icon:Clock3,tone:'red'},{label:'Progresso médio',value:`${d.progresso_medio}%`,sub:'Execução global',icon:TrendingUp,tone:'gold'},{label:'Ocorrências abertas',value:d.ocorrencias_abertas,sub:`${d.fiscalizacoes_mes} visitas este mês`,icon:AlertTriangle,tone:'blue'}]:[];
  return <QueryState loading={q.isLoading} error={!!q.error} retry={()=>q.refetch()}><>
    <Heading eyebrow="PAINEL DE CONTROLO · ANGOLA" title="Visão geral" description="O essencial para decidir o próximo passo no terreno." action={<span className="live-pill"><span/>Dados actualizados</span>}/>
    {d&&<><section className="metric-grid">{cards.map(({label,value,sub,icon:Icon,tone})=><article className={`metric-card metric-${tone}`} key={label}><div className="metric-top"><span>{label}</span><Icon size={18}/></div><div className="metric-value">{value}</div><div className="metric-sub">{sub}</div></article>)}</section>
    <section className="overview-lower"><article className="surface portfolio-card"><div className="section-head"><div><div className="eyebrow">EXECUÇÃO FINANCEIRA</div><h2>Investimento em curso</h2></div><Coins size={20}/></div><div className="finance-total">{money(d.valor_contratual)}</div><div className="muted-label">Valor contratual total</div><div className="finance-bar"><span style={{width:`${d.valor_contratual?Math.min(d.valor_pago/d.valor_contratual*100,100):0}%`}}/></div><div className="finance-legend"><span><i className="legend-dot paid"/>Pago <b>{money(d.valor_pago)}</b></span><span><i className="legend-dot remaining"/>Por executar</span></div><div className="finance-foot"><span>Taxa de execução financeira</span><b>{d.valor_contratual?Math.round(d.valor_pago/d.valor_contratual*100):0}%</b></div></article>
      <article className="surface attention-card"><div className="section-head"><div><div className="eyebrow">ACÇÃO PRIORITÁRIA</div><h2>Requer acompanhamento</h2></div><Link href="/ocorrencias" className="text-link">Ver todas <ArrowRight size={14}/></Link></div>{d.ocorrencias_criticas.length?d.ocorrencias_criticas.slice(0,3).map(o=><div className="attention-row" key={o.id}><span className="attention-icon"><AlertTriangle size={16}/></span><div className="attention-copy"><b>{o.titulo}</b><small>{o.obra_nome}</small></div><Badge value={o.gravidade}/></div>):<div className="calm-message"><CheckCircle2 size={19}/> Sem ocorrências críticas por tratar.</div>}</article></section>
    <section className="surface table-surface"><div className="section-head"><div><div className="eyebrow">ACOMPANHAMENTO DE PROJECTOS</div><h2>Obras em destaque</h2></div><Link href="/obras" className="text-link">Abrir registo <ArrowRight size={14}/></Link></div>{d.obras.length?<ObraTable obras={d.obras.slice(0,5)}/>:<Empty title="Sem obras registadas" copy="As obras aparecerão aqui assim que forem introduzidas no sistema." action={can_manage_works?<Link href="/obras/new" className="btn btn-primary">Registar obra</Link>:undefined}/>}</section>
    <section className="surface compact-activity"><div className="section-head"><div><div className="eyebrow">NO TERRENO</div><h2>Fiscalizações recentes</h2></div><Link href="/fiscalizacoes" className="text-link">Ver registo <ArrowRight size={14}/></Link></div>{d.fiscalizacoes_recentes.length?d.fiscalizacoes_recentes.slice(0,3).map(f=><div className="activity-row" key={f.id}><div className="activity-date">{date(f.data_visita)}</div><div className="activity-main"><b>{f.obra_nome}</b><small>{f.inspector} · {f.progresso}% de execução reportada</small></div><Badge value={f.qualidade}/></div>):<Empty title="Ainda sem visitas" copy="As visitas de campo registadas serão apresentadas nesta área."/>}</section></>}
  </></QueryState>;
}

function ObraTable({obras}:{obras:Obra[]}) {
  return <div className="table-scroll"><table><thead><tr><th>Obra / referência</th><th>Localização</th><th>Empreiteiro</th><th>Progresso</th><th>Estado</th><th>Prazo</th><th/></tr></thead><tbody>{obras.map(o=><tr key={o.id} data-testid={`row-obra-${o.id}`}><td><Link href={`/obras/${o.id}`} className="table-title"><b>{o.nome}</b><small>{o.referencia}</small></Link></td><td><span className="location-cell"><MapPin size={13}/>{o.municipio}, {o.provincia}</span></td><td>{o.empreiteiro}</td><td><Progress value={o.progresso}/></td><td><Badge value={o.estado}/></td><td>{date(o.prazo_conclusao)}</td><td><Link href={`/obras/${o.id}`} className="row-arrow" aria-label={`Abrir ${o.nome}`}><ArrowRight size={16}/></Link></td></tr>)}</tbody></table></div>;
}
function ObrasPage() {
  const {can_manage_works}=useAccess();
  const [search,setSearch]=useState('');const [status,setStatus]=useState('');
  const params=useMemo(()=>({search:search||undefined,status:status||undefined}),[search,status]);
  const q=useListObras(params);
  return <QueryState loading={q.isLoading} error={!!q.error} retry={()=>q.refetch()}><>
    <Heading eyebrow="CARTEIRA DE PROJECTOS" title="Obras" description="Pesquise, compare e acompanhe a execução dos projectos." action={can_manage_works?<Link href="/obras/new" className="btn btn-primary"><Plus size={17}/> Nova obra</Link>:undefined}/>
    <section className="surface register-surface"><div className="filter-bar"><label className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar obra, referência, município…" data-testid="input-search-obras"/></label><label className="filter-select"><Filter size={16}/><select value={status} onChange={e=>setStatus(e.target.value)} data-testid="select-status-obras"><option value="">Todos os estados</option><option value="ativa">Em curso</option><option value="atrasada">Atrasada</option><option value="concluida">Concluída</option><option value="suspensa">Suspensa</option><option value="planeada">Planeada</option></select><ChevronDown size={14}/></label><span className="result-count">{q.data?.length??0} registos</span></div>
    {q.data?.length?<ObraTable obras={q.data}/>:<Empty title={search||status?'Nenhum resultado encontrado':'Nenhuma obra registada'} copy={search||status?'Altere a pesquisa ou os filtros para encontrar outros projectos.':can_manage_works?'Comece por registar a primeira obra na carteira de projectos.':'Ainda não existem obras para consultar.'} action={!search&&!status&&can_manage_works?<Link href="/obras/new" className="btn btn-primary"><Plus size={16}/> Registar obra</Link>:undefined}/>}</section>
  </></QueryState>;
}

const input = (fd:FormData,key:string) => String(fd.get(key)||'');
function FormField({label,name,type='text',required=false,defaultValue,placeholder,step,min}:{label:string;name:string;type?:string;required?:boolean;defaultValue?:string|number;placeholder?:string;step?:string;min?:string}) {
  return <label className="form-field"><span>{label}{required&&<i> *</i>}</span><input name={name} type={type} required={required} defaultValue={defaultValue} placeholder={placeholder} step={step} min={min} data-testid={`input-${name}`}/></label>;
}
function ObraEditor({id}:{id?:string}) {
  const {can_manage_works}=useAccess();
  const existing=id?Number(id):undefined;
  const detail=useGetObra(existing||0,{query:{enabled:!!existing,queryKey:getGetObraQueryKey(existing||0)}});
  const create=useCreateObra();const update=useUpdateObra();const client=useQueryClient();const [,setLocation]=useLocation();
  const [error,setError]=useState('');
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setError('');const fd=new FormData(e.currentTarget);const body={referencia:input(fd,'referencia'),nome:input(fd,'nome'),descricao:input(fd,'descricao'),provincia:input(fd,'provincia'),municipio:input(fd,'municipio'),empreiteiro:input(fd,'empreiteiro'),valor_contrato:Number(input(fd,'valor_contrato')),valor_pago:Number(input(fd,'valor_pago')),progresso:Number(input(fd,'progresso')),estado:input(fd,'estado'),data_inicio:input(fd,'data_inicio'),prazo_conclusao:input(fd,'prazo_conclusao')};
    const done=(obra:Obra)=>{client.invalidateQueries({queryKey:getListObrasQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});if(existing)client.invalidateQueries({queryKey:getGetObraQueryKey(existing)});setLocation(`/obras/${obra.id}`)};
    if(existing)update.mutate({id:existing,data:body},{onSuccess:done,onError:()=>setError('Não foi possível guardar as alterações. Tente novamente.')});else create.mutate({data:body},{onSuccess:done,onError:()=>setError('Não foi possível registar a obra. Tente novamente.')});
  };
  if(!can_manage_works)return <div className="state-panel access-denied"><span className="state-icon"><ShieldAlert/></span><h3>Sem permissão para alterar obras</h3><p>O seu perfil permite consultar os projectos, mas não criar nem alterar os seus dados.</p><Link href={existing?`/obras/${existing}`:'/obras'} className="btn btn-secondary">Voltar às obras</Link></div>;
  if(existing&&detail.isLoading)return <div className="skeleton-stack"><div className="skeleton sk-wide"/><div className="skeleton sk-table"/></div>;
  if(existing&&detail.error)return <div className="state-panel error-panel"><h3>Obra não encontrada</h3><p>O registo solicitado não está disponível.</p><Link href="/obras" className="btn btn-secondary">Voltar às obras</Link></div>;
  const o=detail.data;
  return <><Heading eyebrow={existing?'DETALHE DO PROJECTO':'NOVO PROJECTO'} title={existing?'Editar obra':'Registar obra'} description="Dados técnicos, financeiros e de execução da empreitada." action={<Link href={existing?`/obras/${existing}`:'/obras'} className="btn btn-secondary"><X size={16}/> Cancelar</Link>}/>
    <form className="surface editor-form" onSubmit={save}><div className="form-section"><div className="form-section-title"><span className="section-number">01</span><div><h2>Identificação e localização</h2><p>Identificadores públicos e enquadramento territorial.</p></div></div><div className="form-grid"><FormField label="Referência" name="referencia" required defaultValue={o?.referencia} placeholder="Ex.: OBR-LDA-2025-014"/><FormField label="Nome da obra" name="nome" required defaultValue={o?.nome} placeholder="Designação do projecto"/><FormField label="Província" name="provincia" required defaultValue={o?.provincia} placeholder="Província"/><FormField label="Município" name="municipio" required defaultValue={o?.municipio} placeholder="Município"/><FormField label="Empreiteiro" name="empreiteiro" required defaultValue={o?.empreiteiro} placeholder="Empresa responsável"/><label className="form-field span-two"><span>Descrição</span><textarea name="descricao" defaultValue={o?.descricao} rows={3} placeholder="Âmbito e notas do projecto"/></label></div></div>
    <div className="form-section"><div className="form-section-title"><span className="section-number">02</span><div><h2>Execução e contrato</h2><p>Valores em kwanzas e calendário previsto.</p></div></div><div className="form-grid"><FormField label="Valor do contrato (Kz)" name="valor_contrato" type="number" min="0" step="any" required defaultValue={o?.valor_contrato}/><FormField label="Valor pago (Kz)" name="valor_pago" type="number" min="0" step="any" required defaultValue={o?.valor_pago??0}/><FormField label="Progresso (%)" name="progresso" type="number" min="0" step="1" required defaultValue={o?.progresso??0}/><label className="form-field"><span>Estado *</span><select name="estado" required defaultValue={o?.estado||'ativa'}><option value="ativa">Em curso</option><option value="planeada">Planeada</option><option value="atrasada">Atrasada</option><option value="suspensa">Suspensa</option><option value="concluida">Concluída</option></select></label><FormField label="Data de início" name="data_inicio" type="date" required defaultValue={o?.data_inicio?.slice(0,10)??today()}/><FormField label="Prazo de conclusão" name="prazo_conclusao" type="date" required defaultValue={o?.prazo_conclusao?.slice(0,10)}/></div></div>
    {error&&<div className="form-error"><AlertCircle size={16}/>{error}</div>}<div className="form-actions"><Link href={existing?`/obras/${existing}`:'/obras'} className="btn btn-secondary">Cancelar</Link><Button type="submit" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'A guardar…':<><Check size={16}/> Guardar obra</>}</Button></div></form>
  </>;
}
function ObraDetail({id}:{id:string}) {
  const {can_manage_works,can_publish_updates}=useAccess();
  const oid=Number(id);const q=useGetObra(oid);const del=useDeleteObra();const client=useQueryClient();const [,setLocation]=useLocation();
  if(q.isLoading)return <div className="skeleton-stack"><div className="skeleton sk-wide"/><div className="skeleton sk-table"/></div>;
  if(q.error||!q.data)return <div className="state-panel error-panel"><h3>Obra não encontrada</h3><p>Não foi possível localizar este projecto.</p><Link href="/obras" className="btn btn-secondary">Voltar ao registo</Link></div>;
  const o=q.data;return <><div className="detail-back"><Link href="/obras"><ArrowRight size={15}/> Voltar às obras</Link></div><Heading eyebrow={`${o.referencia} · ${o.provincia}`} title={o.nome} description={`${o.municipio} · Empreiteiro: ${o.empreiteiro}`} action={can_manage_works?<><Link href={`/obras/${o.id}/editar`} className="btn btn-secondary"><Pencil size={16}/> Editar</Link><Button variant="danger" onClick={()=>{if(confirm('Eliminar esta obra? Esta acção não pode ser anulada.'))del.mutate({id:o.id},{onSuccess:()=>{client.invalidateQueries({queryKey:getListObrasQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});setLocation('/obras')}})}}><Trash2 size={16}/> Eliminar</Button></>:undefined}/>
    <section className="detail-metrics"><div className="surface detail-metric"><small>Progresso físico</small><strong>{o.progresso}%</strong><Progress value={o.progresso}/></div><div className="surface detail-metric"><small>Valor contratual</small><strong>{money(o.valor_contrato)}</strong><span>Contrato</span></div><div className="surface detail-metric"><small>Valor pago</small><strong>{money(o.valor_pago)}</strong><span>{o.valor_contrato?Math.round(o.valor_pago/o.valor_contrato*100):0}% do contrato</span></div><div className="surface detail-metric"><small>Estado actual</small><strong><Badge value={o.estado}/></strong><span>Prazo: {date(o.prazo_conclusao)}</span></div></section>
     <section className="surface detail-description"><div className="eyebrow">ENQUADRAMENTO</div><h2>Sobre esta obra</h2><p>{o.descricao||'Sem descrição complementar registada.'}</p><div className="detail-info-grid"><div><small>Início previsto</small><b>{date(o.data_inicio)}</b></div><div><small>Prazo de conclusão</small><b>{date(o.prazo_conclusao)}</b></div><div><small>Registada em</small><b>{date(o.criado_em)}</b></div></div></section><StaffProgressSection obraId={o.id} canPublish={can_publish_updates}/>
  </>;
}

function FiscalizacoesPage() {
  const {can_write_field_records,can_delete_field_records}=useAccess();
  const canWrite=can_write_field_records;
  const q=useListFiscalizacoes();const obras=useListObras();const create=useCreateFiscalizacao();const update=useUpdateFiscalizacao();const del=useDeleteFiscalizacao();const client=useQueryClient();const [edit,setEdit]=useState<Fiscalizacao|null>(null);const [show,setShow]=useState(false);const [error,setError]=useState('');
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const body={obra_id:Number(input(fd,'obra_id')),inspector:input(fd,'inspector'),data_visita:input(fd,'data_visita'),progresso:Number(input(fd,'progresso')),qualidade:input(fd,'qualidade') as 'conforme'|'atencao'|'nao_conforme',observacoes:input(fd,'observacoes'),proxima_visita:input(fd,'proxima_visita')||null};const done=()=>{client.invalidateQueries({queryKey:getListFiscalizacoesQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});setShow(false);setEdit(null);setError('')};if(edit)update.mutate({id:edit.id,data:body},{onSuccess:done,onError:()=>setError('Falha ao actualizar a visita.')});else create.mutate({data:body},{onSuccess:done,onError:()=>setError('Falha ao registar a visita.')})};
  return <><Heading eyebrow="ACOMPANHAMENTO DE CAMPO" title="Fiscalizações" description="Registo de visitas, progresso observado e conformidade da execução." action={canWrite?<Button onClick={()=>{setEdit(null);setShow(true);setError('')}}><Plus size={17}/> Registar visita</Button>:undefined}/>
    <QueryState loading={q.isLoading} error={!!q.error} retry={()=>q.refetch()}><section className="surface register-surface">{q.data?.length?<div className="table-scroll"><table><thead><tr><th>Obra</th><th>Inspector</th><th>Data da visita</th><th>Progresso</th><th>Qualidade</th><th>Próxima visita</th>{canWrite&&<th>Acções</th>}</tr></thead><tbody>{q.data.map(f=><tr key={f.id}><td><Link href={`/obras/${f.obra_id}`} className="table-title"><b>{f.obra_nome}</b><small>Visita #{String(f.id).padStart(3,'0')}</small></Link></td><td>{f.inspector}</td><td>{date(f.data_visita)}</td><td><Progress value={f.progresso}/></td><td><Badge value={f.qualidade}/></td><td>{date(f.proxima_visita)}</td>{canWrite&&<td className="row-actions"><button onClick={()=>{setEdit(f);setShow(true)}} aria-label="Editar fiscalização"><Pencil size={15}/></button>{can_delete_field_records&&<button onClick={()=>{if(confirm('Eliminar esta fiscalização?'))del.mutate({id:f.id},{onSuccess:()=>{client.invalidateQueries({queryKey:getListFiscalizacoesQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()})}})}} aria-label="Eliminar fiscalização"><Trash2 size={15}/></button>}</td>}</tr>)}</tbody></table></div>:<Empty title="Sem fiscalizações registadas" copy="As visitas de campo registadas serão apresentadas aqui." action={canWrite?<Button onClick={()=>setShow(true)}><Plus size={16}/> Registar visita</Button>:undefined}/>}</section></QueryState>
    {show&&<Modal title={edit?'Editar visita de campo':'Nova fiscalização'} close={()=>{setShow(false);setEdit(null)}}><form onSubmit={save}><div className="modal-fields"><label className="form-field"><span>Obra *</span><select name="obra_id" required defaultValue={edit?.obra_id??''}><option value="" disabled>Seleccionar obra</option>{obras.data?.map(o=><option key={o.id} value={o.id}>{o.referencia} — {o.nome}</option>)}</select></label><FormField label="Inspector" name="inspector" required defaultValue={edit?.inspector} placeholder="Nome do inspector"/><FormField label="Data da visita" name="data_visita" type="date" required defaultValue={edit?.data_visita?.slice(0,10)??today()}/><FormField label="Progresso observado (%)" name="progresso" type="number" min="0" step="1" required defaultValue={edit?.progresso??0}/><label className="form-field"><span>Qualidade *</span><select name="qualidade" defaultValue={edit?.qualidade??'conforme'}><option value="conforme">Conforme</option><option value="atencao">Atenção</option><option value="nao_conforme">Não conforme</option></select></label><FormField label="Próxima visita" name="proxima_visita" type="date" defaultValue={edit?.proxima_visita?.slice(0,10)}/><label className="form-field span-two"><span>Observações</span><textarea name="observacoes" rows={3} defaultValue={edit?.observacoes} placeholder="Constatações da visita"/></label></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><Button variant="secondary" onClick={()=>{setShow(false);setEdit(null)}}>Cancelar</Button><Button type="submit" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'A guardar…':'Guardar visita'}</Button></div></form></Modal>}
  </>;
}
function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}) { return <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="modal-card" role="dialog" aria-modal="true" aria-label={title}><header className="modal-head"><div><div className="eyebrow">REGISTO OPERACIONAL</div><h2>{title}</h2></div><button className="icon-button" onClick={close} aria-label="Fechar"><X size={19}/></button></header>{children}</section></div>; }

function OcorrenciasPage() {
  const {can_write_field_records,can_delete_field_records}=useAccess();
  const canWrite=can_write_field_records;
  const q=useListOcorrencias();const obras=useListObras();const create=useCreateOcorrencia();const update=useUpdateOcorrencia();const del=useDeleteOcorrencia();const client=useQueryClient();const [show,setShow]=useState(false);const [editing,setEditing]=useState<Ocorrencia|null>(null);const [filter,setFilter]=useState('');const [error,setError]=useState('');
  const rows=(q.data||[]).filter(o=>!filter||o.estado===filter);
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const fd=new FormData(e.currentTarget);const body={obra_id:Number(input(fd,'obra_id')),titulo:input(fd,'titulo'),descricao:input(fd,'descricao'),gravidade:input(fd,'gravidade') as 'baixa'|'media'|'alta'|'critica',estado:input(fd,'estado') as 'aberta'|'em_resolucao'|'resolvida',data_registo:input(fd,'data_registo'),prazo_resolucao:input(fd,'prazo_resolucao')||null};const done=()=>{client.invalidateQueries({queryKey:getListOcorrenciasQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()});setShow(false);setEditing(null);setError('')};if(editing)update.mutate({id:editing.id,data:body},{onSuccess:done,onError:()=>setError('Não foi possível actualizar a ocorrência.')});else create.mutate({data:body},{onSuccess:done,onError:()=>setError('Não foi possível registar a ocorrência.')})};
  return <><Heading eyebrow="GESTÃO DE RISCO E PENDÊNCIAS" title="Ocorrências" description="Problemas que exigem resolução, responsáveis e prazos acompanhados." action={canWrite?<Button onClick={()=>{setEditing(null);setShow(true);setError('')}}><Plus size={17}/> Nova ocorrência</Button>:undefined}/>
    <QueryState loading={q.isLoading} error={!!q.error} retry={()=>q.refetch()}><><div className="issue-summary"><span className="summary-icon"><AlertTriangle size={19}/></span><div><b>{q.data?.filter(o=>o.estado!=='resolvida').length??0}</b><small>ocorrências por resolver</small></div><div className="summary-divider"/><div className="issue-summary-copy">Priorize os itens de maior gravidade e acompanhe a data-limite de resolução.</div><label className="filter-select"><SlidersHorizontal size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="">Todos os estados</option><option value="aberta">Abertas</option><option value="em_resolucao">Em resolução</option><option value="resolvida">Resolvidas</option></select><ChevronDown size={14}/></label></div>
     <div className="issue-list">{rows.length?rows.map(o=><article className="issue-card" key={o.id}><div className={`severity-mark severity-${o.gravidade}`}/><div className="issue-content"><div className="issue-topline"><Badge value={o.gravidade}/><span className="issue-date">Registada em {date(o.data_registo)}</span></div><h3>{o.titulo}</h3><p>{o.descricao}</p><div className="issue-meta"><Link href={`/obras/${o.obra_id}`}><Building2 size={14}/>{o.obra_nome}</Link><span><CalendarDays size={14}/>Prazo: {date(o.prazo_resolucao)}</span></div></div><div className="issue-controls">{canWrite?<label className="state-control"><span>Estado</span><select value={o.estado} onChange={e=>update.mutate({id:o.id,data:{estado:e.target.value as 'aberta'|'em_resolucao'|'resolvida'}},{onSuccess:()=>{client.invalidateQueries({queryKey:getListOcorrenciasQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()})}})}><option value="aberta">Aberta</option><option value="em_resolucao">Em resolução</option><option value="resolvida">Resolvida</option></select></label>:<div className="state-control"><span>Estado</span><Badge value={o.estado}/></div>}{canWrite&&<div className="row-actions"><button onClick={()=>{setEditing(o);setShow(true)}} aria-label="Editar ocorrência"><Pencil size={15}/></button>{can_delete_field_records&&<button onClick={()=>{if(confirm('Eliminar esta ocorrência?'))del.mutate({id:o.id},{onSuccess:()=>{client.invalidateQueries({queryKey:getListOcorrenciasQueryKey()});client.invalidateQueries({queryKey:getGetDashboardQueryKey()})}})}} aria-label="Eliminar ocorrência"><Trash2 size={15}/></button>}</div>}</div></article>):<div className="surface"><Empty title={filter?'Sem ocorrências neste estado':'Sem ocorrências registadas'} copy={filter?'Seleccione outro estado para consultar ocorrências.':canWrite?'Não há problemas registados. Crie uma ocorrência quando for necessário acompanhamento.':'Não há ocorrências registadas para consultar.'} action={!filter&&canWrite?<Button onClick={()=>setShow(true)}><Plus size={16}/> Nova ocorrência</Button>:undefined}/></div>}</div></></QueryState>
    {show&&<Modal title={editing?'Editar ocorrência':'Registar ocorrência'} close={()=>{setShow(false);setEditing(null)}}><form onSubmit={save}><div className="modal-fields"><label className="form-field span-two"><span>Obra *</span><select name="obra_id" required defaultValue={editing?.obra_id??''}><option value="" disabled>Seleccionar obra</option>{obras.data?.map(o=><option key={o.id} value={o.id}>{o.referencia} — {o.nome}</option>)}</select></label><FormField label="Título" name="titulo" required defaultValue={editing?.titulo} placeholder="Resumo do problema"/><label className="form-field"><span>Gravidade *</span><select name="gravidade" defaultValue={editing?.gravidade??'media'}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label><label className="form-field"><span>Estado *</span><select name="estado" defaultValue={editing?.estado??'aberta'}><option value="aberta">Aberta</option><option value="em_resolucao">Em resolução</option><option value="resolvida">Resolvida</option></select></label><FormField label="Data de registo" name="data_registo" type="date" required defaultValue={editing?.data_registo?.slice(0,10)??today()}/><FormField label="Prazo de resolução" name="prazo_resolucao" type="date" defaultValue={editing?.prazo_resolucao?.slice(0,10)}/><label className="form-field span-two"><span>Descrição</span><textarea name="descricao" rows={3} defaultValue={editing?.descricao} placeholder="Descreva a situação observada"/></label></div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><Button variant="secondary" onClick={()=>{setShow(false);setEditing(null)}}>Cancelar</Button><Button type="submit" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'A guardar…':'Guardar ocorrência'}</Button></div></form></Modal>}
  </>;
}

function RelatoriosPage() {
  return <ReportsPage />;
}
function NotFound() { return <div className="state-panel"><span className="state-icon"><MapPin/></span><h3>Página não encontrada</h3><p>O endereço solicitado não corresponde a uma área disponível.</p><Link href="/" className="btn btn-primary">Ir para visão geral</Link></div>; }

function AccessManagementRoute() {
  const access = useAccess();
  return access.role === 'gestor' ? <AccessManagementPage/> : <NotFound/>;
}
function Router() {
  const access = useAccess();
  if (access.role === 'cliente') return <Layout><Switch><Route path="/" component={ClientWorksPage}/><Route path="/obras/:id">{params => <ClientWorkDetail id={params.id}/>}</Route><Route component={NotFound}/></Switch></Layout>;
  return <Layout><Switch><Route path="/" component={DashboardPage}/><Route path="/obras" component={ObrasPage}/><Route path="/obras/new" component={()=> <ObraEditor/>}/><Route path="/obras/:id/editar">{params=><ObraEditor id={params.id}/>}</Route><Route path="/obras/:id">{params=><ObraDetail id={params.id}/>}</Route><Route path="/fiscalizacoes" component={FiscalizacoesPage}/><Route path="/ocorrencias" component={OcorrenciasPage}/><Route path="/relatorios" component={RelatoriosPage}/><Route path="/acessos" component={AccessManagementRoute}/><Route component={NotFound}/></Switch></Layout>;
}

async function loadAccessProfile(): Promise<AccessProfile> {
  return apiRequest<AccessProfile>('/api/me');
}

function AuthLoading({ message = 'A preparar o acesso…' }: { message?: string }) {
  return <main className="auth-screen"><div className="auth-loading"><span className="pulse-dot"/><p>{message}</p></div></main>;
}

function PublicLandingPage() {
  return <main className="landing-page">
    <header className="landing-header">
      <Link href="/" className="brand" aria-label="Caribo SJA — início"><span className="brand-mark"><Building2 size={18} strokeWidth={1.8}/></span><span className="brand-copy"><b>CARIBO</b><small>SJA · Obras públicas</small></span></Link>
      <div className="landing-actions"><Link href="/sign-in" className="btn btn-primary">Iniciar sessão <ArrowRight size={16}/></Link></div>
    </header>
    <section className="landing-hero">
      <div className="landing-copy"><div className="eyebrow">PLATAFORMA DE OPERAÇÕES · ANGOLA</div><h1>Obras públicas, acompanhadas com clareza.</h1><p>Um espaço seguro para consultar a carteira de projectos, registar visitas de fiscalização e acompanhar a resolução de ocorrências.</p><div className="landing-actions landing-hero-actions"><Link href="/sign-in" className="btn btn-primary">Aceder à plataforma <ArrowRight size={16}/></Link><span>Contas individuais criadas por um gestor</span></div></div>
      <div className="landing-visual" aria-hidden="true"><div className="landing-orbit orbit-one"/><div className="landing-orbit orbit-two"/><div className="landing-card"><div className="landing-card-top"><span className="live-pill"><span/>GESTÃO DE OBRAS</span><Building2 size={21}/></div><div className="landing-card-line line-wide"/><div className="landing-card-line line-short"/><div className="landing-progress"><span/></div><div className="landing-card-bottom"><span>Execução física</span><b>Controlada</b></div></div><div className="landing-stamp"><ShieldAlert size={17}/><span>Dados protegidos<br/><b>por perfil de acesso</b></span></div></div>
    </section>
    <footer className="landing-footer"><span>CARIBO SJA <i>·</i> Gestão e fiscalização de obras</span><span>Luanda · Angola</span></footer>
  </main>;
}

function AccessPendingPage({ message }: { message: string }) {
  const { session, signOut } = useSession();
  return <main className="auth-screen"><section className="access-pending surface">
    <span className="state-icon"><ShieldAlert/></span><div className="eyebrow">PERFIL DE ACESSO</div><h1>Acesso ainda não atribuído</h1>
    <p>{message}</p><p className="access-account">{session?.user?.email || 'Conta autenticada'}</p>
    <p>Peça a um gestor para rever o seu perfil de acesso ou o estado da conta.</p>
    <button className="btn btn-secondary" onClick={()=>void signOut()}>Terminar sessão</button>
  </section></main>;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const query = useQuery({
    queryKey: ['auth-session'],
    queryFn: () => apiRequest<AuthSession>('/api/auth/session'),
    retry: false,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
  const previousUserId = useRef<number | null | undefined>(undefined);
  const currentUserId = query.data?.authenticated ? query.data.user?.id ?? null : null;

  useEffect(() => {
    const previous = previousUserId.current;
    if (previous !== undefined && previous !== null && previous !== currentUserId) {
      queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== 'auth-session' });
    }
    previousUserId.current = currentUserId;
  }, [currentUserId, queryClient]);

  const refresh = async () => {
    const result = await query.refetch();
    if (result.error) throw result.error;
  };
  const signOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== 'auth-session' });
    queryClient.setQueryData<AuthSession>(['auth-session'], { authenticated: false });
    setLocation('/sign-in');
  };

  const value = useMemo<SessionContextValue>(() => ({
    session: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refresh,
    signOut,
  }), [query.data, query.error, query.isLoading, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

function AuthenticatedApp() {
  const { session, signOut } = useSession();
  const [location] = useLocation();
  const userId = session?.user?.id;
  const accessQuery = useQuery({
    queryKey: ['access-profile', userId],
    queryFn: loadAccessProfile,
    enabled: Boolean(userId),
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
  });

  if (accessQuery.isLoading) return <AuthLoading message="A confirmar as permissões da conta…"/>;
  if (accessQuery.isError) {
    const error = accessQuery.error;
    if (error instanceof ApiRequestError && error.status === 403) {
      return <AccessPendingPage message={error.message}/>;
    }
    if (error instanceof ApiRequestError && error.status === 401) {
      return <main className="auth-screen"><section className="access-pending surface"><h1>A sessão expirou</h1><p>Inicie sessão novamente para continuar.</p><button className="btn btn-secondary" onClick={()=>void signOut()}>Voltar a entrar</button></section></main>;
    }
    return <main className="auth-screen"><section className="access-pending surface"><h1>Não foi possível validar o perfil</h1><p>Verifique a ligação ao serviço e tente novamente.</p><button className="btn btn-secondary" onClick={()=>accessQuery.refetch()}>Tentar novamente</button></section></main>;
  }
  if (!accessQuery.data) return <AuthLoading message="A confirmar as permissões da conta…"/>;
  return <AccessContext.Provider value={accessQuery.data}><Router/></AccessContext.Provider>;
}

function AuthRoutes() {
  const auth = useSession();
  const [location] = useLocation();
  if (auth.isLoading) return <AuthLoading/>;
  if (auth.error) {
    return <main className="auth-screen"><section className="access-pending surface"><h1>Não foi possível validar a sessão</h1><p>Verifique a ligação ao serviço e tente novamente.</p><button className="btn btn-secondary" onClick={()=>void auth.refresh()}>Tentar novamente</button></section></main>;
  }
  if (location.startsWith('/sign-in')) {
    return auth.session?.authenticated
      ? <Redirect to="/"/>
      : <SignInPage onAuthenticated={auth.refresh}/>;
  }
  if (location.startsWith('/sign-up')) {
    return <Redirect to={auth.session?.authenticated ? '/' : '/sign-in'}/>;
  }
  if (auth.session?.authenticated) return <AuthenticatedApp/>;
  return location === '/' ? <PublicLandingPage/> : <Redirect to="/sign-in"/>;
}

function App() {
  return <WouterRouter base={basePath}>
    <QueryClientProvider client={qc}>
      <SessionProvider><AuthRoutes/></SessionProvider>
    </QueryClientProvider>
  </WouterRouter>;
}
export default App;
