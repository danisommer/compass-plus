import { describe, expect, it } from 'vitest';
import K from '../src/engine';
import { detectarEquivalencias, diferemSoPorNumero, estruturarConjuntos, identificarPdf, parseHistorico, parseMatriz, parseTurmasAbertas, semestreDaOferta } from '../src/parser';
import { empateNoTopo, prontidaoDasTrilhas } from '../src/trilhas';
import { carregarFixture } from './carregar-fixture';

const paginas = { matriz: carregarFixture('matriz'), historico: carregarFixture('historico'), turmas: carregarFixture('turmas') };
const historico = parseHistorico(paginas.historico);
const estrutura = estruturarConjuntos(parseMatriz(paginas.matriz), historico.resumoOptativas);
if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
const { matriz } = estrutura;
const turmas = parseTurmasAbertas(paginas.turmas);

describe('upload único: cada PDF é reconhecido pelo conteúdo', () => {
    it('identifica matriz, histórico e turmas', () => {
        expect(identificarPdf(paginas.matriz)).toBe('matriz');
        expect(identificarPdf(paginas.historico)).toBe('historico');
        expect(identificarPdf(paginas.turmas)).toBe('gnh');
    });

    it('não reconhece um PDF qualquer', () => {
        expect(identificarPdf([{ h: 800, items: [{ str: 'Boleto', x: 10, yTop: 10, w: 30, h: 9 }] }])).toBeNull();
    });

    it('lê o semestre da oferta', () => expect(semestreDaOferta(paginas.turmas)).toEqual({ ano: 2026, per: 2 }));
});

describe('cabeçalho do histórico', () => {
    it('separa curso e matriz dos rótulos seguintes da linha', () => {
        expect(historico.aluno.curso).toBe('236 - Sist De Informação');
        expect(historico.aluno.matriz).toBe('981 - Matriz 3 De Sistemas De Informação');
        expect(historico.aluno.matrizCodigo).toBe('981');
    });

    it('lê por que o aluno está retido no 5º período', () => {
        expect(historico.aluno.retencao).toEqual({ limite: 16, aulasFaltantes: 21.95, periodo: 5 });
    });
});

describe('divergências de código', () => {
    const { auto, divergencias } = detectarEquivalencias(matriz, turmas, historico.aluno.matrizCodigo);

    it('equivale automaticamente o prefixo I (CSX41 → ICSX41)', () => expect(auto).toEqual({ CSX41: 'ICSX41' }));

    it('marca "Não" para as disciplinas de outros cursos, que não listam a matriz 981', () => {
        expect(divergencias.map(d => [d.gnhCod, d.matrizCod, d.padrao]).sort()).toEqual([
            ['ELEB20', 'ICSW4B', 'nao'], ['ELET30', 'ICSR31', 'nao'], ['EST70A', 'EST70C', 'nao'], ['IF69D', 'ICSV30', 'nao'],
        ]);
        expect(divergencias.find(d => d.gnhCod === 'IF69D').matrizesListadas.sort()).toEqual(['543', '616']);
    });

    it('marca "Sim" quando a turma lista a matriz do aluno', () => {
        const comLista = turmas.map(t => t.codigo === 'IF69D' ? { ...t, optativaMatrizes: [...t.optativaMatrizes, 'Matriz:981'] } : t);
        const d = detectarEquivalencias(matriz, comLista, '981').divergencias.find(x => x.gnhCod === 'IF69D');
        expect(d).toMatchObject({ listaMatriz: true, padrao: 'sim' });
    });

    it.each([
        ['Trabalho de Integração 1', 'Trabalho de Integração 2', true],
        ['Cálculo II', 'Cálculo III', true],
        ['Estruturas de Dados 1', 'Estruturas de Dados 1', false],
        ['Comunicação de Dados', 'Comunicação Oral e Escrita', false],
    ])('"%s" × "%s" diferem só por número: %s', (a, b, esperado) => expect(diferemSoPorNumero(a, b)).toBe(esperado));

    it('nunca sugere TI 1 × TI 2', () => {
        const ti2 = [{ ...turmas[0], codigo: 'XYZ999', nome: 'Trabalho de Integração 1', optativaMatrizes: [] }];
        const naMatriz = { ...matriz, disciplinas: matriz.disciplinas.filter(d => d.codigo !== 'ICSX20') };
        expect(detectarEquivalencias(naMatriz, ti2, '981').divergencias).toEqual([]);
    });
});

describe('prontidão das trilhas', () => {
    const pref = { campusUnico: true, campus: 'CURITIBA', turnos: ['T', 'N'] };
    const comTurma = new Set(turmas.filter(t => K.turmaNasPreferencias(t, pref)).map(t => t.codigo));
    const lista = prontidaoDasTrilhas(matriz, new Set([...historico.cursadasAprovadas, ...historico.emAndamento]), c => comTurma.has(c));

    it('cobre as 12 subáreas, das mais prontas para as menos', () => {
        expect(lista).toHaveLength(12);
        for (let i = 1; i < lista.length; i++) expect(lista[i].materiasParaValidar).toBeGreaterThanOrEqual(lista[i - 1].materiasParaValidar);
    });

    it('conta só matérias com pré-requisitos cumpridos e turma no horário', () => {
        for (const t of lista) for (const d of t.liberadas) {
            expect(comTurma.has(d.codigo)).toBe(true);
            expect(matriz.disciplinas.find(x => x.codigo === d.codigo).subAreaTrilha).toBe(t.id);
        }
    });

    it('aponta empate entre as mais prontas', () => {
        const topo = lista.filter(t => t.materiasParaValidar === lista[0].materiasParaValidar);
        expect(empateNoTopo(lista)).toEqual(topo.length > 1 ? topo.map(t => t.id) : []);
    });

    it('sem empate no topo, não pede escolha', () => {
        const unica = [{ ...lista[0], materiasParaValidar: 1 }, ...lista.slice(1).map(t => ({ ...t, materiasParaValidar: 2 }))];
        expect(empateNoTopo(unica)).toEqual([]);
    });
});
