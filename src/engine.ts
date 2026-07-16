/* ===================================================================
    Compass+ — Motor de cálculos e planejamento (puro, sem DOM; testável em Node).
    Grafo de dependências, geração de grades, alocação de trabalho e cálculo de
    horas faltantes. Consome as estruturas produzidas pelo parser de PDFs
    (`parser.ts`). Módulo ES: exporta `default` o objeto API (importado como `K`
    nos demais módulos), reunindo parsing + cálculos numa única superfície.
    =================================================================== */
import Parser, { TRILHA_SUBAREAS, REQUISITOS } from './parser';

/* ---------- Constantes de horário (Apêndice A) ---------- */
const SLOTS = {
    M: { 1: ['07h30', '08h20'], 2: ['08h20', '09h10'], 3: ['09h10', '10h00'], 4: ['10h20', '11h10'], 5: ['11h10', '12h00'], 6: ['12h00', '12h50'] },
    T: { 1: ['13h10', '14h00'], 2: ['14h00', '14h50'], 3: ['14h50', '15h40'], 4: ['16h00', '16h50'], 5: ['16h50', '17h40'], 6: ['17h40', '18h30'] },
    N: { 1: ['18h50', '19h35'], 2: ['19h35', '20h20'], 3: ['20h20', '21h05'], 4: ['21h05', '21h50'], 5: ['21h50', '22h30'] },
};
const DIAS = { 2: 'Segunda', 3: 'Terça', 4: 'Quarta', 5: 'Quinta', 6: 'Sexta', 7: 'Sábado' };
// ordem vertical dos slots (M1..M6, T1..T6, N1..N5)
const ORDEM_SLOTS = [];
['M', 'T', 'N'].forEach(p => { const n = p === 'N' ? 5 : 6; for (let s = 1; s <= n; s++) ORDEM_SLOTS.push([p, s]); });
function hhmmMin(s) { const m = String(s).match(/(\d{1,2})[h:](\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
// minutos → 'HH:MM' (formato de <input type="time">; fmtHHMM usa 'HHhMM', só p/ exibição)
const minHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const ceil5 = m => Math.ceil(m / 5) * 5;                   // p/ cima na grade de 5 min (= step do input de hora)
function slotTexto(p, s) { const a = SLOTS[p] && SLOTS[p][s]; return a ? `${a[0]}–${a[1]}` : ''; }
/* ---- Trabalho: dois modos (refatorado) ----
    UM eixo só: `modo` ∈ {'fixo', 'flexivel'}.
      • FIXO     → a janela [inicio, fim] é o bloco exato, igual todo dia útil, e TRAVA a grade:
                   nenhuma aula pode ocupá-la (com a folga). A carga semanal é DERIVADA da janela
                   (= 5 × duração da janela), não é perguntada.
      • FLEXÍVEL → o trabalho encaixa a carga semanal `horas` ao redor das aulas, dentro da
                   janela-limite [inicio, fim]. A distribuição busca HOMOGENEIDADE (horas ÷ 5 por
                   dia, water-filling) e `ancora` define onde o bloco diário se fixa:
                     'inicio' = começo fixo (cresce p/ frente) | 'fim' = fim fixo (cresce p/ trás)
                     | 'livre' = encaixa no maior intervalo livre. */
const DIAS_UTEIS = [2, 3, 4, 5, 6];
const SLOT_MIN = {};                                       // 'M1' -> {ini,fim} em minutos
for (const [p, s] of ORDEM_SLOTS) { const a = SLOTS[p][s]; SLOT_MIN[p + s] = { ini: hhmmMin(a[0]), fim: hhmmMin(a[1]) }; }
// Limites do dia letivo (M1 07h30 → N5 22h30). Só delimitam até onde a faixa-limite pode CRESCER
// sozinha: fora deles não há aula para o trabalho desviar, então alargar mais não ajudaria a grade.
const DIA_INI = 7 * 60 + 30, DIA_FIM = 22 * 60 + 30;
const DEFAULT_TRAB = {
    trabalha: null,                          // null = não respondido | true = Sim | false = Não
    modo: 'fixo',                            // 'fixo' (trava a grade) | 'flexivel' (encaixa ao redor das aulas)
    horas: 20,                               // total semanal (flexível); no fixo é derivado da janela
    inicio: '08:00', fim: '',                // janela: bloco exato (fixo) ou faixa-limite (flexível)
    ancora: 'livre',                         // só flexível: 'inicio' (começo fixo) | 'fim' (fim fixo) | 'livre'
    folga: 0                                 // intervalo mínimo (min) trabalho↔aula, nos dois sentidos
};
// duração da janela [inicio, fim] em horas
function janelaHoras(w) { return Math.max(0, (hhmmMin(w.fim) - hhmmMin(w.inicio)) / 60); }
// teto semanal da janela: o trabalho se espalha pelos 5 dias úteis → nenhuma grade fecha mais que isto
function janelaCapSemanal(w) { return janelaHoras(w) * DIAS_UTEIS.length; }
// span mínimo (min) que a faixa precisa ter p/ comportar `horas` na semana
function spanMinPara(horas) { return ceil5(Math.max(0, +horas || 0) / DIAS_UTEIS.length * 60); }
// a janela padrão ACOMPANHA as horas padrão em vez de ser um valor fixo: se DEFAULT_TRAB.horas mudar,
// a faixa nasce do tamanho certo (20h → 08:00–12:00) sem precisar reeditar este literal.
DEFAULT_TRAB.fim = minHHMM(hhmmMin(DEFAULT_TRAB.inicio) + spanMinPara(DEFAULT_TRAB.horas));

/* Faixa-limite × horas/semana (só modo flexível) — relação de MÃO ÚNICA:
     • mudou `horas`  → a faixa se adapta (ajustarJanelaParaHoras): cresce só se ficou estreita demais
                        p/ comportar horas/5 por dia. Se já cabe, a faixa é preservada como está — a
                        folga extra é justamente o que deixa o trabalho desviar das aulas.
     • mudou a faixa  → `horas` NÃO muda. O usuário manda; se a faixa não comportar o total, a UI avisa
                        (janelaCapSemanal < horas) em vez de corrigir sozinha.
   Sem isso, `horas` acima do teto da faixa gera um déficit que NENHUMA grade fecha — estado que o
   usuário nunca quer e que era fácil não perceber. */
function ajustarJanelaParaHoras(w) {
    w = normTrab(w);
    if (w.modo !== 'flexivel') return w;                   // fixo: a janela É o bloco; horas é derivado dela
    const need = spanMinPara(w.horas);
    let ini = hhmmMin(w.inicio), fim = hhmmMin(w.fim);
    if (fim - ini >= need) return w;                       // já comporta → preserva a faixa (e sua folga)
    // uma faixa já fora do dia letivo vira o próprio limite: nunca encolhemos o que o usuário definiu
    const lo = Math.min(ini, DIA_INI), hi = Math.max(fim, DIA_FIM);
    const p = () => need - (fim - ini);                    // quanto ainda falta alargar
    const cresceFim = () => { fim += Math.min(p(), hi - fim); };
    const cresceIni = () => { ini -= Math.min(p(), ini - lo); };
    // Cresce pela ponta livre: com âncora 'fim' o bloco fica colado no fim da faixa, então mexer no fim
    // moveria justamente a ponta que o usuário fixou → cresce p/ trás. Nos demais casos, o fim primeiro.
    if (w.ancora === 'fim') { cresceIni(); cresceFim(); } else { cresceFim(); cresceIni(); }
    return Object.assign({}, w, { inicio: minHHMM(ini), fim: minHHMM(fim) });
}
function normTrab(w) {
    w = w || {};
    const o = Object.assign({}, DEFAULT_TRAB, w);
    // migração do modelo antigo (varHoras/varHorario/flexLado/flexivel → modo/ancora).
    // Atenção: flexLado nomeava qual ponta VARIAVA; ancora nomeia onde o bloco FICA fixo → invertem-se.
    const varHorario = w.varHorario !== undefined ? w.varHorario : (w.flexivel !== undefined ? w.flexivel : undefined);
    if (w.modo === undefined && varHorario !== undefined) o.modo = varHorario ? 'flexivel' : 'fixo';
    if (w.ancora === undefined && w.flexLado !== undefined) o.ancora = w.flexLado === 'ambos' ? 'livre' : (w.flexLado === 'inicio' ? 'fim' : 'inicio');
    if (!['fixo', 'flexivel'].includes(o.modo)) o.modo = 'fixo';
    if (!['inicio', 'fim', 'livre'].includes(o.ancora)) o.ancora = 'livre';
    if (o.modo === 'fixo') o.horas = 5 * janelaHoras(o);                 // fixo: carga semanal derivada da janela
    for (const k of ['varHoras', 'varHorario', 'flexLado', 'flexivel', 'maxComeco', 'minFim', 'desejInicio', 'desejFim', 'diasVariaveis', 'diasPreferidos'])
        delete o[k];
    return o;
}
function fmtHHMM(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`; }
function fmtDur(h) { const tot = Math.round(h * 60), hh = Math.floor(tot / 60), mm = tot % 60; return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`; }

function janelaTrab(w) {
    w = normTrab(w);
    const ini = hhmmMin(w.inicio), fim = hhmmMin(w.fim);
    return { ini, fim, maxH: Math.max(0, (fim - ini) / 60) };
}

// capacidade de trabalho de UM dia, dado os slots de aula desse dia.
// folga = intervalo mínimo (min) entre o trabalho e qualquer aula (deslocamento), nos dois sentidos.
// Retorna { coreLivre, capH, left, right }: o intervalo [left,right] onde o bloco do dia pode ficar.
function capacidadeDia(w, slotsAula) {
    w = normTrab(w);
    const ini = hhmmMin(w.inicio), fim = hhmmMin(w.fim), gap = Math.max(0, +w.folga || 0);
    const aulas = (slotsAula || []).map(h => SLOT_MIN[h.periodo + h.slot]).filter(Boolean);
    if (w.modo === 'fixo') {
        // FIXO: a janela inteira é o bloco (já travada contra aulas). Uma aula sobre ela (com a
        // folga) "fura" a trava — o dia perde a capacidade e vira conflito.
        const furada = aulas.some(a => (a.fim + gap) > ini && (a.ini - gap) < fim);
        return furada ? { coreLivre: false, capH: 0, left: ini, right: ini }
                      : { coreLivre: true, capH: Math.max(0, (fim - ini) / 60), left: ini, right: fim };
    }
    // FLEXÍVEL: escolhe um intervalo livre dentro de [ini, fim] conforme a âncora.
    return capacidadeFlex(ini, fim, gap, aulas, w.ancora);
}
// Flexível: divide [ini, fim] nos intervalos livres entre as aulas (com folga) e escolhe um conforme a
// âncora. A âncora é uma PREFERÊNCIA de posição, não um veto: se a ponta preferida estiver ocupada por
// aula, o dia ainda trabalha no intervalo livre mais próximo dela (todo dia com folga recebe trabalho).
//  • 'inicio' (começo fixo) → intervalo livre MAIS CEDO (trabalha o quanto antes; = começa em `ini` se livre);
//  • 'fim'    (fim fixo)     → intervalo livre MAIS TARDE (trabalha o quanto depois; = termina em `fim` se livre);
//  • 'livre'                 → o MAIOR intervalo livre (encaixa onde melhor couber).
function capacidadeFlex(ini, fim, gap, aulas, ancora) {
    const within = aulas.filter(a => a.fim > ini && a.ini < fim).sort((a, b) => a.ini - b.ini);
    const livres = []; let cursor = ini;
    for (const a of within) {
        const aIni = Math.max(ini, a.ini - gap), aFim = Math.min(fim, a.fim + gap);
        if (aIni > cursor) livres.push([cursor, aIni]);
        cursor = Math.max(cursor, aFim);
    }
    if (cursor < fim) livres.push([cursor, fim]);
    const validos = livres.filter(iv => iv[1] - iv[0] > 1e-6);   // já em ordem crescente de horário
    let chosen = null;
    if (ancora === 'inicio') chosen = validos[0] || null;                         // mais cedo
    else if (ancora === 'fim') chosen = validos[validos.length - 1] || null;      // mais tarde
    else chosen = validos.reduce((b, iv) => !b || (iv[1] - iv[0]) > (b[1] - b[0]) ? iv : b, null);  // maior
    if (!chosen) return { coreLivre: false, capH: 0, left: ini, right: ini };
    return { coreLivre: true, capH: Math.max(0, (chosen[1] - chosen[0]) / 60), left: chosen[0], right: chosen[1] };
}

// análise de UM dia (= capacidade); mantida como ponto único usado por custoTrab/blocosTrabalhoCalc.
function analiseDia(w, slotsAula) { return capacidadeDia(w, slotsAula); }

// posiciona um bloco de `durMin` minutos no intervalo livre [info.left, info.right] conforme a âncora:
//  • 'fim'             → cola no FIM e cresce p/ trás;
//  • 'inicio'/'livre'  → cola no INÍCIO e cresce p/ frente (no fixo, o bloco É a janela inteira).
// Os horários do bloco são snapados a uma grade de 5 min (evita exibir trabalho terminando às 6h37).
const round5 = m => Math.round(m / 5) * 5;
function placeBloco(w, durMin, info) {
    w = normTrab(w);
    const left = info.left, right = info.right;
    let start, end;
    if (w.modo === 'flexivel' && w.ancora === 'fim') { end = right; start = Math.max(left, end - durMin); }
    else { start = left; end = Math.min(right, start + durMin); }
    // múltiplos de 5 min, sem sair do intervalo livre [left, right] (não invade aula nem a folga)
    const clamp = m => Math.min(right, Math.max(left, round5(m)));
    start = clamp(start); end = clamp(end); if (end < start) end = start;
    return { startMin: start, endMin: end, horas: Math.max(0, (end - start) / 60) };
}

const MIN5 = 5 / 60;     // 5 minutos em horas
// Arredonda horasPorDia à grade de 5 min PRESERVANDO a soma (método do maior resto): cada dia vai
// p/ floor(quanta) e os quanta restantes p/ fechar o total são dados aos dias de maior fração — assim
// o total semanal não perde minutos e a distribuição segue o mais homogênea possível. Respeita a
// capacidade de cada dia (não ultrapassa o intervalo livre cortado pelas aulas).
function snap5Aloc(horasPorDia, dias, capH, alvoSem) {
    const capQ = {}, base = {}, frac = []; let baseSum = 0, capSum = 0;
    for (const d of dias) {
        capQ[d] = Math.floor(capH(d) / MIN5 + 1e-9);                 // capacidade em quanta de 5 min
        const q = Math.min(horasPorDia[d] / MIN5, capQ[d]);
        base[d] = Math.floor(q + 1e-9); baseSum += base[d]; capSum += capQ[d];
        frac.push({ d, f: q - base[d] });
    }
    let resto = Math.min(Math.round(alvoSem / MIN5), capSum) - baseSum;   // quanta p/ fechar o total
    frac.sort((a, b) => b.f - a.f);                                       // maior fração primeiro
    for (const { d } of frac) { if (resto <= 0) break; if (base[d] < capQ[d]) { base[d]++; resto--; } }
    while (resto > 0) { const d = dias.find(x => base[x] < capQ[x]); if (d == null) break; base[d]++; resto--; }
    for (const d of dias) horasPorDia[d] = base[d] * MIN5;
}

// distribui o total semanal entre os dias úteis. FIXO: a janela inteira todo dia (bloco já travado).
// FLEXÍVEL: busca HOMOGENEIDADE (alvoSem/nDias por dia) e só desvia quando a capacidade de um dia
// força, redistribuindo a sobra aos dias com folga (water-filling). No fim, arredonda à grade de 5 min
// preservando a soma (snap5Aloc), p/ os horários exibidos serem redondos sem perder o total semanal.
function alocarTrab(w, infoPorDia) {
    w = normTrab(w);
    const alvoSem = Math.max(0, +w.horas || 0);
    const dias = DIAS_UTEIS.filter(d => infoPorDia[d] != null);
    const horasPorDia = {}; dias.forEach(d => horasPorDia[d] = 0);
    const capH = d => infoPorDia[d].capH;
    // conflitosNucleo só existe no fixo: dia cuja janela travada foi furada por uma aula.
    let conflitosNucleo = 0;
    if (w.modo === 'fixo') dias.forEach(d => { if (!infoPorDia[d].coreLivre) conflitosNucleo++; });
    if (!dias.length || alvoSem <= 0) return { horasPorDia, deficit: 0, rigidConf: 0, conflitosNucleo };

    if (w.modo === 'fixo') {                                 // bloco = janela inteira todo dia útil
        dias.forEach(d => horasPorDia[d] = capH(d));
    } else {
        // Water-filling: eleva um nível uniforme até fechar o total; o dia cuja capacidade (cortada
        // pelas aulas) é menor que o nível satura na própria capacidade e LIBERA a sobra para os demais
        // — assim fica o mais homogêneo possível e TODO dia com capacidade > 0 recebe trabalho.
        const pendentes = dias.filter(d => capH(d) > 1e-6);
        let restante = alvoSem, g = 0;
        while (pendentes.length && restante > 1e-6 && g++ < 100) {
            const nivel = restante / pendentes.length;
            pendentes.sort((a, b) => capH(a) - capH(b));
            const menor = pendentes[0];
            if (capH(menor) <= nivel + 1e-9) {              // não comporta a média: satura e libera a sobra
                horasPorDia[menor] = capH(menor); restante -= capH(menor); pendentes.shift();
            } else {                                        // todos os pendentes comportam o nível: reparte igual
                pendentes.forEach(d => horasPorDia[d] = nivel); restante = 0;
            }
        }
    }
    snap5Aloc(horasPorDia, dias, capH, alvoSem);            // grade de 5 min, soma preservada
    const total = dias.reduce((a, d) => a + horasPorDia[d], 0);
    return { horasPorDia, deficit: Math.max(0, alvoSem - total), rigidConf: 0, conflitosNucleo };
}

// ocupação de aulas por dia útil, a partir de uma seleção (sel[].horarios)
function ocupacaoPorDia(sel) {
    const o = {}; for (const d of DIAS_UTEIS) o[d] = [];
    for (const s of (sel || [])) for (const h of (s.horarios || [])) if (o[h.diaSemana]) o[h.diaSemana].push({ periodo: h.periodo, slot: h.slot });
    return o;
}

// custo do trabalho p/ uma ocupação (usado no score do motor)
function custoTrab(w, ocupadoPorDia) {
    w = normTrab(w);
    if (!w.trabalha || !(+w.horas > 0)) return { deficit: 0, conflitosNucleo: 0, rigidConf: 0 };
    const info = {}; for (const d of DIAS_UTEIS) info[d] = analiseDia(w, ocupadoPorDia[d] || []);
    const { deficit, conflitosNucleo, rigidConf } = alocarTrab(w, info);
    return { deficit, conflitosNucleo, rigidConf };
}

// blocos de trabalho calculados p/ uma grade (precisão de minutos) — exibição
function blocosTrabalhoCalc(w, ocupadoPorDia) {
    w = normTrab(w); ocupadoPorDia = ocupadoPorDia || {};
    const vazio = { intervalos: {}, slots: [], deficit: 0, conflitosNucleo: 0, rigidConf: 0, horasPorDia: {}, total: 0 };
    if (!w.trabalha || !(+w.horas > 0)) return vazio;
    const info = {};
    for (const d of DIAS_UTEIS) info[d] = analiseDia(w, ocupadoPorDia[d] || []);
    const { horasPorDia, deficit, conflitosNucleo, rigidConf } = alocarTrab(w, info);
    const intervalos = {}, slots = []; let total = 0;
    for (const d of DIAS_UTEIS) {
        const horas = horasPorDia[d] || 0; if (horas <= 1e-6) continue;
        const iv = placeBloco(w, horas * 60, info[d]);
        if (iv.horas <= 1e-6) continue;
        intervalos[d] = iv; total += iv.horas;
        for (const [p, s] of ORDEM_SLOTS) { const sm = SLOT_MIN[p + s]; if (iv.startMin < sm.fim && iv.endMin > sm.ini) slots.push({ diaSemana: d, periodo: p, slot: s, nome: 'Trabalho', auto: true }); }
    }
    return { intervalos, slots, deficit, conflitosNucleo, rigidConf, horasPorDia, total };
}

// compat: blocos de trabalho sem grade (janela cheia) — usado como fallback
function blocosTrabalho(w) { return blocosTrabalhoCalc(w, {}).slots; }

/* ===================================================================
    Grafo de dependências + Motor de planejamento
    =================================================================== */
function construirGrafo(disciplinas) {
    const grafo = new Map();
    const byCod = new Map(disciplinas.map(d => [d.codigo, d]));
    for (const d of disciplinas) if (!grafo.has(d.codigo)) grafo.set(d.codigo, { in: new Set(), out: new Set() });
    for (const d of disciplinas)
        for (const p of d.preRequisitos)
            if (byCod.has(p)) { grafo.get(d.codigo).in.add(p); grafo.get(p).out.add(d.codigo); }
    return grafo;
}
function getDisponiveis(grafo, cursadas) {
    const out = [];
    grafo.forEach((v, cod) => { let ok = true; v.in.forEach(p => { if (!cursadas.has(p)) ok = false; }); if (ok && !cursadas.has(cod)) out.push(cod); });
    return out;
}
function getDesbloqueaveis(grafo, codigo, cursadas) {
    const v = grafo.get(codigo); if (!v) return [];
    const futuras = new Set([...cursadas, codigo]);
    const out = [];
    v.out.forEach(nx => { const w = grafo.get(nx); let ok = true; w.in.forEach(p => { if (!futuras.has(p)) ok = false; }); if (ok && !cursadas.has(nx)) out.push(nx); });
    return out;
}
// fecho transitivo de descendentes: todas as matérias que dependem (direta/indiretamente) de cada código.
// Memoizado; assume grafo acíclico (com guarda contra ciclos por garantia).
function descendentesTransitivos(grafo) {
    const memo = new Map();
    const dfs = (cod, pilha) => {
        if (memo.has(cod)) return memo.get(cod);
        const acc = new Set(); const v = grafo.get(cod);
        if (v) v.out.forEach(nx => { if (pilha.has(nx)) return; acc.add(nx); pilha.add(nx); dfs(nx, pilha).forEach(x => acc.add(x)); pilha.delete(nx); });
        memo.set(cod, acc); return acc;
    };
    grafo.forEach((_, cod) => { if (!memo.has(cod)) dfs(cod, new Set([cod])); });
    return memo;
}

function conflita(hA, hB) {
    for (const a of hA) for (const b of hB) if (a.diaSemana === b.diaSemana && a.periodo === b.periodo && a.slot === b.slot) return true;
    return false;
}
function bloqueado(horarios, bloqueios) {
    for (const h of horarios) for (const b of bloqueios) if (h.diaSemana === b.diaSemana && h.periodo === b.periodo && h.slot === b.slot) return true;
    return false;
}
// alguma aula de `horarios` invade a janela de trabalho FIXO [inicio, fim] (com folga)?
// Mesma regra usada em gerarGrades para descartar turmas quando o trabalho é modo === 'fixo'.
function conflitaTrabalhoFixo(horarios, w) {
    w = normTrab(w);
    const wIni = hhmmMin(w.inicio), wFim = hhmmMin(w.fim), gap = Math.max(0, +w.folga || 0);
    return (horarios || []).some(h => {
        const sm = SLOT_MIN[h.periodo + h.slot];
        if (!sm) return false;
        return (sm.fim + gap) > wIni && (sm.ini - gap) < wFim;
    });
}

/* Candidatas (disciplina + turmas viáveis) para um semestre */
function candidatasSemestre(ctx, cursadas, emAndamento, usarGNH) {
    const { matrizByCod, grafo, gnhByCod, equiv, pref } = ctx;
    const disp = new Set(getDisponiveis(grafo, cursadas));
    const cand = [];
    disp.forEach(cod => {
        if (emAndamento.has(cod)) return;
        const d = matrizByCod.get(cod); if (!d) return;
        if (/^(ENADE|ESTÁGIO)/.test(d.modeloDisciplina) && d.chSemanal === 0) { /* estágio sem aula */ }
        let turmasViaveis = (gnhByCod.get(cod) || []);
        if (usarGNH) {
            turmasViaveis = turmasViaveis.filter(t => {
                if (t.semOferta) return true;                 // consta na oferta sem turma/horário detalhado — não bloquear
                if (pref.campusUnico && t.campus !== pref.campus) return false;
                if (t.horarios.length && !t.horarios.every(h => pref.turnos.includes(h.periodo))) return false;
                return true;
            });
            // prioridade do curso (SI): só ORDENA (melhor prioridade primeiro). Nunca exclui:
            // toda turma listada em Turmas Abertas é considerada, mesmo Fechada ou sem vagas.
            turmasViaveis = turmasViaveis.slice()
                .sort((a, b) => (a.prioridadeSI == null ? 99 : a.prioridadeSI) - (b.prioridadeSI == null ? 99 : b.prioridadeSI));
            if (!turmasViaveis.length) return;     // exige oferta real (só campus/turno filtram)
        } else {
            if (!turmasViaveis.length) turmasViaveis = [{ codigo: cod, turma: '—', professor: '', horarios: [], campus: 'CURITIBA', estimada: true }];
        }
        cand.push({ disciplina: d, turmas: turmasViaveis });
    });
    return cand;
}

/* Prioridade (3.4.1) */
// periodoRef = período "nominal" do semestre sendo planejado (período atual + nº de semestres à frente).
// Matérias atrasadas/do período atual têm prioridade; obrigatórias de período muito futuro (ex.: TCC) decaem.
function prioridade(ctx, cand, cursadas, faltantesObrig, periodoRef, conjFeitos) {
    const { grafo, pref } = ctx;
    if (!ctx._descMemo) ctx._descMemo = descendentesTransitivos(grafo);
    const P = periodoRef || 8;
    return cand.map(c => {
        const d = c.disciplina;
        const fanout = getDesbloqueaveis(grafo, d.codigo, cursadas).length;     // destrava agora (1 nível)
        const descSet = ctx._descMemo.get(d.codigo);
        let alcance = 0; if (descSet) descSet.forEach(x => { if (!cursadas.has(x)) alcance++; });  // dependentes futuros ainda não cursados
        const obrig = !d.isOpcional;
        const isFaltObrig = obrig && faltantesObrig.has(d.codigo);
        const trilhaRank = (d.subAreaTrilha && pref.preferenciaTrilhas.indexOf(d.subAreaTrilha) >= 0)
            ? (pref.preferenciaTrilhas.length - pref.preferenciaTrilhas.indexOf(d.subAreaTrilha)) : 0;
        // atraso em períodos: >0 atrasada (período passado), 0 = período atual, <0 = futura.
        // Vale para TODAS as matérias (inclui optativas: 2º estrato/humanidades = 3º, trilhas = 4º).
        const atrasoP = P - (d.periodoSugerido || 8);
        const base = atrasoP >= 0
            ? 30000 + Math.min(atrasoP, 6) * 2500        // atrasada/atual: quanto mais velha, mais urgente
            : Math.max(0, 22000 + atrasoP * 5000);       // futura: decai forte a cada período à frente
        let key = base + (obrig ? 4000 : 0) + alcance * 8 + fanout * 30 + trilhaRank * 5;
        // conjunto optativo já satisfeito (2º estrato/humanidades/trilhas): para de empilhar essas optativas
        if (conjFeitos && d.isOpcional && conjFeitos[d.conjuntoOptativo]) key -= 40000;
        return Object.assign({}, c, { fanout, alcance, obrig, isFaltObrig, trilhaRank, _key: key });
    }).sort((a, b) => b._key - a._key);
}

/* Geração de grades por backtracking com prazo (3.4.2-4) */
function gerarGrades(ctx, candOrdenadas, pref, bloqueios, usarGNH, deadline, trabConfig) {
    const min = pref.cargaMin, max = pref.cargaMax;
    // Pool de busca (mantém a ordem de prioridade): top-18 optativas + TODAS as obrigatórias
    // disponíveis, mesmo as de período futuro que a prioridade rebaixa (cada obrigatória pesa muito
    // no score).
    const pool = candOrdenadas.filter((c, i) => i < 18 || !c.disciplina.isOpcional);
    const grades = [];          // grades que atingem o mínimo de disciplinas
    const parciais = [];        // melhores grades possíveis ABAIXO do mínimo (fallback p/ oferta insuficiente)
    let nodes = 0;
    const trab = trabConfig && trabConfig.trabalha && (+trabConfig.horas > 0) ? trabConfig : null;

    function score(sel) {
        let nObr = 0, fan = 0, alc = 0, nTri = 0, nBlk = 0;
        for (const s of sel) { if (s.obrig) nObr++; fan += s.fanout; alc += (s.alcance || 0); if (s.trilhaRank > 0) nTri++; if (s.bloqueado) nBlk++; }
        let penTrab = 0;
        if (trab) { const ct = custoTrab(trab, ocupacaoPorDia(sel)); penTrab = 12 * ct.deficit + 40 * ct.conflitosNucleo + 25 * ct.rigidConf; }
        return 100 * nObr + 8 * fan + 2 * alc + 12 * nTri - 40 * nBlk - 6 * sel.length - penTrab;
    }
    function rec(idx, sel, ocup) {
        if (Date.now() > deadline) return;
        nodes++;
        if (sel.length >= min) {
            grades.push({ sel: sel.map(s => ({ ...s })), score: score(sel) });
        }
        if (sel.length >= max) return;
        let estendeu = false;
        for (let i = idx; i < pool.length; i++) {
            const c = pool[i];
            // escolher melhor turma viável (sem conflito; bloqueio vira rascunho)
            let chosen = null;
            for (const t of c.turmas) {
                if (usarGNH && t.horarios.length && conflita(t.horarios, ocup)) continue;
                if (trab && trab.modo === 'fixo' && t.horarios.length) {
                    // RESTRIÇÃO MÁXIMA: horário fixo é COMANDO, não sugestão.
                    // Nenhuma aula pode sobrepor a janela de trabalho [inicio, fim] em qualquer dia,
                    // incluindo a folga (intervalo mínimo trabalho↔aula) configurada — respeitada de igual forma.
                    const wIni = hhmmMin(trab.inicio), wFim = hhmmMin(trab.fim);
                    const gap = Math.max(0, +trab.folga || 0);
                    const violaRestr = t.horarios.some(h => {
                        const sm = SLOT_MIN[h.periodo + h.slot];
                        if (!sm) return false;
                        // sobreposição com folga: slot + gap ultrapassa o início do trabalho,
                        // ou slot começa antes do fim + folga do trabalho.
                        return (sm.fim + gap) > wIni && (sm.ini - gap) < wFim;
                    });
                    if (violaRestr) continue;
                }
                const blk = bloqueado(t.horarios, bloqueios);
                if (!chosen || (chosen.bloqueado && !blk)) chosen = { ...c, turma: t, bloqueado: blk, horarios: t.horarios };
                if (!blk) break;
            }
            if (!chosen) continue;
            estendeu = true;
            const novoOcup = ocup.concat(chosen.horarios);
            rec(i + 1, sel.concat(chosen), novoOcup);
            if (Date.now() > deadline) return;
        }
        // Sem turmas suficientes p/ o mínimo: registra a melhor grade possível com o que há
        // (seleção maximal que não pode mais crescer). Usada só se nenhuma grade atingir o mínimo.
        if (!estendeu && sel.length > 0 && sel.length < min) {
            parciais.push({ sel: sel.map(s => ({ ...s })), score: score(sel) });
        }
    }
    rec(0, [], []);

    // dedup por conjunto de códigos, top-5 por score
    // se nenhuma grade atinge o mínimo, cai p/ as melhores grades parciais (oferta insuficiente)
    const base = grades.length ? grades : parciais;
    const vistos = new Set(); const unicas = [];
    base.sort((a, b) => b.score - a.score);
    for (const g of base) {
        const key = g.sel.map(s => s.disciplina.codigo).sort().join(',');
        if (vistos.has(key)) continue; vistos.add(key); unicas.push(g);
        if (unicas.length >= 5) break;
    }
    return { grades: unicas, nodes, estourou: Date.now() > deadline };
}

/* Score de uma seleção arbitrária (grades personalizadas/editadas) — mesma fórmula do motor */
function pontuarSel(ctx, selRaw, cursadas, faltObrig, pref, bloqueios, trabConfig) {
    if (!ctx._descMemo) ctx._descMemo = descendentesTransitivos(ctx.grafo);
    let nObr = 0, fan = 0, alc = 0, nTri = 0, nBlk = 0;
    for (const s of (selRaw || [])) {
        const d = s.disciplina; if (!d) continue;
        fan += getDesbloqueaveis(ctx.grafo, d.codigo, cursadas).length;
        const desc = ctx._descMemo.get(d.codigo); if (desc) desc.forEach(x => { if (!cursadas.has(x)) alc++; });
        if (!d.isOpcional) nObr++;
        if (d.subAreaTrilha && pref.preferenciaTrilhas.indexOf(d.subAreaTrilha) >= 0) nTri++;
        const blk = s.bloqueado != null ? s.bloqueado : bloqueado(s.horarios || [], bloqueios || []);
        if (blk) nBlk++;
    }
    let penTrab = 0;
    if (trabConfig && trabConfig.trabalha && +trabConfig.horas > 0) { const ct = custoTrab(trabConfig, ocupacaoPorDia(selRaw)); penTrab = 12 * ct.deficit + 40 * ct.conflitosNucleo + 25 * ct.rigidConf; }
    return Math.round(100 * nObr + 8 * fan + 2 * alc + 12 * nTri - 40 * nBlk - 6 * (selRaw ? selRaw.length : 0) - penTrab);
}

/* Detalhamento do score (mesma fórmula de pontuarSel) — para o tooltip "como o score foi obtido". */
function pontuarSelDetalhe(ctx, selRaw, cursadas, faltObrig, pref, bloqueios, trabConfig) {
    if (!ctx._descMemo) ctx._descMemo = descendentesTransitivos(ctx.grafo);
    let nObr = 0, fan = 0, alc = 0, nTri = 0, nBlk = 0;
    for (const s of (selRaw || [])) {
        const d = s.disciplina; if (!d) continue;
        fan += getDesbloqueaveis(ctx.grafo, d.codigo, cursadas).length;
        const desc = ctx._descMemo.get(d.codigo); if (desc) desc.forEach(x => { if (!cursadas.has(x)) alc++; });
        if (!d.isOpcional) nObr++;
        if (d.subAreaTrilha && pref.preferenciaTrilhas.indexOf(d.subAreaTrilha) >= 0) nTri++;
        const blk = s.bloqueado != null ? s.bloqueado : bloqueado(s.horarios || [], bloqueios || []);
        if (blk) nBlk++;
    }
    const len = selRaw ? selRaw.length : 0;
    let deficit = 0, conflitosNucleo = 0, rigidConf = 0;
    if (trabConfig && trabConfig.trabalha && +trabConfig.horas > 0) { const ct = custoTrab(trabConfig, ocupacaoPorDia(selRaw)); deficit = ct.deficit; conflitosNucleo = ct.conflitosNucleo; rigidConf = ct.rigidConf; }
    const penTrab = 12 * deficit + 40 * conflitosNucleo + 25 * rigidConf;
    const partes = [
        { label: 'Obrigatórias', n: nObr, peso: 100, val: 100 * nObr },
        { label: 'Destrava agora (fan-out)', n: fan, peso: 8, val: 8 * fan },
        { label: 'Dependentes futuros (alcance)', n: alc, peso: 2, val: 2 * alc },
        { label: 'Trilhas preferidas', n: nTri, peso: 12, val: 12 * nTri },
        { label: 'Em conflito com bloqueio', n: nBlk, peso: -40, val: -40 * nBlk },
        { label: 'Nº de disciplinas', n: len, peso: -6, val: -6 * len },
        { label: 'Penalidade de trabalho', n: null, peso: null, val: -penTrab },
    ];
    const total = Math.round(100 * nObr + 8 * fan + 2 * alc + 12 * nTri - 40 * nBlk - 6 * len - penTrab);
    return { nObr, fan, alc, nTri, nBlk, len, deficit, conflitosNucleo, rigidConf, penTrab, total, partes };
}

/* ===================================================================
    Cálculo de horas faltantes (validado contra histórico oficial)
    =================================================================== */
function calcularHoras(matriz, cursadasSet, extras) {
    const byCod = new Map(matriz.disciplinas.map(d => [d.codigo, d]));
    const aprov = d => cursadasSet.has(d.codigo);
    let obrCursada = 0;
    matriz.disciplinas.filter(d => !d.isOpcional).forEach(d => { if (aprov(d)) obrCursada += d.chTotal; });

    const porConjunto = {};
    const addConj = (id, ch) => { porConjunto[id] = porConjunto[id] || { cursada: 0 }; porConjunto[id].cursada += ch; };
    matriz.disciplinas.filter(d => d.isOpcional).forEach(d => {
        if (!aprov(d)) return;
        if (d.conjuntoOptativo === '1160' && d.subAreaTrilha) addConj(d.subAreaTrilha, d.chTotal);
        else addConj(d.conjuntoOptativo, d.chTotal);
    });
    const c1159 = porConjunto['1159']?.cursada || 0;
    const c1161 = porConjunto['1161']?.cursada || 0;
    // trilhas: validação parcial (3 subáreas) — soma simples de CH cursada em subáreas
    let trilhaCursada = 0; const subStatus: any = {};
    Object.keys(TRILHA_SUBAREAS).forEach(id => {
        const ch = porConjunto[id]?.cursada || 0; trilhaCursada += ch;
        subStatus[id] = { nome: TRILHA_SUBAREAS[id], cursada: ch, validada: ch >= REQUISITOS.trilhaMin, faltante: Math.max(0, REQUISITOS.trilhaMin - ch) };
    });
    const validadas = Object.values(subStatus).filter((s: any) => s.validada).length;

    // extensão: ICSX20(60 obrig) + optativas aprovadas com chExt
    let extCursada = 0;
    matriz.disciplinas.forEach(d => { if (aprov(d) && d.chExt > 0) extCursada += d.chExt; });

    const eletivaCursada = (extras && extras.eletivaManual) || 0;

    const linha = (req, cur) => ({ total: req, cursada: cur, faltante: Math.max(0, req - cur), ok: cur >= req });
    return {
        obrigatorias: linha(REQUISITOS.obrigatorias, obrCursada),
        optativasTotal: linha(REQUISITOS.optativas, c1159 + c1161 + trilhaCursada),
        conj1159: linha(REQUISITOS.conj1159, c1159),
        conj1161: linha(REQUISITOS.conj1161, c1161),
        trilhas: {
            total: REQUISITOS.trilhas1160, cursada: trilhaCursada,
            faltante: validadas >= REQUISITOS.trilhasNecessarias ? Math.max(0, REQUISITOS.trilhas1160 - trilhaCursada) : Math.max(0, REQUISITOS.trilhas1160 - trilhaCursada),
            validadas, ok: validadas >= REQUISITOS.trilhasNecessarias && trilhaCursada >= REQUISITOS.trilhas1160
        },
        subStatus,
        eletivas: linha(REQUISITOS.eletivas, eletivaCursada),
        extensao: linha(REQUISITOS.extensao, extCursada),
        complementares: linha(REQUISITOS.complementares, cursadasSet.has('ICSX50') ? REQUISITOS.complementares : 0),
    };
}

/* ---------- exports ----------
    API combinada (parsing + cálculos) preservada para compat: importada como `K`.
    O parsing vive em `parser.ts` e é reexposto aqui via spread de `Parser`. */
const API = {
    ...Parser,
    construirGrafo, getDisponiveis, getDesbloqueaveis, descendentesTransitivos, pontuarSel, pontuarSelDetalhe,
    candidatasSemestre, prioridade, gerarGrades, calcularHoras, conflita, bloqueado, conflitaTrabalhoFixo,
    SLOTS, DIAS,
    ORDEM_SLOTS, hhmmMin, slotTexto, blocosTrabalho,
    DIAS_UTEIS, DEFAULT_TRAB, normTrab, fmtHHMM, fmtDur, janelaTrab, janelaHoras, capacidadeDia,
    janelaCapSemanal, spanMinPara, ajustarJanelaParaHoras,
    analiseDia, placeBloco, alocarTrab, ocupacaoPorDia, custoTrab, blocosTrabalhoCalc
};

export default API;
