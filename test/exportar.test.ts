import { describe, expect, it } from 'vitest';
import { aulasDaGrade, gerarIcs, periodoLetivoEstimado } from '../src/exportar';

const disciplina = (codigo: string, nome: string) => ({ codigo, nome });
const sel = [
    { disciplina: disciplina('ICSX40', 'Trabalho de Conclusão 1'), turma: { turma: 'S73', professor: 'Fulano; de Tal' }, horarios: [{ diaSemana: 4, periodo: 'T', slot: 6, sala: 'CB-201' }, { diaSemana: 4, periodo: 'N', slot: 1, sala: 'CB-201' }] },
    { disciplina: disciplina('ICSA31', 'Teoria da Computação'), turma: { turma: 'S71', professor: '' }, horarios: [{ diaSemana: 5, periodo: 'T', slot: 5, sala: 'CA-102' }, { diaSemana: 5, periodo: 'T', slot: 4, sala: 'CA-102' }, { diaSemana: 2, periodo: 'M', slot: 1, sala: 'CE-1' }] },
    { disciplina: disciplina('ICSX99', 'Em conflito'), turma: { turma: 'S01' }, bloqueado: true, horarios: [{ diaSemana: 3, periodo: 'M', slot: 1 }] },
];

describe('aulasDaGrade', () => {
    const aulas = aulasDaGrade(sel);

    it('junta horários consecutivos no mesmo dia, mesmo com o intervalo entre turnos', () => {
        expect(aulas.find(a => a.codigo === 'ICSX40')).toMatchObject({ diaSemana: 4, inicioMin: 17 * 60 + 40, fimMin: 19 * 60 + 35, sala: 'CB-201' });
        expect(aulas.find(a => a.codigo === 'ICSA31' && a.diaSemana === 5)).toMatchObject({ inicioMin: 16 * 60, fimMin: 17 * 60 + 40 });
    });

    it('separa dias diferentes e ignora matérias em conflito com bloqueio', () => {
        expect(aulas.map(a => `${a.codigo}/${a.diaSemana}`)).toEqual(['ICSA31/2', 'ICSX40/4', 'ICSA31/5']);
    });
});

describe('gerarIcs', () => {
    const ics = gerarIcs(aulasDaGrade(sel), { inicio: '2027-03-01', fim: '2027-07-03' }, '2027/1', new Date('2026-11-09T12:00:00Z'));
    const linhas = ics.split('\r\n');

    it('usa CRLF e abre/fecha o calendário', () => {
        expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(ics.replace(/\r\n/g, '')).not.toMatch(/\n/);
        expect(linhas[0]).toBe('BEGIN:VCALENDAR');
    });

    it('cria uma aula semanal a partir da primeira ocorrência do dia', () => {
        expect(linhas).toContain('DTSTART:20270303T174000');
        expect(linhas).toContain('DTEND:20270303T193500');
        expect(linhas).toContain('DTSTART:20270301T073000');
        expect(linhas.filter(l => l === 'RRULE:FREQ=WEEKLY;UNTIL=20270703T235959')).toHaveLength(3);
        expect(linhas.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(3);
    });

    it('escapa ponto e vírgula e vírgula nos textos', () => {
        expect(ics).toContain('Prof. Fulano\\; de Tal');
    });

    it('dobra linhas longas em até 75 bytes', () => {
        const longa = gerarIcs([{ codigo: 'ICS001', nome: 'Á'.repeat(80), turma: 'S01', professor: '', sala: '', diaSemana: 2, inicioMin: 450, fimMin: 500 }], { inicio: '2027-03-01', fim: '2027-03-31' }, 'x');
        for (const l of longa.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
        expect(longa).toMatch(/\r\n Á/);
    });

    it('não cria evento que começaria depois do fim', () => {
        expect(gerarIcs(aulasDaGrade(sel), { inicio: '2027-03-01', fim: '2027-03-01' }, 'x').match(/BEGIN:VEVENT/g)).toHaveLength(1);
    });
});

describe('periodoLetivoEstimado', () => {
    it('começa na primeira segunda-feira de março ou de agosto', () => {
        expect(periodoLetivoEstimado(2027, 1)).toEqual({ inicio: '2027-03-01', fim: '2027-07-03' });
        expect(periodoLetivoEstimado(2027, 2).inicio).toBe('2027-08-02');
    });
});
