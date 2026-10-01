const FIELDS = ['id','nome','tipo','estado','provincia','zona','localidade','morada','telefone','website','notas','mapsQuery','appleName','applePlaceId','appleConfirmado','appleVerificadoEm','lat','lon','fonte','especialidade','actualizado','preco','acessibilidade'];
const ATTR_GROUPS = {
  cozinhas: ['portuguesa','regional','peixe','marisco','carne','grelhados','petiscos'],
  ambientes: ['clássico','casual','contemporâneo','romântico','familiar','grupo','tranquilo','animado'],
  ocasioes: ['almoço','jantar','date','família','grupo','negócios','celebração'],
  caracteristicas: ['esplanada','vista','histórico','hotel','cerveja','vinho','take-away','acessível']
};
const TYPES = ['clássico','date / contemporâneo','marisqueira','taberna','tasco','cervejaria','churrasqueira','restaurante','fine dining','hotel-restaurante','petiscos'];
const STATES = ['aberto','incerto','encerrado'];
let restaurants = [];
let selectedId = null;
let creating = false;
let dirty = false;

const $ = s => document.querySelector(s);
const form = $('#form');
const list = $('#list');
const fileInput = $('#fileInput');
const fileInput2 = $('#fileInput2');

function today(){ return new Date().toISOString().slice(0,10); }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function slugify(s=''){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45); }
function makeId(name){ let base=slugify(name)||'restaurante'; let id=base, n=2; while(restaurants.some(r=>r.id===id)) id=`${base}-${n++}`; return id; }
function setDirty(v=true){ dirty=v; $('#downloadBtn').disabled = !restaurants.length; }
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }

function normalize(raw){
  if(!Array.isArray(raw)) throw new Error('O ficheiro tem de conter um array de restaurantes.');
  return raw.map((r,i)=>{
    const o={}; FIELDS.forEach(k=>o[k]=r[k] ?? '');
    const a=r.atributos && typeof r.atributos==='object' ? r.atributos : {};
    o.atributos={}; Object.keys(ATTR_GROUPS).forEach(g=>o.atributos[g]=Array.isArray(a[g])?a[g].filter(v=>ATTR_GROUPS[g].includes(v)):[]);
    o.atributos.preco=a.preco||''; o.atributos.acessibilidade=a.acessibilidade||'';
    o.appleConfirmado = r.appleConfirmado === true || r.appleConfirmado === 'true';
    o.appleVerificadoEm = String(r.appleVerificadoEm || '').trim();
    o.id=String(o.id||makeId(o.nome||`restaurante-${i+1}`));
    o.nome=String(o.nome||'').trim();
    o.tipo=String(o.tipo||'restaurante').trim();
    o.estado=STATES.includes(o.estado)?o.estado:'incerto';
    return o;
  });
}

function validate(data=restaurants){
  const errors=[]; const ids=new Set();
  data.forEach((r,i)=>{
    if(!r.id) errors.push(`Registo ${i+1}: ID em falta.`);
    else if(ids.has(r.id)) errors.push(`ID duplicado: ${r.id}`); else ids.add(r.id);
    if(!r.nome) errors.push(`Registo ${i+1}: nome em falta.`);
    if(!STATES.includes(r.estado)) errors.push(`${r.nome||r.id}: estado inválido.`);
    if(r.website && !/^https?:\/\//i.test(r.website)) errors.push(`${r.nome}: website deve começar por http:// ou https://.`);
    if(r.appleConfirmado && !r.applePlaceId) errors.push(`${r.nome}: não podes confirmar Apple Maps sem Apple Place ID.`);
    if(r.appleConfirmado && r.applePlaceId && !r.appleVerificadoEm) errors.push(`${r.nome}: falta a data da confirmação Apple Maps.`);
    if(r.lat!=='' && !Number.isFinite(Number(r.lat))) errors.push(`${r.nome}: latitude inválida.`);
    if(r.lon!=='' && !Number.isFinite(Number(r.lon))) errors.push(`${r.nome}: longitude inválida.`);
    if(r.lat!=='' && (Number(r.lat)<-90 || Number(r.lat)>90)) errors.push(`${r.nome}: latitude fora do intervalo.`);
    if(r.lon!=='' && (Number(r.lon)<-180 || Number(r.lon)>180)) errors.push(`${r.nome}: longitude fora do intervalo.`);
    if(!r.atributos || typeof r.atributos!=='object') errors.push(`${r.nome}: atributos em falta.`);
    else { Object.entries(ATTR_GROUPS).forEach(([g,values])=>{ const vals=r.atributos[g]; if(!Array.isArray(vals)) errors.push(`${r.nome}: atributos.${g} inválido.`); else vals.forEach(v=>{ if(!values.includes(v)) errors.push(`${r.nome}: atributo inválido: ${g}/${v}.`); }); });
      if(r.atributos.preco && !['€','€€','€€€','€€€€'].includes(r.atributos.preco)) errors.push(`${r.nome}: faixa de preço inválida.`);
      if(r.atributos.acessibilidade && !['sim','parcial','não','desconhecida'].includes(r.atributos.acessibilidade)) errors.push(`${r.nome}: acessibilidade inválida.`);
    }
  });
  return errors;
}

function updateStats(){
  $('#count').textContent=restaurants.length;
  $('#openCount').textContent=restaurants.filter(r=>r.estado==='aberto').length;
  $('#missingCount').textContent=restaurants.filter(r=>!r.telefone||!r.website||!r.especialidade||!r.morada||r.lat===''||r.lon==='').length;
  const appleIds=restaurants.filter(r=>r.applePlaceId).length;
  const appleConfirmed=restaurants.filter(r=>r.applePlaceId && r.appleConfirmado===true).length;
  $('#appleIdCount').textContent=appleIds;
  $('#appleConfirmedCount').textContent=appleConfirmed;
}
function populateTypeFilters(){
  const values=[...new Set(restaurants.map(r=>r.tipo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt'));
  const current=$('#typeFilter').value;
  $('#typeFilter').innerHTML='<option value="">Todos os tipos</option>'+values.map(v=>`<option>${escapeHtml(v)}</option>`).join('');
  $('#typeFilter').value=current;
  $('#tipo').innerHTML=[...new Set([...TYPES,...values])].map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}
function renderTagControls(){
  Object.entries(ATTR_GROUPS).forEach(([group,values])=>{
    const host=$(`#tags-${group}`); if(!host) return;
    host.innerHTML=values.map(v=>`<label class="tag-option"><input type="checkbox" value="${escapeHtml(v)}"><span>${escapeHtml(v)}</span></label>`).join('');
  });
}

function renderList(){
  const q=$('#search').value.trim().toLowerCase(); const st=$('#stateFilter').value; const ty=$('#typeFilter').value;
  const filtered=restaurants.filter(r=>{
    const hay=[r.nome,r.localidade,r.zona,r.provincia,r.tipo,r.especialidade].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!st||r.estado===st)&&(!ty||r.tipo===ty);
  });
  list.innerHTML=filtered.length?filtered.map(r=>`<button class="item ${r.id===selectedId?'active':''}" data-id="${escapeHtml(r.id)}"><div class="name">${escapeHtml(r.nome||'(sem nome)')} <span class="badge ${r.estado==='encerrado'?'closed':r.estado==='incerto'?'uncertain':''}">${escapeHtml(r.estado)}</span></div><div class="meta">${escapeHtml([r.localidade,r.zona,r.tipo].filter(Boolean).join(' · '))}</div></button>`).join(''):'<div class="empty">Nenhum restaurante encontrado.</div>';
  list.querySelectorAll('.item').forEach(b=>b.addEventListener('click',()=>selectRestaurant(b.dataset.id)));
}
function fillForm(r){
  FIELDS.forEach(k=>{ const el=form.elements[k]; if(el) el.value=r[k] ?? ''; });
  const a=r.atributos||{};
  Object.keys(ATTR_GROUPS).forEach(g=>{ document.querySelectorAll(`#tags-${g} input`).forEach(cb=>{ cb.checked=(a[g]||[]).includes(cb.value); }); });
  form.elements.preco.value=a.preco||''; form.elements.acessibilidade.value=a.acessibilidade||'';
  form.elements.appleConfirmado.checked = r.appleConfirmado === true;
  form.elements.appleVerificadoEm.value = r.appleVerificadoEm || '';
  $('#formTitle').textContent=creating?'Novo restaurante':'Editar restaurante';
  $('#modeLabel').textContent=creating?'NOVO RESTAURANTE':'RESTAURANTE';
  $('#deleteBtn').hidden=creating;
  $('#duplicateBtn').hidden=creating;
  $('#notice').hidden=true;
  $('#validation').textContent=''; $('#validation').className='validation';
}
function selectRestaurant(id){
  const r=restaurants.find(x=>x.id===id); if(!r)return;
  selectedId=id; creating=false; form.hidden=false; $('#welcome').hidden=true; fillForm(r); renderList();
}
function newRestaurant(){
  creating=true; selectedId=null; form.hidden=false; $('#welcome').hidden=true;
  fillForm({id:makeId('novo restaurante'),nome:'',tipo:'restaurante',estado:'aberto',actualizado:today(),atributos:{cozinhas:[],ambientes:[],ocasioes:[],caracteristicas:[],preco:'',acessibilidade:''}});
  form.elements.nome.focus(); renderList();
}
function readForm(){
  const r={}; FIELDS.forEach(k=>{ const el=form.elements[k]; if(!el) return; r[k]=el.type==='checkbox' ? el.checked : String(el.value??'').trim(); });
  r.lat=r.lat===''?'':Number(r.lat); r.lon=r.lon===''?'':Number(r.lon);
  r.appleConfirmado=!!r.appleConfirmado;
  if(r.appleConfirmado && !r.appleVerificadoEm) r.appleVerificadoEm=today();
  if(!r.appleConfirmado) r.appleVerificadoEm='';
  r.atributos={}; Object.keys(ATTR_GROUPS).forEach(g=>{ r.atributos[g]=Array.from(document.querySelectorAll(`#tags-${g} input:checked`)).map(cb=>cb.value); });
  r.atributos.preco=r.preco||''; r.atributos.acessibilidade=r.acessibilidade||'';
  delete r.preco; delete r.acessibilidade;
  return r;
}
function saveForm(e){
  e.preventDefault(); const r=readForm();
  if($('#touchDate').checked) r.actualizado=today();
  const errors=validate([r]);
  if(errors.length){ $('#validation').textContent=errors[0]; $('#validation').className='validation error'; return; }
  if(creating){ if(restaurants.some(x=>x.id===r.id)){r.id=makeId(r.nome)} restaurants.push(r); selectedId=r.id; creating=false; toast('Restaurante criado.'); }
  else { const i=restaurants.findIndex(x=>x.id===selectedId); if(i<0)return; restaurants[i]=r; selectedId=r.id; toast('Alterações guardadas.'); }
  setDirty(); updateStats(); populateTypeFilters(); fillForm(restaurants.find(x=>x.id===selectedId)); renderList();
}
function duplicate(){
  const r=restaurants.find(x=>x.id===selectedId); if(!r)return;
  const copy=JSON.parse(JSON.stringify(r)); copy.id=makeId(r.nome+' copia'); copy.nome=r.nome+' — cópia'; copy.actualizado=today(); restaurants.push(copy); selectedId=copy.id; creating=false; setDirty(); updateStats(); populateTypeFilters(); fillForm(copy); renderList(); toast('Cópia criada.');
}
function remove(){
  const r=restaurants.find(x=>x.id===selectedId); if(!r)return;
  const ok=confirm(`Eliminar definitivamente “${r.nome}”?\n\nEsta ação só será aplicada ao JSON quando o exportares.`);
  if(!ok)return;
  restaurants=restaurants.filter(x=>x.id!==selectedId); selectedId=null; form.hidden=true; $('#welcome').hidden=false; setDirty(); updateStats(); populateTypeFilters(); renderList(); toast('Registo eliminado.');
}
function loadFile(file){
  if(!file)return; const reader=new FileReader(); reader.onload=()=>{try{const raw=JSON.parse(reader.result); const normalized=normalize(raw); const errors=validate(normalized); if(errors.length) throw new Error(errors.slice(0,5).join(' ')); restaurants=normalized; selectedId=null; creating=false; dirty=false; form.hidden=true; $('#welcome').hidden=false; updateStats(); populateTypeFilters(); renderList(); $('#downloadBtn').disabled=false; toast(`${restaurants.length} restaurantes carregados.`);}catch(err){alert('Não foi possível carregar o ficheiro.\n\n'+err.message);}}; reader.readAsText(file,'utf-8'); }
function openApple(){
  const r=readForm();
  const q = r.mapsQuery || [r.appleName || r.nome, r.morada, r.localidade, r.provincia].filter(Boolean).join(', ');
  const url = r.applePlaceId ? `https://maps.apple.com/place?place-id=${encodeURIComponent(r.applePlaceId)}` : `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
  window.open(url, '_blank', 'noopener');
}

function exportJson(){
  const errors=validate(); if(errors.length){alert('A base não pode ser exportada porque contém erros:\n\n'+errors.join('\n'));return;}
  const blob=new Blob([JSON.stringify(restaurants,null,2)+'\n'],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='restaurantes.json'; a.click(); URL.revokeObjectURL(url); dirty=false; toast('restaurantes.json exportado.');
}

renderTagControls();

fileInput.addEventListener('change',e=>loadFile(e.target.files[0])); fileInput2.addEventListener('change',e=>loadFile(e.target.files[0]));
$('#openAppleBtn').addEventListener('click',openApple);

async function autoLoad(){
  try {
    const response=await fetch('../data/restaurantes.json',{cache:'no-store'});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw=await response.json();
    const normalized=normalize(raw);
    const errors=validate(normalized);
    if(errors.length) throw new Error(errors.slice(0,5).join(' '));
    restaurants=normalized; selectedId=null; creating=false; dirty=false; form.hidden=true; $('#welcome').hidden=true;
    updateStats(); populateTypeFilters(); renderList(); $('#downloadBtn').disabled=false; $('#newBtn').disabled=false; toast(`${restaurants.length} restaurantes carregados automaticamente.`);
  } catch(err) {
    $('#notice').hidden=false; $('#notice').innerHTML='<strong>Base não carregada automaticamente.</strong> Usa “Carregar JSON” para escolher <code>data/restaurantes.json</code>.';
  }
}
autoLoad();
$('#search').addEventListener('input',renderList); $('#stateFilter').addEventListener('change',renderList); $('#typeFilter').addEventListener('change',renderList);
$('#newBtn').addEventListener('click',newRestaurant); $('#downloadBtn').addEventListener('click',exportJson); $('#duplicateBtn').addEventListener('click',duplicate); $('#deleteBtn').addEventListener('click',remove); $('#cancelBtn').addEventListener('click',()=>{form.hidden=true;$('#welcome').hidden=false;selectedId=null;creating=false;renderList();}); form.addEventListener('submit',saveForm);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
