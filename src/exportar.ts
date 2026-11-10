/* ===================================================================
    Compass+ — Exportação da grade de um semestre (puro, sem DOM; testável em Node).
    Gera um calendário iCalendar (.ics, RFC 5545) com as aulas semanais da grade.
    =================================================================== */
import K from './engine';

/** Um bloco de aula semanal: horários consecutivos da mesma disciplina no mesmo dia. */
export interface AulaIcs { codigo: string; nome: string; turma: string; professor: string; sala: string; diaSemana: number; inicioMin: number; fimMin: number; }
export interface PeriodoLetivo { inicio: string; fim: string; }

const INTERVALO_MAX_ENTRE_AULAS = 20;
const DURACAO_SEMESTRE_DIAS = 17 * 7 + 5;
const LIMITE_LINHA_BYTES = 75;

/** Junta os horários de cada disciplina da grade em blocos contínuos por dia (com tolerância ao intervalo entre aulas). */
export function aulasDaGrade(sel): AulaIcs[] {
    const out: AulaIcs[] = [];
    for (const s of (sel || []).filter(x => !x.bloqueado)) {
        const porDia = new Map<number, { ini: number; fim: number; sala: string }[]>();
        for (const h of s.horarios || []) {
            const faixa = K.SLOTS[h.periodo] && K.SLOTS[h.periodo][h.slot];
            if (!faixa) continue;
            porDia.set(h.diaSemana, [...(porDia.get(h.diaSemana) || []), { ini: K.hhmmMin(faixa[0]), fim: K.hhmmMin(faixa[1]), sala: h.sala || '' }]);
        }
        for (const [dia, faixas] of porDia) {
            const ordenadas = faixas.sort((a, b) => a.ini - b.ini);
            let atual = { ...ordenadas[0] };
            const fechar = () => out.push({ codigo: s.disciplina.codigo, nome: s.disciplina.nome, turma: s.turma ? s.turma.turma : '', professor: s.turma ? s.turma.professor || '' : '', sala: atual.sala, diaSemana: dia, inicioMin: atual.ini, fimMin: atual.fim });
            for (const f of ordenadas.slice(1)) {
                if (f.ini - atual.fim <= INTERVALO_MAX_ENTRE_AULAS) atual.fim = Math.max(atual.fim, f.fim);
                else { fechar(); atual = { ...f }; }
            }
            fechar();
        }
    }
    return out.sort((a, b) => a.diaSemana - b.diaSemana || a.inicioMin - b.inicioMin);
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');
const dataUtc = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const isoDe = (d: Date) => `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
const compacta = (iso: string) => iso.replace(/-/g, '');
const horaIcs = (min: number) => `${doisDigitos(Math.floor(min / 60))}${doisDigitos(min % 60)}00`;

/** Datas prováveis de aula de um semestre (1º: a partir da 1ª segunda de março; 2º: de agosto), para o usuário ajustar. */
export function periodoLetivoEstimado(ano: number, per: number): PeriodoLetivo {
    const inicio = dataUtc(`${ano}-${per === 1 ? '03' : '08'}-01`);
    while (inicio.getUTCDay() !== 1) inicio.setUTCDate(inicio.getUTCDate() + 1);
    const fim = new Date(inicio); fim.setUTCDate(fim.getUTCDate() + DURACAO_SEMESTRE_DIAS);
    return { inicio: isoDe(inicio), fim: isoDe(fim) };
}

/** Primeira data em `inicio` ou depois que cai no dia da semana da UTFPR (2 = segunda … 7 = sábado). */
function primeiraOcorrencia(inicio: string, diaSemana: number): string {
    const d = dataUtc(inicio);
    while (d.getUTCDay() !== (diaSemana - 1) % 7) d.setUTCDate(d.getUTCDate() + 1);
    return isoDe(d);
}

const escaparTexto = (s: string) => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function dobrarLinha(linha: string): string {
    const codificador = new TextEncoder();
    const partes: string[] = [];
    let atual = '', bytes = 0;
    for (const ch of linha) {
        const n = codificador.encode(ch).length;
        const limite = partes.length ? LIMITE_LINHA_BYTES - 1 : LIMITE_LINHA_BYTES;
        if (bytes + n > limite) { partes.push(atual); atual = ''; bytes = 0; }
        atual += ch; bytes += n;
    }
    partes.push(atual);
    return partes.join('\r\n ');
}

/** Calendário com cada aula repetida toda semana entre `periodo.inicio` e `periodo.fim` (horário local, sem fuso). */
export function gerarIcs(aulas: AulaIcs[], periodo: PeriodoLetivo, rotulo: string, agora: Date = new Date()): string {
    const carimbo = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compass+//Planejador UTFPR//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escaparTexto(`Compass+ ${rotulo}`)}`];
    for (const a of aulas) {
        const dia = primeiraOcorrencia(periodo.inicio, a.diaSemana);
        if (dia > periodo.fim) continue;
        linhas.push(
            'BEGIN:VEVENT',
            `UID:${compacta(dia)}-${a.codigo}-${a.turma || 'sem-turma'}-${a.diaSemana}-${horaIcs(a.inicioMin)}@compass-plus`,
            `DTSTAMP:${carimbo}`,
            `DTSTART:${compacta(dia)}T${horaIcs(a.inicioMin)}`,
            `DTEND:${compacta(dia)}T${horaIcs(a.fimMin)}`,
            `RRULE:FREQ=WEEKLY;UNTIL=${compacta(periodo.fim)}T235959`,
            `SUMMARY:${escaparTexto(`${a.codigo} ${a.nome}`)}`,
            ...(a.sala ? [`LOCATION:${escaparTexto(a.sala)}`] : []),
            `DESCRIPTION:${escaparTexto([a.turma && `Turma ${a.turma}`, a.professor && `Prof. ${a.professor}`].filter(Boolean).join(' · '))}`,
            'END:VEVENT',
        );
    }
    linhas.push('END:VCALENDAR');
    return linhas.map(dobrarLinha).join('\r\n') + '\r\n';
}
