import { describe, expect, it } from 'vitest';
import { parseMatriz, tituloCase, verificarMatriz, type Disciplina, type Matriz } from '../src/parser';
import type { ItemPdf } from '../src/pdf-extracao';

const item = (str: string, x: number, yTop: number): ItemPdf => ({ str, x, yTop, w: str.length * 5, h: 9 });
const cargas = (valores: number[], y: number, yTotal = y) => valores.map((v, k) => item(String(v), 380 + 17 * k, k === 8 ? yTotal : y));
const cabecalho = (y: number) => [
    item('Total', 470, y - 10), item('Período', 20, y), item('[OPT]', 40, y), item('Código', 80, y),
    item('Modelo', 300, y), item('teóricas', 380, y + 2), item('Pré-', 560, y),
];

const paginaDesalinhada = {
    h: 800,
    items: [
        ...cabecalho(100),
        item('ICSD20', 80, 189), item('INTRODUÇÃO', 110, 189), item('À', 160, 189), item('LÓGICA', 170, 189),
        item('FORMAÇÃO', 300, 194), item('BÁSICA', 340, 194),
        ...cargas([2, 1, 3, 0, 0, 0, 0, 0, 45], 196.5, 192.5), item('1', 20, 196.5), item('Turmas', 80, 199), item('horas', 516, 201),
        item('ICSF13', 80, 222.5), item('FUNDAMENTOS', 110, 222.5), item('DA', 180, 222.5), item('ÉTICA', 195, 222.5),
        item('ICSD20', 560, 224), item('[1161]', 40, 226), item('HUMANIDADES', 300, 228),
        ...cargas([2, 0, 2, 0, 0, 0, 30, 0, 30], 230, 226), item('2', 20, 230), item('Turmas', 80, 232),
        ...cabecalho(260),
        item('ICSX51', 80, 314), item('ESTÁGIO', 110, 314), item('1', 150, 314), item('ESTÁGIO', 300, 318),
        ...cargas([0, 0, 0, 0, 0, 0, 0, 0, 200], 320), item('3', 20, 320), item('Período:5', 560, 320),
        item('CÂMPUS:', 20, 700), item('CURITIBA', 70, 700),
        item('CHTOBRIGATORIASMATRIZ:', 20, 720), item('245', 150, 720), item('CHTOPTATIVASMATRIZ:', 200, 720), item('30', 330, 720),
        item('CHEXTENSAO:', 20, 735), item('30', 150, 735), item('CHELETIVA:', 200, 735), item('0', 330, 735),
    ],
};

describe('tituloCase', () => {
    it.each([
        ['ÁLGEBRA LINEAR', 'Álgebra Linear'],
        ['FUNDAMENTOS DA ÉTICA', 'Fundamentos da Ética'],
        ['METODOLOGIAS ÁGEIS', 'Metodologias Ágeis'],
        ['INTRODUÇÃO ÀS CIÊNCIAS COGNITIVAS', 'Introdução às Ciências Cognitivas'],
        ['A ARTE DE PROGRAMAR', 'A Arte de Programar'],
        ['ESTÁGIO 1', 'Estágio 1'],
    ])('%s → %s', (entrada, esperado) => expect(tituloCase(entrada)).toBe(esperado));

    it('aceita acentos decompostos (NFD)', () => expect(tituloCase('ÁLGEBRA'.normalize('NFD'))).toBe('Álgebra'));
    it('devolve string vazia para entrada vazia ou nula', () => {
        expect(tituloCase('')).toBe('');
        expect(tituloCase(null)).toBe('');
    });
});

describe('parseMatriz por geometria de tabela', () => {
    const matriz = parseMatriz([paginaDesalinhada]);
    const [logica, etica, estagio] = matriz.disciplinas;

    it('lê as linhas mesmo com período, código e carga total em alturas diferentes', () => {
        expect(matriz.disciplinas.map(d => d.codigo)).toEqual(['ICSD20', 'ICSF13', 'ICSX51']);
    });

    it('extrai nome, modelo e cargas da coluna certa', () => {
        expect(logica).toMatchObject<Partial<Disciplina>>({
            nome: 'Introdução à Lógica', periodoSugerido: 1, modeloDisciplina: 'FORMAÇÃO BÁSICA',
            chTotal: 45, chSemanal: 3, chExt: 0, preRequisitos: [], periodoMinimo: null,
            conjuntoOptativo: null, subAreaTrilha: null, isOpcional: false,
        });
    });

    it('não deixa os pré-requisitos de uma linha caírem na linha de cima', () => {
        expect(logica.preRequisitos).toEqual([]);
        expect(etica.preRequisitos).toEqual(['ICSD20']);
    });

    it('lê o conjunto optativo e a extensão', () => {
        expect(etica).toMatchObject<Partial<Disciplina>>({ nome: 'Fundamentos da Ética', conjuntoOptativo: '1161', isOpcional: true, chExt: 30, chTotal: 30 });
    });

    it('corta a linha no cabeçalho repetido no meio da página', () => {
        expect(etica.modeloDisciplina).toBe('HUMANIDADES');
        expect(estagio.modeloDisciplina).toBe('ESTÁGIO');
    });

    it('lê "Período:N" como período mínimo', () => {
        expect(estagio).toMatchObject<Partial<Disciplina>>({ nome: 'Estágio 1', periodoMinimo: 5, chTotal: 200, preRequisitos: [] });
    });

    it('lê os totais do rodapé', () => {
        expect(matriz.resumo).toMatchObject({ chObrigatoriaTotal: 245, chOptativasTotal: 30, chExtensaoTotal: 30, chEletivaTotal: 0 });
    });
});

describe('verificarMatriz', () => {
    const obrigatoria = (i: number, chTotal: number): Disciplina => ({
        codigo: `ICS${String(i).padStart(3, '0')}`, nome: `Disciplina ${i}`, periodoSugerido: 1, chTotal, chSemanal: 2, chExt: 0,
        modeloDisciplina: '', preRequisitos: [], periodoMinimo: null, conjuntoOptativo: null, subAreaTrilha: null, isOpcional: false,
    });
    const matrizCom = (disciplinas: Disciplina[], chObrigatoriaTotal: number | null, chExtensaoTotal: number | null = 330): Matriz => ({
        disciplinas, subareas: {},
        resumo: { chObrigatoriaTotal, chOptativasTotal: 840, chExtensaoTotal, chEletivaTotal: 105, conjuntosOptativos: [] },
    });
    const vinte = Array.from({ length: 20 }, (_, i) => obrigatoria(i, 10));

    it('aceita quando a soma das obrigatórias bate com o rodapé', () => {
        expect(verificarMatriz(matrizCom(vinte, 200))).toEqual({ ok: true });
    });

    it('recusa quando a soma das obrigatórias não bate com o rodapé', () => {
        expect(verificarMatriz(matrizCom(vinte, 2005))).toEqual({ ok: false, problemas: ['as obrigatórias lidas somam 200 h, mas o rodapé da matriz informa 2005 h'] });
    });

    it('recusa quando vêm menos de 20 disciplinas', () => {
        const v = verificarMatriz(matrizCom(vinte.slice(0, 1), 10));
        expect(v.ok).toBe(false);
        expect(v.ok === false && v.problemas[0]).toMatch(/^só 1 disciplina/);
    });

    it('recusa quando falta um total do rodapé', () => {
        expect(verificarMatriz(matrizCom(vinte, 200, null))).toEqual({ ok: false, problemas: ['não encontrei o total CHEXTENSAO no rodapé da matriz'] });
    });

    it('recusa uma sessão antiga sem resumo em vez de quebrar', () => {
        expect(verificarMatriz({ ...matrizCom(vinte, 200), resumo: undefined }).ok).toBe(false);
    });
});
