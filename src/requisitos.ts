/* ===================================================================
    Compass+ — Requisitos de integralização (puro, sem DOM; testável em Node).
    A partir da matriz estruturada (conjuntos e regra das trilhas vindos do histórico),
    das disciplinas cumpridas e dos lançamentos feitos por fora, calcula o que falta
    em cada requisito e confere o cálculo com o "Resumo Geral" do histórico.
    =================================================================== */
import type { Disciplina, Matriz, ResumoGeral, ResumoOptativas } from './parser';

export interface Linha { total: number; cursada: number; faltante: number; ok: boolean; }
export interface SituacaoConjunto extends Linha { id: string; nome: string; }
export interface SituacaoSubarea extends Linha { id: string; nome: string; validada: boolean; }
/** `cursada` = soma das subáreas validadas (com excedente); `faltante` = mínimo de horas que ainda falta para fechar a regra. */
export interface SituacaoTrilhas extends Linha { id: string; nome: string; minimoValidadas: number; validadas: number; subareas: SituacaoSubarea[]; }
export interface Situacao {
    obrigatorias: Linha & { pendentes: string[]; manuaisPendentes: string[] };
    optativas: Linha;
    conjuntos: SituacaoConjunto[];
    trilhas: SituacaoTrilhas | null;
    extensao: Linha;
    eletivas: Linha;
}
/** Horas feitas por fora das disciplinas da matriz (empresa júnior, eletivas de outro curso…). */
export interface Lancamentos { extensao: number; eletivas: number; eletivasValidadas: number; }
export interface Divergencia { requisito: string; app: number; historico: number; }

const RE_SEM_TURMA = /EST[ÁA]GIO|ATIVIDADES COMPLEMENTARES/i;
/** Disciplina sem turma, que o aluno marca como concluída (estágios, atividades complementares). */
export function ehManual(d: Disciplina): boolean { return RE_SEM_TURMA.test(d.modeloDisciplina || ''); }

const linha = (total: number, cursada: number): Linha => ({ total, cursada, faltante: Math.max(0, total - cursada), ok: cursada >= total });
const somaCh = (ds: Disciplina[]) => ds.reduce((a, d) => a + d.chTotal, 0);

function situacaoTrilhas(m: Matriz, cumpridas: Disciplina[]): SituacaoTrilhas | null {
    const regra = m.resumo.trilhas;
    if (!regra) return null;
    const subareas = regra.subareas.map(s => {
        const l = linha(s.chObrigatoria, somaCh(cumpridas.filter(d => d.subAreaTrilha === s.id)));
        return { ...l, id: s.id, nome: s.nome, validada: l.ok };
    });
    const validadas = subareas.filter(s => s.validada);
    const somaValidadas = validadas.reduce((a, s) => a + s.cursada, 0);
    const faltamValidar = Math.max(0, regra.minimoValidadas - validadas.length);
    const maisProximas = subareas.filter(s => !s.validada).sort((a, b) => a.faltante - b.faltante).slice(0, faltamValidar);
    const horasParaValidar = maisProximas.reduce((a, s) => a + s.faltante, 0);
    const somaAposValidar = somaValidadas + maisProximas.reduce((a, s) => a + s.total, 0);
    const ok = validadas.length >= regra.minimoValidadas && somaValidadas >= regra.chObrigatoria;
    const faltante = ok ? 0 : Math.max(1, horasParaValidar + Math.max(0, regra.chObrigatoria - somaAposValidar));
    return {
        id: regra.id, nome: regra.nome, minimoValidadas: regra.minimoValidadas, validadas: validadas.length, subareas,
        total: regra.chObrigatoria, cursada: somaValidadas, faltante, ok,
    };
}

/** Situação dos requisitos com as disciplinas `cumpridas` (códigos) e os lançamentos por fora. */
export function situacao(m: Matriz, cumpridas: Set<string>, lanc: Lancamentos): Situacao {
    const feitas = m.disciplinas.filter(d => cumpridas.has(d.codigo));
    const obrigatorias = m.disciplinas.filter(d => !d.isOpcional);
    const idTrilhas = m.resumo.trilhas ? m.resumo.trilhas.id : null;
    const conjuntos = m.resumo.conjuntosOptativos.filter(c => c.id !== idTrilhas).map(c => ({
        ...linha(c.chObrigatoria, somaCh(feitas.filter(d => d.conjuntoOptativo === c.id))), id: c.id, nome: c.nome,
    }));
    const trilhas = situacaoTrilhas(m, feitas);
    const optativasValidas = conjuntos.reduce((a, c) => a + Math.min(c.cursada, c.total), 0) + (trilhas ? Math.min(trilhas.cursada, trilhas.total) : 0);
    const pendentes = obrigatorias.filter(d => !cumpridas.has(d.codigo));
    return {
        obrigatorias: {
            ...linha(m.resumo.chObrigatoriaTotal, somaCh(obrigatorias.filter(d => cumpridas.has(d.codigo)))),
            pendentes: pendentes.filter(d => !ehManual(d)).map(d => d.codigo),
            manuaisPendentes: pendentes.filter(ehManual).map(d => d.codigo),
        },
        optativas: linha(m.resumo.chOptativasTotal, optativasValidas),
        conjuntos,
        trilhas,
        extensao: linha(m.resumo.chExtensaoTotal, feitas.reduce((a, d) => a + (d.chExt || 0), 0) + lanc.extensao),
        eletivas: linha(m.resumo.chEletivaTotal, lanc.eletivasValidadas + lanc.eletivas),
    };
}

/** Tudo cumprido, inclusive itens manuais e lançamentos. */
export function integralizado(s: Situacao): boolean {
    return s.obrigatorias.ok && !s.obrigatorias.pendentes.length && !s.obrigatorias.manuaisPendentes.length &&
        s.conjuntos.every(c => c.ok) && (!s.trilhas || s.trilhas.ok) && s.extensao.ok && s.eletivas.ok;
}

/** Cursar `d` agora reduz algum requisito ainda aberto? (obrigatória pendente, conjunto ou trilhas incompletos, extensão faltando) */
export function reduzRequisito(d: Disciplina, s: Situacao): boolean {
    if (!d.isOpcional) return s.obrigatorias.pendentes.includes(d.codigo);
    if ((d.chExt || 0) > 0 && !s.extensao.ok) return true;
    if (d.subAreaTrilha) return !!s.trilhas && !s.trilhas.ok;
    return s.conjuntos.some(c => c.id === d.conjuntoOptativo && !c.ok);
}

/** Requisitos que dependem de cursar disciplinas com turma (o que o planejador precisa cobrir). */
export function faltaCursar(s: Situacao): boolean {
    return s.obrigatorias.pendentes.length > 0 || s.conjuntos.some(c => !c.ok) || (!!s.trilhas && !s.trilhas.ok) || !s.extensao.ok;
}

/** Diferenças entre o cálculo do app só com as aprovadas e os números oficiais do histórico. */
export function conferirComHistorico(m: Matriz, aprovadas: Set<string>, resumoGeral: ResumoGeral | null, resumoOptativas: ResumoOptativas | null): Divergencia[] {
    const s = situacao(m, aprovadas, { extensao: 0, eletivas: 0, eletivasValidadas: 0 });
    const out: Divergencia[] = [];
    const comparar = (requisito: string, app: number, historico: number | null | undefined) => {
        if (historico != null && app !== historico) out.push({ requisito, app, historico });
    };
    if (resumoGeral && resumoGeral.obrigatorias) {
        comparar('Obrigatórias cursadas e aprovadas (h)', s.obrigatorias.cursada, resumoGeral.obrigatorias.aprovada);
        comparar('Obrigatórias faltantes (h)', s.obrigatorias.faltante, resumoGeral.obrigatorias.faltante);
    }
    if (resumoGeral && resumoGeral.extensao) comparar('Extensão cursada (h)', s.extensao.cursada, resumoGeral.extensao.cursada);
    for (const c of (resumoOptativas ? resumoOptativas.conjuntos : [])) {
        const feitas = m.disciplinas.filter(d => aprovadas.has(d.codigo) && d.conjuntoOptativo === c.id);
        comparar(`${c.nome} cursada (h)`, somaCh(feitas), c.chCursada);
    }
    return out;
}
