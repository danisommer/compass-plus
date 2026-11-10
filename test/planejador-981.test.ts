import highsLoader from 'highs';
import { beforeAll, describe, expect, it } from 'vitest';
import K from '../src/engine';
import { detectarEquivalencias, estruturarConjuntos, parseHistorico, parseMatriz, parseTurmasAbertas } from '../src/parser';
import { agruparOfertas, alternativas, motivosDoPlano, planejar, type EntradaPlano, type ItemPlano, type Plano, type Solver } from '../src/planejador';
import { carregarFixture } from './carregar-fixture';

const historico = parseHistorico(carregarFixture('historico'));
const estrutura = estruturarConjuntos(parseMatriz(carregarFixture('matriz')), historico.resumoOptativas);
if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
const { matriz } = estrutura;
const porCodigo = new Map(matriz.disciplinas.map(d => [d.codigo, d]));
const turmas = parseTurmasAbertas(carregarFixture('turmas'));
const equivalencias = detectarEquivalencias(matriz, turmas).auto;
const oferta = turmas.map(t => ({ ...t, codigo: equivalencias[t.codigo] || t.codigo }));

const MAX_SEMESTRES = 14;
const SEMESTRE_ATUAL = historico.semestreMatriculadas.ano * 2 + historico.semestreMatriculadas.per - 1;
const rotulo = (idx: number) => { const n = SEMESTRE_ATUAL + idx; return `${Math.floor(n / 2)}/${(n % 2) + 1}`; };
const TARDE_NOITE = { campusUnico: true, campus: 'CURITIBA', turnos: ['T', 'N'] };
const A_PARTIR_DE_T4 = { ...TARDE_NOITE, janela: { inicio: 'T4', fim: 'N5' } };

function entrada(pref, cargaMax: number, extensaoPorFora = 270, fixos = new Map<number, string[]>()): EntradaPlano {
    const ofertas = [];
    for (let s = 1; s <= MAX_SEMESTRES; s++) ofertas[s] = agruparOfertas(oferta, t => K.turmaNasPreferencias(t, pref));
    return {
        matriz,
        cumpridas: new Set([...historico.cursadasAprovadas, ...historico.emAndamento]),
        disponivelApos: new Map([['ICSX51', 1], ['ICSX52', 2]]),
        fixos, ofertas,
        lancamentos: { extensao: extensaoPorFora, eletivas: 105, eletivasValidadas: 0 },
        periodoAtual: historico.aluno.periodoAtual,
        cargaMax, cargaMin: 4,
        preferenciaTrilhas: Object.keys(matriz.subareas),
        maxSemestres: MAX_SEMESTRES,
    };
}
const sequencia = (p: Plano): [number, string[]][] => p.status === 'ok' ? [...p.semestres.entries()].map(([s, its]) => [s, its.map(i => i.codigo)]) : [];
const semestreDe = (p: Plano, f: (i: ItemPlano) => boolean) => p.status === 'ok' ? [...p.semestres.entries()].find(([, its]) => its.some(f))?.[0] : undefined;

let highs: Solver;
beforeAll(async () => { highs = (await highsLoader()) as unknown as Solver; });

describe('Planejador — critérios de aceite da Fase 2 (fixtures do dono)', () => {
    it('Tarde e Noite, campus Curitiba, carga máxima 7 (TCC conta): último semestre com matérias = 2027/2', () => {
        const p = planejar(highs, entrada(TARDE_NOITE, 7));
        expect(p.status).toBe('ok');
        expect(p.status === 'ok' && rotulo(p.ultimo)).toBe('2027/2');
    });

    it('só aulas a partir de T4 e carga máxima 5: 2028/1', () => {
        const p = planejar(highs, entrada(A_PARTIR_DE_T4, 5));
        expect(p.status === 'ok' && rotulo(p.ultimo)).toBe('2028/1');
    });

    it.each([['Tarde e Noite', TARDE_NOITE, 7], ['a partir de T4', A_PARTIR_DE_T4, 5]])('%s: toda matéria planejada reduz algum requisito', (_, pref, carga) => {
        const e = entrada(pref, carga as number);
        const motivos = motivosDoPlano(e, sequencia(planejar(highs, e)));
        expect(motivos.size).toBeGreaterThan(0);
        for (const [codigo, m] of motivos) expect(m, codigo).not.toEqual([]);
    });

    it.each([['Tarde e Noite', TARDE_NOITE, 7], ['a partir de T4', A_PARTIR_DE_T4, 5]])('%s: respeita carga, conflitos, turnos e janela', (_, pref: any, carga) => {
        const p = planejar(highs, entrada(pref, carga as number));
        if (p.status !== 'ok') throw new Error('plano inviável');
        for (const itens of p.semestres.values()) {
            expect(itens.length).toBeLessThanOrEqual(carga as number);
            const slots = itens.flatMap(i => i.turma.horarios.map(h => `${h.diaSemana}${h.periodo}${h.slot}`));
            expect(new Set(slots).size).toBe(slots.length);
            for (const i of itens) expect(K.turmaNasPreferencias(i.turma, pref)).toBe(true);
        }
    });

    it('cumpre os pré-requisitos dentro do plano', () => {
        const p = planejar(highs, entrada(TARDE_NOITE, 7));
        const cumpridas = new Set([...historico.cursadasAprovadas, ...historico.emAndamento]);
        for (const [s, cods] of sequencia(p).sort((a, b) => a[0] - b[0])) {
            for (const c of cods) for (const pre of porCodigo.get(c).preRequisitos) if (porCodigo.has(pre)) expect(cumpridas.has(pre), `${c} antes de ${pre}`).toBe(true);
            cods.forEach(c => cumpridas.add(c));
            expect(s).toBeGreaterThan(0);
        }
    });

    it('Humanidades entra no primeiro semestre, e não depois de fechar as trilhas', () => {
        const e = entrada(TARDE_NOITE, 7);
        const p = planejar(highs, e);
        const motivos = motivosDoPlano(e, sequencia(p));
        const humanidades = semestreDe(p, i => porCodigo.get(i.codigo).conjuntoOptativo === '1161');
        const fechaTrilhas = semestreDe(p, i => (motivos.get(i.codigo) || []).some(m => m.includes('fecha as trilhas')));
        expect(humanidades).toBe(1);
        expect(humanidades).toBeLessThanOrEqual(fechaTrilhas);
    });

    it('sem a extensão feita por fora, explica que as optativas extensionistas não bastam', () => {
        const p = planejar(highs, entrada(TARDE_NOITE, 7, 0));
        expect(p.status).toBe('inviavel');
        expect(p.status === 'inviavel' && p.motivos.map(m => m.motivo).join(' ')).toMatch(/faltam 270 h de extensão/);
    });
});

describe('Planejador — alternativas e semestres confirmados', () => {
    it('as alternativas trocam a grade do semestre e mantêm o semestre final', () => {
        const e = entrada(TARDE_NOITE, 7);
        const p = planejar(highs, e);
        if (p.status !== 'ok') throw new Error('plano inviável');
        const atual = p.semestres.get(1).map(i => i.codigo).sort().join(',');
        const alts = alternativas(highs, e, p, 1);
        expect(alts.length).toBeGreaterThan(0);
        expect(alts.length).toBeLessThanOrEqual(3);
        const chaves = alts.map(a => a.map(i => i.codigo).sort().join(','));
        expect(chaves).not.toContain(atual);
        expect(new Set(chaves).size).toBe(chaves.length);
    });

    it('um semestre confirmado vira restrição fixa e o resto é reotimizado', () => {
        const e = entrada(TARDE_NOITE, 7);
        const p = planejar(highs, e);
        const [alt] = alternativas(highs, e, p, 1);
        const confirmado = alt.map(i => i.codigo);
        const p2 = planejar(highs, entrada(TARDE_NOITE, 7, 270, new Map([[1, confirmado]])));
        if (p2.status !== 'ok') throw new Error('plano inviável');
        expect(p2.semestres.has(1)).toBe(false);
        expect(rotulo(p2.ultimo)).toBe('2027/2');
        for (const itens of p2.semestres.values()) for (const i of itens) expect(confirmado).not.toContain(i.codigo);
    });
});
