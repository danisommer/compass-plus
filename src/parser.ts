/* ===================================================================
    Compass+ — Fetching/parsing dos PDFs (puro, sem DOM; testável em Node).
    Lê os PDFs do aluno (Matriz Curricular, Histórico Escolar, Turmas Abertas)
    e os transforma nas estruturas de dados consumidas pelo motor de cálculos
    (`engine.ts`). Módulo ES: exporta as funções nomeadas + um objeto `default`
    com a API de parsing.
    =================================================================== */
import type { ItemPdf, PaginaPdf } from './pdf-extracao';

/** Disciplina da matriz. `chSemanal` = aulas por semana; `periodoMinimo` = "Período:N" exigido como pré-requisito. */
export interface Disciplina {
    codigo: string;
    nome: string;
    periodoSugerido: number;
    chTotal: number;
    chSemanal: number;
    chExt: number;
    modeloDisciplina: string;
    preRequisitos: string[];
    periodoMinimo: number | null;
    conjuntoOptativo: string | null;
    subAreaTrilha: string | null;
    isOpcional: boolean;
}
export interface ConjuntoOptativo { id: string; nome: string; periodoInicial: number; periodoFinal: number; chObrigatoria: number; disciplinas: string[]; }
/** Regra do conjunto de trilhas: `minimoValidadas` subáreas com `chObrigatoria` cada, somando `chObrigatoria` do conjunto. */
export interface RegraTrilhas { id: string; nome: string; chObrigatoria: number; minimoValidadas: number; subareas: { id: string; nome: string; chObrigatoria: number }[]; }
/** Totais lidos do rodapé da matriz; `null` quando o rodapé não trouxe o valor. */
export interface TotaisMatriz { chObrigatoriaTotal: number | null; chOptativasTotal: number | null; chExtensaoTotal: number | null; chEletivaTotal: number | null; }
export interface ResumoMatriz extends TotaisMatriz { conjuntosOptativos: ConjuntoOptativo[]; trilhas: RegraTrilhas | null; }
export interface Matriz { disciplinas: Disciplina[]; resumo: ResumoMatriz; subareas: Record<string, string>; }
export type VerificacaoMatriz = { ok: true } | { ok: false; problemas: string[] };

/** Linha do "Resumo Optativas" do histórico. `chFaltante` é `null` quando o histórico escreve "Faltantes". */
export interface ConjuntoHistorico { id: string; nome: string; periodoInicial: number; periodoFinal: number; chs: number; chObrigatoria: number; chCursada: number; chFaltante: number | null; chValidada: number; }
export interface ResumoOptativas { conjuntos: ConjuntoHistorico[]; trilhas: { id: string; minimoValidadas: number; subareas: ConjuntoHistorico[] } | null; }
export interface ResumoEletiva { total: number; cursada: number; faltante: number; validada: number; }
export interface LinhaResumoGeral { total: number; cursada: number; aprovadaOuValidada: number; faltante: number; aprovada: number; }
export interface ResumoGeral { obrigatorias: LinhaResumoGeral | null; optativas: LinhaResumoGeral | null; eletivas: LinhaResumoGeral | null; extensao: { total: number; cursada: number; faltante: number } | null; }
export type EstruturaConjuntos = { ok: true; matriz: Matriz } | { ok: false; problemas: string[] };

/* ---------- Utilidades de texto ---------- */
function norm(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dice(a, b) {                       // similaridade de bigramas (0..1)
    a = norm(a); b = norm(b);
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
    const A = bg(a), B = bg(b); let inter = 0, total = 0;
    A.forEach((c, g) => { total += c; if (B.has(g)) inter += Math.min(c, B.get(g)); });
    B.forEach(c => total += c);
    return (2 * inter) / total;
}
const reCodigo = /^[A-Z]{2,5}[0-9][0-9A-Z]{0,2}$/;   // ICSD20, MAT7C1, ICSHX0, ELEW40...
function isCodigo(t) { return reCodigo.test(t) && /[0-9]/.test(t) && t.length >= 5 && t.length <= 6; }
const CONECTIVOS_MINUSCULOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'ao', 'aos', 'em', 'para', 'à', 'às']);
/** Capitaliza cada palavra (letras acentuadas incluídas), mantendo os conectivos em minúsculas — exceto no início. */
function tituloCase(s) {
    return (s || '').normalize('NFC').toLowerCase()
        .replace(/[\p{L}\p{M}\p{N}]+/gu, w => CONECTIVOS_MINUSCULOS.has(w) ? w : w[0].toUpperCase() + w.slice(1))
        .replace(/^\p{L}/u, c => c.toUpperCase());
}

/* ===================================================================
    Reconstrução geométrica de linhas (idêntica no browser via PDF.js)
    pages: [{ h, items:[{str,x,yTop,w,h}] }]   (yTop cresce p/ baixo)
    -> retorna [ [ {t,x} ... ]  (linha)  ... ] achatado de todas as páginas
    =================================================================== */
function reconstruirLinhas(pages, xMax?) {
    const linhas = [];
    for (const pg of pages) {
        const its = pg.items.filter(it => it.str && it.str.trim() !== '' && (xMax == null || it.x < xMax));
        const bandas = [];
        for (const it of its) {
            const ymid = it.yTop + (it.h || 0) / 2;
            let b = bandas.find(x => Math.abs(x.y - ymid) <= 3.2);
            if (!b) { b = { y: ymid, toks: [] }; bandas.push(b); }
            b.toks.push({ t: it.str, x: it.x });
        }
        bandas.sort((a, b) => a.y - b.y);
        for (const b of bandas) { b.toks.sort((p, q) => p.x - q.x); linhas.push(b.toks); }
    }
    return linhas;
}

/* ===================================================================
    PARSER 1 — Matriz Curricular
    =================================================================== */
const RE_CABECALHO_PERIODO = /^(Período|PER)$/;
const RE_CONJUNTO = /^\[(\d{4})\]$/;
const CHAVES_RODAPE = ['CHTOBRIGATORIASMATRIZ', 'CHTOPTATIVASMATRIZ', 'CHEXTENSAO', 'CHELETIVA'] as const;
type ChaveRodape = typeof CHAVES_RODAPE[number];
type TotaisRodape = Partial<Record<ChaveRodape, number>>;
const CAMPO_DO_TOTAL: [ChaveRodape, keyof TotaisMatriz][] = [
    ['CHTOBRIGATORIASMATRIZ', 'chObrigatoriaTotal'], ['CHTOPTATIVASMATRIZ', 'chOptativasTotal'],
    ['CHEXTENSAO', 'chExtensaoTotal'], ['CHELETIVA', 'chEletivaTotal'],
];
const MARGEM_MATRIZ = { opt: 6, cod: 6, mod: 8, num: 8, pre: 20, larguraCodigo: 40, inicioNome: 25, abaixoCabecalho: 18, alturaCabecalho: 16, acimaRodape: 2 };
const X_PRE_REQUISITOS_SEM_CABECALHO = 515;
const CAMPOS_CARGA = 9;
const IDX_CARGA = { semanal: 2, extensao: 6, total: 8 };
const MIN_DISCIPLINAS_MATRIZ = 20;

/** Limites x (início) de cada coluna da tabela, derivados do cabeçalho da página. */
interface ColunasMatriz { opt: number; cod: number; mod: number; num: number; pre: number; }
/** Uma linha da tabela: os itens entre os pontos médios da âncora (dígito do período) e das vizinhas. */
interface LinhaMatriz { periodo: number; itens: ItemPdf[]; }

function colunasDaPagina(its: ItemPdf[]): ColunasMatriz | null {
    const achar = (re: RegExp) => its.find(i => re.test(i.str));
    const per = achar(RE_CABECALHO_PERIODO), opt = achar(/^\[OPT\]$/), cod = achar(/^Código$/),
        mod = achar(/^Modelo/), teo = achar(/^teóricas$/), pre = achar(/^Pré-$|^Pré-requisito|^requisito/);
    if (!per || !opt || !cod || !mod || !teo) return null;
    const M = MARGEM_MATRIZ;
    return { opt: opt.x - M.opt, cod: cod.x - M.cod, mod: mod.x - M.mod, num: teo.x - M.num, pre: pre ? pre.x - M.pre : X_PRE_REQUISITOS_SEM_CABECALHO };
}

function linhasDaPagina(alturaPagina: number, its: ItemPdf[], cols: ColunasMatriz): LinhaMatriz[] {
    const M = MARGEM_MATRIZ;
    const cabecalho = its.find(i => RE_CABECALHO_PERIODO.test(i.str));
    const inicio = cabecalho ? cabecalho.yTop + M.abaixoCabecalho : 0;
    const ancoras = its.filter(i => /^[1-8]$/.test(i.str) && i.x < cols.opt && i.yTop > inicio).sort((a, b) => a.yTop - b.yTop);
    const cabecalhosPeriodo = its.filter(i => RE_CABECALHO_PERIODO.test(i.str) && i.x < cols.opt).map(i => i.yTop);
    const iniciosCabecalho = its.filter(i => i.str === 'Total').map(i => i.yTop);
    const rodape = its.find(i => /^CÂMPUS:/.test(i.str));
    const fim = rodape ? rodape.yTop - M.acimaRodape : alturaPagina;
    return ancoras.map((ancora, a) => {
        const y = ancora.yTop;
        const loBase = a === 0 ? inicio : (ancoras[a - 1].yTop + y) / 2;
        const hiBase = a === ancoras.length - 1 ? fim : (y + ancoras[a + 1].yTop) / 2;
        const proximoCabecalho = Math.min(...iniciosCabecalho.filter(t => t > y));
        const cabecalhoAnterior = Math.max(...cabecalhosPeriodo.filter(t => t < y));
        const lo = Math.max(loBase, cabecalhoAnterior + M.alturaCabecalho);
        const hi = proximoCabecalho < hiBase ? proximoCabecalho - 1 : hiBase;
        return { periodo: +ancora.str, itens: its.filter(i => i.yTop >= lo && i.yTop < hi).sort((p, q) => p.yTop - q.yTop || p.x - q.x) };
    });
}

function disciplinaDaLinha({ periodo, itens }: LinhaMatriz, cols: ColunasMatriz): Disciplina | null {
    const M = MARGEM_MATRIZ;
    const naFaixa = (ini: number, fim: number) => itens.filter(i => i.x >= ini && i.x < fim);
    const codigo = naFaixa(cols.cod, cols.cod + M.larguraCodigo).find(i => isCodigo(i.str));
    if (!codigo) return null;
    const cargas = naFaixa(cols.num, cols.pre).sort((p, q) => p.x - q.x)
        .map(i => i.str.replace(/\s*horas$/, '')).filter(s => /^\d+$/.test(s)).map(Number);
    if (cargas.length < CAMPOS_CARGA) return null;
    const ch = cargas.slice(-CAMPOS_CARGA);
    const opt = naFaixa(cols.opt, cols.cod).find(i => RE_CONJUNTO.test(i.str));
    const conjunto = opt ? opt.str.slice(1, 5) : null;
    const preReq = itens.filter(i => i.x >= cols.pre).map(i => i.str);
    const periodoMinimo = preReq.join(' ').match(/Período:\s*(\d)/);
    return {
        codigo: codigo.str,
        nome: tituloCase(naFaixa(cols.cod + M.inicioNome, cols.mod).filter(i => !isCodigo(i.str) && i.str !== 'Turmas').map(i => i.str).join(' ')),
        periodoSugerido: periodo,
        chTotal: ch[IDX_CARGA.total],
        chSemanal: ch[IDX_CARGA.semanal],
        chExt: ch[IDX_CARGA.extensao],
        modeloDisciplina: naFaixa(cols.mod, cols.num).map(i => i.str).join(' '),
        preRequisitos: [...new Set(preReq.filter(isCodigo))],
        periodoMinimo: periodoMinimo ? +periodoMinimo[1] : null,
        conjuntoOptativo: conjunto,
        subAreaTrilha: null,
        isOpcional: conjunto != null,
    };
}

function lerTotaisRodape(texto: string, totais: TotaisRodape): void {
    for (const k of CHAVES_RODAPE) { const m = texto.match(new RegExp(`${k}:\\s*(\\d+)`)); if (m) totais[k] = +m[1]; }
}

/**
 * Lê a Matriz Curricular por geometria de tabela: colunas pelo cabeçalho de cada página, linhas ancoradas no dígito do período.
 * `conjuntoOptativo` sai com o id impresso na coluna [OPT]; quais ids são subáreas de trilha vem do histórico (`estruturarConjuntos`).
 */
function parseMatriz(pages: PaginaPdf[]): Matriz {
    const disciplinas: Disciplina[] = [];
    const vistos = new Set<string>();
    const totais: TotaisRodape = {};
    let cols: ColunasMatriz | null = null;
    for (const pg of pages) {
        const its = pg.items.filter(i => i.str && i.str.trim());
        lerTotaisRodape(its.map(i => i.str).join(' '), totais);
        cols = colunasDaPagina(its) || cols;
        if (!cols) continue;
        for (const linha of linhasDaPagina(pg.h, its, cols)) {
            const d = disciplinaDaLinha(linha, cols);
            if (!d || vistos.has(d.codigo)) continue;
            vistos.add(d.codigo); disciplinas.push(d);
        }
    }
    return {
        disciplinas,
        resumo: {
            chObrigatoriaTotal: totais.CHTOBRIGATORIASMATRIZ ?? null,
            chOptativasTotal: totais.CHTOPTATIVASMATRIZ ?? null,
            chExtensaoTotal: totais.CHEXTENSAO ?? null,
            chEletivaTotal: totais.CHELETIVA ?? null,
            conjuntosOptativos: [],
            trilhas: null,
        },
        subareas: {},
    };
}

/**
 * Aplica à matriz os conjuntos optativos do "Resumo Optativas" do histórico: cargas exigidas, nomes, a regra das
 * trilhas e o mapeamento subárea → conjunto de trilhas. Idempotente; falha se alguma optativa citar um conjunto desconhecido.
 */
function estruturarConjuntos(m: Matriz, r: ResumoOptativas | null): EstruturaConjuntos {
    if (!r || !r.conjuntos.length) return { ok: false, problemas: ['não encontrei o "Resumo Optativas" no histórico'] };
    const pai = r.trilhas ? r.conjuntos.find(c => c.id === r.trilhas.id) : null;
    const problemas: string[] = [];
    if (r.trilhas && !pai) problemas.push(`o conjunto de trilhas ${r.trilhas.id} não aparece no "Resumo Optativas"`);
    const paiDaSubarea = new Map((r.trilhas ? r.trilhas.subareas : []).map((s): [string, string] => [s.id, r.trilhas.id]));
    const conhecidos = new Set([...r.conjuntos.map(c => c.id), ...paiDaSubarea.keys()]);
    const desconhecidos = [...new Set(m.disciplinas.filter(d => d.isOpcional && !conhecidos.has(d.conjuntoOptativo)).map(d => d.conjuntoOptativo))];
    if (desconhecidos.length) problemas.push(`a matriz cita conjunto(s) que o histórico não descreve: ${desconhecidos.join(', ')}`);
    if (problemas.length) return { ok: false, problemas };
    const disciplinas = m.disciplinas.map(d => paiDaSubarea.has(d.conjuntoOptativo)
        ? { ...d, conjuntoOptativo: paiDaSubarea.get(d.conjuntoOptativo), subAreaTrilha: d.conjuntoOptativo } : d);
    const trilhas: RegraTrilhas | null = r.trilhas ? {
        id: pai.id, nome: pai.nome, chObrigatoria: pai.chObrigatoria, minimoValidadas: r.trilhas.minimoValidadas,
        subareas: r.trilhas.subareas.map(s => ({ id: s.id, nome: s.nome, chObrigatoria: s.chObrigatoria })),
    } : null;
    return {
        ok: true,
        matriz: {
            disciplinas,
            resumo: {
                ...m.resumo, trilhas,
                conjuntosOptativos: r.conjuntos.map(c => ({
                    id: c.id, nome: c.nome, periodoInicial: c.periodoInicial, periodoFinal: c.periodoFinal, chObrigatoria: c.chObrigatoria,
                    disciplinas: disciplinas.filter(d => d.conjuntoOptativo === c.id).map(d => d.codigo),
                })),
            },
            subareas: Object.fromEntries((trilhas ? trilhas.subareas : []).map(s => [s.id, s.nome])),
        },
    };
}

/** Confere se a leitura é confiável: ao menos 20 disciplinas, os 4 totais do rodapé e a soma das obrigatórias igual ao rodapé. */
function verificarMatriz(m: Matriz): VerificacaoMatriz {
    const r: Partial<ResumoMatriz> = m.resumo || {};
    const problemas: string[] = [];
    if (m.disciplinas.length < MIN_DISCIPLINAS_MATRIZ) problemas.push(`só ${m.disciplinas.length} disciplina(s) reconhecida(s); uma matriz completa tem bem mais de ${MIN_DISCIPLINAS_MATRIZ}`);
    for (const [chave, campo] of CAMPO_DO_TOTAL) if (r[campo] == null) problemas.push(`não encontrei o total ${chave} no rodapé da matriz`);
    const somaObrigatorias = m.disciplinas.filter(d => !d.isOpcional).reduce((a, d) => a + d.chTotal, 0);
    if (r.chObrigatoriaTotal != null && somaObrigatorias !== r.chObrigatoriaTotal)
        problemas.push(`as obrigatórias lidas somam ${somaObrigatorias} h, mas o rodapé da matriz informa ${r.chObrigatoriaTotal} h`);
    return problemas.length ? { ok: false, problemas } : { ok: true };
}

/* ===================================================================
    PARSER 2 — Histórico Escolar
    =================================================================== */
const SIT_PRIO = { APROVADO: 5, CREDITO_CONSIGNADO: 5, CURSANDO: 3, REPROVADO: 2, CANCELADO: 1 };
const numeroHistorico = (s: string) => +s.replace(/\./g, '');

/** Linhas entre a primeira que casa `inicio` (exclusiva) e a seguinte que casa `fim` (exclusiva); [] se `inicio` não existir. */
function secao(texto: string[], inicio: RegExp, fim: RegExp): string[] {
    const i = texto.findIndex(t => inicio.test(t));
    if (i < 0) return [];
    const j = texto.findIndex((t, k) => k > i && fim.test(t));
    return texto.slice(i + 1, j < 0 ? texto.length : j);
}

const RE_LINHA_CONJUNTO = /^(\d{4})\s+(?:\(\*\)\s+)?(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+|Faltantes)\s+([\d.]+)$/;
function conjuntoDaLinha(t: string): ConjuntoHistorico | null {
    const m = t.match(RE_LINHA_CONJUNTO);
    if (!m) return null;
    return {
        id: m[1], nome: tituloCase(m[2]), periodoInicial: +m[3], periodoFinal: +m[4], chs: +m[5],
        chObrigatoria: numeroHistorico(m[6]), chCursada: numeroHistorico(m[7]),
        chFaltante: m[8] === 'Faltantes' ? null : numeroHistorico(m[8]), chValidada: numeroHistorico(m[9]),
    };
}

/** "Resumo Optativas": conjuntos do curso e, depois do "Detalhamento", as subáreas do conjunto de trilhas e quantas precisam ser validadas. */
function lerResumoOptativas(texto: string[]): ResumoOptativas | null {
    const linhas = secao(texto, /^Resumo Optativas/, /^Detalhes das Optativas Cursadas/);
    const iDetalhe = linhas.findIndex(t => /^\*?\s*Detalhamento do Conjunto/.test(t));
    const conjuntos = (iDetalhe < 0 ? linhas : linhas.slice(0, iDetalhe)).map(conjuntoDaLinha).filter(Boolean);
    if (!conjuntos.length) return null;
    if (iDetalhe < 0) return { conjuntos, trilhas: null };
    const pai = linhas[iDetalhe].match(/\(\s*(\d{4})\s*-/);
    const minimo = linhas.join(' ').match(/quando\s+(\d+)\s+das\s+subáreas/i);
    const subareas = linhas.slice(iDetalhe + 1).map(conjuntoDaLinha).filter(Boolean);
    return { conjuntos, trilhas: pai && minimo && subareas.length ? { id: pai[1], minimoValidadas: +minimo[1], subareas } : null };
}

/** "Resumo Eletiva": total, cursada, faltante e validada (a coluna de pré-requisito é opcional, por isso os três últimos números). */
function lerResumoEletiva(texto: string[]): ResumoEletiva | null {
    const linha = secao(texto, /^Resumo Eletiva/, /^Exame de Suficiência/).find(t => /^Eletiva(\s+[\d.]+){4,}$/.test(t));
    if (!linha) return null;
    const n = linha.split(/\s+/).slice(1).map(numeroHistorico);
    return { total: n[0], cursada: n[n.length - 3], faltante: n[n.length - 2], validada: n[n.length - 1] };
}

function linhaResumoGeral(linhas: string[], rotulo: string): LinhaResumoGeral | null {
    const re = new RegExp(`^CHT Disciplinas ${rotulo}\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)$`);
    const m = linhas.map(t => t.match(re)).find(Boolean);
    return m ? { total: numeroHistorico(m[1]), cursada: numeroHistorico(m[2]), aprovadaOuValidada: numeroHistorico(m[3]), faltante: numeroHistorico(m[4]), aprovada: numeroHistorico(m[5]) } : null;
}

/** "Resumo Geral" do histórico: números oficiais usados para conferir o cálculo do app. */
function lerResumoGeral(texto: string[]): ResumoGeral | null {
    const linhas = secao(texto, /^Resumo Geral$/, /^Detalhes das CHExt/);
    if (!linhas.length) return null;
    const ext = linhas.map(t => t.match(/^CHEXT geral do curso\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)).find(Boolean);
    return {
        obrigatorias: linhaResumoGeral(linhas, 'Obrigatórias'),
        optativas: linhaResumoGeral(linhas, 'Optativas'),
        eletivas: linhaResumoGeral(linhas, 'Eletivas'),
        extensao: ext ? { total: numeroHistorico(ext[1]), cursada: numeroHistorico(ext[2]), faltante: numeroHistorico(ext[3]) } : null,
    };
}

function parseHistorico(pages) {
    const linhas = reconstruirLinhas(pages);
    const texto = linhas.map(l => l.map(t => t.t).join(' '));

    const head = texto.slice(0, 25).join('\n');
    const get = re => { const m = head.match(re); return m ? m[1].trim() : ''; };
    const aluno = {
        matricula: get(/Aluno:\s*(\d+)/),
        nome: tituloCase(get(/Aluno:\s*\d+\s*-\s*([^\n]+)/).split(/\s+Identidade/i)[0]),
        curso: get(/Curso:\s*([^\n]+)/),
        periodoAtual: parseInt(get(/Período:\s*(\d+)/) || '1', 10),
        matriz: get(/Matriz:\s*([^\n]+)/),
        coeficienteAbsoluto: parseFloat((get(/Coeficiente absoluto:\s*([\d,]+)/) || '0').replace(',', '.')),
        coeficienteNormalizado: parseFloat((get(/Coeficiente normalizado:\s*([\d,]+)/) || '0').replace(',', '.')),
    };

    // Linhas-âncora: dígito período + código + contém ano 20xx
    const anchors = [];
    for (let i = 0; i < linhas.length; i++) {
        const toks = linhas[i];
        if (toks.length < 4) continue;
        if (!/^[1-8]$/.test(toks[0].t)) continue;
        if (!isCodigo(toks[1].t)) continue;
        if (!toks.some(t => /^20\d\d$/.test(t.t))) continue;
        anchors.push(i);
    }
    const registros = new Map();
    const setReg = (cod, sit, extra) => {
        const prev = registros.get(cod);
        if (!prev || (SIT_PRIO[sit] || 0) >= (SIT_PRIO[prev.situacao] || 0))
            registros.set(cod, Object.assign({ codigo: cod, situacao: sit }, prev, extra, { situacao: sit }));
    };
    for (let a = 0; a < anchors.length; a++) {
        const Li = anchors[a];
        const toks = linhas[Li];
        const codigo = toks[1].t;
        const arr = toks.map(t => t.t);
        const yi = arr.findIndex(t => /^20\d\d$/.test(t));
        const ano = parseInt(arr[yi], 10);
        const semestre = parseInt(arr[yi - 1], 10) || null;
        // janela do registro: da âncora anterior+1 até esta âncora
        const ini = a === 0 ? 0 : anchors[a - 1] + 1;
        let blob = '';
        for (let k = ini; k <= Li; k++) blob += ' ' + texto[k];
        blob = norm(blob);
        let sit = 'APROVADO';
        if (/CANCELADO/.test(blob)) sit = 'CANCELADO';
        else if (/REPROVADO/.test(blob)) sit = 'REPROVADO';
        else if (/APROVADO/.test(blob)) sit = 'APROVADO';
        else if (/CONSIGNADO/.test(blob)) sit = 'CREDITO_CONSIGNADO';
        setReg(codigo, sit, { ano, semestre });
    }

    // Matriculadas (CURSANDO) — cabeçalho "Disciplinas Matriculadas - AAAA/S" traz o semestre letivo atual
    const matIdx = texto.findIndex(t => /Matriculadas/.test(t));
    const mSem = matIdx >= 0 ? texto[matIdx].match(/Matriculadas\s*-\s*(\d{4})\s*\/\s*([12])\b/) : null;
    const semestreMatriculadas = mSem ? { ano: +mSem[1], per: +mSem[2] } : null;
    if (matIdx >= 0) {
        for (let k = matIdx + 1; k < linhas.length; k++) {
            const toks = linhas[k];
            const arr = toks.map(t => t.t);
            if (arr.join(' ').match(/Exame De Curso|ENADE|Vínculos|Bloqueios/i)) break;
            if (toks.length && isCodigo(toks[0].t) && arr.some(t => /Cursando/i.test(t))) {
                const turma = (arr.find(t => /^[A-Z]\d{2}$/.test(t)) || '');
                setReg(toks[0].t, 'CURSANDO', { turma });
            }
        }
    }

    // ENADE
    const full = texto.join('\n');
    const enadeConcluinte = /CONCLUINTE[\s\S]{0,40}Sem Registro/i.test(full) ? false : /CONCLUINTE[\s\S]{0,80}(Aprovado|Dispensado|Realiz)/i.test(full);

    const cursadas = [...registros.values()];
    const cursadasAprovadas = cursadas.filter(d => d.situacao === 'APROVADO' || d.situacao === 'CREDITO_CONSIGNADO').map(d => d.codigo);
    const emAndamento = cursadas.filter(d => d.situacao === 'CURSANDO').map(d => d.codigo);

    return {
        aluno, cursadas, cursadasAprovadas, emAndamento, enadeConcluinte, semestreMatriculadas,
        resumoOptativas: lerResumoOptativas(texto), resumoEletiva: lerResumoEletiva(texto), resumoGeral: lerResumoGeral(texto),
    };
}

/* ===================================================================
    PARSER 3b — Turmas Abertas (Portal do Aluno) — substitui o Grade na Hora.
    Colunas (Turma | Enquadramento | Vagas… | Reserva | Prioridade | Horário | Professor |
    Optativa) localizadas pelo cabeçalho de cada tabela, não por posição fixa.
    Saída compatível com a oferta usada no app + prioridadeSI/reserva.
    =================================================================== */
const COLUNAS_TA: [string, RegExp][] = [['turma', /^Turma$/i], ['enq', /^Enquadramento$/i], ['vagas', /^Vagas$/i], ['res', /^Reserva$/i], ['pri', /^Prioridade$/i], ['hor', /^Hor[áa]rio$/i], ['prof', /^Professor$/i], ['opt', /^Optativa$/i]];
// Início (x) de cada coluna a partir da linha de cabeçalho; null se faltar Turma, Enquadramento ou Horário.
function colunasDoCabecalho(toks) {
    const cols = [];
    for (const tk of toks) { const c = COLUNAS_TA.find(([, re]) => re.test(tk.t)); if (c) cols.push({ key: c[0], ini: tk.x - 3 }); }
    cols.sort((a, b) => a.ini - b.ini);
    return ['turma', 'enq', 'hor'].every(k => cols.some(c => c.key === k)) ? cols : null;
}
// Coluna em que começa um token de posição x (null se antes da primeira coluna).
function colunaDe(cols, x) { let k = null; for (const c of cols) { if (x < c.ini) break; k = c.key; } return k; }
// Distância máxima (pt) acima da linha da turma em que ainda há texto dela (fonte menor de prioridade/professor).
const ACIMA_DA_TURMA = 6;
function parseTurmasAbertas(pages) {
    const reDisc = /^[A-Z]{2,5}[0-9][0-9A-Z]{0,2}$/, reTurma = /^[A-Z]{1,2}[0-9]{2,3}$/;
    const ALVO = norm('Sist De Informação');
    const turmas = []; let disc = null;
    let cols = null, aberta = null, pendentes = [];
    const montarTurma = t => {
        const col = { enq: [], res: [], pri: [], hor: [], prof: [], opt: [] };
        for (const bb of t.bandas) for (const tk of bb.toks) { const k = colunaDe(cols, tk.x); if (col[k]) col[k].push(tk.t); }
        const jc = a => a.join(' ').replace(/\s+/g, ' ').trim();
        const enq = jc(col.enq), reserva = jc(col.res), priText = jc(col.pri), horText = col.hor.join(''), prof = tituloCase(jc(col.prof)), optText = jc(col.opt);
        const prios = []; const re = /(\d+)\s*-\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]*?)(?=\s+\d+\s*-\s*|$)/g; let mp;
        while ((mp = re.exec(priText))) prios.push({ rank: +mp[1], curso: mp[2].replace(/\s+/g, ' ').trim() });
        let prioridadeSI = null; for (const p of prios) { const n = norm(p.curso); if (n === ALVO || n.startsWith('SIST DE INFORM')) { prioridadeSI = p.rank; break; } }
        const horarios = [], seen = new Set(); let campus = 'CURITIBA';
        const sr = /(\d)([MTN])(\d)\((\*{0,2})([A-Za-z0-9-]+)\)/g; let sm;
        while ((sm = sr.exec(horText))) { const dia = +sm[1], per = sm[2], slot = +sm[3], ast = sm[4], sala = sm[5]; if (ast) campus = ast === '**' ? 'NEOVILLE' : 'ECOVILLE'; const key = dia + per + slot; if (seen.has(key)) continue; seen.add(key); horarios.push({ diaSemana: dia, periodo: per, slot, sala }); }
        const elegivel = !/fechada/i.test(reserva) || prioridadeSI != null;   // pode cursar? (Fechada exige SI na prioridade)
        return { codigo: t.disc.codigo, nome: t.disc.nome, turma: t.codigo, professor: prof, aulasSem: t.disc.aulas, horarios, campus, enquadramento: enq, reserva, prioridadeSI, prioridades: prios, elegivel, optativaMatrizes: (optText.match(/Matriz:\d+/g) || []) };
    };
    const fecharTurma = () => { if (aberta) { aberta.bandas.push(...pendentes); turmas.push(montarTurma(aberta)); } aberta = null; pendentes = []; };
    // O código da disciplina pode vir fragmentado em vários spans no PDF (ex.: "ICS" "X" "20"
    // para "Trabalho de Integração"). Reconstrói o código juntando os tokens iniciais da 1ª
    // coluna até casar reDisc; retorna {code, n} (n = nº de tokens consumidos).
    const leadingCode = toks => { let s = ''; for (let q = 0; q < toks.length; q++) { const tk = toks[q]; if (tk.x < 100 && /^[A-Z0-9]+$/i.test(tk.t)) { s += tk.t; if (reDisc.test(s)) return { code: s, n: q + 1 }; } else break; } return null; };
    const discsVistas = new Map();   // toda disciplina que aparece no PDF (mesmo sem turma parseável)
    for (const pg of pages) {
        const its = pg.items.filter(i => i.str && i.str.trim());
        const bands = [];
        for (const it of its) { const ym = it.yTop + (it.h || 0) / 2; let b = bands.find(x => Math.abs(x.y - ym) <= 3.2); if (!b) { b = { y: ym, toks: [] }; bands.push(b); } b.toks.push({ t: it.str, x: it.x, y: it.yTop }); }
        bands.sort((a, b) => a.y - b.y); bands.forEach(b => b.toks.sort((p, q) => p.x - q.x));
        const jb = i => i >= 0 && i < bands.length ? bands[i].toks.map(t => t.t).join(' ') : '';
        for (let bi = 0; bi < bands.length; bi++) {
            const b = bands[bi], joined = jb(bi), first = b.toks[0]; if (!first) continue;
            // cabeçalho de disciplina. Código/nome/aulas saem da 1ª linha (aceita aulas fracionárias);
            // o chExt ("horas semestrais") é opcional pois pode ficar na página seguinte (cabeçalho quebra a página).
            const lc = first.x < 70 ? leadingCode(b.toks) : null;
            if (lc && /Aulas\s+semanais/i.test(joined + ' ' + jb(bi + 1))) {
                // prefixa o código já reconstruído para que o m2 case mesmo com código fragmentado
                let full = lc.code + ' ' + b.toks.slice(lc.n).map(t => t.t).join(' '), j = bi;
                while (!/horas semestrais|extensionistas\)/i.test(full) && j + 1 < bands.length && j - bi < 4) { j++; full += ' ' + jb(j); }
                const m2 = full.match(/^([A-Z]{2,5}[0-9][0-9A-Z]{0,2})\s*[-–]\s*(.+?)\s*\(([\d.,]+)\s*Aulas semanais/i);
                if (m2) {
                    fecharTurma();
                    const extM = full.match(/([\d.,]+)\s*horas semestrais/i);
                    disc = { codigo: m2[1], nome: tituloCase(m2[2].replace(/\s+/g, ' ').trim()), aulas: Math.round(parseFloat(m2[3].replace(',', '.')) || 0), chExt: extM ? Math.round(parseFloat(extM[1].replace(',', '.')) || 0) : 0 };
                    discsVistas.set(disc.codigo, disc);
                    bi = j; continue;
                }
            }
            if (/^Turma\b/.test(joined) && /Enquadramento/.test(joined)) { fecharTurma(); cols = colunasDoCabecalho(b.toks); continue; }
            const isTurma = !!cols && !!disc && colunaDe(cols, first.x) === 'turma' && reTurma.test(first.t) && b.toks.some(t => colunaDe(cols, t.x) === 'enq');
            if (!isTurma) { pendentes.push(b); continue; }
            const acima = pendentes.filter(p => p.y >= b.y - ACIMA_DA_TURMA);
            pendentes = pendentes.filter(p => p.y < b.y - ACIMA_DA_TURMA);
            fecharTurma();
            aberta = { disc, codigo: first.t, bandas: [...acima, b] };
        }
        if (aberta) aberta.bandas.push(...pendentes);
        pendentes = [];
    }
    fecharTurma();
    // Disciplinas que constam no PDF mas não tiveram nenhuma turma parseada (turma/horário ausentes)
    // ainda devem poder ser listadas/usadas — Turmas Abertas é a fonte da verdade do que está disponível.
    const comTurma = new Set(turmas.map(t => t.codigo));
    discsVistas.forEach((dd, cod) => {
        if (comTurma.has(cod)) return;
        turmas.push({ codigo: cod, nome: dd.nome, turma: '—', professor: '', aulasSem: dd.aulas, chExt: dd.chExt || 0, horarios: [], campus: 'CURITIBA', enquadramento: '', reserva: '', prioridadeSI: null, prioridades: [], elegivel: true, optativaMatrizes: [], semOferta: true });
    });
    return turmas;
}

/** Semestre da oferta impresso no cabeçalho das Turmas Abertas ("2º Semestre de 2026"); `null` se não houver. */
function semestreDaOferta(pages): { ano: number; per: number } | null {
    const texto = reconstruirLinhas(pages.slice(0, 1)).map(l => l.map(t => t.t).join(' ')).join('\n');
    const m = texto.match(/([12])\s*[º°o]\s+Semestre\s+de\s+(\d{4})/i);
    return m ? { ano: +m[2], per: +m[1] } : null;
}

/* ===================================================================
    Equivalências GNH↔Matriz + divergências
    =================================================================== */
function detectarEquivalencias(matriz, gnh) {
    const mCods = new Set(matriz.disciplinas.map(d => d.codigo));
    const auto = {}; const divergencias = [];
    const gnhCods: any[] = [...new Set(gnh.map(t => t.codigo))];
    for (const gc of gnhCods) {
        if (mCods.has(gc)) continue;
        if (mCods.has('I' + gc)) { auto[gc] = 'I' + gc; continue; }   // CSX41 -> ICSX41
        const nome = (gnh.find(t => t.codigo === gc) || {}).nome || '';
        let best = null, bestS = 0;
        for (const d of matriz.disciplinas) {
            const s = dice(nome, d.nome);
            if (s > bestS) { bestS = s; best = d; }
        }
        if (best && bestS >= 0.9) divergencias.push({ gnhCod: gc, gnhNome: nome, matrizCod: best.codigo, matrizNome: best.nome, score: bestS });
    }
    return { auto, divergencias };
}

/* ---------- exports ---------- */
export {
    norm, dice, isCodigo, tituloCase, reconstruirLinhas,
    parseMatriz, verificarMatriz, estruturarConjuntos, parseHistorico, parseTurmasAbertas, semestreDaOferta, detectarEquivalencias,
};

const Parser = {
    norm, dice, reconstruirLinhas,
    parseMatriz, verificarMatriz, estruturarConjuntos, parseHistorico, parseTurmasAbertas, semestreDaOferta, detectarEquivalencias,
    tituloCase,
};
export default Parser;
