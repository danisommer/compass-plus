import { describe, expect, it } from 'vitest';
import { estruturarConjuntos, parseHistorico, parseMatriz, type Disciplina, type Matriz } from '../src/parser';
import { conferirComHistorico, ehManual, faltaCursar, integralizado, situacao } from '../src/requisitos';
import { carregarFixture } from './carregar-fixture';

const SEM_LANCAMENTOS = { extensao: 0, eletivas: 0, eletivasValidadas: 0 };
const trilha = (codigo: string, subArea: string, chTotal: number): Disciplina => ({
    codigo, nome: codigo, periodoSugerido: 5, chTotal, chSemanal: chTotal / 15, chExt: 0, modeloDisciplina: '',
    preRequisitos: [], periodoMinimo: null, conjuntoOptativo: '1160', subAreaTrilha: subArea, isOpcional: true,
});
const subareas = ['A', 'B', 'C', 'D'].map(id => ({ id, nome: `Subárea ${id}`, chObrigatoria: 90 }));
const matrizTrilhas = (disciplinas: Disciplina[]): Matriz => ({
    disciplinas, subareas: {},
    resumo: {
        chObrigatoriaTotal: 0, chOptativasTotal: 345, chExtensaoTotal: 0, chEletivaTotal: 0,
        conjuntosOptativos: [{ id: '1160', nome: 'Trilhas', periodoInicial: 4, periodoFinal: 8, chObrigatoria: 345, disciplinas: disciplinas.map(d => d.codigo) }],
        trilhas: { id: '1160', nome: 'Trilhas', chObrigatoria: 345, minimoValidadas: 3, subareas },
    },
});

describe('regra das trilhas (D4): só contam subáreas validadas', () => {
    const ds = [trilha('A1', 'A', 90), trilha('B1', 'B', 90), trilha('C1', 'C', 60), trilha('C2', 'C', 60), trilha('D1', 'D', 60)];
    const m = matrizTrilhas(ds);

    it('horas soltas numa subárea não validada não contam para as 345 h', () => {
        const t = situacao(m, new Set(['A1', 'B1', 'C1', 'C2', 'D1']), SEM_LANCAMENTOS).trilhas;
        expect(t.validadas).toBe(3);
        expect(t.cursada).toBe(300);
        expect(t.ok).toBe(false);
        expect(t.faltante).toBe(45);
    });

    it('o excedente de uma subárea validada conta', () => {
        const m2 = matrizTrilhas([trilha('A1', 'A', 120), trilha('B1', 'B', 120), trilha('C1', 'C', 105)]);
        const t = situacao(m2, new Set(['A1', 'B1', 'C1']), SEM_LANCAMENTOS).trilhas;
        expect(t).toMatchObject({ validadas: 3, cursada: 345, ok: true, faltante: 0 });
    });

    it('com menos de 3 subáreas validadas, falta ao menos o que fecha as mais próximas', () => {
        const t = situacao(m, new Set(['A1', 'C1']), SEM_LANCAMENTOS).trilhas;
        expect(t.validadas).toBe(1);
        expect(t.faltante).toBe(30 + 90 + 75);
    });
});

describe('requisitos com o histórico real', () => {
    const historico = parseHistorico(carregarFixture('historico'));
    const estrutura = estruturarConjuntos(parseMatriz(carregarFixture('matriz')), historico.resumoOptativas);
    if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
    const { matriz } = estrutura;
    const aprovadas = new Set(historico.cursadasAprovadas);

    it('bate com o "Resumo Geral" e o "Resumo Optativas" do histórico', () => {
        expect(conferirComHistorico(matriz, aprovadas, historico.resumoGeral, historico.resumoOptativas)).toEqual([]);
    });

    it('calcula o que falta só com as aprovadas', () => {
        const s = situacao(matriz, aprovadas, SEM_LANCAMENTOS);
        expect(s.obrigatorias).toMatchObject({ total: 2005, cursada: 1395, faltante: 610 });
        expect(s.conjuntos.map(c => [c.id, c.cursada, c.faltante])).toEqual([['1159', 135, 225], ['1161', 90, 45]]);
        expect(s.trilhas).toMatchObject({ validadas: 0, cursada: 0, ok: false });
        expect(s.extensao).toMatchObject({ total: 330, cursada: 60, faltante: 270 });
        expect([...s.obrigatorias.manuaisPendentes].sort()).toEqual(['ICSX51', 'ICSX52']);
    });

    it('trata estágio e atividades complementares como itens manuais, e o TCC 2 como disciplina planejável', () => {
        const porCodigo = new Map(matriz.disciplinas.map(d => [d.codigo, d]));
        expect(ehManual(porCodigo.get('ICSX51'))).toBe(true);
        expect(ehManual(porCodigo.get('ICSX50'))).toBe(true);
        expect(ehManual(porCodigo.get('ICSX41'))).toBe(false);
    });

    it('lançamentos por fora contam para extensão e eletivas', () => {
        const s = situacao(matriz, aprovadas, { extensao: 270, eletivas: 105, eletivasValidadas: 0 });
        expect(s.extensao.ok).toBe(true);
        expect(s.eletivas.ok).toBe(true);
        expect(faltaCursar(s)).toBe(true);
        expect(integralizado(s)).toBe(false);
    });
});
