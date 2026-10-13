/* ===================================================================
    Compass+ — Fetching/parsing dos PDFs (puro, sem DOM; testável em Node).
    Lê os PDFs do aluno (Matriz Curricular, Histórico Escolar, Turmas Abertas)
    e os transforma nas estruturas de dados consumidas pelo motor de cálculos
    (`engine.ts`). Módulo ES: exporta as funções nomeadas + um objeto `default`
    com a API de parsing.
    =================================================================== */

/* ---------- Constantes do curso (currículo) ---------- */
const TRILHA_SUBAREAS = {
    '1162': 'Gestão de Sistemas de Informação',
    '1163': 'Interação Humano-Computador',
    '1164': 'Desenvolvimento Baseado em Plataformas',
    '1165': 'Banco de Dados',
    '1166': 'Inteligência Artificial',
    '1167': 'Processamento Gráfico',
    '1168': 'Algoritmos e Complexidade',
    '1169': 'Engenharia de Software',
    '1170': 'Redes de Computadores',
    '1171': 'Sistemas Embarcados e Robótica',
    '1172': 'Linguagens de Programação',
    '1173': 'Otimização, Mod. Analíticos e Simulação',
};
const CONJUNTOS = {
    '1159': { nome: 'Segundo Estrato', pIni: 3, pFim: 6, ch: 360 },
    '1161': { nome: 'Optativas do Ciclo de Humanidades', pIni: 3, pFim: 6, ch: 135 },
    '1160': { nome: 'Terceiro Estrato — Trilhas em Computação', pIni: 4, pFim: 8, ch: 345 },
};
const REQUISITOS = {
    obrigatorias: 2005,
    optativas: 840,
    conj1159: 360,
    conj1161: 135,
    trilhas1160: 345,
    trilhaMin: 90,        // mínimo p/ validar uma subárea
    trilhasNecessarias: 3,
    eletivas: 105,
    extensao: 330,
    extensaoEmObrig: 60,  // ICSX20
    complementares: 90,
};

/* ---------- Utilidades de texto ---------- */
function norm(s) {
    return (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function dice(a, b) {                       // similaridade de bigramas (0..1)
    a = norm(a); b = norm(b);
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
    const A = bg(a), B = bg(b); let inter = 0, total = 0;
    A.forEach((c, g) => { total += c; if (B.has(g)) inter += Math.min(c, B.get(g)); });
    B.forEach(c => total += c);
    return (2 * inter) / total;
}
const reCodigo = /^[A-Z]{2,5}[0-9][0-9A-Z]{0,2}$/;   // ICSD20, MAT7C1, ICSHX0, ELEW40...
function isCodigo(t) { return reCodigo.test(t) && /[0-9]/.test(t) && t.length >= 5 && t.length <= 6; }
function tituloCase(s) {
    return (s || '').toLowerCase().replace(/\b([a-zà-ú0-9])([a-zà-ú0-9]*)/g, (m, a, b) => a.toUpperCase() + b)
        .replace(/\b(De|Da|Do|Das|Dos|E|A|Ao|Em|Para|À)\b/g, w => w.toLowerCase())
        .replace(/^./, c => c.toUpperCase());
}

/* ===================================================================
    Reconstrução geométrica de linhas (idêntica no browser via PDF.js)
    pages: [{ h, items:[{str,x,yTop,w,h}] }]   (yTop cresce p/ baixo)
    -> retorna [ [ {t,x} ... ]  (linha)  ... ] achatado de todas as páginas
    =================================================================== */
function reconstruirLinhas(pages, xMax?) {
    const linhas = [];
    for (const pg of pages) {
        const its = pg.items.filter(it => it.str && it.str.trim() !== '' && (xMax == null || it.x < xMax));
        const bandas = [];
        for (const it of its) {
            const ymid = it.yTop + (it.h || 0) / 2;
            let b = bandas.find(x => Math.abs(x.y - ymid) <= 3.2);
            if (!b) { b = { y: ymid, toks: [] }; bandas.push(b); }
            b.toks.push({ t: it.str, x: it.x });
        }
        bandas.sort((a, b) => a.y - b.y);
        for (const b of bandas) { b.toks.sort((p, q) => p.x - q.x); linhas.push(b.toks); }
    }
    return linhas;
}

/* ===================================================================
    PARSER 1 — Matriz Curricular
    =================================================================== */
// Recuo (pt) do início da coluna "Modelo de disciplina" em relação ao título "Modelo" do cabeçalho:
// o conteúdo da coluna é centralizado e palavras largas começam alguns pontos antes do título.
const RECUO_COLUNA_MODELO = 8;
function parseMatriz(pages) {
    const linhas = reconstruirLinhas(pages);
    const disciplinas = [];
    const isHeader = toks => toks[0] && /^(Período|PER|\[OPT\])$/.test(toks[0].t);
    let inicioColunaModelo = null;

    for (let i = 0; i < linhas.length; i++) {
        const toks = linhas[i];
        if (!toks.length) continue;
        if (isHeader(toks)) { const mod = toks.find(t => /^Modelo$/i.test(t.t)); if (mod) inicioColunaModelo = mod.x - RECUO_COLUNA_MODELO; continue; }
        if (!/^[1-8]$/.test(toks[0].t)) continue;

        // conjunto + código
        let conjuntoRaw = null, codeIdx = 1;
        if (toks[1] && /^\[(\d{4})\]$/.test(toks[1].t)) { conjuntoRaw = toks[1].t.slice(1, 5); codeIdx = 2; }
        if (!toks[codeIdx] || !isCodigo(toks[codeIdx].t)) continue;
        const codigo = toks[codeIdx].t;

        // localizar a corrida de 9 inteiros (CH) — pulando pré-reqs / lixo à direita
        const arr = toks.map(t => t.t);
        let j = arr.length - 1;
        const prereqLinha = [];
        while (j > codeIdx && !/^\d+$/.test(arr[j])) { if (isCodigo(arr[j])) prereqLinha.push(arr[j]); j--; }
        const nums = [];
        while (j > codeIdx && /^\d+$/.test(arr[j])) { nums.unshift(parseInt(arr[j], 10)); j--; }
        if (nums.length < 9) continue;                          // não é linha de disciplina
        const ch = nums.slice(nums.length - 9);                 // 9 campos de CH
        const runStart = j + 1 + (nums.length - 9);
        const modeloX = toks[runStart - 1] ? toks[runStart - 1].x : 1e9;
        const nameFirstIdx = codeIdx + 1;
        const nameStartX = toks[nameFirstIdx] ? toks[nameFirstIdx].x : modeloX;
        const codeX = toks[codeIdx].x;
        const midName = (codeX + nameStartX) / 2;
        const inicioModelo = inicioColunaModelo != null ? inicioColunaModelo : (nameStartX + modeloX) / 2;

        // linha-início: separa nome × modelo pela coluna (x), não pela posição
        const nomeToks = [], modeloToks = [];
        for (let k = nameFirstIdx; k < runStart; k++) {
            const tk = toks[k];
            if (tk.x < inicioModelo) nomeToks.push(tk.t); else modeloToks.push(tk.t);
        }

        // continuação nas linhas seguintes (nome/modelo por coluna; pára no rodapé/próxima disc.)
        const prereqs = prereqLinha.slice();
        const footerRe = /^(CÂMPUS|MATRIZ|STATUS|CURSO|CHT|SOMA|TEMA|TIPO|Legenda|Optativas|Detalhes|Eletiva|Período|Pré|\*)/i;
        let contLines = 0;
        for (let n = i + 1; n < linhas.length && contLines < 6; n++) {
            const ln = linhas[n];
            if (!ln.length) continue;
            if (isHeader(ln)) break;
            if (footerRe.test(ln.map(t => t.t).join(' '))) break;
            if (/^[1-8]$/.test(ln[0].t)) {                        // possível próxima disciplina
                const hasRun = ln.map(t => t.t).filter(s => /^\d+$/.test(s)).length >= 9;
                const c = (ln[1] && /^\[(\d{4})\]$/.test(ln[1].t)) ? 2 : 1;
                if (hasRun && ln[c] && isCodigo(ln[c].t)) break;
            }
            contLines++;
            for (const tk of ln) {
                if (isCodigo(tk.t)) { if (tk.x > inicioModelo) prereqs.push(tk.t); continue; }
                if (tk.t === 'Turmas' || tk.t === 'horas') continue;
                if (tk.x >= midName && tk.x < inicioModelo) nomeToks.push(tk.t);      // inclui dígitos do nome
                else if (tk.x >= inicioModelo && !/^\d+$/.test(tk.t)) modeloToks.push(tk.t);
            }
        }

        const modelo = modeloToks.join(' ');
        let conjuntoOptativo = null, subAreaTrilha = null;
        if (conjuntoRaw) {
            if (TRILHA_SUBAREAS[conjuntoRaw]) { conjuntoOptativo = '1160'; subAreaTrilha = conjuntoRaw; }
            else if (conjuntoRaw === '1159' || conjuntoRaw === '1161') conjuntoOptativo = conjuntoRaw;
            else conjuntoOptativo = conjuntoRaw;
        }
        if (disciplinas.some(d => d.codigo === codigo)) continue;   // evita duplicatas
        disciplinas.push({
            codigo,
            nome: tituloCase(nomeToks.join(' ')),
            periodoSugerido: parseInt(toks[0].t, 10),
            chTotal: ch[8],
            chSemanal: ch[2],
            chExt: ch[6],
            modeloDisciplina: modelo,
            preRequisitos: [...new Set(prereqs)],
            conjuntoOptativo,
            subAreaTrilha,
            isOpcional: conjuntoOptativo != null,
        });
    }

    const conjuntosOptativos = [];
    for (const id of Object.keys(CONJUNTOS)) {
        const c = CONJUNTOS[id];
        conjuntosOptativos.push({
            id, nome: c.nome, periodoInicial: c.pIni, periodoFinal: c.pFim, chObrigatoria: c.ch,
            disciplinas: disciplinas.filter(d => (id === '1160' ? d.conjuntoOptativo === '1160' : d.conjuntoOptativo === id)).map(d => d.codigo),
        });
    }
    return {
        disciplinas,
        resumo: {
            chObrigatoriaTotal: REQUISITOS.obrigatorias,
            chOptativasTotal: REQUISITOS.optativas,
            chExtensaoTotal: REQUISITOS.extensao,
            chEletivaTotal: REQUISITOS.eletivas,
            conjuntosOptativos,
        },
        subareas: TRILHA_SUBAREAS,
    };
}

/* ===================================================================
    PARSER 2 — Histórico Escolar
    =================================================================== */
const SIT_PRIO = { APROVADO: 5, CREDITO_CONSIGNADO: 5, CURSANDO: 3, REPROVADO: 2, CANCELADO: 1 };
function parseHistorico(pages) {
    const linhas = reconstruirLinhas(pages);
    const texto = linhas.map(l => l.map(t => t.t).join(' '));

    const head = texto.slice(0, 25).join('\n');
    const get = re => { const m = head.match(re); return m ? m[1].trim() : ''; };
    const aluno = {
        matricula: get(/Aluno:\s*(\d+)/),
        nome: tituloCase(get(/Aluno:\s*\d+\s*-\s*([^\n]+)/).split(/\s+Identidade/i)[0]),
        curso: get(/Curso:\s*([^\n]+)/),
        periodoAtual: parseInt(get(/Período:\s*(\d+)/) || '1', 10),
        matriz: get(/Matriz:\s*([^\n]+)/),
        coeficienteAbsoluto: parseFloat((get(/Coeficiente absoluto:\s*([\d,]+)/) || '0').replace(',', '.')),
        coeficienteNormalizado: parseFloat((get(/Coeficiente normalizado:\s*([\d,]+)/) || '0').replace(',', '.')),
    };

    // Linhas-âncora: dígito período + código + contém ano 20xx
    const anchors = [];
    for (let i = 0; i < linhas.length; i++) {
        const toks = linhas[i];
        if (toks.length < 4) continue;
        if (!/^[1-8]$/.test(toks[0].t)) continue;
        if (!isCodigo(toks[1].t)) continue;
        if (!toks.some(t => /^20\d\d$/.test(t.t))) continue;
        anchors.push(i);
    }
    const registros = new Map();
    const setReg = (cod, sit, extra) => {
        const prev = registros.get(cod);
        if (!prev || (SIT_PRIO[sit] || 0) >= (SIT_PRIO[prev.situacao] || 0))
            registros.set(cod, Object.assign({ codigo: cod, situacao: sit }, prev, extra, { situacao: sit }));
    };
    for (let a = 0; a < anchors.length; a++) {
        const Li = anchors[a];
        const toks = linhas[Li];
        const codigo = toks[1].t;
        const arr = toks.map(t => t.t);
        const yi = arr.findIndex(t => /^20\d\d$/.test(t));
        const ano = parseInt(arr[yi], 10);
        const semestre = parseInt(arr[yi - 1], 10) || null;
        // janela do registro: da âncora anterior+1 até esta âncora
        const ini = a === 0 ? 0 : anchors[a - 1] + 1;
        let blob = '';
        for (let k = ini; k <= Li; k++) blob += ' ' + texto[k];
        blob = norm(blob);
        let sit = 'APROVADO';
        if (/CANCELADO/.test(blob)) sit = 'CANCELADO';
        else if (/REPROVADO/.test(blob)) sit = 'REPROVADO';
        else if (/APROVADO/.test(blob)) sit = 'APROVADO';
        else if (/CONSIGNADO/.test(blob)) sit = 'CREDITO_CONSIGNADO';
        setReg(codigo, sit, { ano, semestre });
    }

    // Matriculadas (CURSANDO) — cabeçalho "Disciplinas Matriculadas - AAAA/S" traz o semestre letivo atual
    const matIdx = texto.findIndex(t => /Matriculadas/.test(t));
    const mSem = matIdx >= 0 ? texto[matIdx].match(/Matriculadas\s*-\s*(\d{4})\s*\/\s*([12])\b/) : null;
    const semestreMatriculadas = mSem ? { ano: +mSem[1], per: +mSem[2] } : null;
    if (matIdx >= 0) {
        for (let k = matIdx + 1; k < linhas.length; k++) {
            const toks = linhas[k];
            const arr = toks.map(t => t.t);
            if (arr.join(' ').match(/Exame De Curso|ENADE|Vínculos|Bloqueios/i)) break;
            if (toks.length && isCodigo(toks[0].t) && arr.some(t => /Cursando/i.test(t))) {
                const turma = (arr.find(t => /^[A-Z]\d{2}$/.test(t)) || '');
                setReg(toks[0].t, 'CURSANDO', { turma });
            }
        }
    }

    // ENADE
    const full = texto.join('\n');
    const enadeConcluinte = /CONCLUINTE[\s\S]{0,40}Sem Registro/i.test(full) ? false : /CONCLUINTE[\s\S]{0,80}(Aprovado|Dispensado|Realiz)/i.test(full);

    const cursadas = [...registros.values()];
    const cursadasAprovadas = cursadas.filter(d => d.situacao === 'APROVADO' || d.situacao === 'CREDITO_CONSIGNADO').map(d => d.codigo);
    const emAndamento = cursadas.filter(d => d.situacao === 'CURSANDO').map(d => d.codigo);

    return { aluno, cursadas, cursadasAprovadas, emAndamento, enadeConcluinte, semestreMatriculadas };
}

/* ===================================================================
    PARSER 3b — Turmas Abertas (Portal do Aluno) — substitui o Grade na Hora.
    Colunas (Turma | Enquadramento | Vagas… | Reserva | Prioridade | Horário | Professor |
    Optativa) localizadas pelo cabeçalho de cada tabela, não por posição fixa.
    Saída compatível com a oferta usada no app + prioridadeSI/reserva.
    =================================================================== */
const COLUNAS_TA = [['turma', /^Turma$/i], ['enq', /^Enquadramento$/i], ['vagas', /^Vagas$/i], ['res', /^Reserva$/i], ['pri', /^Prioridade$/i], ['hor', /^Hor[áa]rio$/i], ['prof', /^Professor$/i], ['opt', /^Optativa$/i]];
// Início (x) de cada coluna a partir da linha de cabeçalho; null se faltar Turma, Enquadramento ou Horário.
function colunasDoCabecalho(toks) {
    const cols = [];
    for (const tk of toks) { const c = COLUNAS_TA.find(([, re]) => re.test(tk.t)); if (c) cols.push({ key: c[0], ini: tk.x - 3 }); }
    cols.sort((a, b) => a.ini - b.ini);
    return ['turma', 'enq', 'hor'].every(k => cols.some(c => c.key === k)) ? cols : null;
}
// Coluna em que começa um token de posição x (null se antes da primeira coluna).
function colunaDe(cols, x) { let k = null; for (const c of cols) { if (x < c.ini) break; k = c.key; } return k; }
// Distância máxima (pt) acima da linha da turma em que ainda há texto dela (fonte menor de prioridade/professor).
const ACIMA_DA_TURMA = 6;
function parseTurmasAbertas(pages) {
    const reDisc = /^[A-Z]{2,5}[0-9][0-9A-Z]{0,2}$/, reTurma = /^[A-Z]{1,2}[0-9]{2,3}$/;
    const ALVO = norm('Sist De Informação');
    const turmas = []; let disc = null;
    let cols = null, aberta = null, pendentes = [];
    const montarTurma = t => {
        const col = { enq: [], res: [], pri: [], hor: [], prof: [], opt: [] };
        for (const bb of t.bandas) for (const tk of bb.toks) { const k = colunaDe(cols, tk.x); if (col[k]) col[k].push(tk.t); }
        const jc = a => a.join(' ').replace(/\s+/g, ' ').trim();
        const enq = jc(col.enq), reserva = jc(col.res), priText = jc(col.pri), horText = col.hor.join(''), prof = tituloCase(jc(col.prof)), optText = jc(col.opt);
        const prios = []; const re = /(\d+)\s*-\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]*?)(?=\s+\d+\s*-\s*|$)/g; let mp;
        while ((mp = re.exec(priText))) prios.push({ rank: +mp[1], curso: mp[2].replace(/\s+/g, ' ').trim() });
        let prioridadeSI = null; for (const p of prios) { const n = norm(p.curso); if (n === ALVO || n.startsWith('SIST DE INFORM')) { prioridadeSI = p.rank; break; } }
        const horarios = [], seen = new Set(); let campus = 'CURITIBA';
        const sr = /(\d)([MTN])(\d)\((\*{0,2})([A-Za-z0-9-]+)\)/g; let sm;
        while ((sm = sr.exec(horText))) { const dia = +sm[1], per = sm[2], slot = +sm[3], ast = sm[4], sala = sm[5]; if (ast) campus = ast === '**' ? 'NEOVILLE' : 'ECOVILLE'; const key = dia + per + slot; if (seen.has(key)) continue; seen.add(key); horarios.push({ diaSemana: dia, periodo: per, slot, sala }); }
        const elegivel = !/fechada/i.test(reserva) || prioridadeSI != null;   // pode cursar? (Fechada exige SI na prioridade)
        return { codigo: t.disc.codigo, nome: t.disc.nome, turma: t.codigo, professor: prof, aulasSem: t.disc.aulas, horarios, campus, enquadramento: enq, reserva, prioridadeSI, prioridades: prios, elegivel, optativaMatrizes: (optText.match(/Matriz:\d+/g) || []) };
    };
    const fecharTurma = () => { if (aberta) { aberta.bandas.push(...pendentes); turmas.push(montarTurma(aberta)); } aberta = null; pendentes = []; };
    // O código da disciplina pode vir fragmentado em vários spans no PDF (ex.: "ICS" "X" "20"
    // para "Trabalho de Integração"). Reconstrói o código juntando os tokens iniciais da 1ª
    // coluna até casar reDisc; retorna {code, n} (n = nº de tokens consumidos).
    const leadingCode = toks => { let s = ''; for (let q = 0; q < toks.length; q++) { const tk = toks[q]; if (tk.x < 100 && /^[A-Z0-9]+$/i.test(tk.t)) { s += tk.t; if (reDisc.test(s)) return { code: s, n: q + 1 }; } else break; } return null; };
    const discsVistas = new Map();   // toda disciplina que aparece no PDF (mesmo sem turma parseável)
    for (const pg of pages) {
        const its = pg.items.filter(i => i.str && i.str.trim());
        const bands = [];
        for (const it of its) { const ym = it.yTop + (it.h || 0) / 2; let b = bands.find(x => Math.abs(x.y - ym) <= 3.2); if (!b) { b = { y: ym, toks: [] }; bands.push(b); } b.toks.push({ t: it.str, x: it.x, y: it.yTop }); }
        bands.sort((a, b) => a.y - b.y); bands.forEach(b => b.toks.sort((p, q) => p.x - q.x));
        const jb = i => i >= 0 && i < bands.length ? bands[i].toks.map(t => t.t).join(' ') : '';
        for (let bi = 0; bi < bands.length; bi++) {
            const b = bands[bi], joined = jb(bi), first = b.toks[0]; if (!first) continue;
            // cabeçalho de disciplina. Código/nome/aulas saem da 1ª linha (aceita aulas fracionárias);
            // o chExt ("horas semestrais") é opcional pois pode ficar na página seguinte (cabeçalho quebra a página).
            const lc = first.x < 70 ? leadingCode(b.toks) : null;
            if (lc && /Aulas\s+semanais/i.test(joined + ' ' + jb(bi + 1))) {
                // prefixa o código já reconstruído para que o m2 case mesmo com código fragmentado
                let full = lc.code + ' ' + b.toks.slice(lc.n).map(t => t.t).join(' '), j = bi;
                while (!/horas semestrais|extensionistas\)/i.test(full) && j + 1 < bands.length && j - bi < 4) { j++; full += ' ' + jb(j); }
                const m2 = full.match(/^([A-Z]{2,5}[0-9][0-9A-Z]{0,2})\s*[-–]\s*(.+?)\s*\(([\d.,]+)\s*Aulas semanais/i);
                if (m2) {
                    fecharTurma();
                    const extM = full.match(/([\d.,]+)\s*horas semestrais/i);
                    disc = { codigo: m2[1], nome: tituloCase(m2[2].replace(/\s+/g, ' ').trim()), aulas: Math.round(parseFloat(m2[3].replace(',', '.')) || 0), chExt: extM ? Math.round(parseFloat(extM[1].replace(',', '.')) || 0) : 0 };
                    discsVistas.set(disc.codigo, disc);
                    bi = j; continue;
                }
            }
            if (/^Turma\b/.test(joined) && /Enquadramento/.test(joined)) { fecharTurma(); cols = colunasDoCabecalho(b.toks); continue; }
            const isTurma = !!cols && !!disc && colunaDe(cols, first.x) === 'turma' && reTurma.test(first.t) && b.toks.some(t => colunaDe(cols, t.x) === 'enq');
            if (!isTurma) { pendentes.push(b); continue; }
            const acima = pendentes.filter(p => p.y >= b.y - ACIMA_DA_TURMA);
            pendentes = pendentes.filter(p => p.y < b.y - ACIMA_DA_TURMA);
            fecharTurma();
            aberta = { disc, codigo: first.t, bandas: [...acima, b] };
        }
        if (aberta) aberta.bandas.push(...pendentes);
        pendentes = [];
    }
    fecharTurma();
    // Disciplinas que constam no PDF mas não tiveram nenhuma turma parseada (turma/horário ausentes)
    // ainda devem poder ser listadas/usadas — Turmas Abertas é a fonte da verdade do que está disponível.
    const comTurma = new Set(turmas.map(t => t.codigo));
    discsVistas.forEach((dd, cod) => {
        if (comTurma.has(cod)) return;
        turmas.push({ codigo: cod, nome: dd.nome, turma: '—', professor: '', aulasSem: dd.aulas, chExt: dd.chExt || 0, horarios: [], campus: 'CURITIBA', enquadramento: '', reserva: '', prioridadeSI: null, prioridades: [], elegivel: true, optativaMatrizes: [], semOferta: true });
    });
    return turmas;
}

/* ===================================================================
    Equivalências GNH↔Matriz + divergências
    =================================================================== */
function detectarEquivalencias(matriz, gnh) {
    const mCods = new Set(matriz.disciplinas.map(d => d.codigo));
    const auto = {}; const divergencias = [];
    const gnhCods: any[] = [...new Set(gnh.map(t => t.codigo))];
    for (const gc of gnhCods) {
        if (mCods.has(gc)) continue;
        if (mCods.has('I' + gc)) { auto[gc] = 'I' + gc; continue; }   // CSX41 -> ICSX41
        const nome = (gnh.find(t => t.codigo === gc) || {}).nome || '';
        let best = null, bestS = 0;
        for (const d of matriz.disciplinas) {
            const s = dice(nome, d.nome);
            if (s > bestS) { bestS = s; best = d; }
        }
        if (best && bestS >= 0.9) divergencias.push({ gnhCod: gc, gnhNome: nome, matrizCod: best.codigo, matrizNome: best.nome, score: bestS });
    }
    return { auto, divergencias };
}

/* ---------- exports ---------- */
export {
    TRILHA_SUBAREAS, CONJUNTOS, REQUISITOS,
    norm, dice, isCodigo, tituloCase, reconstruirLinhas,
    parseMatriz, parseHistorico, parseTurmasAbertas, detectarEquivalencias,
};

const Parser = {
    norm, dice, reconstruirLinhas,
    parseMatriz, parseHistorico, parseTurmasAbertas, detectarEquivalencias,
    tituloCase, TRILHA_SUBAREAS, CONJUNTOS, REQUISITOS,
};
export default Parser;
