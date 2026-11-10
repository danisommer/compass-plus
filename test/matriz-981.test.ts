import { describe, expect, it } from 'vitest';
import { estruturarConjuntos, parseHistorico, parseMatriz, verificarMatriz } from '../src/parser';
import { carregarFixture } from './carregar-fixture';

const matriz = parseMatriz(carregarFixture('matriz'));
const estrutura = estruturarConjuntos(matriz, parseHistorico(carregarFixture('historico')).resumoOptativas);
const porCodigo = new Map(matriz.disciplinas.map(d => [d.codigo, d]));
const disciplina = (codigo: string) => {
    const d = porCodigo.get(codigo);
    if (!d) throw new Error(`${codigo} não foi lida da matriz`);
    return d;
};

describe('Matriz 981 — Sistemas de Informação (fixture anonimizada)', () => {
    it('passa na verificação de sanidade', () => expect(verificarMatriz(matriz)).toEqual({ ok: true }));

    it('lê as 149 disciplinas', () => expect(matriz.disciplinas).toHaveLength(149));

    it('as obrigatórias somam 2.005 h', () => {
        expect(matriz.disciplinas.filter(d => !d.isOpcional).reduce((a, d) => a + d.chTotal, 0)).toBe(2005);
    });

    it('lê os totais do rodapé', () => {
        expect(matriz.resumo).toMatchObject({ chObrigatoriaTotal: 2005, chOptativasTotal: 840, chExtensaoTotal: 330, chEletivaTotal: 105 });
    });

    it('separa os conjuntos optativos (1159, 1161 e 1160 nas 12 subáreas), com a estrutura do histórico', () => {
        if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
        const optativas = estrutura.matriz.disciplinas.filter(d => d.isOpcional);
        const doConjunto = (id: string) => optativas.filter(d => d.conjuntoOptativo === id);
        expect(doConjunto('1159')).toHaveLength(10);
        expect(doConjunto('1161')).toHaveLength(14);
        expect(doConjunto('1160')).toHaveLength(optativas.length - 24);
        expect(new Set(doConjunto('1160').map(d => d.subAreaTrilha))).toEqual(new Set(Object.keys(estrutura.matriz.subareas)));
        expect(Object.keys(estrutura.matriz.subareas)).toHaveLength(12);
    });

    it.each([
        ['ICSH31', ['GEE7A1', 'ICSE20', 'ICSX10']],
        ['ICSM31', ['ICSB30', 'ICSG20']],
        ['ICSX40', ['ICSX30']],
    ])('%s tem os pré-requisitos %j', (codigo, esperados) => {
        expect([...disciplina(codigo).preRequisitos].sort()).toEqual(esperados);
    });

    it('ICSX51 (Estágio 1) exige o 4º período', () => expect(disciplina('ICSX51').periodoMinimo).toBe(4));

    it.each([['ICSX20', 60], ['FCH7PC', 60], ['FCH7XB', 45]])('%s tem %i h de extensão', (codigo, horas) => {
        expect(disciplina(codigo).chExt).toBe(horas);
    });

    it('escreve os nomes acentuados corretamente', () => {
        const nomes = matriz.disciplinas.map(d => d.nome);
        expect(nomes).toContain('Álgebra Linear');
        expect(nomes).toContain('Fundamentos da Ética');
        expect(nomes.some(n => n.startsWith('Metodologias Ágeis'))).toBe(true);
    });
});
