import K from './engine';
import { log, registrarEstado, descreverErro } from './log';
import { agruparOfertas, alternativas, motivosDoPlano, planejar, type EntradaPlano, type ItemPlano } from './planejador';
import { conferirComHistorico, faltaCursar, integralizado, reduzRequisito, situacao } from './requisitos';
import { obterSolver } from './solver';

/* ---------- Estado ---------- */
const DEFAULT_PREF = { campusUnico: false, campus: 'CURITIBA', turnos: ['M', 'T', 'N'], janela: { ...K.JANELA_INTEIRA }, cargaMin: 4, cargaMax: 7, preferenciaTrilhas: [], eletivaManual: 0 };
let S: any = null;          // estado persistido
let D: any = {};            // derivado (não persistido)
const MAXSEM = 14;          // horizonte máximo de semestres projetados

function novoEstado() {
    return {
        fase: 'upload', files: { matriz: null, historico: null, gnh: null }, parsed: { matriz: null, historico: null, gnh: null }, ofertas: {},
        equivalencias: {}, divergPendentes: [], preferencias: structuredClone(DEFAULT_PREF), bloqueios: {}, trabalho: {}, trabPresets: [],
        trabRascunho: {}, bloqRascunho: {},
        escolhas: {}, custom: {}, editor: null, manuais: { estagios: {}, eletiva: { porSem: {} }, extensao: { porSem: {} }, enade: { done: false, sem: null } },
        abaAtiva: 0, sidebarCollapsed: false, prefsOpen: false
    };
}
function salvar() {
    try { const c = structuredClone(S); delete c.files; delete c.trabPresets; localStorage.setItem('compass_state', JSON.stringify(c)); salvarPresets(); }
    catch (e) { console.warn(e); log('estado.salvar.falha', descreverErro(e), 'error'); }
    registrarEstado(S);
}
function carregar() {
    try {
        const r = localStorage.getItem('compass_state'); if (!r) return null; const o = JSON.parse(r); o.files = { matriz: null, historico: null, gnh: null }; if (Array.isArray(o.bloqueios)) o.bloqueios = {}; if (!o.trabalho) o.trabalho = {}; if (!Array.isArray(o.trabPresets)) o.trabPresets = []; if (!o.trabRascunho) o.trabRascunho = {}; if (!o.bloqRascunho) o.bloqRascunho = {};
        for (const k in o.trabalho) { o.trabalho[k] = K.normTrab(o.trabalho[k]); }   // migra estados antigos (campos novos)
        o.trabPresets.forEach(p => { p.cfg = K.normTrab(p.cfg); });
        // migra itens manuais acumulativos (eletiva/extensão) p/ o modelo por-semestre {porSem:{idx:horas}}
        if (o.manuais) ['eletiva', 'extensao'].forEach(k => {
            const it = o.manuais[k]; if (!it) { o.manuais[k] = { porSem: {} }; return; }
            if (!it.porSem) { it.porSem = {}; if (+it.h > 0) it.porSem[it.sem == null ? 0 : it.sem] = +it.h; delete it.h; delete it.sem; }
        });
        descartarLeituraInvalida(o);
        return o;
    } catch (e) { log('estado.carregar.falha', descreverErro(e), 'error'); return null; }
}
/** Problemas que impedem reaproveitar a leitura salva: matriz reprovada em `verificarMatriz` ou lida por versão sem os conjuntos do histórico. */
function problemasDaLeituraSalva(parsed): string[] {
    const v = K.verificarMatriz(parsed.matriz);
    const problemas = v.ok ? [] : v.problemas;
    if (!parsed.historico || !parsed.historico.resumoOptativas || (parsed.matriz.resumo || {}).trilhas === undefined)
        problemas.push('leitura salva por uma versão sem os conjuntos optativos do histórico');
    return problemas;
}
/** Sessão salva com leitura inválida volta ao upload (preferências, trabalho e escolhas ficam). */
function descartarLeituraInvalida(o) {
    if (!o.parsed || !o.parsed.matriz) return;
    const problemas = problemasDaLeituraSalva(o.parsed);
    if (!problemas.length) return;
    log('estado.leitura_invalida', { problemas }, 'warn');
    o.parsed = { matriz: null, historico: null, gnh: null };
    o.fase = 'upload';
}
// Configurações de trabalho: chave dedicada, durável — sobrevive ao "Reiniciar tudo"
const PRESETS_KEY = 'compass_trab_presets';
function salvarPresets() { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(S.trabPresets || [])); } catch (e) { log('presets.salvar.falha', descreverErro(e), 'error'); } }
function carregarPresets() { try { const r = localStorage.getItem(PRESETS_KEY); if (r == null) return null; const a = JSON.parse(r); return Array.isArray(a) ? a.map(p => ({ id: p.id, nome: p.nome, cfg: K.normTrab(p.cfg) })) : []; } catch (e) { log('presets.carregar.falha', descreverErro(e), 'error'); return null; } }
// popula S.trabPresets a partir da chave dedicada (ou semeia a chave com o que já houver no estado)
function hidratarPresets() { const dk = carregarPresets(); if (dk !== null) { S.trabPresets = dk; } else { S.trabPresets = S.trabPresets || []; salvarPresets(); } }
const ORDER = K.ORDEM_SLOTS;                                // [[p,s], ...] ordem vertical
function manualBlocos(idx) { return (S.bloqueios && S.bloqueios[idx]) || []; }
function trabDoSem(idx) { return (S.trabalho && S.trabalho[idx]) || null; }
// S2: o usuário já respondeu se trabalha (Sim/Não) neste semestre?
function trabRespondido(idx) { const w = trabDoSem(idx); return !!w && (w.trabalha === true || w.trabalha === false); }
// "horário flexível" p/ a UI = modo flexível → o trabalho se molda ao redor das aulas (aula sobre o
// trabalho é permitida). No modo fixo, a janela trava a grade.
function trabFlex(idx) { const w = K.normTrab(trabDoSem(idx)); return !!(w && w.trabalha && w.modo === 'flexivel'); }
// blocos de trabalho (auto) calculados a partir de uma seleção de grade
function trabCalc(idx, sel) { return K.blocosTrabalhoCalc(trabDoSem(idx), K.ocupacaoPorDia(sel || [])); }
function totalBloqueios() { let n = 0; for (const i in (S.bloqueios || {})) n += S.bloqueios[i].length; return n; }

/* ---- Configurações de trabalho nomeadas (presets, globais) ---- */
const TRAB_CFG_KEYS = ['modo', 'horas', 'inicio', 'fim', 'ancora', 'folga'];
function trabCfgDe(w) { const n = K.normTrab(w); const o = {}; TRAB_CFG_KEYS.forEach(k => o[k] = n[k]); return o; }
function mesmaCfgTrab(a, b) { const x = trabCfgDe(a), y = trabCfgDe(b); return TRAB_CFG_KEYS.every(k => x[k] === y[k]); }
function salvarPresetTrab(idx, nome) { S.trabPresets = S.trabPresets || []; const cfg = trabCfgDe(trabRascunhoOuSalvo(idx)); const ex = S.trabPresets.find(p => p.nome === nome); if (ex) { ex.cfg = cfg; } else { S.trabPresets.push({ id: 'p' + Date.now() + Math.floor(Math.random() * 1e4), nome, cfg }); } }
function aplicarPresetTrab(idx, id) { const p = (S.trabPresets || []).find(p => p.id === id); if (!p) return; S.trabalho[idx] = K.normTrab(Object.assign({}, p.cfg, { trabalha: true })); }
function excluirPresetTrab(id) { S.trabPresets = (S.trabPresets || []).filter(p => p.id !== id); }
/* ---- Rascunho do formulário de trabalho ---- */
function trabRascunhoOuSalvo(idx) { return K.normTrab((S.trabRascunho && S.trabRascunho[idx]) ? S.trabRascunho[idx] : trabDoSem(idx)); }
function trabTemRascunho(idx) { return !!(S.trabRascunho && S.trabRascunho[idx]); }
function trabRascunhoSet(idx, updates) {
    if (!S.trabRascunho) S.trabRascunho = {};
    const base = S.trabRascunho[idx] ? S.trabRascunho[idx] : K.normTrab(trabDoSem(idx));
    S.trabRascunho[idx] = Object.assign({}, base, updates);
}
function trabAplicarRascunho(idx) {
    if (!trabTemRascunho(idx)) return false;
    S.trabalho[idx] = K.normTrab(S.trabRascunho[idx]);
    delete S.trabRascunho[idx];
    return true;
}
function trabDescartarRascunho(idx) { if (S.trabRascunho) delete S.trabRascunho[idx]; }
// Replica trabalho + bloqueios manuais de `idx` em todos os semestres seguintes até MAXSEM
// (inclusive os ainda não projetados). Retorna quantos desses já estão na projeção.
function aplicarTrabSeguintes(idx) {
    const w = K.normTrab(trabDoSem(idx)); const cfg = trabCfgDe(w); const manuais = manualBlocos(idx);
    const projetados = new Set((D.projecao || []).map(s => s.idx));
    let n = 0;
    for (let i = idx + 1; i <= MAXSEM; i++) {
        S.trabalho[i] = K.normTrab(Object.assign({}, cfg, { trabalha: w.trabalha }));
        if (manuais.length) S.bloqueios[i] = manuais.map(b => ({ ...b })); else delete S.bloqueios[i];
        if (projetados.has(i)) n++;
    }
    limparEscolhasApos(idx);
    return n;
}

/* ---------- Derivação (grafo, ctx) ---------- */
function derive() {
    D = {};
    const { matriz, historico, gnh } = S.parsed;
    if (!matriz || !historico || !gnh) return;
    D.matriz = matriz; D.hist = historico;
    D.byCod = new Map(matriz.disciplinas.map(d => [d.codigo, d]));
    D.grafo = K.construirGrafo(matriz.disciplinas);
    D.ofertaPorRotulo = new Map(ofertasCarregadas().map((o): [string, Map<string, any[]>] => [o.rotulo, porCodigoComEquivalencias(o.turmas)]));
    D.gnhByCod = D.ofertaPorRotulo.get(ofertasCarregadas()[0].rotulo);
    // turmas em-andamento (por código+turma do histórico)
    D.cursadasBase = new Set(historico.cursadasAprovadas);
    D.emAndamento = historico.emAndamento.slice();
    D.ctx = { matrizByCod: D.byCod, grafo: D.grafo, gnhByCod: D.gnhByCod, equiv: S.equivalencias || {}, pref: S.preferencias };
    D.divergenciasHistorico = conferirComHistorico(matriz, D.cursadasBase, historico.resumoGeral, historico.resumoOptativas);
    D.projecao = projetar();
}

/** Turma `turmaId` de `cod` na oferta do semestre `idx` (sem idx: a oferta carregada no upload); a primeira se o id não existir. */
function turmaDe(cod, turmaId, idx?) {
    const porCodigo = idx == null ? D.gnhByCod : ofertaDoSemestre(idx).porCodigo;
    const arr = porCodigo.get(cod) || [];
    return arr.find(t => t.turma === turmaId) || arr[0] || null;
}
function tipoDe(d) {
    if (!d) return 'OPT';
    if (!d.isOpcional) return 'OBR';
    if (d.conjuntoOptativo === '1161') return 'HUM';
    if (d.conjuntoOptativo === '1159') return 'OPT';
    if (d.conjuntoOptativo === '1160') return 'TRI';
    return 'OPT';
}

/* ---------- Projeção dos semestres ---------- */
// Semestre letivo do idx 0 (o das matérias matriculadas): o do cabeçalho "Disciplinas Matriculadas" do
// histórico; sem ele, o seguinte ao último semestre com resultado; sem nenhum resultado, a data atual.
function semestreLetivoAtual() {
    const hist = S.parsed && S.parsed.historico;
    if (hist && hist.semestreMatriculadas) return hist.semestreMatriculadas;
    const regs = ((hist && hist.cursadas) || [])
        .filter(c => (c.situacao === 'APROVADO' || c.situacao === 'REPROVADO') && c.ano && (c.semestre === 1 || c.semestre === 2));
    if (!regs.length) { const hoje = new Date(); return { ano: hoje.getFullYear(), per: hoje.getMonth() < 7 ? 1 : 2 }; }
    const ult = regs.reduce((a, c) => (c.ano * 2 + c.semestre > a.ano * 2 + a.semestre ? c : a));
    return ult.semestre === 2 ? { ano: ult.ano + 1, per: 1 } : { ano: ult.ano, per: 2 };
}
function rotuloSem(idx) { // idx 0 = semestre atual, 1 = o seguinte, ...
    const base = semestreLetivoAtual();
    const n = base.ano * 2 + (base.per - 1) + idx;
    return `${Math.floor(n / 2)}/${(n % 2) + 1}`;
}
function manualNoSem(idx) {
    const out = [];
    const m = S.manuais;
    for (const cod in m.estagios) { if (m.estagios[cod] === idx) out.push(cod); }
    return out;
}
// soma as horas lançadas por-semestre de um item manual até (e incluindo) `idx`
function somaManualAteSem(item, idx) { let s = 0; const p = (item && item.porSem) || {}; for (const k in p) if (+k <= idx) s += (+p[k] || 0); return s; }
function cursadasComManuais(baseSet, idx) {
    const s = new Set(baseSet);
    const m = S.manuais;
    for (const cod in m.estagios) { if (m.estagios[cod] != null && m.estagios[cod] <= idx) s.add(cod); }
    return s;
}
/* ---------- Ofertas por semestre ---------- */
const paridade = (rotulo: string) => rotulo.slice(-1);
const ordemRotulo = (rotulo: string) => { const [a, p] = rotulo.split('/').map(Number); return a * 2 + p; };
/** Ofertas carregadas: a do upload e as de outros semestres guardadas em `S.ofertas` (rótulo "AAAA/S" → turmas). */
function ofertasCarregadas(): { rotulo: string; turmas: any[] }[] {
    const base = { rotulo: S.parsed.gnhSemestre || rotuloSem(0), turmas: S.parsed.gnh };
    return [base, ...Object.entries(S.ofertas || {}).filter(([r]) => r !== base.rotulo).map(([rotulo, turmas]) => ({ rotulo, turmas: turmas as any[] }))];
}
function porCodigoComEquivalencias(turmas) {
    const eq = S.equivalencias || {};
    const m = new Map();
    for (const t0 of turmas) { const t = { ...t0, codigo: eq[t0.codigo] || t0.codigo }; m.set(t.codigo, [...(m.get(t.codigo) || []), t]); }
    return m;
}
/** Oferta usada no semestre `idx`: a do próprio semestre; senão a mais recente da mesma paridade (1º/2º); senão a mais recente. */
function ofertaDoSemestre(idx) {
    const alvo = rotuloSem(idx);
    const todas = ofertasCarregadas().sort((a, b) => ordemRotulo(b.rotulo) - ordemRotulo(a.rotulo));
    const exata = todas.find(o => o.rotulo === alvo);
    const usada = exata || todas.find(o => paridade(o.rotulo) === paridade(alvo)) || todas[0];
    return { rotulo: usada.rotulo, estimada: !exata, porCodigo: D.ofertaPorRotulo.get(usada.rotulo) };
}

/* ---------- Plano global ---------- */
/** A turma cabe nas preferências e não esbarra em bloqueio manual nem no trabalho fixo do semestre? */
function turmaPermitida(t, idx) {
    if (!K.turmaNasPreferencias(t, S.preferencias)) return false;
    const hor = t.horarios || [];
    if (K.bloqueado(hor, manualBlocos(idx))) return false;
    const w = K.normTrab(trabDoSem(idx));
    return !(w.trabalha && w.modo === 'fixo' && +w.horas > 0 && K.conflitaTrabalhoFixo(hor, w));
}
/** Horas lançadas por fora até o semestre `idx` (Infinity = todas). */
function lancamentosAte(idx) {
    const m = S.manuais;
    return { extensao: somaManualAteSem(m.extensao, idx), eletivas: somaManualAteSem(m.eletiva, idx), eletivasValidadas: (D.hist.resumoEletiva && D.hist.resumoEletiva.validada) || 0 };
}
function estagiosMarcados(): Map<string, number> {
    return new Map(Object.entries(S.manuais.estagios || {}).filter(([, s]) => s != null).map(([c, s]): [string, number] => [c, +s]));
}
/** Último semestre com algum item manual marcado ou lançado (a formatura não acontece antes dele). */
function ultimoSemestreManual() {
    const m = S.manuais;
    const comHoras = item => Object.keys((item && item.porSem) || {}).filter(k => +item.porSem[k] > 0).map(Number);
    return Math.max(0, ...estagiosMarcados().values(), ...comHoras(m.extensao), ...comHoras(m.eletiva));
}
const codigosQueContam = grade => grade.sel.filter(s => !s.bloqueado).map(s => s.disciplina.codigo);
function gradeConfirmada(idx) { return S.escolhas[idx] ? reconstruirGrade(S.escolhas[idx], idx) : null; }

function entradaDoPlano(): EntradaPlano {
    const fixos = new Map<number, string[]>();
    for (const k in S.escolhas) { const idx = +k; const g = idx >= 1 && idx <= MAXSEM ? gradeConfirmada(idx) : null; if (g) fixos.set(idx, codigosQueContam(g)); }
    const ofertas = [];
    for (let idx = 1; idx <= MAXSEM; idx++) ofertas[idx] = agruparOfertas([...ofertaDoSemestre(idx).porCodigo.values()].flat(), t => turmaPermitida(t, idx));
    return {
        matriz: D.matriz, cumpridas: new Set([...D.cursadasBase, ...D.emAndamento]), disponivelApos: estagiosMarcados(),
        fixos, ofertas, lancamentos: lancamentosAte(Infinity), periodoAtual: D.hist.aluno.periodoAtual || 1,
        cargaMax: S.preferencias.cargaMax, cargaMin: S.preferencias.cargaMin || 0, preferenciaTrilhas: S.preferencias.preferenciaTrilhas || [],
        maxSemestres: MAXSEM,
    };
}
function gradeDeItens(itens: ItemPlano[], motivos: Map<string, string[]>) {
    return {
        sel: itens.map(i => ({ disciplina: D.byCod.get(i.codigo), turma: i.turma, horarios: i.turma ? i.turma.horarios : [], bloqueado: false, motivos: motivos.get(i.codigo) || [] }))
            .filter(x => x.disciplina),
    };
}
/** Motivos de uma grade avaliada sozinha, a partir do que já estava cumprido antes do semestre (alternativas e personalizadas). */
function motivosLocais(e: EntradaPlano, cursadasAntes: Set<string>, idx: number, codigos: string[]) {
    return motivosDoPlano({ ...e, cumpridas: cursadasAntes, disponivelApos: new Map() }, [[idx, codigos]]);
}
function comMotivos(g, motivos: Map<string, string[]>) { if (g) g.sel.forEach(s => { s.motivos = motivos.get(s.disciplina.codigo) || []; }); return g; }

// Matérias liberadas e ofertadas que o filtro de turno/campus das preferências tirou das candidatas.
function descartadasPorPreferencia(cand, semFiltro) {
    const ficaram = new Set(cand.map(c => c.disciplina.codigo));
    return { candidatas: cand.length, semFiltro: semFiltro.length, descartadas: semFiltro.filter(c => !ficaram.has(c.disciplina.codigo)).map(c => c.disciplina.codigo) };
}
// Resumo de um semestre projetado para o log: plano, alternativas, escolha e estado terminal.
function resumoSemestre(s) {
    const sel = (s.grade && s.grade.sel) || [];
    return {
        idx: s.idx, rotulo: s.rotulo, status: s.status, oferta: s.oferta || null,
        terminal: s.formatura ? 'formatura' : s.cursoImpossivel ? 'impossivel' : s.quaseFormatura ? 'quase' : null,
        candidatas: (s.candidatas || []).length, grades: (s.grades || []).length, personalizadas: (s.personalizadas || []).length,
        descartadasPeloFiltro: s.filtroPrefs ? s.filtroPrefs.descartadas : [],
        grade: sel.map(x => `${x.disciplina.codigo}/${x.turma ? x.turma.turma : '—'}`),
        emConflito: sel.filter(x => x.bloqueado).map(x => x.disciplina.codigo),
        aguardandoTrab: !!s.aguardandoTrab,
        trabalho: s.trab && s.trab.total ? { horas: s.trab.total, deficit: s.trab.deficit, conflitosNucleo: s.trab.conflitosNucleo } : null,
        motivosImpossivel: s.motivosImpossivel || null,
    };
}
let ultimaProjecaoLogada = '';
// Registra a projeção só quando o resultado muda (projetar roda a cada render).
function registrarProjecao(sems, ms: number) {
    const semestres = sems.map(resumoSemestre);
    const chave = JSON.stringify(semestres);
    if (chave === ultimaProjecaoLogada) return;
    ultimaProjecaoLogada = chave;
    log('projecao', { ms, semestres });
}

function semestreAtual() {
    const andDiscs = D.emAndamento.map(cod => {
        const reg = D.hist.cursadas.find(c => c.codigo === cod);
        const t = turmaDe(cod, reg && reg.turma);
        return { disciplina: D.byCod.get(cod), turma: t, horarios: t ? t.horarios : [], bloqueado: false, andamento: true };
    }).filter(x => x.disciplina);
    const horas = situacao(D.matriz, cursadasComManuais(D.cursadasBase, 0), lancamentosAte(0));
    return { idx: 0, rotulo: rotuloSem(0), status: 'atual', grade: { sel: andDiscs }, grades: [], escolhida: true, horas, candidatas: [], manuais: manualNoSem(0), formatura: false, bloqueios: manualBlocos(0), trab: trabCalc(0, andDiscs) };
}

/**
 * Projeção dos semestres: o plano global (menor semestre final) com os semestres confirmados fixos; para o semestre
 * em exibição, até 3 alternativas. Cada matéria leva os motivos de estar ali; o último semestre indica formatura,
 * "quase lá" (só itens manuais) ou a inviabilidade com os motivos.
 */
function projetar() {
    const t0 = performance.now();
    const solver = obterSolver();
    const e = entradaDoPlano();
    const plano = planejar(solver, e);
    const planejadas = plano.status === 'ok' ? plano.semestres : new Map<number, ItemPlano[]>();
    const ultimoFixo = Math.max(0, ...e.fixos.keys());
    const ultimo = Math.max(1, plano.status === 'ok' ? plano.ultimo : ultimoFixo, ultimoSemestreManual());
    const fim = plano.status === 'inviavel' && e.fixos.has(ultimo) ? ultimo + 1 : ultimo;
    const sequencia: [number, string[]][] = [];
    for (let idx = 1; idx <= fim; idx++) sequencia.push([idx, e.fixos.get(idx) || (planejadas.get(idx) || []).map(i => i.codigo)]);
    const motivos = motivosDoPlano(e, sequencia);
    const prefSemFiltro = { ...S.preferencias, campusUnico: false, turnos: ['M', 'T', 'N'], janela: K.JANELA_INTEIRA };

    const sems: any[] = [semestreAtual()];
    let cumul = new Set(e.cumpridas);
    for (let idx = 1; idx <= fim; idx++) {
        const cursadasAntes = cursadasComManuais(cumul, idx - 1);
        const oferta = ofertaDoSemestre(idx);
        const ctx = { ...D.ctx, gnhByCod: oferta.porCodigo };
        const cand = K.candidatasSemestre(ctx, cursadasAntes, new Set(), true);
        const filtroPrefs = descartadasPorPreferencia(cand, K.candidatasSemestre({ ...ctx, pref: prefSemFiltro }, cursadasAntes, new Set(), true));
        const sitAntes = situacao(D.matriz, cursadasAntes, lancamentosAte(idx - 1));
        cand.forEach(c => { c.util = reduzRequisito(c.disciplina, sitAntes); });
        cand.sort((a, b) => Number(b.util) - Number(a.util));

        const confirmada = comMotivos(gradeConfirmada(idx), motivos);
        const recomendada = gradeDeItens(planejadas.get(idx) || [], motivos);
        const alts = !confirmada && idx === S.abaAtiva && plano.status === 'ok' && planejadas.has(idx)
            ? alternativas(solver, e, plano, idx).map(itens => gradeDeItens(itens, motivosLocais(e, cursadasAntes, idx, itens.map(i => i.codigo))))
            : [];
        const grades = confirmada ? [confirmada] : recomendada.sel.length ? [recomendada, ...alts] : [];
        const pers = (S.custom[idx] || []).map(c => { const g = reconstruirGrade(c, idx); return g && comMotivos(g, motivosLocais(e, cursadasAntes, idx, codigosQueContam(g))); }).filter(Boolean);
        const escolhida = confirmada || recomendada;
        cumul = new Set([...cumul, ...codigosQueContam(escolhida)]);
        const horas = situacao(D.matriz, cursadasComManuais(cumul, idx), lancamentosAte(idx));
        const terminal = idx === fim;
        const sem: any = {
            idx, rotulo: rotuloSem(idx), status: confirmada ? 'confirmado' : 'futuro',
            grade: escolhida, grades, personalizadas: pers, recKey: !confirmada && grades.length ? 0 : null, escolhida: !!confirmada, horas, candidatas: cand,
            manuais: manualNoSem(idx), oferta: { rotulo: oferta.rotulo, estimada: oferta.estimada }, cursadasAntes, filtroPrefs,
            formatura: terminal && plano.status === 'ok' && integralizado(horas),
            quaseFormatura: terminal && plano.status === 'ok' && !integralizado(horas) && !faltaCursar(horas),
            bloqueios: manualBlocos(idx), trab: trabCalc(idx, escolhida.sel),
            aguardandoTrab: !trabRespondido(idx),
        };
        if (terminal && plano.status === 'inviavel') Object.assign(sem, { cursoImpossivel: true, motivosImpossivel: plano.motivos });
        sems.push(sem);
    }
    D.cursadasFinal = cumul;
    D.plano = plano;
    registrarProjecao(sems, Math.round(performance.now() - t0));
    return sems;
}

/** Grade salva (confirmada ou personalizada) com as turmas da oferta do semestre `idx`; `bloqueado` = cai num bloqueio manual. */
function reconstruirGrade(escolha, idx) {
    if (!escolha || !escolha.codigos) return null;
    const blocos = manualBlocos(idx);
    const sel = escolha.codigos.map(cod => {
        const d = D.byCod.get(cod); if (!d) return null;
        const t = turmaDe(cod, (escolha.turmas || {})[cod], idx);
        return { disciplina: d, turma: t, horarios: t ? t.horarios : [], bloqueado: t ? K.bloqueado(t.horarios, blocos) : false, motivos: [] };
    }).filter(Boolean);
    return { sel, custom: !!escolha.custom };
}
function blocoExiste(idx, d, p, s) { const a = manualBlocos(idx); return a.some(b => b.diaSemana === d && b.periodo === p && b.slot === s); }
function addBloco(idx, d, p, s, nome) { S.bloqueios[idx] = S.bloqueios[idx] || []; if (!blocoExiste(idx, d, p, s)) S.bloqueios[idx].push({ diaSemana: d, periodo: p, slot: s, nome: nome || 'Bloqueio' }); }
function rmBloco(idx, d, p, s) { const a = S.bloqueios[idx]; if (!a) return; const i = a.findIndex(b => b.diaSemana === d && b.periodo === p && b.slot === s); if (i >= 0) a.splice(i, 1); if (a && !a.length) delete S.bloqueios[idx]; }
/* ---- Rascunho dos bloqueios manuais — como o rascunho de trabalho, só afeta as grades no "Aplicar" ---- */
function chaveBloq(a) { return (a || []).map(b => `${b.diaSemana}-${b.periodo}-${b.slot}:${b.nome || ''}`).sort().join(','); }
function bloqRascunhoAtivo(idx) { return !!(S.bloqRascunho && Object.prototype.hasOwnProperty.call(S.bloqRascunho, idx)); }
// há diferença pendente entre o rascunho de bloqueios e o salvo?
function bloqTemRascunho(idx) { return bloqRascunhoAtivo(idx) && chaveBloq(S.bloqRascunho[idx]) !== chaveBloq(manualBlocos(idx)); }
// lista de bloqueios efetiva p/ EXIBIÇÃO (rascunho se ativo; senão o salvo)
function bloqEfetivos(idx) { return bloqRascunhoAtivo(idx) ? S.bloqRascunho[idx] : manualBlocos(idx); }
function bloqRascunhoInit(idx) { if (!S.bloqRascunho) S.bloqRascunho = {}; if (!bloqRascunhoAtivo(idx)) S.bloqRascunho[idx] = manualBlocos(idx).map(b => ({ ...b })); return S.bloqRascunho[idx]; }
function blocoExisteRasc(idx, d, p, s) { return bloqRascunhoInit(idx).some(b => b.diaSemana === d && b.periodo === p && b.slot === s); }
function addBlocoRasc(idx, d, p, s, nome) { const a = bloqRascunhoInit(idx); if (!a.some(b => b.diaSemana === d && b.periodo === p && b.slot === s)) a.push({ diaSemana: d, periodo: p, slot: s, nome: nome || 'Bloqueio' }); }
function rmBlocoRasc(idx, d, p, s) { const a = bloqRascunhoInit(idx); const i = a.findIndex(b => b.diaSemana === d && b.periodo === p && b.slot === s); if (i >= 0) a.splice(i, 1); }
// aplica o rascunho de bloqueios ao estado salvo; retorna true se havia rascunho ativo
function bloqAplicarRascunho(idx) {
    if (!bloqRascunhoAtivo(idx)) return false;
    const a = S.bloqRascunho[idx];
    if (a && a.length) S.bloqueios[idx] = a.map(b => ({ ...b })); else delete S.bloqueios[idx];
    delete S.bloqRascunho[idx];
    return true;
}
function bloqDescartarRascunho(idx) { if (S.bloqRascunho) delete S.bloqRascunho[idx]; }
function limparEscolhasApos(idx) { let n = 0; for (const k in S.escolhas) if (+k > idx) { delete S.escolhas[k]; n++; } return n; }
// como limparEscolhasApos, mas inclui o próprio semestre `idx` — força recálculo da grade do
// semestre alterado E dos seguintes (ao mudar trabalho/bloqueios/horários travados).
function limparEscolhasDesde(idx) { let n = 0; for (const k in S.escolhas) if (+k >= idx) { delete S.escolhas[k]; n++; } return n; }

function setEstado(v) { S = v; }

export {
    DEFAULT_PREF, S, D, novoEstado, salvar, carregar, PRESETS_KEY, salvarPresets, carregarPresets, hidratarPresets, ORDER, manualBlocos, trabDoSem, trabRespondido, trabFlex, trabCalc, totalBloqueios, TRAB_CFG_KEYS, trabCfgDe, mesmaCfgTrab, salvarPresetTrab, aplicarPresetTrab, excluirPresetTrab, trabRascunhoOuSalvo, trabTemRascunho, trabRascunhoSet, trabAplicarRascunho, trabDescartarRascunho, aplicarTrabSeguintes, derive, turmaDe, tipoDe, rotuloSem, manualNoSem, somaManualAteSem, cursadasComManuais, ofertaDoSemestre, projetar, reconstruirGrade, blocoExiste, addBloco, rmBloco, bloqEfetivos, bloqTemRascunho, blocoExisteRasc, addBlocoRasc, rmBlocoRasc, bloqAplicarRascunho, bloqDescartarRascunho, limparEscolhasApos, limparEscolhasDesde, setEstado
};
