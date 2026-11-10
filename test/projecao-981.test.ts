import highsLoader from 'highs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectarEquivalencias, estruturarConjuntos, parseHistorico, parseMatriz, parseTurmasAbertas } from '../src/parser';
import { carregarFixture } from './carregar-fixture';

vi.mock('../src/solver', async () => {
    const highs = await highsLoader();
    return { carregarSolver: async () => highs, obterSolver: () => highs };
});
vi.mock('../src/log', () => ({ log: () => undefined, registrarEstado: () => undefined, iniciarLog: () => undefined, descreverErro: (e: unknown) => ({ mensagem: String(e) }) }));

const estado = await import('../src/state');

const historico = parseHistorico(carregarFixture('historico'));
const estrutura = estruturarConjuntos(parseMatriz(carregarFixture('matriz')), historico.resumoOptativas);
if (!estrutura.ok) throw new Error(estrutura.problemas.join('; '));
const { matriz } = estrutura;
const turmas = parseTurmasAbertas(carregarFixture('turmas'));

function estadoDoDono() {
    const st = estado.novoEstado();
    st.parsed = { matriz, historico, gnh: turmas, gnhSemestre: '2026/2' };
    st.equivalencias = detectarEquivalencias(matriz, turmas).auto;
    st.preferencias = { ...st.preferencias, campusUnico: true, campus: 'CURITIBA', turnos: ['T', 'N'], cargaMax: 7, preferenciaTrilhas: Object.keys(matriz.subareas) };
    st.manuais.estagios = { ICSX51: 1, ICSX52: 2 };
    st.manuais.extensao.porSem = { 1: 270 };
    st.manuais.eletiva.porSem = { 1: 105 };
    st.fase = 'app';
    st.abaAtiva = 1;
    return st;
}
const projetado = () => { estado.derive(); return estado.D.projecao; };

describe('projeção do app (state.derive) com as fixtures do dono', () => {
    beforeEach(() => estado.setEstado(estadoDoDono()));

    it('projeta até 2027/2 e marca a formatura no último semestre', () => {
        const p = projetado();
        expect(p.map(s => s.rotulo)).toEqual(['2026/2', '2027/1', '2027/2']);
        expect(p[2].formatura).toBe(true);
        expect(p[1].formatura).toBe(false);
    });

    it('mostra o plano e as alternativas do semestre em exibição, sem pontuação', () => {
        const [, sem1, sem2] = projetado();
        expect(sem1.grades.length).toBeGreaterThan(1);
        expect(sem1.recKey).toBe(0);
        expect(sem2.grades).toHaveLength(1);
        for (const g of sem1.grades) expect(g).not.toHaveProperty('score');
    });

    it('cada matéria planejada explica por que está ali', () => {
        for (const sem of projetado().slice(1)) for (const s of sem.grade.sel) expect(s.motivos.length, s.disciplina.codigo).toBeGreaterThan(0);
    });

    it('avisa que a oferta futura é estimada a partir de 2026/2', () => {
        const [, sem1, sem2] = projetado();
        expect(sem1.oferta).toEqual({ rotulo: '2026/2', estimada: true });
        expect(sem2.oferta).toEqual({ rotulo: '2026/2', estimada: true });
    });

    it('usa a oferta guardada de mesma paridade quando existe', () => {
        estado.S.ofertas = { '2027/1': turmas };
        const [, sem1, sem2] = projetado();
        expect(sem1.oferta).toEqual({ rotulo: '2027/1', estimada: false });
        expect(sem2.oferta).toEqual({ rotulo: '2026/2', estimada: true });
    });

    it('um semestre confirmado fica fixo e o resto é reotimizado', () => {
        const alternativa = projetado()[1].grades[1];
        estado.S.escolhas[1] = { codigos: alternativa.sel.map(s => s.disciplina.codigo), turmas: Object.fromEntries(alternativa.sel.map(s => [s.disciplina.codigo, s.turma.turma])), custom: false };
        const p = projetado();
        expect(p[1].status).toBe('confirmado');
        expect(p[1].grades).toHaveLength(1);
        expect(p[1].grade.sel.map(s => s.disciplina.codigo).sort()).toEqual(alternativa.sel.map(s => s.disciplina.codigo).sort());
        expect(p.at(-1).rotulo).toBe('2027/2');
        expect(p.at(-1).formatura).toBe(true);
    });

    it('sem extensão lançada, termina em "sem solução" com o motivo', () => {
        estado.S.manuais.extensao.porSem = {};
        const p = projetado();
        const ultimo = p.at(-1);
        expect(ultimo.cursoImpossivel).toBe(true);
        expect(ultimo.motivosImpossivel.map(m => m.motivo).join(' ')).toMatch(/extensão/);
    });

    it('sem os estágios marcados, para em "quase lá" no último semestre com matérias', () => {
        estado.S.manuais.estagios = {};
        const ultimo = projetado().at(-1);
        expect(ultimo.rotulo).toBe('2027/2');
        expect(ultimo.formatura).toBe(false);
        expect(ultimo.quaseFormatura).toBe(true);
        expect([...ultimo.horas.obrigatorias.manuaisPendentes].sort()).toEqual(['ICSX51', 'ICSX52']);
    });
});
