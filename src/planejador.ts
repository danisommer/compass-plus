/* ===================================================================
    Compass+ — Planejador global (puro, sem DOM; testável em Node).
    Formula o plano até a formatura como programação linear inteira e resolve com o
    HiGHS (injetado como `Solver`). Para K = 1, 2, … procura o menor semestre final
    viável; dentro dele minimiza, em ordem: nº de disciplinas, preferência de trilhas,
    equilíbrio de carga e, por fim, cursar o quanto antes (optativas de conjunto com
    carga fixa antes das de trilha). Semestres confirmados pelo usuário entram fixos;
    o resto é reotimizado.
    =================================================================== */
import type { Disciplina, Matriz } from './parser';
import { ehManual, faltaCursar, reduzRequisito, situacao, type Lancamentos, type Situacao } from './requisitos';

export interface Horario { diaSemana: number; periodo: string; slot: number; sala?: string; }
export interface Turma { codigo: string; turma: string; horarios: Horario[]; prioridadeSI?: number | null; }
/** Interface mínima do HiGHS usada aqui (`highs.solve`). */
export interface Solver { solve(lp: string, opcoes?: Record<string, unknown>): { Status: string; Columns: Record<string, { Primal?: number }> }; }

export interface EntradaPlano {
    matriz: Matriz;
    /** Aprovadas e em andamento: valem como cumpridas a partir do semestre 1. */
    cumpridas: Set<string>;
    /** Itens manuais marcados (estágios…): código → semestre ao fim do qual passam a valer. */
    disponivelApos: Map<string, number>;
    /** Semestres confirmados: idx → códigos que contam (valem a partir do semestre seguinte). */
    fixos: Map<number, string[]>;
    /** `ofertas[idx]`: turmas permitidas por código no semestre idx (já filtradas por preferências e bloqueios). */
    ofertas: Map<string, Turma[]>[];
    lancamentos: Lancamentos;
    periodoAtual: number;
    cargaMax: number;
    preferenciaTrilhas: string[];
    maxSemestres: number;
}
export interface Corte { semestre: number; codigos: string[]; }
export interface ItemPlano { codigo: string; turma: Turma | null; }
export interface MotivoInviavel { cod: string | null; nome: string | null; motivo: string; }
export type Plano =
    | { status: 'ok'; ultimo: number; semestres: Map<number, ItemPlano[]> }
    | { status: 'inviavel'; motivos: MotivoInviavel[] };

interface Candidata { d: Disciplina; i: number; inicio: number; }
interface Variavel { nome: string; c: Candidata; s: number; turma: Turma; }

const OPCOES_SOLVER = { output_flag: false, mip_rel_gap: 0, mip_abs_gap: 0.5, time_limit: 30 };
const URGENCIA_CONJUNTO_FIXO = 2;
const TERMOS_POR_LINHA = 12;
const LIMITE_CACHE = 64;
const cache = new Map<string, ReturnType<Solver['solve']>>();

function resolverComCache(solver: Solver, lp: string) {
    const salvo = cache.get(lp);
    if (salvo) return salvo;
    const r = solver.solve(lp, OPCOES_SOLVER);
    cache.set(lp, r);
    if (cache.size > LIMITE_CACHE) cache.delete(cache.keys().next().value);
    return r;
}

const porCodigo = (ds: Disciplina[]) => new Map(ds.map((d): [string, Disciplina] => [d.codigo, d]));

function fixadasPorCodigo(e: EntradaPlano): Map<string, number> {
    const m = new Map<string, number>();
    e.fixos.forEach((cods, s) => cods.forEach(c => m.set(c, s)));
    return m;
}

function ofertada(e: EntradaPlano, cod: string): boolean {
    return e.ofertas.some((m, s) => s >= 1 && m && (m.get(cod) || []).length > 0);
}

/** Semestre a partir do qual `cod` vale como pré-requisito cumprido fora do modelo (Infinity se não vale). */
function cumpridaDesde(e: EntradaPlano, fixadas: Map<string, number>, cod: string): number {
    if (e.cumpridas.has(cod)) return 1;
    if (fixadas.has(cod)) return fixadas.get(cod) + 1;
    if (e.disponivelApos.has(cod)) return e.disponivelApos.get(cod) + 1;
    return Infinity;
}

/** Disciplinas que reduzem algum requisito (mais os pré-requisitos delas), ofertadas e alcançáveis no horizonte. */
function selecionarCandidatas(e: EntradaPlano, sit: Situacao, fixadas: Map<string, number>): Map<string, Candidata> {
    const byCod = porCodigo(e.matriz.disciplinas);
    const elegivel = (d: Disciplina) => cumpridaDesde(e, fixadas, d.codigo) === Infinity && !ehManual(d) && ofertada(e, d.codigo);
    const escolhidas = new Set(e.matriz.disciplinas.filter(d => elegivel(d) && reduzRequisito(d, sit)).map(d => d.codigo));
    for (let mudou = true; mudou;) {
        mudou = false;
        for (const cod of [...escolhidas]) for (const p of byCod.get(cod).preRequisitos) {
            const dp = byCod.get(p);
            if (dp && !escolhidas.has(p) && elegivel(dp)) { escolhidas.add(p); mudou = true; }
        }
    }
    for (let removeu = true; removeu;) {
        removeu = false;
        const memo = new Map<string, number>();
        const inicio = (cod: string, pilha: Set<string>): number => {
            if (memo.has(cod)) return memo.get(cod);
            const d = byCod.get(cod);
            let s = Math.max(1, d.periodoMinimo ? d.periodoMinimo - e.periodoAtual : 1);
            for (const p of d.preRequisitos) {
                if (!byCod.has(p)) continue;
                const fora = cumpridaDesde(e, fixadas, p);
                if (fora !== Infinity) s = Math.max(s, fora);
                else if (escolhidas.has(p) && !pilha.has(p)) s = Math.max(s, inicio(p, new Set([...pilha, p])) + 1);
                else s = Infinity;
            }
            memo.set(cod, s);
            return s;
        };
        for (const cod of [...escolhidas]) if (inicio(cod, new Set([cod])) > e.maxSemestres) { escolhidas.delete(cod); removeu = true; }
        if (!removeu) {
            const out = new Map<string, Candidata>();
            [...escolhidas].sort().forEach((cod, i) => out.set(cod, { d: byCod.get(cod), i, inicio: memo.get(cod) }));
            return out;
        }
    }
    return new Map();
}

function semDuplicatas(turmas: Turma[]): Turma[] {
    const vistas = new Set<string>();
    return [...turmas].sort((a, b) => (a.prioridadeSI ?? 99) - (b.prioridadeSI ?? 99)).filter(t => {
        const chave = t.horarios.map(h => `${h.diaSemana}${h.periodo}${h.slot}`).sort().join(',');
        if (vistas.has(chave)) return false;
        vistas.add(chave); return true;
    });
}

const termo = (coef: number, nome: string) => `${coef < 0 ? '-' : '+'} ${Math.abs(coef)} ${nome}`;
function expressao(termos: string[]): string {
    const linhas = [];
    for (let i = 0; i < termos.length; i += TERMOS_POR_LINHA) linhas.push(termos.slice(i, i + TERMOS_POR_LINHA).join(' '));
    return linhas.join('\n   ');
}

interface Modelo { lp: string; vars: Variavel[]; }

/** Modelo para semestre final K; `null` se alguma exigência já é impossível (sem variáveis que a atendam). */
function montarModelo(e: EntradaPlano, cands: Map<string, Candidata>, sit: Situacao, K: number, cortes: Corte[]): Modelo | null {
    const livres = Array.from({ length: K }, (_, k) => k + 1).filter(s => !e.fixos.has(s));
    const vars: Variavel[] = [];
    const porCand = new Map<string, Variavel[]>();
    for (const c of cands.values()) {
        const vs: Variavel[] = [];
        for (const s of livres) if (s >= c.inicio)
            semDuplicatas((e.ofertas[s] && e.ofertas[s].get(c.d.codigo)) || []).forEach((t, j) => vs.push({ nome: `x_${c.i}_${s}_${j}`, c, s, turma: t }));
        porCand.set(c.d.codigo, vs); vars.push(...vs);
    }
    const linhas: string[] = [];
    const restricao = (nome: string, termos: string[], op: string, rhs: number) => { linhas.push(` ${nome}: ${expressao(termos)} ${op} ${rhs}`); };

    for (const c of cands.values()) {
        const vs = porCand.get(c.d.codigo);
        const obrigatoria = !c.d.isOpcional;
        if (!vs.length) { if (obrigatoria) return null; continue; }
        restricao(`unica_${c.i}`, vs.map(v => termo(1, v.nome)), obrigatoria ? '=' : '<=', 1);
        for (const p of c.d.preRequisitos) {
            const cp = cands.get(p);
            if (!cp) continue;
            const vp = porCand.get(p);
            for (const s of new Set(vs.map(v => v.s)))
                restricao(`pre_${c.i}_${cp.i}_${s}`, [...vs.filter(v => v.s === s).map(v => termo(1, v.nome)), ...vp.filter(v => v.s < s).map(v => termo(-1, v.nome))], '<=', 0);
        }
    }
    for (const s of livres) {
        const doSem = vars.filter(v => v.s === s);
        if (!doSem.length) continue;
        const porSlot = new Map<string, string[]>();
        doSem.forEach(v => v.turma.horarios.forEach(h => { const k = `${h.diaSemana}${h.periodo}${h.slot}`; porSlot.set(k, [...(porSlot.get(k) || []), v.nome]); }));
        porSlot.forEach((nomes, k) => { if (nomes.length > 1) restricao(`slot_${s}_${k}`, nomes.map(n => termo(1, n)), '<=', 1); });
        const carga = doSem.map(v => termo(1, v.nome));
        restricao(`carga_${s}`, carga, '<=', e.cargaMax);
        restricao(`pico_${s}`, [...carga, termo(-1, 'L')], '<=', 0);
    }
    for (const conj of sit.conjuntos.filter(c => !c.ok)) {
        const vs = vars.filter(v => v.c.d.conjuntoOptativo === conj.id);
        if (!vs.length) return null;
        restricao(`conj_${conj.id}`, vs.map(v => termo(v.c.d.chTotal, v.nome)), '>=', conj.faltante);
    }
    const binarias = vars.map(v => v.nome);
    if (sit.trilhas && !sit.trilhas.ok) {
        const tr = sit.trilhas;
        const vValid: string[] = [], zSoma: string[] = [];
        tr.subareas.forEach((sa, k) => {
            const vs = vars.filter(v => v.c.d.subAreaTrilha === sa.id);
            const potencial = sa.cursada + vs.reduce((a, v) => a + v.c.d.chTotal, 0);
            if (potencial < sa.total) return;
            const ch = vs.map(v => termo(v.c.d.chTotal, v.nome));
            restricao(`valida_${k}`, [...ch, termo(-sa.total, `v_${k}`)], '>=', -sa.cursada);
            restricao(`somah_${k}`, [termo(1, `z_${k}`), ...vs.map(v => termo(-v.c.d.chTotal, v.nome))], '<=', sa.cursada);
            restricao(`somav_${k}`, [termo(1, `z_${k}`), termo(-potencial, `v_${k}`)], '<=', 0);
            vValid.push(termo(1, `v_${k}`)); zSoma.push(termo(1, `z_${k}`)); binarias.push(`v_${k}`);
        });
        if (vValid.length < tr.minimoValidadas) return null;
        restricao('trilhas_validadas', vValid, '>=', tr.minimoValidadas);
        restricao('trilhas_soma', zSoma, '>=', tr.total);
    }
    if (!sit.extensao.ok) {
        const vs = vars.filter(v => (v.c.d.chExt || 0) > 0);
        if (!vs.length) return null;
        restricao('extensao', vs.map(v => termo(v.c.d.chExt, v.nome)), '>=', sit.extensao.faltante);
    }
    for (const [k, corte] of cortes.entries()) {
        const vs = vars.filter(v => v.s === corte.semestre && corte.codigos.includes(v.c.d.codigo));
        const nCods = new Set(vs.map(v => v.c.d.codigo)).size;
        if (nCods) restricao(`corte_${k}`, vs.map(v => termo(1, v.nome)), '<=', nCods - 1);
    }

    const n = Math.max(1, cands.size);
    const maxRank = e.preferenciaTrilhas.length;
    const rank = (d: Disciplina) => { const r = e.preferenciaTrilhas.indexOf(d.subAreaTrilha); return d.subAreaTrilha ? (r < 0 ? maxRank : r) : 0; };
    const urgencia = (d: Disciplina) => d.isOpcional && !d.subAreaTrilha ? URGENCIA_CONJUNTO_FIXO : 1;
    const maxCedo = K * n * URGENCIA_CONJUNTO_FIXO;
    const pesoEquilibrio = maxCedo + 1, maxEquilibrio = pesoEquilibrio * e.cargaMax;
    const pesoTrilha = maxEquilibrio + maxCedo + 1, maxTrilha = pesoTrilha * maxRank * n;
    const pesoQuantidade = maxTrilha + maxEquilibrio + maxCedo + 1;
    const objetivo = [
        ...vars.map(v => termo(pesoQuantidade + pesoTrilha * rank(v.c.d) + urgencia(v.c.d) * v.s, v.nome)),
        termo(pesoEquilibrio, 'L'),
    ];
    const lp = ['Minimize', ` obj: ${expressao(objetivo)}`, 'Subject To', ...linhas, 'Binary', ` ${expressao(binarias)}`, 'End', ''].join('\n');
    return { lp, vars };
}

function extrair(m: Modelo, r: ReturnType<Solver['solve']>): Map<number, ItemPlano[]> {
    const semestres = new Map<number, ItemPlano[]>();
    for (const v of m.vars) {
        const col = r.Columns[v.nome];
        if (!col || (col.Primal ?? 0) < 0.5) continue;
        semestres.set(v.s, [...(semestres.get(v.s) || []), { codigo: v.c.d.codigo, turma: v.turma }]);
    }
    return semestres;
}

function diagnosticar(e: EntradaPlano, sit: Situacao, cands: Map<string, Candidata>, fixadas: Map<string, number>): MotivoInviavel[] {
    const byCod = porCodigo(e.matriz.disciplinas);
    const motivos: MotivoInviavel[] = [];
    for (const cod of sit.obrigatorias.pendentes) {
        if (cands.has(cod)) continue;
        const d = byCod.get(cod);
        const presos = d.preRequisitos.filter(p => byCod.has(p) && cumpridaDesde(e, fixadas, p) === Infinity && !cands.has(p));
        const motivo = !ofertada(e, cod) ? 'nenhuma turma ofertada que caiba nas suas preferências (turnos, campus, janela de horário) e bloqueios'
            : presos.length ? `depende de ${presos.map(p => `${p} ${byCod.get(p).nome}`).join(', ')}, que não dá para cursar antes`
                : `não cabe em até ${e.maxSemestres} semestres`;
        motivos.push({ cod, nome: d.nome, motivo });
    }
    for (const conj of sit.conjuntos.filter(c => !c.ok)) {
        const disponivel = [...cands.values()].filter(c => c.d.conjuntoOptativo === conj.id).reduce((a, c) => a + c.d.chTotal, 0);
        if (disponivel < conj.faltante) motivos.push({ cod: null, nome: conj.nome, motivo: `faltam ${conj.faltante} h de ${conj.nome}, mas as optativas ofertadas que cabem nas suas preferências somam ${disponivel} h` });
    }
    if (!sit.extensao.ok) {
        const disponivel = [...cands.values()].reduce((a, c) => a + (c.d.chExt || 0), 0);
        if (disponivel < sit.extensao.faltante) motivos.push({ cod: null, nome: 'Extensão', motivo: `faltam ${sit.extensao.faltante} h de extensão e as optativas extensionistas ofertadas somam ${disponivel} h — lance as horas feitas por fora` });
    }
    if (!motivos.length) motivos.push({ cod: null, nome: null, motivo: `Não há combinação de turmas sem conflito de horário que conclua o curso em até ${e.maxSemestres} semestres com no máximo ${e.cargaMax} matérias por semestre.` });
    return motivos;
}

/** Agrupa por código as turmas que `permitida` aceita (preferências, bloqueios e trabalho fixo do semestre). */
export function agruparOfertas(turmas: Turma[], permitida: (t: Turma) => boolean): Map<string, Turma[]> {
    const m = new Map<string, Turma[]>();
    for (const t of turmas) if (permitida(t)) m.set(t.codigo, [...(m.get(t.codigo) || []), t]);
    return m;
}

/** Situação inicial do modelo: cumpridas, itens manuais marcados e semestres fixos já contam. */
export function situacaoInicial(e: EntradaPlano): Situacao {
    const todas = new Set([...e.cumpridas, ...e.disponivelApos.keys(), ...[...e.fixos.values()].flat()]);
    return situacao(e.matriz, todas, e.lancamentos);
}

/** Plano de menor semestre final. Com `K`, resolve só esse horizonte; `cortes` proíbem combinações já vistas. */
export function planejar(solver: Solver, e: EntradaPlano, opcoes: { K?: number; cortes?: Corte[] } = {}): Plano {
    const fixadas = fixadasPorCodigo(e);
    const sit = situacaoInicial(e);
    const ultimoFixo = Math.max(0, ...e.fixos.keys());
    if (!faltaCursar(sit)) return { status: 'ok', ultimo: ultimoFixo, semestres: new Map() };
    const cands = selecionarCandidatas(e, sit, fixadas);
    const inicioObrigatorias = sit.obrigatorias.pendentes.map(c => cands.has(c) ? cands.get(c).inicio : Infinity);
    const kMin = opcoes.K ?? Math.max(1, ultimoFixo, ...inicioObrigatorias.filter(Number.isFinite));
    const kMax = opcoes.K ?? e.maxSemestres;
    if (inicioObrigatorias.some(s => !Number.isFinite(s))) return { status: 'inviavel', motivos: diagnosticar(e, sit, cands, fixadas) };
    for (let K = kMin; K <= kMax; K++) {
        const m = montarModelo(e, cands, sit, K, opcoes.cortes || []);
        if (!m) continue;
        const r = resolverComCache(solver, m.lp);
        if (r.Status === 'Optimal') return { status: 'ok', ultimo: K, semestres: extrair(m, r) };
    }
    return { status: 'inviavel', motivos: diagnosticar(e, sit, cands, fixadas) };
}

/** Até `n` grades alternativas para o semestre `s`, mantendo o mesmo semestre final; cada uma proíbe as anteriores. */
export function alternativas(solver: Solver, e: EntradaPlano, plano: Plano, s: number, n = 3): ItemPlano[][] {
    if (plano.status !== 'ok' || !plano.semestres.has(s)) return [];
    const vistas = [plano.semestres.get(s)];
    for (let k = 0; k < n; k++) {
        const cortes = vistas.map(g => ({ semestre: s, codigos: g.map(i => i.codigo) }));
        const alt = planejar(solver, e, { K: plano.ultimo, cortes });
        if (alt.status !== 'ok' || !alt.semestres.has(s)) break;
        vistas.push(alt.semestres.get(s));
    }
    return vistas.slice(1);
}

/**
 * Por que cada disciplina está no plano, percorrendo os semestres em ordem (`sequencia`: idx → códigos, fixos e planejados).
 * Ex.: "fecha as 45 h que faltavam de Humanidades", "2ª matéria da trilha Redes (valida a subárea)", "pré-requisito de TCC 2".
 */
export function motivosDoPlano(e: EntradaPlano, sequencia: [number, string[]][]): Map<string, string[]> {
    const byCod = porCodigo(e.matriz.disciplinas);
    const cumulativas = new Set([...e.cumpridas, ...e.disponivelApos.keys()]);
    const ordem = (d: Disciplina) => `${d.isOpcional ? 1 : 0}${d.subAreaTrilha ? 1 : 0}${d.conjuntoOptativo || ''}${d.subAreaTrilha || ''}${d.codigo}`;
    const motivos = new Map<string, string[]>();
    const ordenada = [...sequencia].sort((a, b) => a[0] - b[0]);
    for (const [s, cods] of ordenada) {
        for (const d of cods.map(c => byCod.get(c)).filter(Boolean).sort((a, b) => ordem(a).localeCompare(ordem(b)))) {
            const antes = situacao(e.matriz, cumulativas, e.lancamentos);
            cumulativas.add(d.codigo);
            const depois = situacao(e.matriz, cumulativas, e.lancamentos);
            const m: string[] = [];
            if (!d.isOpcional && antes.obrigatorias.pendentes.includes(d.codigo)) m.push(`obrigatória do ${d.periodoSugerido}º período`);
            const cAntes = antes.conjuntos.find(c => c.id === d.conjuntoOptativo), cDepois = depois.conjuntos.find(c => c.id === d.conjuntoOptativo);
            if (cAntes && !cAntes.ok) m.push(cDepois.ok ? `fecha as ${cAntes.faltante} h que faltavam de ${cAntes.nome}` : `${d.chTotal} h de ${cAntes.nome} (faltam ${cDepois.faltante} h)`);
            if (d.subAreaTrilha && antes.trilhas && !antes.trilhas.ok) {
                const sa = antes.trilhas.subareas.find(x => x.id === d.subAreaTrilha), saD = depois.trilhas.subareas.find(x => x.id === d.subAreaTrilha);
                const n = [...cumulativas].filter(c => byCod.get(c) && byCod.get(c).subAreaTrilha === d.subAreaTrilha).length;
                m.push(`${n}ª matéria da trilha ${sa.nome}${!sa.validada && saD.validada ? ' (valida a subárea)' : ''}${depois.trilhas.ok ? ' — fecha as trilhas' : ''}`);
            }
            if ((d.chExt || 0) > 0 && !antes.extensao.ok) m.push(`+${d.chExt} h de extensão`);
            for (const [s2, cods2] of ordenada) if (s2 > s) for (const c2 of cods2) if (byCod.get(c2) && byCod.get(c2).preRequisitos.includes(d.codigo)) m.push(`pré-requisito de ${byCod.get(c2).nome}`);
            motivos.set(d.codigo, [...new Set(m)]);
        }
    }
    return motivos;
}
