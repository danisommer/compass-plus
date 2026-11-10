import { describe, expect, it } from 'vitest';
import { estruturarConjuntos, parseHistorico, parseMatriz, type ResumoOptativas } from '../src/parser';
import { carregarFixture } from './carregar-fixture';

const historico = parseHistorico(carregarFixture('historico'));

describe('Histórico da matriz 981 (fixture anonimizada)', () => {
    it('lê período, semestre letivo e disciplinas em andamento', () => {
        expect(historico.aluno.periodoAtual).toBe(5);
        expect(historico.semestreMatriculadas).toEqual({ ano: 2026, per: 2 });
        expect([...historico.emAndamento].sort()).toEqual(['FCH7FA', 'ICSH31', 'ICSI30', 'ICSS30', 'ICSX30']);
    });

    it('lê os conjuntos do "Resumo Optativas"', () => {
        expect(historico.resumoOptativas.conjuntos.map(c => [c.id, c.chObrigatoria, c.chCursada, c.chFaltante])).toEqual([
            ['1159', 360, 135, 225],
            ['1161', 135, 90, 45],
            ['1160', 345, 0, null],
        ]);
        expect(historico.resumoOptativas.conjuntos[2].nome).toBe('Terceiro Estrato - Trilhas Em Computação');
    });

    it('lê a regra das trilhas: 12 subáreas de 90 h, 3 validadas', () => {
        const { trilhas } = historico.resumoOptativas;
        expect(trilhas.id).toBe('1160');
        expect(trilhas.minimoValidadas).toBe(3);
        expect(trilhas.subareas).toHaveLength(12);
        expect(new Set(trilhas.subareas.map(s => s.chObrigatoria))).toEqual(new Set([90]));
        expect(trilhas.subareas.find(s => s.id === '1173').nome).toBe('Otimização, Mod Analíticos E Simulação');
    });

    it('lê o "Resumo Eletiva"', () => {
        expect(historico.resumoEletiva).toEqual({ total: 105, cursada: 0, faltante: 105, validada: 0 });
    });

    it('lê o "Resumo Geral"', () => {
        expect(historico.resumoGeral).toEqual({
            obrigatorias: { total: 2005, cursada: 1530, aprovadaOuValidada: 1395, faltante: 610, aprovada: 1395 },
            optativas: { total: 840, cursada: 405, aprovadaOuValidada: 0, faltante: 840, aprovada: 225 },
            eletivas: { total: 105, cursada: 180, aprovadaOuValidada: 0, faltante: 105, aprovada: 0 },
            extensao: { total: 330, cursada: 60, faltante: 270 },
        });
    });
});

describe('estruturarConjuntos com a matriz 981', () => {
    const estrutura = estruturarConjuntos(parseMatriz(carregarFixture('matriz')), historico.resumoOptativas);
    if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
    const { matriz } = estrutura;

    it('troca o id da subárea pelo conjunto de trilhas e guarda a subárea', () => {
        const otimizacao = matriz.disciplinas.find(d => d.codigo === 'ICSD47');
        expect(otimizacao).toMatchObject({ conjuntoOptativo: '1160', subAreaTrilha: '1173', periodoMinimo: 7 });
    });

    it('usa as cargas e a regra de trilhas do histórico', () => {
        expect(matriz.resumo.conjuntosOptativos.map(c => [c.id, c.chObrigatoria])).toEqual([['1159', 360], ['1161', 135], ['1160', 345]]);
        expect(matriz.resumo.trilhas).toMatchObject({ id: '1160', chObrigatoria: 345, minimoValidadas: 3 });
        expect(Object.keys(matriz.subareas)).toHaveLength(12);
    });

    it('é idempotente', () => {
        const de_novo = estruturarConjuntos(matriz, historico.resumoOptativas);
        expect(de_novo.ok && de_novo.matriz.disciplinas).toEqual(matriz.disciplinas);
    });
});

describe('estruturarConjuntos com dados incompletos', () => {
    const matrizMinima = parseMatriz([]);
    const comOptativa = { ...matrizMinima, disciplinas: [{ codigo: 'ICS999', nome: 'X', periodoSugerido: 3, chTotal: 45, chSemanal: 3, chExt: 0, modeloDisciplina: '', preRequisitos: [], periodoMinimo: null, conjuntoOptativo: '9999', subAreaTrilha: null, isOpcional: true }] };
    const resumo: ResumoOptativas = { conjuntos: [{ id: '1159', nome: 'Segundo Estrato', periodoInicial: 3, periodoFinal: 6, chs: 24, chObrigatoria: 360, chCursada: 0, chFaltante: 360, chValidada: 0 }], trilhas: null };

    it('recusa quando o histórico não traz o resumo', () => {
        expect(estruturarConjuntos(matrizMinima, null)).toEqual({ ok: false, problemas: ['não encontrei o "Resumo Optativas" no histórico'] });
    });

    it('recusa quando a matriz cita um conjunto que o histórico não descreve', () => {
        expect(estruturarConjuntos(comOptativa, resumo)).toEqual({ ok: false, problemas: ['a matriz cita conjunto(s) que o histórico não descreve: 9999'] });
    });
});
