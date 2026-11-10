/* ===================================================================
    Compass+ — Prontidão das trilhas (puro, sem DOM; testável em Node).
    Para sugerir a ordem de preferência: quanto falta em cada subárea e quantas
    matérias já liberadas e ofertadas no horário do aluno bastam para validá-la.
    =================================================================== */
import type { Matriz } from './parser';

export interface ProntidaoTrilha {
    id: string;
    nome: string;
    cursada: number;
    faltaValidar: number;
    liberadas: { codigo: string; nome: string; chTotal: number }[];
    horasLiberadas: number;
    /** Menor nº de matérias liberadas que valida a subárea; Infinity se as liberadas não bastam. */
    materiasParaValidar: number;
}

/** Subáreas da regra de trilhas, da mais pronta para a menos pronta. `ofertada` diz se o código tem turma que cabe nas preferências. */
export function prontidaoDasTrilhas(m: Matriz, cumpridas: Set<string>, ofertada: (codigo: string) => boolean): ProntidaoTrilha[] {
    const regra = m.resumo.trilhas;
    if (!regra) return [];
    const naMatriz = new Set(m.disciplinas.map(d => d.codigo));
    const liberada = (d: Matriz['disciplinas'][number]) => !cumpridas.has(d.codigo) && ofertada(d.codigo) && d.preRequisitos.every(p => cumpridas.has(p) || !naMatriz.has(p));
    return regra.subareas.map(s => {
        const daSubarea = m.disciplinas.filter(d => d.subAreaTrilha === s.id);
        const cursada = daSubarea.filter(d => cumpridas.has(d.codigo)).reduce((a, d) => a + d.chTotal, 0);
        const faltaValidar = Math.max(0, s.chObrigatoria - cursada);
        const liberadas = daSubarea.filter(liberada).map(d => ({ codigo: d.codigo, nome: d.nome, chTotal: d.chTotal })).sort((a, b) => b.chTotal - a.chTotal);
        let acumulado = 0, materiasParaValidar = faltaValidar === 0 ? 0 : Infinity;
        for (let i = 0; i < liberadas.length && materiasParaValidar === Infinity; i++) {
            acumulado += liberadas[i].chTotal;
            if (acumulado >= faltaValidar) materiasParaValidar = i + 1;
        }
        return { id: s.id, nome: s.nome, cursada, faltaValidar, liberadas, horasLiberadas: liberadas.reduce((a, d) => a + d.chTotal, 0), materiasParaValidar };
    }).sort((a, b) => a.materiasParaValidar - b.materiasParaValidar || b.horasLiberadas - a.horasLiberadas || a.nome.localeCompare(b.nome));
}

/** Ids das trilhas empatadas como as mais prontas (mesmo nº de matérias para validar); vazio se não há empate no topo. */
export function empateNoTopo(lista: ProntidaoTrilha[]): string[] {
    if (!lista.length || !Number.isFinite(lista[0].materiasParaValidar)) return [];
    const topo = lista.filter(t => t.materiasParaValidar === lista[0].materiasParaValidar);
    return topo.length > 1 ? topo.map(t => t.id) : [];
}
