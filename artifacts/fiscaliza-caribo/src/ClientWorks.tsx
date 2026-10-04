import { useState, type FormEvent, type ChangeEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListClientObras, getListClientObrasQueryKey, useGetClientObra, getGetClientObraQueryKey,
  useListObraActualizacoes, getListObraActualizacoesQueryKey, useCreateObraActualizacao,
  useCreateObraPhotoUploadUrl,
} from '@workspace/api-client-react';
import type { ActualizacaoObraInput, ActualizacaoObra, ClientObra } from '@workspace/api-client-react';
import { apiRequest } from './lib/auth-client';
import { AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Camera, CheckCircle2, MapPin, UploadCloud } from 'lucide-react';

const displayDate = (value?: string | null) => value
  ? new Intl.DateTimeFormat('pt-AO', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value))
  : 'Data por confirmar';

function ClientWorkCard({ work }: { work: ClientObra }) {
  return <Link href={`/obras/${work.id}`} className="client-work-card" data-testid={`link-client-work-${work.id}`}>
    <div className="client-card-top"><span className="client-reference">{work.referencia}</span><span className="client-status"><i />{work.estado_label}</span></div>
    <h2>{work.nome}</h2><p>{work.municipio}, {work.provincia}</p>
    <div className="client-progress-label"><span>Progresso da obra</span><b>{work.progresso}%</b></div>
    <div className="client-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={work.progresso}><span style={{ width: `${Math.max(0, Math.min(work.progresso, 100))}%` }} /></div>
    <div className="client-card-foot"><span>Actualizado {displayDate(work.actualizado_em)}</span><span className="client-open">Acompanhar <ArrowRight size={15}/></span></div>
  </Link>;
}

export function ClientWorksPage() {
  const q = useListClientObras();
  return <main className="client-portal">
    <header className="client-welcome"><div className="client-welcome-copy"><div className="client-kicker">CARIBO SJA <i/> ACOMPANHAMENTO DO CLIENTE</div><h1>As suas obras,<br/><em>em perspectiva.</em></h1><p>Acompanhe o progresso publicado pela equipa de campo, com informação clara e actualizada.</p></div><div className="client-welcome-stamp"><span>ANGOLA</span><b>Obras<br/>públicas</b><i>Informação de confiança, directamente do terreno.</i></div></header>
    {q.isLoading ? <div className="client-work-grid" aria-label="A carregar obras"><div className="client-skeleton"/><div className="client-skeleton"/></div>
      : q.isError ? <section className="client-state client-error"><AlertCircle/><h2>Não foi possível carregar as suas obras</h2><p>Verifique a ligação e tente novamente.</p><button className="btn btn-secondary" onClick={() => q.refetch()}>Tentar novamente</button></section>
      : q.data?.length ? <><div className="client-section-intro"><div><span className="client-kicker">CARTEIRA ATRIBUÍDA</span><h2>Obras acompanhadas</h2></div><span>{q.data.length} {q.data.length === 1 ? 'obra' : 'obras'}</span></div><section className="client-work-grid">{q.data.map(work => <ClientWorkCard key={work.id} work={work}/>)}</section></>
      : <section className="client-state"><span className="client-empty-mark"><MapPin/></span><h2>Sem obras atribuídas</h2><p>Quando a equipa responsável associar uma obra à sua conta, poderá acompanhá-la aqui.</p></section>}
  </main>;
}

function ProgressHistory({ obraId, canPublish }: { obraId: number; canPublish: boolean }) {
  const q = useListObraActualizacoes(obraId, { query: { queryKey: getListObraActualizacoesQueryKey(obraId) } });
  return <section className="progress-history" aria-labelledby="progress-history-heading">
    <header className="client-section-intro"><div><span className="client-kicker">REGISTO DE CAMPO</span><h2 id="progress-history-heading">Histórico de progresso</h2></div>{q.data && <span>{q.data.length} actualizações</span>}</header>
    {canPublish && <PublishUpdate obraId={obraId}/>}
    {q.isLoading ? <div className="client-history-skeleton"/> : q.isError
      ? <div className="client-inline-error" role="alert"><AlertCircle size={17}/><span>Não foi possível carregar o histórico.</span><button onClick={() => q.refetch()}>Tentar novamente</button></div>
      : q.data?.length ? <div className="timeline">{q.data.map((entry) => <article className="timeline-entry" key={entry.id}><span className="timeline-node"/><div className="timeline-card"><div className="timeline-heading"><div><span className="timeline-date"><CalendarDays size={14}/>{displayDate(entry.criado_em)}</span><h3>{entry.titulo}</h3></div><span className="timeline-progress">{entry.progresso}%</span></div><div className="client-progress-track"><span style={{width:`${Math.max(0,Math.min(entry.progresso,100))}%`}}/></div>{entry.descricao && <p>{entry.descricao}</p>}<div className="timeline-byline">Publicado por <b>{entry.autor}</b></div>{entry.fotos?.length > 0 && <div className="timeline-photos">{entry.fotos.map(photo=><a key={photo.id} href={photo.foto_url} target="_blank" rel="noreferrer" aria-label={`Abrir fotografia ${photo.nome_original}`}><img src={photo.foto_url} alt={photo.nome_original}/><span>{photo.nome_original}</span></a>)}</div>}</div></article>)}</div>
      : <div className="client-history-empty"><span className="timeline-node"/><div><b>Ainda não há actualizações publicadas</b><p>O registo de campo surgirá aqui assim que a equipa publicar o primeiro ponto de situação.</p></div></div>}
  </section>;
}

function PublishUpdate({ obraId }: { obraId: number }) {
  const create = useCreateObraActualizacao();
  const requestUpload = useCreateObraPhotoUploadUrl();
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    setError('');
    if (chosen.length > 6) { setError('Seleccione no máximo seis fotografias.'); event.target.value = ''; return; }
    if (chosen.some(file => !allowed.includes(file.type))) { setError('Utilize fotografias JPEG, PNG ou WebP.'); event.target.value = ''; return; }
    if (chosen.some(file => file.size > 10 * 1024 * 1024 || file.size < 1)) { setError('Cada fotografia deve ter até 10 MB.'); event.target.value = ''; return; }
    setFiles(chosen); setSuccess(false);
  };
  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setSuccess(false); setSubmitting(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const photos: NonNullable<ActualizacaoObraInput['fotos']> = [];
      for (let index=0; index<files.length; index++) {
        const file = files[index];
        setUploadStatus(`A carregar fotografia ${index + 1} de ${files.length}…`);
        const target = await requestUpload.mutateAsync({ obraId, data: { content_type: file.type as 'image/jpeg'|'image/png'|'image/webp', tamanho: file.size } });
        if (target.backend === 'object') {
          if (!target.upload_url || !target.object_path) throw new Error('O destino de carregamento não está disponível.');
          const upload = await fetch(target.upload_url, { method: 'PUT', headers: { 'Content-Type': target.content_type || file.type }, body: file });
          if (!upload.ok) throw new Error(`Não foi possível carregar ${file.name}.`);
          photos.push({ object_path: target.object_path, storage_backend: 'object', nome_original: file.name, content_type: file.type as 'image/jpeg'|'image/png'|'image/webp', tamanho: file.size });
        } else {
          const payload = new FormData(); payload.append('foto', file);
          const uploaded = await apiRequest<{object_path?:string;foto?:{object_path?:string}}> (`/api/obras/${obraId}/actualizacoes/upload-local`, { method: 'POST', body: payload });
          const path = uploaded.object_path || uploaded.foto?.object_path;
          if (!path) throw new Error(`O serviço não devolveu o caminho de ${file.name}.`);
          photos.push({ object_path: path, storage_backend: 'local', nome_original: file.name, content_type: file.type as 'image/jpeg'|'image/png'|'image/webp', tamanho: file.size });
        }
      }
      setUploadStatus('A publicar actualização…');
      const data: ActualizacaoObraInput = { titulo: String(form.get('titulo') || '').trim(), descricao: String(form.get('descricao') || '').trim(), progresso: Number(form.get('progresso')), ...(photos.length ? { fotos: photos } : {}) };
      await create.mutateAsync({ obraId, data });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListObraActualizacoesQueryKey(obraId) }),
        qc.invalidateQueries({ queryKey: getGetClientObraQueryKey(obraId) }),
        qc.invalidateQueries({ queryKey: getListClientObrasQueryKey() }),
      ]);
      formElement.reset(); setFiles([]); setSuccess(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível publicar a actualização.');
    } finally { setSubmitting(false); setUploadStatus(''); }
  };
  return <form className="publish-update" onSubmit={publish}><div className="publish-heading"><div><span className="client-kicker">NOVA NOTA DE CAMPO</span><h3>Publicar progresso</h3></div><span className="publish-secure"><CheckCircle2 size={14}/> Visível apenas a contas autorizadas</span></div><div className="publish-fields"><label className="form-field"><span>Título da actualização *</span><input name="titulo" maxLength={180} placeholder="Ex.: Conclusão da fundação do bloco A" required/></label><label className="form-field"><span>Progresso físico (%) *</span><input name="progresso" type="number" min="0" max="100" step="1" required placeholder="0"/></label><label className="form-field publish-description"><span>Descrição do trabalho realizado</span><textarea name="descricao" rows={3} placeholder="Descreva o que foi observado no terreno."/></label></div><label className="photo-picker"><UploadCloud size={18}/><span><b>Adicionar fotografias</b><small>JPEG, PNG ou WebP · até 10 MB por imagem · máximo 6</small></span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} aria-label="Seleccionar fotografias"/></label>{files.length>0&&<div className="selected-files"><Camera size={14}/>{files.map(file=>file.name).join(' · ')}</div>}{error&&<div className="form-error" role="alert"><AlertCircle size={15}/>{error}</div>}{success&&<div className="client-publish-success" role="status"><CheckCircle2 size={16}/> Actualização publicada e adicionada ao histórico.</div>}<div className="publish-actions">{uploadStatus&&<span role="status">{uploadStatus}</span>}<button className="btn btn-primary" type="submit" disabled={submitting}>{submitting?'A publicar…':'Publicar actualização'}</button></div></form>;
}

export function ClientWorkDetail({ id }: { id: string }) {
  const obraId = Number(id);
  const q = useGetClientObra(obraId, { query: { enabled: Number.isFinite(obraId) && obraId > 0, queryKey: getGetClientObraQueryKey(obraId) } });
  if (q.isLoading) return <div className="client-portal"><div className="client-skeleton client-skeleton-detail"/></div>;
  if (q.isError || !q.data) return <main className="client-portal"><Link href="/" className="client-back"><ArrowLeft size={15}/> As minhas obras</Link><section className="client-state client-error"><AlertCircle/><h2>Esta obra não está disponível</h2><p>Confirme se a obra está atribuída à sua conta e tente novamente.</p><button className="btn btn-secondary" onClick={()=>q.refetch()}>Tentar novamente</button></section></main>;
  const work=q.data;
  return <main className="client-portal client-detail-page"><Link href="/" className="client-back"><ArrowLeft size={15}/> As minhas obras</Link><section className="client-detail-hero"><div className="client-kicker">OBRA ATRIBUÍDA <i/> {work.referencia}</div><span className="client-status"><i/>{work.estado_label}</span><h1>{work.nome}</h1><p className="client-location"><MapPin size={16}/>{work.municipio}, {work.provincia}</p><div className="client-hero-progress"><div><span>Progresso global</span><strong>{work.progresso}%</strong></div><div className="client-progress-track"><span style={{width:`${Math.max(0,Math.min(work.progresso,100))}%`}}/></div></div></section><div className="client-detail-meta"><div><small>Início previsto</small><b>{displayDate(work.data_inicio)}</b></div><div><small>Prazo de conclusão</small><b>{displayDate(work.prazo_conclusao)}</b></div><div><small>Última actualização</small><b>{displayDate(work.actualizado_em)}</b></div></div>{work.descricao&&<section className="client-description"><span className="client-kicker">ENQUADRAMENTO</span><p>{work.descricao}</p></section>}<ProgressHistory obraId={obraId} canPublish={false}/></main>;
}

export function StaffProgressSection({ obraId, canPublish }: { obraId: number; canPublish: boolean }) {
  return <div className="staff-progress-section"><ProgressHistory obraId={obraId} canPublish={canPublish}/></div>;
}
