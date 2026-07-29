import K from './engine';
import { AJUDA_IMGS } from './ajuda-imgs';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import Sortable from 'sortablejs';
import './styles.css';
import {
    DEFAULT_PREF, S, D, novoEstado, salvar, carregar, PRESETS_KEY, salvarPresets, carregarPresets, hidratarPresets, ORDER, manualBlocos, trabDoSem, trabRespondido, trabFlex, trabCalc, totalBloqueios, TRAB_CFG_KEYS, trabCfgDe, mesmaCfgTrab, salvarPresetTrab, aplicarPresetTrab, excluirPresetTrab, trabRascunhoOuSalvo, trabTemRascunho, trabRascunhoSet, trabAplicarRascunho, trabDescartarRascunho, derive, turmaDe, tipoDe, rotuloSem, manualNoSem, somaManualAteSem, extrasAteSem, cursadasComManuais, formaturaOK, calcHorasIdx, projetar, reconstruirGrade, blocoExiste, addBloco, rmBloco, bloqEfetivos, bloqTemRascunho, blocoExisteRasc, addBlocoRasc, rmBlocoRasc, bloqAplicarRascunho, bloqDescartarRascunho, limparEscolhasApos, limparEscolhasDesde, setEstado
} from './state';

/* ===================================================================
    Compass+ — Interface
    =================================================================== */
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
const $ = (s: string, r: Document | Element = document): any => r.querySelector(s);
const $$ = (s: string, r: Document | Element = document): any[] => [...r.querySelectorAll(s)];
const root = $('#root');
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// S8 — explicação geral do score (tooltip da barra superior e dos cabeçalhos de grade)
const SCORE_TIP = esc('O que é o Score') + '\\nUma nota que ordena as grades possíveis de um semestre: quanto maior, melhor a grade para avançar no curso.\\n\\n' +
    esc('Para que serve') + '\\nRecomendar e ordenar as grades, priorizando o que mais aproxima você da formatura e respeita seus bloqueios/trabalho.\\n\\n' +
    esc('Como é calculado') + '\\n+100 por obrigatória · +8 por matéria que destrava agora · +2 por dependente futuro · +12 por trilha preferida · −40 por conflito com bloqueio · −6 por matéria (enxuga a carga) · − penalidade de trabalho (déficit / núcleo / horário fixo).';
// constrói o tooltip detalhado (S9) a partir do detalhamento de pontuarSelDetalhe
function scoreBreakdownTip(sem, sel) {
    const det = K.pontuarSelDetalhe(D.ctx, sel || [], sem.cursadasAntes || new Set(), sem.faltObrig || new Set(), S.preferencias, sem.bloqueios || [], trabDoSem(sem.idx));
    const linhas = det.partes.filter(p => p.val !== 0 || (p.n != null && p.n !== 0)).map(p => {
        const v = Math.round(p.val); const sinal = v >= 0 ? '+' : '';
        const calc = p.n != null && p.peso != null ? `${p.n}×${p.peso} = ` : '';
        return `${esc(p.label)}: ${calc}${sinal}${v}`;
    });
    return esc('Como este score foi obtido') + '\\n' + linhas.join('\\n') + '\\n──────\\n' + esc('Total') + `: ${det.total}`;
}

/* ---------- Ajuda: como exportar os PDFs do Portal do Aluno (slide-over) ---------- */
function ajudaFig(i) {
    const im = AJUDA_IMGS[i]; if (!im) return '';
    return `<figure class="ajuda-fig"><img src="${im.src}" alt="${esc(im.alt)}" width="${im.w}" height="${im.h}" loading="lazy"><figcaption>${esc(im.cap)}</figcaption></figure>`;
}
function abrirAjuda() {
    if (document.getElementById('ajuda-ov')) return;
    const ov = document.createElement('div'); ov.id = 'ajuda-ov'; ov.className = 'ajuda-ov';
    ov.innerHTML = `
    <div class="ajuda-backdrop" data-fechar-ajuda></div>
    <aside class="ajuda-panel" role="dialog" aria-label="Como exportar os PDFs">
        <header class="ajuda-head"><h2>📄 Como exportar os PDFs do Portal do Aluno</h2><button class="btn btn-sm btn-ghost" data-fechar-ajuda aria-label="Fechar">✕</button></header>
        <div class="ajuda-body">
        <div class="ajuda-note">
            <b>ℹ️ Antes de começar — como salvar o PDF certo:</b>
            <ol>
            <li>Ao clicar em qualquer botão de impressão, abre a janela de impressão do navegador.</li>
            <li>Em <b>Destino</b> (ou <i>Destination</i>), escolha <b>Salvar como PDF</b>.</li>
            <li><b>Renomeie o arquivo</b> — todos saem com o mesmo nome "Portal do Aluno - Curitiba". Use nomes claros: <code>turmas_abertas.pdf</code>, <code>historico_completo.pdf</code>, <code>matriz_curricular.pdf</code>.</li>
            </ol>
        </div>

        <section><h3>Etapa 1 — Turmas Abertas</h3>
            <p><b>Caminho:</b> Página Inicial → Turmas Abertas.</p>
            <p>Selecione o seu <b>Campus</b> e o seu <b>Curso</b> e clique em <b>Confirmar</b> para carregar a lista de turmas.</p>
            ${ajudaFig(0)}
            <p>Com as turmas na tela, clique em <b>qualquer um dos dois botões de imprimir</b> (seta vermelha) e salve como <b>turmas_abertas.pdf</b>.</p>
            ${ajudaFig(1)}
        </section>

        <section><h3>Etapa 2 — Histórico Completo</h3>
            <p><b>Caminho:</b> Página Inicial → Histórico Completo.</p>
            <p>Pressione <b>Imprimir Histórico Escolar</b> (seta vermelha) e salve como <b>historico_completo.pdf</b>.</p>
            ${ajudaFig(2)}
        </section>

        <section><h3>Etapa 3 — Matrizes Curriculares</h3>
            <p><b>Caminho:</b> Página Inicial → Matrizes Curriculares.</p>
            <p>Pressione <b>Imprimir Matriz Curricular</b> (seta vermelha) e salve como <b>matriz_curricular.pdf</b>.</p>
            ${ajudaFig(3)}
        </section>
        <p class="muted" style="font-size:11px">Tutorial referente ao Portal do Aluno da UTFPR — Campus Curitiba.</p>
        </div>
    </aside>`;
    ov.addEventListener('click', e => { if ((e.target as HTMLElement).closest('[data-fechar-ajuda]')) fecharAjuda(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('on'));
}
function fecharAjuda() { const ov = document.getElementById('ajuda-ov'); if (ov) { ov.classList.remove('on'); setTimeout(() => ov.remove(), 260); } }
document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; fecharAjuda(); if (S.prefsOpen) { S.prefsOpen = false; salvar(); render(); } });

/* ---------- Extração via PDF.js ---------- */
async function extrairPaginas(file, onProg?) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items = [];
        for (const it of tc.items as any[]) {
            const str = it.str; if (!str || !str.trim()) continue;
            const x = it.transform[4], f = it.transform[5];
            const h = it.height || 9, w = it.width || str.length * 5;
            const yTop = vp.height - f;
            const words = str.trim().split(/\s+/);
            if (words.length <= 1) { items.push({ str: str.trim(), x, yTop, w, h }); }
            else {
                const total = str.length; let ci = 0;
                for (const wd of words) { const idx = str.indexOf(wd, ci); const off = idx < 0 ? ci : idx; items.push({ str: wd, x: x + (off / total) * w, yTop, w: (wd.length / total) * w, h }); ci = off + wd.length; }
            }
        }
        pages.push({ h: vp.height, items });
        if (onProg) onProg(p / pdf.numPages);
    }
    return pages;
}


/* ===================================================================
    RENDER
    =================================================================== */
function render() {
    if (S.fase === 'upload') return renderUpload();
    if (S.fase === 'divergencias') return renderDivergencias();
    if (S.fase === 'preferencias') return renderPreferencias();
    if (S.fase === 'grafo') { derive(); return renderGrafo(); }
    if (S.fase === 'app') { derive(); return renderApp(); }
}

/* ---------- Upload ---------- */
function renderUpload() {
    const f = S.files;
    const zonas = [
        ['matriz', 'Matriz Curricular', '📚', 'Grade do curso: disciplinas, períodos e pré-requisitos.'],
        ['historico', 'Histórico Escolar', '🎓', 'Disciplinas cursadas, situação e coeficientes.'],
        ['gnh', 'Turmas Abertas', '🗓️', 'Turmas ofertadas no semestre, com horários, vagas e prioridade de curso.'],
    ];
    root.innerHTML = `
<div class="welcome">
<div class="brand"><div class="logo">C+</div><div><h1>Compass+</h1><div class="muted" style="font-size:13px">Planejamento acadêmico · UTFPR — Sistemas de Informação</div></div></div>
<p class="sub">Envie os três PDFs do <b>Portal do Aluno</b> (Matriz, Histórico e Turmas Abertas). Tudo é processado <b>localmente no seu navegador</b> — nada é enviado a servidores. <button class="btn btn-sm btn-ghost" id="abrir-ajuda">❓ Como exportar os PDFs</button></p>
<div class="dropzones">
    ${zonas.map(([k, t, ic, desc]) => {
        return `<div class="dz ${f[k] ? 'done' : ''}" data-dz="${k}">
        <div class="ico">${f[k] ? '✅' : ic}</div>
        <h3>${t}</h3>
        ${f[k] ? `<div class="fname">${esc(f[k].name)}</div>` : `<p>${desc}</p>`}
        <div class="bar"><i data-bar="${k}" style="width:${f[k] ? 100 : 0}%"></i></div>
        <button class="btn btn-sm btn-ghost" data-pick="${k}">${f[k] ? 'Trocar arquivo' : 'Selecionar PDF'}</button>
        <input type="file" accept="application/pdf,.pdf" data-input="${k}" class="hidden">
    </div>`;
    }).join('')}
</div>
<div class="actions">
    <button class="btn btn-primary" id="processar" ${(!f.matriz || !f.historico || !f.gnh) ? 'disabled' : ''}>Processar e planejar →</button>
    <span class="muted" id="proc-status"></span>
    ${localStorage.getItem('compass_state') ? '<button class="btn btn-ghost" id="restaurar">Restaurar sessão salva</button>' : ''}
</div>
<div class="steps">
    ${['Upload dos PDFs', 'Resolução de divergências', 'Preferências', 'Planejamento'].map((s, i) => `<div class="step"><b>${i + 1}</b>${s}</div>`).join('')}
</div>
</div>`;
}

/* ---------- Divergências (Módulo 1.5) ---------- */
function renderDivergencias() {
    const d = S.divergPendentes[0];
    if (!d) { S.fase = 'preferencias'; salvar(); return render(); }
    const total = S.divergTotal || S.divergPendentes.length;
    const atual = total - S.divergPendentes.length + 1;
    root.innerHTML = `
<div class="overlay"><div class="modal">
<div class="diverg-progress">Divergência ${atual} de ${total}</div>
<h2>Confirme a equivalência de disciplina</h2>
<div class="q"><b>“${esc(d.gnhNome)}”</b> aparece nas Turmas Abertas com o código <b class="mono">${esc(d.gnhCod)}</b>,
    mas na matriz como <b class="mono">${esc(d.matrizCod)}</b> (<b>${esc(d.matrizNome)}</b>).<br>
    Similaridade de nome: <b>${Math.round(d.score * 100)}%</b>. São a mesma disciplina?</div>
<div class="row">
    <button class="btn btn-ghost" data-div="no">✗ Não, são diferentes</button>
    <button class="btn btn-primary" data-div="yes">✓ Sim, mesma disciplina</button>
</div>
</div></div>`;
}

/* ---------- Preferências (Módulo 2) ---------- */
// cards de preferências (campus, turnos, carga, trilhas) — reutilizados na tela de onboarding
// e no slide-over de preferências dentro do app.
function prefsGridHTML(p) {
    if (!p.preferenciaTrilhas.length) p.preferenciaTrilhas = Object.keys(K.TRILHA_SUBAREAS);
    const trilhas = p.preferenciaTrilhas;
    return `<div class="pref-grid">
    <div class="card">
    <h3>🏫 Campus</h3>
    <div class="spread"><span>Restringir a um único campus</span><div class="toggle ${p.campusUnico ? 'on' : ''}" data-pref="campusUnico"><i></i></div></div>
    <div class="seg ${p.campusUnico ? '' : 'hidden'}" style="margin-top:12px" id="campus-seg">
        ${['CURITIBA', 'ECOVILLE', 'NEOVILLE'].map(c => `<button class="${p.campus === c ? 'on' : ''}" data-campus="${c}">${c === 'CURITIBA' ? 'Curitiba (CB)' : c === 'ECOVILLE' ? 'Ecoville (*)' : 'Neoville (**)'}</button>`).join('')}
    </div>
    </div>
    <div class="card">
    <h3>🕑 Turnos disponíveis</h3>
    <div class="checks">
        ${[['M', 'Manhã'], ['T', 'Tarde'], ['N', 'Noite']].map(([k, t]) => `<div class="check ${p.turnos.includes(k) ? 'on' : ''}" data-turno="${k}">${t} (${k})</div>`).join('')}
    </div>
    <div class="hint">Selecione ao menos um turno.</div>
    </div>
    <div class="card">
    <h3>📦 Carga por semestre</h3>
    <div class="spread"><span class="muted">Mínimo</span><span class="bignum" id="lbl-min">${p.cargaMin}</span></div>
    <input type="range" min="1" max="10" value="${p.cargaMin}" data-range="cargaMin" style="width:100%">
    <div class="spread" style="margin-top:10px"><span class="muted">Máximo</span><span class="bignum" id="lbl-max">${p.cargaMax}</span></div>
    <input type="range" min="1" max="10" value="${p.cargaMax}" data-range="cargaMax" style="width:100%">
    </div>
    <div class="card">
    <h3>🧭 Preferência de trilhas (Terceiro Estrato)</h3>
    <div class="hint" style="margin-top:0;margin-bottom:10px">Arraste para ordenar (1 = mais preferida). Usado para desempatar grades.</div>
    <ul class="trilha-list" id="trilhas">
        ${trilhas.map((id, i) => `<li data-id="${id}"><span class="rank">${i + 1}</span><span>${esc(K.TRILHA_SUBAREAS[id])}</span><span class="mono muted" style="font-size:11px">[${id}]</span><span class="grip">⋮⋮</span></li>`).join('')}
    </ul>
    </div>
</div>`;
}
function renderPreferencias() {
    // Semestre-alvo (idx 1) leve, só para o formulário de horários travados — sem precisar do projetar()
    // completo. O trabalho é previsto sobre uma grade vazia; após "Calcular grades" ele se molda à grade.
    const sem = { idx: 1, rotulo: rotuloSem(1), bloqueios: manualBlocos(1), trab: trabCalc(1, []) };
    const trabOK = trabRespondido(1);   // preenchimento obrigatório: precisa ter respondido (e aplicado)
    root.innerHTML = `
<div class="pref-screen">
<div class="brand"><div class="logo">C+</div><div><h1>Preferências</h1><div class="muted" style="font-size:13px">Ajuste antes de calcular as grades. Você pode alterar depois na barra lateral.</div></div></div>
${prefsGridHTML(S.preferencias)}
<div class="pref-trab">
    <h2 style="font-size:16px;margin:26px 0 4px">🔒 Horários travados <span class="chip" style="color:var(--secondary)">obrigatório</span></h2>
    <p class="muted" style="font-size:13px;margin:0 0 4px">Informe se você trabalha neste semestre (e o horário). As grades são calculadas ao redor disso. Depois, você edita no plano do semestre.</p>
    ${blocosSemestreHTML(sem, true)}
</div>
<div class="actions" style="margin-top:22px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">
    <button class="btn btn-primary" id="ir-app" ${trabOK ? '' : 'disabled data-tip="Responda sobre seu trabalho em &quot;Horários travados&quot; e clique em Aplicar"'}>Calcular grades →</button>
    <button class="btn btn-ghost" id="voltar-upload">← Voltar</button>
    ${trabOK ? '' : '<span class="muted" style="color:var(--secondary);font-size:12px">⚠ Responda sobre seu trabalho acima (e clique em <b>Aplicar</b>) para continuar.</span>'}
</div>
</div>`;
    initTrilhasDrag();
}
// slide-over de Preferências (dentro do app) — campus, turnos, carga e trilhas.
// Renderizado dentro de #root para que a delegação de eventos e os rerenders funcionem sem navegar
// para fora do planejamento (fecha e volta exatamente pra cá). Os horários travados NÃO ficam aqui:
// eles são preenchidos (obrigatoriamente) no primeiro carregamento e depois editados no plano.
function prefsOverlayHTML() {
    return `<div class="ajuda-ov on" id="prefs-ov">
<div class="ajuda-backdrop" data-fechar-prefs></div>
<aside class="ajuda-panel prefs-panel" role="dialog" aria-label="Preferências">
    <header class="ajuda-head"><h2>⚙️ Preferências</h2><button class="btn btn-sm btn-ghost" data-fechar-prefs aria-label="Fechar">✕</button></header>
    <div class="ajuda-body">
        ${prefsGridHTML(S.preferencias)}
        <div class="actions" style="margin-top:18px"><button class="btn btn-primary" data-fechar-prefs>✓ Concluir</button></div>
    </div>
</aside>
</div>`;
}

function blockGridHTML(sem) {
    const idx = sem.idx;
    const man = bloqEfetivos(idx);   // mostra o rascunho de bloqueios (aplicado só no "Aplicar")
    const auto = (sem.trab && sem.trab.slots) || [];
    const intervalos = (sem.trab && sem.trab.intervalos) || {};
    const autoKey = new Set(auto.map(b => b.diaSemana + b.periodo + b.slot));
    const periods: [string, number][] = [['M', 6], ['T', 6], ['N', 5]];
    let rows = '';
    periods.forEach(([per, n], pi) => {
        for (let s = 1; s <= n; s++) {
            const ord = K.ORDEM_SLOTS.findIndex(o => o[0] === per && o[1] === s);
            const hora = K.slotTexto(per, s);
            rows += `<tr><td class="rowlbl" data-tip="${per}${s} · ${hora}">${per}${s}</td>`;
            for (let d = 2; d <= 7; d++) {
                const mb = man.find(b => b.diaSemana === d && b.periodo === per && b.slot === s);
                const isAuto = !mb && autoKey.has(d + per + s);
                const cls = mb ? 'blk' : isAuto ? 'auto' : '';
                const iv = intervalos[d];
                const label = mb ? esc(mb.nome.slice(0, 4)) : isAuto ? 'Trab' : '';
                const tip = `${K.DIAS[d]} ${per}${s} · ${hora}` + (mb ? `\\nBloqueio: ${esc(mb.nome)}` : isAuto && iv ? `\\nTrabalho ${K.fmtHHMM(iv.startMin)}–${K.fmtHHMM(iv.endMin)} · ${K.fmtDur(iv.horas)}` : isAuto ? `\\nTrabalho (automático)` : '\\n(clique/arraste p/ travar)');
                rows += `<td class="slot ${cls}" data-sem="${idx}" data-d="${d}" data-p="${per}" data-s="${s}" data-ord="${ord}" data-tip="${tip}">${label}</td>`;
            }
            rows += '</tr>';
        }
        if (pi < 2) rows += '<tr class="sep"><td colspan="7"></td></tr>';
    });
    return `<div class="cal-wrap"><table class="blockgrid"><thead><tr><th></th>${[2, 3, 4, 5, 6, 7].map(d => `<th>${K.DIAS[d].slice(0, 3)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function blocosSemestreHTML(sem, forceOpen?) {
    const idx = sem.idx;
    // pendências = trabalho OU bloqueios manuais com alterações não aplicadas
    const temRasc = trabTemRascunho(idx) || bloqTemRascunho(idx);
    // w = rascunho se houver mudanças pendentes; caso contrário, o valor salvo
    const w = trabRascunhoOuSalvo(idx);
    // wSalvo = sempre o valor aplicado (para o resumo de grade e indicativo)
    const wSalvo = K.normTrab(trabDoSem(idx));
    const trab = sem.trab || {};
    const nMan = bloqEfetivos(idx).length;   // conta o rascunho de bloqueios (o que está visível na grade)
    const dn = { 2: 'Seg', 3: 'Ter', 4: 'Qua', 5: 'Qui', 6: 'Sex' };
    const resumo = K.DIAS_UTEIS.map(d => {
        const iv = trab.intervalos && trab.intervalos[d];
        return iv ? `<b>${dn[d]}</b> ${K.fmtHHMM(iv.startMin)}–${K.fmtHHMM(iv.endMin)} (${K.fmtDur(iv.horas)})` : `<b>${dn[d]}</b> livre`;
    }).join(' · ');
    const folgaLabel = `<label style="flex-basis:100%" data-tip="Deslocamento mínimo entre o trabalho e qualquer aula (vale nos dois sentidos: fim do trabalho → início da aula e fim da aula → início do trabalho)">🚍 Intervalo mín. trabalho↔aula <input type="number" min="0" max="240" step="5" value="${w.folga}" data-trab="folga" data-sem="${idx}"> min</label>`;
    // Campos do trabalho. UM modo (fixo|flexível) define o sentido da janela [início, fim]:
    //  • flexível → faixa-limite onde o trabalho se molda; horas/semana é perguntado.
    //  • fixo     → bloco exato que trava a grade; horas/semana é DERIVADO (janela × 5 dias).
    const isFlex = w.modo === 'flexivel';
    const campoHoras = isFlex
        ? `<label>Horas/semana (total) <input type="number" min="0" max="60" value="${w.horas}" data-trab="horas" data-sem="${idx}"></label>`
        : `<label class="muted" style="flex-basis:100%">Carga semanal: <b>${K.fmtDur(w.horas)}</b> <span class="muted">— derivada da janela (janela × 5 dias úteis)</span></label>`;
    const campoJanela = isFlex
        ? `<label data-tip="Faixa-limite onde o trabalho pode cair. Ela se adapta ao alterar as horas/semana: alarga só quando fica estreita demais p/ o total, e mantém a folga que já tiver — folga extra é o que deixa o trabalho desviar das aulas.">Trabalhar entre <input type="time" step="300" value="${w.inicio}" data-trab="comeco" data-sem="${idx}"> e <input type="time" step="300" value="${w.fim}" data-trab="termino" data-sem="${idx}"> <span class="muted">— faixa-limite: o trabalho se encaixa ao redor das aulas</span></label>`
        : `<label>Trabalhar das <input type="time" step="300" value="${w.inicio}" data-trab="comeco" data-sem="${idx}"> às <input type="time" step="300" value="${w.fim}" data-trab="termino" data-sem="${idx}"> <span class="muted">— janela fixa todo dia; nenhuma aula pode ocupá-la</span></label>`;
    // Teto da faixa: o trabalho se espalha pelos 5 dias úteis, então nenhuma grade fecha mais que
    // (duração da faixa × 5). Acima disso o déficit é permanente — avisa aqui, na origem, em vez de
    // deixar o usuário descobrir pelo resumo da grade.
    const capJanela = K.janelaCapSemanal(w);
    const avisoJanela = isFlex && w.trabalha && capJanela < w.horas - 1e-6
        ? `<div class="muted" style="flex-basis:100%;color:var(--secondary);font-size:12px">⚠ Esta faixa comporta no máx. <b>${K.fmtDur(capJanela)}</b>/semana (${K.fmtDur(K.janelaHoras(w))} × 5 dias úteis) — menos que as <b>${K.fmtDur(w.horas)}</b> pedidas, então nenhuma grade fecha o total. <button class="btn btn-sm btn-ghost" data-trab-ajustar="${idx}" data-tip="Alarga a faixa até comportar ${esc(K.fmtDur(w.horas))}/semana">↔ Ajustar faixa</button></div>`
        : '';
    const camposTrab = `${campoJanela}
    ${avisoJanela}
    ${campoHoras}
    ${folgaLabel}`;
    // Âncora (só flexível): onde o bloco diário se fixa quando há aula no meio da janela.
    const ancora = w.ancora || 'livre';
    const ancoraRadios = isFlex ? `
    <label style="flex-basis:100%;gap:8px"><span style="color:var(--text);font-weight:600">📌 Onde o trabalho se fixa?</span>
    <div class="flexlado" style="flex-basis:100%">
    ${[['inicio', 'No começo (cresce p/ a tarde)'], ['fim', 'No fim (cresce p/ a manhã)'], ['livre', 'Sem preferência']].map(([v, t]) => `<button class="flexlado-opt ${ancora === v ? 'on' : ''}" data-trab-ancora="${v}" data-sem="${idx}"><span class="rb"></span>${t}</button>`).join('')}
    </div></label>` : '';
    const presets = S.trabPresets || [];
    // Controles de configurações salvas (só fazem sentido com trabalho ativo).
    const presetControls = w.trabalha ? `
    <span class="muted" style="font-size:12px">📁 Salvas:</span>
    ${presets.length ? presets.map(p => `<span class="daychip ${mesmaCfgTrab(p.cfg, w) ? 'on' : ''}" data-trab-preset-apply="${p.id}" data-sem="${idx}" data-tip="Clique para aplicar &quot;${esc(p.nome)}&quot; a ${esc(sem.rotulo)}">${esc(p.nome)} <span data-trab-preset-del="${p.id}" data-tip="Excluir esta configuração" style="margin-left:5px;color:var(--secondary);font-weight:700">×</span></span>`).join('') : '<span class="muted" style="font-style:italic">nenhuma</span>'}
    <button class="btn btn-sm btn-ghost" data-trab-preset-save="${idx}">💾 Salvar atual…</button>` : '';
    const respondido = wSalvo.trabalha !== null && wSalvo.trabalha !== undefined;
    // S5.3 — total de horas fechado (✓ verde) × não fechado (✗ vermelho)
    const fechado = !wSalvo.trabalha || (trab.deficit <= 1e-6 && !trab.conflitosNucleo && !trab.rigidConf);
    const indicativo = temRasc
        ? `<span class="chip" style="color:#c9a84c;background:rgba(180,130,0,0.15)">⏳ alterações pendentes</span>`
        : !respondido
            ? `<span class="chip" style="color:var(--secondary)">responda →</span>`
            : fechado
                ? `<span class="chip" style="color:var(--success)">✓ preenchido</span>`
                : `<span class="chip" style="color:var(--error)">✗ preenchido (inválido)</span>`;
    // Barra de ações unificada: presets/propagação à esquerda (menor destaque) e Aplicar à direita,
    // sempre exibido — opaco/desabilitado quando não há alterações pendentes.
    const acoesBar = `
<div class="trab-acoes">
    <div class="trab-acoes-l">${presetControls}</div>
    <div class="trab-acoes-r">
    ${temRasc ? `<span class="muted" style="font-size:12px;color:#c9a84c">⏳ não aplicado</span><button class="btn btn-sm btn-ghost" data-trab-descartar="${idx}">✕ Descartar</button>` : ''}
    <button class="btn btn-sm btn-primary" data-trab-aplicar="${idx}" ${temRasc ? '' : 'disabled'} data-tip="${temRasc ? 'Aplica as alterações e recalcula as grades' : 'Sem alterações pendentes para aplicar'}">✔ Aplicar</button>
    </div>
</div>`;
    return `<details class="personalize" id="blocos-${idx}" ${(forceOpen || !respondido) ? 'open' : ''} style="margin-top:14px">
<summary>🔒 Horários travados de ${esc(sem.rotulo)} ${indicativo} <span class="muted" style="font-weight:400;font-size:12px">— ${nMan} manual${nMan === 1 ? '' : 'is'}${wSalvo.trabalha ? ` + trabalho` : ''}</span></summary>
<div class="work-form">
    <label style="gap:10px"><span style="color:var(--text);font-weight:600">💼 Você trabalha neste semestre?</span>
    <span class="segbtn">
        <button class="seg ${w.trabalha === true ? 'on' : ''}" data-trab-sim="${idx}">Sim</button>
        <button class="seg ${w.trabalha === false ? 'on' : ''}" data-trab-nao="${idx}">Não</button>
    </span></label>
    ${w.trabalha ? `
    <label style="flex-basis:100%;gap:8px"><span style="color:var(--text);font-weight:600">🕐 Como é o seu horário de trabalho?</span>
    <span class="segbtn">
        <button class="seg ${w.modo === 'fixo' ? 'on' : ''}" data-trab-modo="fixo" data-sem="${idx}">Fixo</button>
        <button class="seg ${isFlex ? 'on' : ''}" data-trab-modo="flexivel" data-sem="${idx}">Flexível</button>
    </span>
    <span class="muted">${isFlex ? 'encaixo a carga semanal ao redor das aulas (distribuição homogênea entre os dias)' : 'mesmo intervalo todo dia — trava a grade contra aulas nesse horário'}</span></label>
    ${camposTrab}
    ${ancoraRadios}
    <div style="flex-basis:100%;border-top:1px solid var(--line);padding-top:8px" class="muted">📅 Trabalho encaixado na grade escolhida: ${resumo}${trab.deficit > 1e-6 ? ` · <span style="color:var(--secondary)">faltam ${K.fmtDur(trab.deficit)} p/ fechar o total semanal</span>` : ` · <span style="color:var(--success)">total de ${K.fmtDur(wSalvo.horas)} fechado</span>`}${trab.conflitosNucleo ? ` · <span style="color:var(--secondary)">⚠ ${trab.conflitosNucleo} dia(s) com aula no horário de trabalho fixo</span>` : ''}</div>
    `: ''}
</div>
<div style="padding:0 16px 8px" class="muted">Clique numa célula para travar manualmente; <b>clique e arraste verticalmente</b> (mesmo dia) p/ travar vários. O bloco de <b style="color:#9cc0ff">Trabalho</b> (azul) é calculado automaticamente ao redor das aulas da grade escolhida e varia por dia quando você pode variar o horário entre os dias.</div>
<div style="padding:0 16px 16px">${blockGridHTML(sem)}</div>
${acoesBar}
</details>`;
}

function initTrilhasDrag() {
    const ul = $('#trilhas'); if (!ul) return;
    Sortable.create(ul, {
        animation: 150, handle: '.grip', ghostClass: 'sortable-ghost',
        onEnd() {
            S.preferencias.preferenciaTrilhas = $$('#trilhas li').map(li => li.dataset.id);
            $$('#trilhas .rank').forEach((r, i) => r.textContent = i + 1); salvar();
        }
    });
}

/* ===================================================================
    Grafo de matérias (todas) — force-directed em SVG
    =================================================================== */
let GRAFO = null;
let _grafoFocus = null;   // S10 — matéria a ser focada/selecionada ao abrir o grafo
const ROT_STATUS = { concluida: 'Concluída', cursando: 'Cursando agora', disponivel: 'Disponível', bloqueada: 'Bloqueada (faltam pré-req)' };
const NODE_HALF = 30;
// S10 — centraliza a câmera do grafo num nó
function grafoCentrarNo(cod) {
    const nd = GRAFO && GRAFO.byCod.get(cod); const svg = document.getElementById('grafo-svg');
    if (!nd || !svg) return false;
    const r = svg.getBoundingClientRect(); const k = Math.max(GRAFO.view.k, 1);
    GRAFO.view.k = k; GRAFO.view.x = r.width / 2 - nd.x * k; GRAFO.view.y = r.height / 2 - nd.y * k; grafoApplyView();
    return true;
}

function grafoDados() {
    const discs = D.matriz.disciplinas.slice();   // todas as matérias (obrigatórias, trilhas, 2º estrato, humanidades, eletivas)
    const setCods = new Set(discs.map(d => d.codigo));
    const aprov = D.cursadasBase;
    const andamento = new Set(D.emAndamento);
    const feitas = new Set([...aprov, ...andamento]);
    const semPlan = {};
    (D.projecao || []).forEach(s => {
        if (s.idx > 0 && s.grade && s.grade.sel) s.grade.sel.forEach(x => {
            const c = x.disciplina && x.disciplina.codigo; if (c && setCods.has(c) && semPlan[c] == null && !x.bloqueado) semPlan[c] = s.idx;
        });
    });
    const statusDe = cod => {
        if (aprov.has(cod)) return 'concluida';
        if (andamento.has(cod)) return 'cursando';
        const v = D.grafo.get(cod); let ok = true; if (v) v.in.forEach(p => { if (!feitas.has(p)) ok = false; });
        return ok ? 'disponivel' : 'bloqueada';
    };
    const nodes = discs.map(d => ({
        cod: d.codigo, d, tipo: tipoDe(d), status: statusDe(d.codigo),
        sem: semPlan[d.codigo], per: d.periodoSugerido || 0, x: 0, y: 0, dx: 0, dy: 0
    }));
    const edges = [];
    for (const d of discs) for (const p of d.preRequisitos) if (setCods.has(p)) edges.push({ from: p, to: d.codigo });
    return { nodes, edges, byCod: new Map(nodes.map(n => [n.cod, n])), sel: null, view: { x: 0, y: 0, k: 1 } };
}

// Fruchterman–Reingold: posições estáveis precomputadas (semeadas por período).
// Nós sem arestas NÃO participam da simulação (senão formam um anel na periferia);
// depois são posicionados junto a nós conectados da sua própria categoria (ver placeIsolated).
function layoutForca(g, W, H, iters) {
    const n = g.nodes.length; if (!n) return;
    const k = Math.sqrt((W * H) / n) * 0.8;
    g.nodes.forEach((nd, i) => { const p = nd.per > 0 ? nd.per : 4; nd.x = (p / 9) * W + (Math.random() * 80 - 40); nd.y = (H * 0.08) + (i * 131 % Math.max(1, H - 100)) + (Math.random() * 40 - 20); });
    const adj = g.edges.map(e => [g.byCod.get(e.from), g.byCod.get(e.to)]).filter(a => a[0] && a[1]);
    const deg = new Map<any, number>(g.nodes.map(nd => [nd.cod, 0]));
    for (const [a, b] of adj) { deg.set(a.cod, (deg.get(a.cod) || 0) + 1); deg.set(b.cod, (deg.get(b.cod) || 0) + 1); }
    g.nodes.forEach(nd => nd._iso = (deg.get(nd.cod) || 0) === 0);
    const sim = g.nodes.filter(nd => !nd._iso);   // só os conectados na simulação de forças
    const ns = sim.length;
    // componentes conexos: cada sub-grafo desconexo é puxado pelo seu centróide ao centro,
    // para não escapar para longe do grafo central (só a repulsão evita sobreposição entre eles).
    const parent = new Map(sim.map(v => [v.cod, v.cod]));
    const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    for (const [a, b] of adj) { const ra = find(a.cod), rb = find(b.cod); if (ra !== rb) parent.set(ra, rb); }
    const comps = new Map();
    sim.forEach(v => { const r = find(v.cod); (comps.get(r) || comps.set(r, []).get(r)).push(v); });
    const multi = comps.size > 1;
    let t = W * 0.10;
    for (let it = 0; it < iters; it++) {
        sim.forEach(v => { v.dx = 0; v.dy = 0; });
        for (let i = 0; i < ns; i++) for (let j = i + 1; j < ns; j++) {
            const a = sim[i], b = sim[j];
            let dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy) || 0.01; const f = k * k / dist, ux = dx / dist, uy = dy / dist;
            a.dx += ux * f; a.dy += uy * f; b.dx -= ux * f; b.dy -= uy * f;
        }
        for (const [a, b] of adj) {
            let dx = a.x - b.x, dy = a.y - b.y, dist = Math.hypot(dx, dy) || 0.01; const f = dist * dist / k, ux = dx / dist, uy = dy / dist;
            a.dx -= ux * f; a.dy -= uy * f; b.dx += ux * f; b.dy += uy * f;
        }
        sim.forEach(v => {
            v.dx += (W / 2 - v.x) * 0.012; v.dy += (H / 2 - v.y) * 0.012;
            let d = Math.hypot(v.dx, v.dy) || 0.01, m = Math.min(d, t); v.x += v.dx / d * m; v.y += v.dy / d * m;
        });
        t *= 0.965;
    }
    if (multi) packComponents(comps, W, H, k);   // aproxima os sub-grafos do grafo central
    placeIsolated(g, k);
}

// Empacota componentes desconexos: mantém o maior no centro e encosta cada sub-grafo menor
// logo após o nó perimetral do grafo central na sua direção (gap ~ 1 nó), em ângulos distribuídos.
function packComponents(comps, W, H, k) {
    const info = [...comps.values()].map(list => {
        const cx = list.reduce((a, n) => a + n.x, 0) / list.length, cy = list.reduce((a, n) => a + n.y, 0) / list.length;
        let r = 0; for (const v of list) r = Math.max(r, Math.hypot(v.x - cx, v.y - cy));
        return { list, cx, cy, r: r || k * 0.5 };
    }).sort((a, b) => b.list.length - a.list.length);
    if (info.length <= 1) return;
    const cx0 = W / 2, cy0 = H / 2, gap = k * 1.1, N = info.length - 1;
    const main = info[0];
    const move = (c, tx, ty) => { const dx = tx - c.cx, dy = ty - c.cy; c.list.forEach(v => { v.x += dx; v.y += dy; }); c.cx = tx; c.cy = ty; };
    move(main, cx0, cy0);                                  // maior componente no centro
    for (let i = 1; i < info.length; i++) {
        const c = info[i], ang = -Math.PI / 2 + (i - 1) * (2 * Math.PI / N), dx = Math.cos(ang), dy = Math.sin(ang);
        // nó do componente central mais "para fora" nessa direção (perímetro)
        let proj = -Infinity, px = cx0, py = cy0;
        for (const v of main.list) { const p = (v.x - cx0) * dx + (v.y - cy0) * dy; if (p > proj) { proj = p; px = v.x; py = v.y; } }
        move(c, px + dx * (gap + c.r), py + dy * (gap + c.r));   // encosta logo após o nó perimetral
    }
}

// Posiciona os nós isolados perto de nós da MESMA categoria (cor):
//  • categoria COM nós conectados → encosta cada isolado num nó conectado da categoria;
//  • categoria SEM nós conectados → agrupa todos num bloco compacto, num setor logo fora do grafo
//    (ex.: Humanidades, que não tem pré-requisitos no grafo) — assim ficam juntos dos seus pares.
function placeIsolated(g, k) {
    const con = g.nodes.filter(n => !n._iso), iso = g.nodes.filter(n => n._iso);
    if (!iso.length) return;
    const ref = con.length ? con : g.nodes;
    const gx = ref.reduce((a, n) => a + n.x, 0) / ref.length, gy = ref.reduce((a, n) => a + n.y, 0) / ref.length;
    let R = 0; ref.forEach(n => R = Math.max(R, Math.hypot(n.x - gx, n.y - gy)));
    const byTipo = {}; iso.forEach(n => (byTipo[n.tipo] || (byTipo[n.tipo] = [])).push(n));
    const semHost = Object.keys(byTipo).filter(tp => !con.some(n => n.tipo === tp));
    let sector = 0;
    for (const tipo in byTipo) {
        const group = byTipo[tipo];
        const hosts = con.filter(n => n.tipo === tipo);
        if (hosts.length) {
            // encosta cada isolado num nó conectado da mesma categoria (em leque p/ fora do centro)
            const buckets = new Map<any, any[]>(hosts.map(h => [h, []]));
            group.forEach((nd, i) => buckets.get(hosts[i % hosts.length]).push(nd));
            buckets.forEach((list, h) => {
                const m = list.length; if (!m) return;
                let rx = h.x - gx, ry = h.y - gy, rl = Math.hypot(rx, ry) || 1;
                const base = Math.atan2(ry / rl, rx / rl);
                list.forEach((nd, j) => { const ang = base + (m === 1 ? 0 : (j - (m - 1) / 2) * 0.7), rad = k * (0.95 + 0.5 * Math.floor(j / 8)); nd.x = h.x + Math.cos(ang) * rad; nd.y = h.y + Math.sin(ang) * rad; });
            });
        } else {
            // categoria inteira isolada → bloco compacto (grid) num setor logo fora do grafo central
            const ang = -Math.PI / 2 + sector * (2 * Math.PI / Math.max(1, semHost.length)); sector++;
            const dx = Math.cos(ang), dy = Math.sin(ang), sp = k * 0.95;
            const cols = Math.max(1, Math.ceil(Math.sqrt(group.length))), rows = Math.ceil(group.length / cols);
            const bx = gx + dx * (R + k * 2.2), by = gy + dy * (R + k * 2.2);
            group.forEach((nd, idx) => { const r = Math.floor(idx / cols), c = idx % cols; nd.x = bx + (c - (cols - 1) / 2) * sp; nd.y = by + (r - (rows - 1) / 2) * sp; });
        }
    }
}

// cadeia transitiva (dir='in' pré-reqs | 'out' desbloqueia) restrita aos nós do grafo
function cadeiaGrafo(cod, dir) {
    const seen = new Set(), st = [cod];
    while (st.length) {
        const c = st.pop(), v = D.grafo.get(c); if (!v) continue;
        v[dir].forEach(x => { if (GRAFO.byCod.has(x) && !seen.has(x)) { seen.add(x); st.push(x); } });
    }
    return seen;
}

function grafoNodeHTML(nd) {
    const claro = (nd.tipo === 'HUM' || nd.tipo === 'ELE');
    const badge = nd.status === 'concluida' ? '<text class="gn-badge" x="22" y="-7">✓</text>'
        : nd.status === 'cursando' ? '<text class="gn-badge" x="22" y="-7">●</text>' : '';
    const tip = `${esc(nd.d.nome)}\\n${esc(nd.cod)} · ${nd.tipo} · ${nd.d.chTotal}h\\nStatus: ${ROT_STATUS[nd.status]}`
        + (nd.sem != null ? `\\nPlanejada: ${esc(rotuloSem(nd.sem))}` : '')
        + `\\nPré-req: ${nd.d.preRequisitos.join(', ') || 'nenhum'}\\n(clique p/ ver a cadeia)`;
    return `<g class="gn tipo-${nd.tipo} st-${nd.status}" data-grafo-node="${esc(nd.cod)}" transform="translate(${nd.x.toFixed(1)},${nd.y.toFixed(1)})" data-tip="${tip}">`
        + `<rect x="${-NODE_HALF}" y="-13" width="${NODE_HALF * 2}" height="26" rx="6"></rect>`
        + `<text class="gn-lbl" x="0" y="1" fill="${claro ? '#fff' : '#06122b'}">${esc(nd.cod)}</text>${badge}</g>`;
}
function grafoEdgeHTML(e) {
    const a = GRAFO.byCod.get(e.from), b = GRAFO.byCod.get(e.to); if (!a || !b) return '';
    let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const x1 = (a.x + ux * 20).toFixed(1), y1 = (a.y + uy * 15).toFixed(1), x2 = (b.x - ux * 36).toFixed(1), y2 = (b.y - uy * 16).toFixed(1);
    return `<line class="ge" data-from="${esc(e.from)}" data-to="${esc(e.to)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#grafo-seta)"></line>`;
}

function grafoLegendaHTML() {
    const areas = [['OBR', 'Obrigatória', '--obr'], ['OPT', '2º Estrato', '--estrato'], ['HUM', 'Humanidades', '--hum'], ['TRI', 'Trilha', '--trilha'], ['ELE', 'Eletiva', '--elet']];
    return `<div class="grafo-legend">
<div><b>Área (cor)</b><div class="row" style="margin-top:4px">${areas.map(([, t, v]) => `<span><i style="background:var(${v})"></i>${t}</span>`).join('')}</div></div>
<div><b>Status (borda)</b><div class="row" style="margin-top:4px">
    <span><i class="ring" style="border:3px solid var(--success)"></i>Concluída</span>
    <span><i class="ring" style="border:2.5px dashed #cfe0ff"></i>Cursando</span>
    <span><i class="ring" style="border:2px solid #fff"></i>Disponível</span>
    <span><i class="ring" style="border:2px dashed #71809c;opacity:.6"></i>Bloqueada</span>
</div></div></div>`;
}
function grafoPainelVazioHTML() {
    return `<div class="gp-empty"><h3 style="color:var(--text)">Grafo de pré-requisitos</h3>
Mostra as <b>obrigatórias</b> e as <b>trilhas</b> e como uma destrava a outra.<br><br>
• <b>Clique</b> numa matéria para acender a cadeia de pré-requisitos (o que vem antes) e o que ela <b>libera</b> (o que vem depois), e ver os detalhes aqui.<br>
• <b>Arraste o fundo</b> para mover e use a <b>roda do mouse</b> para zoom.<br>
• Botão <b>Ajustar</b> reenquadra tudo.</div>`;
}
function pintarPainelGrafo(cod) {
    const el = document.getElementById('grafo-painel'); if (!el) return;
    const nd = cod && GRAFO.byCod.get(cod);
    if (!nd) { el.innerHTML = grafoPainelVazioHTML(); return; }
    const d = nd.d;
    const preq = d.preRequisitos.length ? d.preRequisitos.map(p => {
        const ok = D.cursadasBase.has(p) || D.emAndamento.includes(p); const nm = D.byCod.get(p);
        return `<li>${ok ? '<span style="color:var(--success)">✓</span>' : '<span style="color:var(--secondary)">✗</span>'} <b class="mono">${esc(p)}</b> ${nm ? esc(nm.nome) : ''}</li>`;
    }).join('') : '<li class="muted">nenhum</li>';
    const vout = D.grafo.get(cod); const out = vout ? [...vout.out].filter(c => GRAFO.byCod.has(c)) : [];
    const desbloq = out.length ? out.map(c => { const nm = D.byCod.get(c); return `<li><b class="mono">${esc(c)}</b> ${nm ? esc(nm.nome) : ''}</li>`; }).join('') : '<li class="muted">nenhuma</li>';
    el.innerHTML = `<button class="btn btn-sm btn-ghost" id="grafo-limpar" style="float:right">Limpar ✕</button>
<h3>${esc(d.nome)}</h3>
<div class="muted mono" style="font-size:12px">${esc(cod)} · <span class="tag ${nd.tipo}">${nd.tipo}</span> · ${d.chTotal}h${d.chExt > 0 ? (' · ext ' + d.chExt + 'h') : ''}</div>
<div class="gp-status st-${nd.status}">${ROT_STATUS[nd.status]}${nd.sem != null ? ` · planejada p/ ${esc(rotuloSem(nd.sem))}` : ''}</div>
<h4>Pré-requisitos (${d.preRequisitos.length})</h4><ul class="gp-list">${preq}</ul>
<h4>Libera / desbloqueia (${out.length})</h4><ul class="gp-list">${desbloq}</ul>`;
}

function selecionarNoGrafo(cod) {
    if (!GRAFO) return;
    GRAFO.sel = cod || null;
    const svg = document.getElementById('grafo-svg'); if (!svg) return;
    const nodes: any = svg.querySelectorAll('.gn'), edges: any = svg.querySelectorAll('.ge');
    if (!cod) { nodes.forEach(n => n.classList.remove('dim', 'hot', 'sel')); edges.forEach(e => e.classList.remove('dim', 'hot')); pintarPainelGrafo(null); return; }
    const anc = cadeiaGrafo(cod, 'in'), desc = cadeiaGrafo(cod, 'out'), rel = new Set([cod, ...anc, ...desc]);
    nodes.forEach(n => { const c = n.dataset.grafoNode; n.classList.toggle('sel', c === cod); n.classList.toggle('hot', rel.has(c) && c !== cod); n.classList.toggle('dim', !rel.has(c)); });
    edges.forEach(e => { const on = rel.has(e.dataset.from) && rel.has(e.dataset.to); e.classList.toggle('hot', on); e.classList.toggle('dim', !on); });
    pintarPainelGrafo(cod);
}

function grafoApplyView() { const cam = document.getElementById('grafo-cam'); if (cam && GRAFO) cam.setAttribute('transform', `translate(${GRAFO.view.x},${GRAFO.view.y}) scale(${GRAFO.view.k})`); }
function grafoFit() {
    const svg = document.getElementById('grafo-svg'); if (!svg || !GRAFO || !GRAFO.nodes.length) return;
    const xs = GRAFO.nodes.map(n => n.x), ys = GRAFO.nodes.map(n => n.y);
    const minx = Math.min(...xs) - NODE_HALF - 20, maxx = Math.max(...xs) + NODE_HALF + 20, miny = Math.min(...ys) - 30, maxy = Math.max(...ys) + 30;
    const w = Math.max(1, maxx - minx), h = Math.max(1, maxy - miny), r = svg.getBoundingClientRect();
    const k = Math.max(0.2, Math.min(2, Math.min(r.width / w, r.height / h)));
    GRAFO.view.k = k; GRAFO.view.x = (r.width - w * k) / 2 - minx * k; GRAFO.view.y = (r.height - h * k) / 2 - miny * k;
    grafoApplyView();
}
window.__grafoFit = grafoFit;

let _grafoMove = null, _grafoUp = null;
function wireGrafo() {
    const svg = document.getElementById('grafo-svg'); if (!svg) return;
    let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
    svg.addEventListener('mousedown', e => { if ((e.target as HTMLElement).closest('.gn')) return; panning = true; sx = e.clientX; sy = e.clientY; ox = GRAFO.view.x; oy = GRAFO.view.y; svg.classList.add('panning'); });
    const move = e => { if (!panning) return; GRAFO.view.x = ox + (e.clientX - sx); GRAFO.view.y = oy + (e.clientY - sy); grafoApplyView(); };
    const up = () => { if (panning) { panning = false; svg.classList.remove('panning'); } };
    if (_grafoMove) window.removeEventListener('mousemove', _grafoMove);
    if (_grafoUp) window.removeEventListener('mouseup', _grafoUp);
    _grafoMove = move; _grafoUp = up;
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    svg.addEventListener('wheel', e => {
        e.preventDefault(); const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const k2 = Math.max(0.2, Math.min(3, GRAFO.view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        GRAFO.view.x = mx - (mx - GRAFO.view.x) * (k2 / GRAFO.view.k); GRAFO.view.y = my - (my - GRAFO.view.y) * (k2 / GRAFO.view.k); GRAFO.view.k = k2; grafoApplyView();
    }, { passive: false });
}

function renderGrafo() {
    if (!D.matriz) { S.fase = 'upload'; return render(); }
    GRAFO = grafoDados();
    layoutForca(GRAFO, 1280, 820, 340);
    const edgesSVG = GRAFO.edges.map(grafoEdgeHTML).join('');
    const nodesSVG = GRAFO.nodes.map(grafoNodeHTML).join('');
    const cont = GRAFO.nodes.reduce((a, n) => { a[n.status] = (a[n.status] || 0) + 1; return a; }, {});
    root.innerHTML = `
<div class="topbar">
<button class="btn btn-sm btn-ghost" id="voltar-plano">← Voltar ao planejador</button>
<div class="logo">C+</div><div class="who">🗺️ Grafo de matérias</div>
<div class="meta">
    <span class="muted" style="font-size:12px">${GRAFO.nodes.length} matérias · ${cont.concluida || 0} concl. · ${cont.cursando || 0} cursando · ${cont.disponivel || 0} disp. · ${cont.bloqueada || 0} bloq.</span>
    <button class="btn btn-sm btn-ghost" id="grafo-ajustar">Ajustar</button>
</div>
</div>
<div class="grafo-wrap">
<div class="grafo-canvas">
    <svg id="grafo-svg" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="grafo-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5a6b8c"></path></marker></defs>
    <g id="grafo-cam"><g id="grafo-edges">${edgesSVG}</g><g id="grafo-nodes">${nodesSVG}</g></g>
    </svg>
    ${grafoLegendaHTML()}
</div>
<aside class="grafo-painel" id="grafo-painel">${grafoPainelVazioHTML()}</aside>
</div>`;
    wireGrafo();
    requestAnimationFrame(grafoFit);
    // S10 — se veio de "ver no grafo", seleciona e centraliza no nó
    if (_grafoFocus) {
        const cod = _grafoFocus; _grafoFocus = null;
        requestAnimationFrame(() => {
            if (GRAFO && GRAFO.byCod.has(cod)) { selecionarNoGrafo(cod); grafoCentrarNo(cod); }
            else toast('Esta matéria não aparece no grafo (só obrigatórias e trilhas são exibidas).');
        });
    }
}

/* ===================================================================
    APP principal
    =================================================================== */
function renderApp() {
    const al = D.hist.aluno;
    const proj = D.projecao;
    // Foco único no semestre-alvo (idx 1 = próximo semestre, o dos dados de oferta inseridos).
    // É sempre o último elemento de D.projecao ([sem0, semAlvo]); o sem0 (em andamento) não é exibido.
    S.abaAtiva = proj.length - 1;
    const sem = proj[S.abaAtiva];
    root.innerHTML = `
<div class="topbar">
<button class="btn btn-sm btn-ghost" id="toggle-side">☰</button>
<div class="logo">C+</div><div class="who">${esc(al.nome || 'Aluno')}</div>
<div class="meta">
    <span class="score-help" data-tip="${SCORE_TIP}">ⓘ Score</span>
    <div class="stat"><b>${(al.coeficienteAbsoluto || 0).toFixed(4)}</b><span>Coef. absoluto</span></div>
    <div class="stat"><b>${D.hist.aluno.periodoAtual}º</b><span>Período atual</span></div>
    <button class="btn btn-sm btn-ghost" data-editar-pref>⚙️ Preferências</button>
    <button class="btn btn-sm btn-ghost" id="ver-grafo">🗺️ Grafo de matérias</button>
    <button class="btn btn-sm btn-danger" id="reiniciar">Reiniciar tudo</button>
</div>
</div>
<div class="layout">
<aside class="sidebar ${S.sidebarCollapsed ? 'collapsed' : ''}" id="sidebar">${sidebarHTML(sem)}</aside>
<main class="main">
    ${semestreHTML(sem)}
</main>
</div>
${S.prefsOpen ? prefsOverlayHTML() : ''}`;
    if (S.prefsOpen) initTrilhasDrag();   // Sortable precisa reanexar ao <ul> recriado
}

function sidebarHTML(sem) {
    const h = sem.horas;
    const row = (label, obj, cls = '', help = '') => {
        const pct = obj.total ? Math.min(100, Math.round(obj.cursada / obj.total * 100)) : 100;
        return `<tr class="${obj.faltante === 0 ? 'done' : ''} ${cls}">
    <td class="area">${esc(label)}${help ? `<span class="q-help" data-tip="${esc(help)}">?</span>` : ''}
    <div class="bar"><i style="width:${pct}%;background:${obj.faltante === 0 ? 'var(--success)' : 'var(--primary)'}"></i></div></td>
    <td>${obj.total}h</td><td>${obj.faltante === 0 ? '<span style="color:var(--success)">✓</span>' : obj.faltante + 'h'}</td></tr>`;
    };
    const sub = h.subStatus;
    const trilhaRows = Object.keys(sub).filter(id => sub[id].cursada > 0 || S.preferencias.preferenciaTrilhas.indexOf(id) < 3)
        .map(id => `<tr class="sub2 ${sub[id].faltante === 0 ? 'done' : ''}"><td>↳ ${esc(sub[id].nome)} ${sub[id].validada ? '<span style="color:var(--success)">✓</span>' : ''}</td><td>${K.REQUISITOS.trilhaMin}h</td><td>${sub[id].faltante}h</td></tr>`).join('');
    return `
<div class="side-sec">
<h4>📊 Horas faltantes <span class="muted" style="text-transform:none;font-weight:400">· ao fim de ${sem.rotulo}</span></h4>
<table class="htable"><tbody>
    ${row('Obrigatórias', h.obrigatorias, '', 'Disciplinas obrigatórias da matriz, incluindo estágios e TCC.')}
    ${row('Optativas (total)', h.optativasTotal, '', 'Soma de Segundo Estrato, Humanidades e Trilhas.')}
    <tr class="sub ${h.conj1159.faltante === 0 ? 'done' : ''}"><td>↳ Segundo Estrato [1159]</td><td>${h.conj1159.total}h</td><td>${h.conj1159.faltante || '✓'}${h.conj1159.faltante ? 'h' : ''}</td></tr>
    <tr class="sub ${h.conj1161.faltante === 0 ? 'done' : ''}"><td>↳ Humanidades [1161]</td><td>${h.conj1161.total}h</td><td>${h.conj1161.faltante || '✓'}${h.conj1161.faltante ? 'h' : ''}</td></tr>
    <tr class="sub ${h.trilhas.faltante === 0 ? 'done' : ''}"><td>↳ Trilhas [1160] · ${h.trilhas.validadas}/3 validadas</td><td>${h.trilhas.total}h</td><td>${h.trilhas.faltante}h</td></tr>
    ${trilhaRows}
    ${row('Eletivas', h.eletivas, '', 'Qualquer disciplina da UTFPR. Registre manualmente abaixo.')}
    ${row('Extensão', h.extensao, '', '330h: 60h via Trab. de Integração 1 + 270h de CCE/optativas extensionistas.')}
    ${row('Complementares', h.complementares, '', 'Atividades Complementares (ICSX50).')}
</tbody></table>
</div>
<div class="side-sec">
<h4>🧩 Itens não presenciais / manuais</h4>
${manuaisHTML(sem)}
</div>
<div class="side-sec">
<h4>⚙️ Preferências</h4>
<button class="btn btn-sm btn-ghost" data-editar-pref style="width:100%">Editar campus, turnos, faixa e bloqueios</button>
<div class="muted" style="font-size:11px;margin-top:8px">Campus: ${S.preferencias.campusUnico ? S.preferencias.campus : 'Qualquer'} · Turnos: ${S.preferencias.turnos.join(' ')} · Carga: ${S.preferencias.cargaMin}–${S.preferencias.cargaMax} · Bloqueios: ${totalBloqueios()}</div>
</div>`;
}

// idx do primeiro semestre projetado em que o requisito de horas `key` é integralizado (ou null)
function semIdxItemSatisfeito(key) { const s = (D.projecao || []).find(s => s.horas && s.horas[key] && s.horas[key].faltante === 0); return s ? s.idx : null; }
function manuaisHTML(sem) {
    const m = S.manuais;
    const idx = sem ? sem.idx : 0;   // conclusão por clique usa o semestre em exibição (sem dropdown)
    // S11 — itens concluíveis por clique: a trava opaca "Item satisfeito em [período]" só aparece
    // A PARTIR DO SEMESTRE SEGUINTE ao da conclusão; no próprio semestre (ou antes) o controle segue acionável.
    const estagioRow = (cod, nome) => {
        const compSem = m.estagios[cod];
        const marcado = compSem != null;
        const locked = marcado && idx > compSem;
        const cabec = `<div><div style="font-size:12px;font-weight:600">${esc(nome)}</div><div class="muted" style="font-size:10px">${esc(cod)} · 200h</div></div>`;
        if (locked) return `<div class="spread manual-done" style="margin-bottom:8px;opacity:.4">${cabec}
    <span class="chip" style="color:var(--success)">✓ Item satisfeito em ${esc(rotuloSem(compSem))}</span></div>`;
        return `<div class="spread" style="margin-bottom:8px">${cabec}
    ${marcado
                ? `<div class="flx"><span class="chip" style="color:var(--success)">✓ Concluído em ${esc(rotuloSem(compSem))}</span><button class="btn btn-sm btn-danger" data-manual="estagio-undo" data-cod="${cod}">Cancelar a conclusão</button></div>`
                : `<button class="btn btn-sm btn-primary" data-manual="estagio-do" data-cod="${cod}" data-sem="${idx}" data-tip="Marca ${esc(nome)} como concluído em ${esc(rotuloSem(idx))}">Concluir em ${esc(rotuloSem(idx))}</button>`}
</div>`;
    };
    // S11 — item acumulativo por semestre: lança as horas realizadas NAQUELE semestre (campo vem vazio);
    // o valor soma ao total. Quando o requisito é integralizado, o campo fica desabilitado e opaco.
    const acumRow = (chave, key, titulo, meta) => {
        const item = m[chave] || (m[chave] = { porSem: {} });
        const noSem = item.porSem[idx];
        const acumAte = somaManualAteSem(item, idx);
        const satIdx = semIdxItemSatisfeito(key);
        // trava/opaca + mensagem só A PARTIR DO SEMESTRE SEGUINTE ao que integralizou o item
        // (no próprio semestre em que satisfaz, o campo segue editável)
        const locked = satIdx != null && idx > satIdx;
        const cabec = `<div><div style="font-size:12px;font-weight:600">${esc(titulo)}</div><div class="muted" style="font-size:10px">${esc(meta)} · acum. até ${esc(rotuloSem(idx))}: ${acumAte}h</div></div>`;
        if (locked) {
            return `<div class="spread manual-done" style="margin-bottom:8px;opacity:.4">${cabec}
    <span class="chip" style="color:var(--success)">✓ Item satisfeito em ${esc(rotuloSem(satIdx))}</span></div>`;
        }
        return `<div class="spread" style="margin-bottom:8px">${cabec}
    <div class="flx"><input type="number" min="0" max="330" value="${noSem != null ? noSem : ''}" placeholder="0" data-manual-sem-num="${chave}" data-idx="${idx}" data-tip="Horas realizadas de ${esc(titulo)} em ${esc(rotuloSem(idx))} (soma ao total)" style="width:58px;background:var(--surface2);border:1px solid var(--line);color:var(--text);border-radius:6px;padding:3px 6px;font-size:11px">h <span class="muted" style="font-size:10px">neste sem.</span></div></div>`;
    };
    return `
${estagioRow('ICSX51', 'Estágio 1')}
${estagioRow('ICSX52', 'Estágio 2')}
${acumRow('eletiva', 'eletivas', 'Eletivas externas', 'meta 105h')}
${acumRow('extensao', 'extensao', 'Extensão (CCE)', 'faltam 270h')}
${(() => {
            const compSem = m.enade.sem, marcado = m.enade.done && compSem != null;
            const locked = marcado && idx > compSem;
            const cabec = `<div><div style="font-size:12px;font-weight:600">ENADE Concluinte</div><div class="muted" style="font-size:10px">requisito de formatura</div></div>`;
            if (locked) return `<div class="spread manual-done" style="opacity:.4">${cabec}
    <span class="chip" style="color:var(--success)">✓ Item satisfeito em ${esc(rotuloSem(compSem))}</span></div>`;
            return `<div class="spread">${cabec}
    ${marcado
                    ? `<div class="flx"><span class="chip" style="color:var(--success)">✓ Concluído em ${esc(rotuloSem(compSem))}</span><button class="btn btn-sm btn-danger" data-manual="enade-undo">Cancelar a conclusão</button></div>`
                    : `<button class="btn btn-sm btn-primary" data-manual="enade-do" data-sem="${idx}" data-tip="Marca o ENADE Concluinte como realizado em ${esc(rotuloSem(idx))}">Marcar em ${esc(rotuloSem(idx))}</button>`}
</div>`;
        })()}`;
}

function semestreHTML(sem) {
    if (sem.formatura) return formaturaHTML(sem) + planoSemestreHTML(sem);
    if (sem.cursoImpossivel) return impossivelHTML(sem) + planoSemestreHTML(sem);
    if (sem.quaseFormatura) return quaseFormaturaHTML(sem) + planoSemestreHTML(sem);
    return planoSemestreHTML(sem);
}

function planoSemestreHTML(sem) {
    const escolhida = sem.grade;
    const banners = [];
    // rascunho banner
    const blocos = sem.bloqueios || [];
    const rasc = escolhida.sel.filter(s => s.bloqueado);
    rasc.forEach(s => {
        const blkSlots = s.horarios.filter(h => blocos.some(b => b.diaSemana === h.diaSemana && b.periodo === h.periodo && b.slot === h.slot));
        const nomesBlk = [...new Set(blkSlots.map(h => { const b = blocos.find(b => b.diaSemana === h.diaSemana && b.periodo === h.periodo && b.slot === h.slot); return b ? b.nome : ''; }))].join(', ');
        banners.push(`<div class="banner warn">⚠ <b>“${esc(s.disciplina.nome)}”</b> ocupa o horário travado <b>${esc(nomesBlk)}</b> em ${sem.rotulo}. Resolva o conflito para que ela entre na sua grade.
    <span class="b-actions"><button class="btn btn-sm btn-ghost" data-rm-rasc="${s.disciplina.codigo}">Remover da grade</button><button class="btn btn-sm btn-ghost" data-abrir-blocos="${sem.idx}">Editar bloqueio</button></span></div>`);
    });
    // trabalho: conflito de núcleo / déficit semanal na grade escolhida
    const tw = K.normTrab(trabDoSem(sem.idx)); const tb = sem.trab;
    if (tw.trabalha && (+tw.horas > 0) && tb && escolhida.sel.length) {
        if (tb.conflitosNucleo > 0) banners.push(`<div class="banner warn">⚠ ${tb.conflitosNucleo} dia(s) têm aula dentro do <b>horário de trabalho fixo</b> em ${sem.rotulo}. Esse intervalo é sempre travado — reduza a janela de trabalho ou escolha outra grade. <span class="b-actions"><button class="btn btn-sm btn-ghost" data-abrir-blocos="${sem.idx}">Ajustar trabalho</button></span></div>`);
        else if (tb.deficit > 1e-6) banners.push(`<div class="banner info">ℹ Nesta grade só cabem <b>${K.fmtDur(tb.total)}</b> de trabalho/sem (faltam ${K.fmtDur(tb.deficit)} para o total de ${K.fmtDur(tw.horas)}). ${tw.modo === 'flexivel' ? 'O sistema priorizou as grades que melhor aproveitam sua disponibilidade.' : 'As aulas reduzem a janela de trabalho fixo nesta grade — reduza a janela ou escolha outra grade.'} <span class="b-actions"><button class="btn btn-sm btn-ghost" data-abrir-blocos="${sem.idx}">Ajustar trabalho</button></span></div>`);
    }

    const editorAberto = S.editor && S.editor.idx === sem.idx;
    // Seleção visual = UMA única grade. Como grades geradas e personalizadas podem ter os mesmos
    // códigos, resolvemos a chave da grade escolhida priorizando o balde certo (custom×gerada) e a
    // identidade por turma; assim nunca mais de um cartão fica marcado como "escolhida".
    const selKey = gradeSelecionadaKey(sem);
    const cards = [...sem.grades.map((g, i) => gradeCardHTML(g, i, sem, false, i === sem.recKey, i === selKey)), ...(sem.personalizadas || []).map((g, i) => gradeCardHTML(g, 'p' + i, sem, true, ('p' + i) === sem.recKey, ('p' + i) === selKey))];
    const montarCard = `<div class="gcard montar" data-montar="${sem.idx}"><div class="gh"><div><div class="gtitle">➕ Montar grade personalizada</div><div class="gsub">crie do zero — ou use “✏️ Editar” numa grade acima</div></div><div class="score" style="font-size:20px">＋</div></div></div>`;
    const temGrades = sem.grades && sem.grades.length;
    const headAcoes = sem.status === 'confirmado'
        ? `<span class="chip" style="color:var(--success)">confirmado ✓</span> <button class="btn btn-sm btn-ghost" data-desconfirmar="${sem.idx}">Refazer</button>`
        : `${temGrades ? `<button class="btn btn-sm btn-primary" data-escolher="${sem.recKey == null ? 0 : sem.recKey}">✓ Confirmar grade sugerida</button>` : ''}`;
    // cronograma: durante a edição mostra a grade em edição (prévia ao vivo); senão, a grade ativa
    const calSel = editorAberto ? editorSel(sem) : escolhida.sel;
    const calSem = editorAberto ? Object.assign({}, sem, { trab: trabCalc(sem.idx, calSel) }) : sem;
    const aguardando = sem.aguardandoTrab;   // S2: ainda não respondeu se trabalha neste semestre
    // S7 — ordem: Avisos → Horários travados → (Cronograma → Grades, só após responder sobre trabalho)
    const topo = `
<div class="sem-head"><h2>${sem.rotulo} ${sem.formatura ? '🎓' : ''}</h2>
<div class="flx">${aguardando ? '<span class="chip" style="color:var(--secondary)">aguardando resposta sobre trabalho</span>' : headAcoes}</div>
</div>
${banners.join('')}
${blocosSemestreHTML(sem)}`;
    if (aguardando) return topo + `
<div class="banner info" style="margin-top:14px">🕒 Para calcular e exibir o cronograma e as grades possíveis de ${esc(sem.rotulo)}, primeiro responda acima em “Horários travados” se você trabalha neste semestre.</div>`;
    return topo + `
${(calSel.length || editorAberto) ? calendarHTML(calSem, calSel, editorAberto) : ''}
${(calSel.length || editorAberto) ? legendaHTML() : ''}
<h3 style="margin:22px 0 6px;font-size:15px">🎲 Grades possíveis ${sem.status === 'confirmado' ? '<span class="muted" style="font-weight:400;font-size:12px">— escolha outra para trocar</span>' : '<span class="muted" style="font-weight:400;font-size:12px">— confirme a sugerida acima ou escolha/edite outra</span>'}</h3>
${editorAberto ? editorHTML(sem) : ''}
<div class="grades">${(cards.length ? cards.join('') : '<div class="banner info">Nenhuma grade gerada para este semestre.</div>')}${editorAberto ? '' : montarCard}</div>`;
}

function gradeCardHTML(g, i, sem, custom, isRec, isSel) {
    const rec = !!isRec;   // "Recomendada" = a grade de maior score dentro das restrições (definida em projetar)
    const sel = !!isSel;   // "escolhida" = a grade confirmada — exatamente UM cartão (ver gradeSelecionadaKey)
    const aulas = g.sel.reduce((a, s) => a + (s.disciplina.chSemanal || 0), 0);
    const nblk = g.sel.filter(s => s.bloqueado).length;
    const open = rec || sel;
    const scoreTip = scoreBreakdownTip(sem, g.sel);   // S9 — detalhamento ao passar o mouse
    return `<div class="gcard ${rec ? 'rec' : ''} ${sel ? 'sel' : ''} ${open ? 'open' : ''}" data-card="${i}">
<div class="gh" data-toggle-card="${i}">
    <div><div class="gtitle">${custom ? 'Grade personalizada' : 'Grade #' + (i + 1)}${rec ? ' <span class="chip" style="color:var(--secondary)">Recomendada</span>' : ''}</div>
    <div class="gsub">${g.sel.length} disciplinas · ${aulas} aulas/sem · ${nblk ? ('<span style="color:var(--secondary)">' + nblk + ' em conflito</span>') : 'sem conflitos'}</div></div>
    <div class="score" data-tip="${scoreTip}">${typeof g.score === 'number' ? ('<span class="dot"></span> Score: ' + g.score) : ''}</div>
</div>
<div class="gbody">
    ${g.sel.map(s => discRowHTML(s, sem)).join('')}
    <div class="gactions">
    ${sel ? '<span class="chip" style="color:var(--success)">✓ Grade escolhida</span>' : `<button class="btn btn-sm btn-primary" data-escolher="${i}">Escolher esta grade</button>`}
    <button class="btn btn-sm btn-ghost" data-copiar-grade="${i}" data-sem="${sem.idx}" data-tip="Copiar como texto: extrato da grade (código — turma) + horário de trabalho">📋 Copiar</button>
    <button class="btn btn-sm btn-ghost" data-editar="${i}" data-sem="${sem.idx}">✏️ Editar</button>
    ${custom ? `<button class="btn btn-sm btn-ghost" data-del-custom="${String(i).slice(1)}" data-sem="${sem.idx}" title="Excluir esta grade personalizada">🗑</button>` : ''}
    </div>
</div></div>`;
}
// identidade só por códigos (compat.) e identidade completa (códigos + turma escolhida)
function sameGrade(a, b) { if (!a || !b) return false; const ka = a.sel.map(s => s.disciplina.codigo).sort().join(','); const kb = b.sel.map(s => s.disciplina.codigo).sort().join(','); return ka === kb && ka.length > 0; }
function gradeIdentTurma(g) { return g && g.sel ? g.sel.map(s => s.disciplina.codigo + ':' + (s.turma ? s.turma.turma : '')).sort().join(',') : ''; }
function sameGradeFull(a, b) { const ka = gradeIdentTurma(a); return !!ka && ka === gradeIdentTurma(b); }
// chave (i | 'p'+i) do ÚNICO cartão que representa a grade confirmada — ou null se nada confirmado.
// Prioriza o balde correto (personalizada×gerada, por S.escolhas.custom) e a identidade por turma,
// caindo para a identidade só-por-códigos; garante seleção visual consistente (um cartão só).
function gradeSelecionadaKey(sem) {
    if (sem.status !== 'confirmado') return null;
    const gen = sem.grades.map((g, i) => ({ g, key: i }));
    const per = (sem.personalizadas || []).map((g, i) => ({ g, key: 'p' + i }));
    const prefCustom = !!(S.escolhas[sem.idx] && S.escolhas[sem.idx].custom);
    const ordered = prefCustom ? [...per, ...gen] : [...gen, ...per];
    const hit = ordered.find(c => sameGradeFull(c.g, sem.grade)) || ordered.find(c => sameGrade(c.g, sem.grade));
    return hit ? hit.key : null;
}
// extrato de uma grade: "- CÓDIGO — TURMA" por linha (formato para copiar/colar)
function extratoGrade(g) { return g.sel.map(s => `- ${s.disciplina.codigo} — ${s.turma ? s.turma.turma : '—'}`).join('\n'); }
// hora "amigável": 540 → "9h", 810 → "13h30"
function fmtHoraCurta(min) { const h = Math.floor(min / 60), m = Math.round(min % 60); return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`; }
function hhmmParaMin(s) { const m = String(s).match(/(\d{1,2})[:h](\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
// extrato do horário de trabalho para ESTA grade (o flexível se molda à grade escolhida).
// '' quando não trabalha no semestre. Fixo → uma linha; flexível → intervalos por dia.
function extratoTrabalho(sem, g) {
    const w = K.normTrab(trabDoSem(sem.idx));
    if (!w.trabalha || !(+w.horas > 0)) return '';
    if (w.modo === 'fixo') return `Trabalho: das ${fmtHoraCurta(hhmmParaMin(w.inicio))} às ${fmtHoraCurta(hhmmParaMin(w.fim))}`;
    const dn = { 2: 'seg', 3: 'ter', 4: 'qua', 5: 'qui', 6: 'sex' };
    const iv = (trabCalc(sem.idx, g.sel) || {}).intervalos || {};
    const dias = K.DIAS_UTEIS.map(d => iv[d] ? `${dn[d]} ${fmtHoraCurta(iv[d].startMin)} - ${fmtHoraCurta(iv[d].endMin)}` : null).filter(Boolean);
    return dias.length ? `Trabalho: ${dias.join(' · ')}` : 'Trabalho: não encaixou nesta grade';
}

function discRowHTML(s, sem?) {
    const d = s.disciplina; const tp = tipoDe(d);
    const tag = tp === 'OBR' ? 'OBR' : tp === 'HUM' ? 'HUM' : tp === 'TRI' ? 'TRI' : tp === 'OPT' ? 'OPT' : 'ELE';
    const turno = s.horarios.length ? [...new Set(s.horarios.map(h => h.periodo))].join('') : '—';
    const reg = D.hist.cursadas.find(c => c.codigo === d.codigo);
    const reprov = reg && reg.situacao === 'REPROVADO';
    // S4.1 — conflito com o trabalho (permitido por flexibilidade) indicado visualmente na matéria
    const conflitoTrab = sem && !s.andamento && conflitoTrabalho(s.horarios || [], sem);
    const prereqInfo = d.preRequisitos.map(p => `${p} ${(D.cursadasFinal && D.cursadasFinal.has(p)) ? '✓' : '•'}`).join(', ');
    const tip = `${esc(d.nome)}\\nCódigo: ${esc(d.codigo)}\\n${s.turma ? ('Turma ' + esc(s.turma.turma) + (s.turma.professor ? (' · ' + esc(s.turma.professor)) : '')) : ''}\\n${s.horarios.map(h => `${K.DIAS[h.diaSemana].slice(0, 3)} ${h.periodo}${h.slot} (${esc(h.sala || '')})`).join(', ')}\\nPré-req: ${prereqInfo || 'nenhum'}\\n${d.chExt > 0 ? ('Extensionista: ' + d.chExt + 'h') : ''}${conflitoTrab ? '\\n⚠ Conflita com o horário de trabalho (permitido — horário flexível)' : ''}`;
    return `<div class="disc-row ${s.bloqueado ? 'rascunho' : ''} ${conflitoTrab ? 'conflito-trab' : ''}" data-tip="${esc(tip)}">
${s.andamento ? '<span style="color:var(--secondary)">●</span>' : (s.bloqueado ? '<span style="color:var(--secondary)">⚠</span>' : '<span style="color:var(--success)">✓</span>')}
<span class="code">${esc(d.codigo)}</span>
<span class="nm">${esc(d.nome)}${reprov ? ' <span class="muted" style="font-size:10px">(reprovada antes)</span>' : ''}</span>
${conflitoTrab ? '<span class="chip" style="color:var(--secondary);font-size:10px" data-tip="Esta matéria ocupa um horário de trabalho — permitido porque seus horários são flexíveis">⚠ trabalho</span>' : ''}
${d.chExt > 0 ? '<span class="ext-dot" title="Extensionista"></span>' : ''}
<span class="tag ${tag}">${tag}</span><span class="tag turno">${turno}</span>
<span class="muted mono" style="font-size:11px">${d.chSemanal}h/sem</span>
<button class="disc-grafo" data-ir-grafo="${esc(d.codigo)}" data-tip="Ver “${esc(d.nome)}” no grafo de matérias">🗺️</button>
</div>`;
}

/* ---------- Cronograma semanal ---------- */
function calendarHTML(sem, sel, editando?) {
    const grid = {};
    const blocos = sem.bloqueios || [];
    const put = (h, data) => { grid[h.diaSemana + '-' + h.periodo + '-' + h.slot] = data; };
    // bloqueios
    for (const b of blocos) put(b, { tipo: 'blk', nome: b.nome });
    // disciplinas
    for (const s of sel) {
        const tp = s.andamento ? 'andamento' : tipoDe(s.disciplina);
        for (const h of s.horarios) {
            const blk = blocos.some(b => b.diaSemana === h.diaSemana && b.periodo === h.periodo && b.slot === h.slot);
            const ev = {
                tipo: s.bloqueado || blk && !s.andamento ? 'rascunho' : tp, nome: s.disciplina.nome, code: s.disciplina.codigo,
                sala: h.sala, prof: s.turma ? s.turma.professor : '', ext: s.disciplina.chExt > 0, rascunho: s.bloqueado
            };
            if (!grid[h.diaSemana + '-' + h.periodo + '-' + h.slot] || grid[h.diaSemana + '-' + h.periodo + '-' + h.slot].tipo === 'blk')
                put(h, ev);
        }
    }
    // trabalho (precisão de minutos) — só em células livres de aula/bloqueio
    const ivAll = (sem.trab && sem.trab.intervalos) || {};
    for (const b of ((sem.trab && sem.trab.slots) || [])) {
        const key = b.diaSemana + '-' + b.periodo + '-' + b.slot;
        if (grid[key]) continue;
        grid[key] = { tipo: 'trab', iv: ivAll[b.diaSemana] };
    }
    const periods: [string, number][] = [['M', 6], ['T', 6], ['N', 5]];
    let rows = '';
    periods.forEach(([per, n], pi) => {
        for (let s = 1; s <= n; s++) {
            const hora = K.slotTexto(per, s);
            rows += `<tr><td class="tlbl" data-tip="${per}${s} · ${hora}">${per}${s}</td>`;
            for (let d = 2; d <= 7; d++) {
                const quando = `${K.DIAS[d]} ${per}${s} · ${hora}`;
                const e = grid[d + '-' + per + '-' + s];
                if (!e) { rows += `<td class="cell" data-tip="${quando}\\n(horário livre)"></td>`; continue; }
                if (e.tipo === 'blk') { rows += `<td class="cell"><div class="ev blk" data-tip="${quando}\\nBloqueio: ${esc(e.nome)}">${esc(e.nome.slice(0, 10))}</div></td>`; continue; }
                if (e.tipo === 'trab') { const faixa = e.iv ? `${K.fmtHHMM(e.iv.startMin)}–${K.fmtHHMM(e.iv.endMin)}` : ''; const dur = e.iv ? K.fmtDur(e.iv.horas) : ''; rows += `<td class="cell"><div class="ev trab" data-tip="${quando}\\nTrabalho ${faixa} · ${dur}">Trabalho<div class="c">${dur}</div></div></td>`; continue; }
                const cls = e.rascunho ? 'rascunho' : e.tipo;
                const tip = `${esc(e.nome)}\\n${esc(e.code)}${e.prof ? (' · ' + esc(e.prof)) : ''}\\n${quando}\\nSala ${esc(e.sala || '')}${e.rascunho ? '\\n⚠ Em conflito com bloqueio' : ''}`;
                rows += `<td class="cell"><div class="ev ${cls} ${e.ext ? 'ext' : ''}" data-tip="${esc(tip)}">${e.rascunho ? '<span class="warn">⚠</span>' : ''}<div>${esc(e.code)}</div><div class="c">${esc(e.sala || '')}</div></div></td>`;
            }
            rows += '</tr>';
        }
        if (pi < 2) rows += '<tr class="sep"><td colspan="7"></td></tr>';
    });
    return `<h3 style="margin:22px 0 0;font-size:15px">🗓️ Cronograma semanal ${editando ? '<span class="chip" style="color:var(--primary)">✏️ prévia da grade em edição</span>' : ''}</h3>
<div class="cal-wrap ${editando ? 'editando' : ''}"><table class="cal"><thead><tr><th></th>${[2, 3, 4, 5, 6, 7].map(d => `<th>${K.DIAS[d]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function legendaHTML() {
    const it = [['OBR', 'Obrigatória', 'var(--obr)'], ['HUM', 'Humanidades', 'var(--hum)'], ['OPT', 'Segundo Estrato', 'var(--estrato)'], ['TRI', 'Trilha', 'var(--trilha)'], ['ELE', 'Eletiva', 'var(--elet)'], ['andamento', 'Em andamento', '#39507a']];
    return `<div class="legend">${it.map(([c, t, col]) => `<span><i style="background:${col}"></i>${t}</span>`).join('')}
<span><i style="background:repeating-linear-gradient(45deg,#5a4a22,#5a4a22 4px,#46391a 4px,#46391a 8px)"></i>Rascunho (conflito)</span>
<span><i style="background:repeating-linear-gradient(45deg,#3a3550,#3a3550 4px,#2c2840 4px,#2c2840 8px)"></i>Bloqueio</span>
<span><i style="background:repeating-linear-gradient(45deg,#2b3a52,#2b3a52 4px,#22324a 4px,#22324a 8px)"></i>Trabalho</span>
<span><i style="box-shadow:inset 0 0 0 2px var(--ext);background:transparent"></i>Extensionista</span></div>`;
}

/* ---------- Editor de grade (Personalizar / Editar qualquer grade) ---------- */
function turmasDe(cod, sem) { const c = (sem.candidatas || []).find(x => x.disciplina.codigo === cod); return c ? c.turmas : []; }
// seleção atual do editor no formato do cronograma (para a prévia ao vivo)
function editorSel(sem) {
    const ed = S.editor; if (!ed) return [];
    return ed.codigos.map(cod => { const d = D.byCod.get(cod); const t = turmaDe(cod, ed.turmas[cod]); return { disciplina: d, turma: t, horarios: t ? t.horarios : [], bloqueado: t ? K.bloqueado(t.horarios, sem.bloqueios || []) : false }; }).filter(x => x.disciplina);
}
function editorOcup(sem, exclCod) {
    const ed = S.editor, ocup = [];
    for (const cod of ed.codigos) { if (cod === exclCod) continue; const t = turmaDe(cod, ed.turmas[cod]); if (t) ocup.push(...t.horarios); }
    return ocup;
}
// conflito "duro": com outra matéria da grade ou com bloqueio manual (sempre impede selecionar)
function conflitoHard(horarios, sem, ocup) {
    for (const h of horarios) if (ocup.some(o => o.diaSemana === h.diaSemana && o.periodo === h.periodo && o.slot === h.slot)) return 'Conflita com outra matéria da grade';
    const blocos = sem.bloqueios || [];
    for (const h of horarios) { const b = blocos.find(b => b.diaSemana === h.diaSemana && b.periodo === h.periodo && b.slot === h.slot); if (b) return 'Conflita com o bloqueio “' + b.nome + '”'; }
    return null;
}
function conflitoTrabalho(horarios, sem) {
    const ts = (sem.trab && sem.trab.slots) || [];
    for (const h of horarios) if (ts.some(b => b.diaSemana === h.diaSemana && b.periodo === h.periodo && b.slot === h.slot)) return 'Conflita com o horário de trabalho';
    return null;
}
// S4 — estado de uma turma na grade: conflito duro bloqueia; conflito com trabalho só bloqueia se NÃO flexível
function turmaEstado(horarios, sem, ocup) {
    const hard = conflitoHard(horarios || [], sem, ocup);
    if (hard) return { bloqueada: true, avisoTrab: false, motivo: hard };
    const tw = conflitoTrabalho(horarios || [], sem);
    if (tw) { const flex = trabFlex(sem.idx); return { bloqueada: !flex, avisoTrab: flex, motivo: tw + (flex ? ' (permitido — horário flexível)' : '') }; }
    return { bloqueada: false, avisoTrab: false, motivo: null };
}
// motivo de conflito que IMPEDE a seleção (usado p/ contagem)
function motivoConflito(horarios, sem, ocup) { const e = turmaEstado(horarios, sem, ocup); return e.bloqueada ? e.motivo : null; }
// primeira turma selecionável (sem conflito duro), preferindo as sem conflito de trabalho; respeita flexibilidade
function melhorTurmaSel(cod, sem, ocup) {
    const turmas = turmasDe(cod, sem); let fallback = null;
    for (const t of turmas) {
        const st = turmaEstado(t.horarios || [], sem, ocup);
        if (st.bloqueada) continue;
        if (!st.avisoTrab) return t;        // sem nenhum conflito
        if (!fallback) fallback = t;        // permitido (flexível) — usa se não houver melhor
    }
    return fallback;
}
// S6 — acréscimo de score ao adicionar `cod` (com `turma`) a uma seleção base
function scoreDeltaCod(sem, baseSel, cod, turma) {
    const w = trabDoSem(sem.idx), cur = sem.cursadasAntes || new Set(), fo = sem.faltObrig || new Set();
    const base = K.pontuarSel(D.ctx, baseSel, cur, fo, S.preferencias, sem.bloqueios || [], w);
    const d = D.byCod.get(cod); const t = turma || turmaDe(cod, null);
    const com = K.pontuarSel(D.ctx, baseSel.concat([{ disciplina: d, turma: t, horarios: t ? t.horarios : [] }]), cur, fo, S.preferencias, sem.bloqueios || [], w);
    return Math.round(com - base);
}
const fmtDelta = v => (v >= 0 ? '+' : '') + v;
function horResumo(t) { return t.horarios && t.horarios.length ? t.horarios.map(h => K.DIAS[h.diaSemana].slice(0, 3) + ' ' + h.periodo + h.slot).join(' ') : 'sem horário'; }
function turmaChip(cod, t, sem, sel, ocup) {
    const st = turmaEstado(t.horarios || [], sem, ocup);
    const prio = t.prioridadeSI != null ? ` · prioridade ${t.prioridadeSI}` : '';
    const tip = `Turma ${esc(t.turma)}${t.reserva ? (' · ' + esc(t.reserva)) : ''}${prio}\\n${esc(horResumo(t))}${t.professor ? ('\\nProf. ' + esc(t.professor)) : ''}${st.motivo ? ('\\n' + (st.bloqueada ? '⛔ ' : '⚠ ') + esc(st.motivo)) : ''}`;
    const cls = st.bloqueada ? 'conflito' : (st.avisoTrab ? 'conflito-trab' : '');
    const attrs = st.bloqueada ? `data-tip="${tip}"` : `data-ed-turma="${esc(cod)}" data-turma="${esc(t.turma)}" data-sem="${sem.idx}" data-tip="${tip}"`;
    return `<span class="ed-turma ${sel ? 'sel ' : ''}${cls}" ${attrs}>${esc(t.turma)} <span class="muted">${esc(horResumo(t))}</span>${st.avisoTrab ? ' <span style="color:var(--secondary)">⚠</span>' : ''}</span>`;
}
function editorHTML(sem) {
    const ed = S.editor; if (!ed || ed.idx !== sem.idx) return '';
    const proxIdx = (D.projecao.find(s => s.idx > 0) || {}).idx;
    const ehProximo = sem.idx === proxIdx;
    const selRaw = ed.codigos.map(cod => { const d = D.byCod.get(cod); const t = turmaDe(cod, ed.turmas[cod]); return { disciplina: d, turma: t, horarios: t ? t.horarios : [] }; }).filter(x => x.disciplina);
    const score = K.pontuarSel(D.ctx, selRaw, sem.cursadasAntes || new Set(), sem.faltObrig || new Set(), S.preferencias, sem.bloqueios || [], trabDoSem(sem.idx));
    const nConf = selRaw.filter(s => motivoConflito(s.horarios, sem, editorOcup(sem, s.disciplina.codigo))).length;
    const nTrabAviso = selRaw.filter(s => turmaEstado(s.horarios, sem, editorOcup(sem, s.disciplina.codigo)).avisoTrab).length;
    const rows = ed.codigos.map(cod => {
        const d = D.byCod.get(cod); if (!d) return '';
        const turmas = turmasDe(cod, sem); const ocup = editorOcup(sem, cod);
        const chips = turmas.map(t => turmaChip(cod, t, sem, ed.turmas[cod] === t.turma, ocup)).join('');
        let substBox = '';
        if (ed.subst === cod) {
            const ocupSem = editorOcup(sem, cod);                                  // ocupação da grade sem a matéria substituída
            const baseSemCod = selRaw.filter(s => s.disciplina.codigo !== cod);
            const mesmaArea = (sem.candidatas || []).filter(c => !ed.codigos.includes(c.disciplina.codigo) && tipoDe(c.disciplina) === tipoDe(d));
            let subs = mesmaArea.length ? mesmaArea : (sem.candidatas || []).filter(c => !ed.codigos.includes(c.disciplina.codigo));
            // S4.3 — só substitutas que PODEM ser selecionadas na grade atual (1ª turma sem conflito) e S6 — ordenadas por acréscimo de score
            subs = subs.map(c => ({ c, t: melhorTurmaSel(c.disciplina.codigo, sem, ocupSem) })).filter(x => x.t)
                .map(x => Object.assign(x, { delta: scoreDeltaCod(sem, baseSemCod, x.c.disciplina.codigo, x.t) }))
                .sort((a, b) => b.delta - a.delta);
            const lista = subs.map(({ c, t, delta }) => `<span class="ed-sub" data-ed-substituir="${esc(cod)}" data-novo="${esc(c.disciplina.codigo)}" data-sem="${sem.idx}" data-tip="Turma ${esc(t.turma)} · ${esc(horResumo(t))}">${esc(c.disciplina.codigo)} ${esc(c.disciplina.nome)} <span class="ed-delta ${delta >= 0 ? 'pos' : 'neg'}">${fmtDelta(delta)}</span></span>`).join('') || '<span class="muted">sem substitutas disponíveis sem conflito</span>';
            substBox = `<div class="ed-subbox"><div class="muted" style="margin-bottom:4px">Substituir “${esc(d.nome)}” por uma matéria disponível (sem conflito · ordenadas por +score):</div>${lista}</div>`;
        }
        return `<div class="ed-row">
    <div class="ed-rowh"><button class="ed-x" data-ed-rm="${esc(cod)}" data-sem="${sem.idx}" title="Remover da grade">✕</button>
    <span class="code">${esc(cod)}</span><span class="nm">${esc(d.nome)}</span><span class="tag ${tipoDe(d)}">${tipoDe(d)}</span>
    <button class="disc-grafo" data-ir-grafo="${esc(cod)}" data-tip="Ver “${esc(d.nome)}” no grafo de matérias">🗺️</button>
    ${ehProximo ? `<button class="btn btn-sm btn-ghost ed-subbtn ${ed.subst === cod ? 'on' : ''}" data-ed-subst="${esc(cod)}" data-sem="${sem.idx}">↔ Matéria indisponível</button>` : ''}</div>
    <div class="ed-turmas">${chips || '<span class="muted">sem turma ofertada</span>'}</div>${substBox}</div>`;
    }).join('');
    // S6 — lista de disponíveis ordenada pelo acréscimo de score (usando a 1ª turma selecionável)
    const ocupAll = editorOcup(sem, null);
    const dispCand = (sem.candidatas || []).filter(c => !ed.codigos.includes(c.disciplina.codigo))
        .map(c => { const t = melhorTurmaSel(c.disciplina.codigo, sem, ocupAll) || c.turmas[0] || null; return { c, t, delta: scoreDeltaCod(sem, selRaw, c.disciplina.codigo, t) }; })
        .sort((a, b) => b.delta - a.delta);
    const disp = dispCand.map(({ c, delta }) => {
        const d = c.disciplina;
        const chips = c.turmas.map(t => turmaChip(d.codigo, t, sem, false, ocupAll)).join('');
        return `<div class="ed-disc"><div class="ed-rowh"><span class="code">${esc(d.codigo)}</span><span class="nm">${esc(d.nome)}</span><span class="tag ${tipoDe(d)}">${tipoDe(d)}</span><span class="ed-delta ${delta >= 0 ? 'pos' : 'neg'}" data-tip="Acréscimo de score ao adicionar esta matéria">${fmtDelta(delta)}</span><button class="disc-grafo" data-ir-grafo="${esc(d.codigo)}" data-tip="Ver “${esc(d.nome)}” no grafo de matérias">🗺️</button></div><div class="ed-turmas">${chips || '<span class="muted">sem turma ofertada</span>'}</div></div>`;
    }).join('');
    return `<div class="editor" id="editor-${sem.idx}">
<div class="ed-head"><h3>✏️ ${ed.base ? 'Editando grade' : 'Montar grade'} — ${esc(sem.rotulo)}</h3>
    <div class="ed-actions"><span class="score" data-tip="${SCORE_TIP}"><span class="dot"></span> Score ${score}${nConf ? ` · <span style="color:var(--secondary)">${nConf} em conflito</span>` : ''}${nTrabAviso ? ` · <span style="color:var(--secondary)">${nTrabAviso} sobre trabalho (flexível)</span>` : ''}</span>
    <button class="btn btn-sm btn-primary" data-ed-salvar="${sem.idx}" ${ed.codigos.length ? '' : 'disabled'}>Salvar como nova grade personalizada</button>
    <button class="btn btn-sm btn-ghost" data-ed-limpar="${sem.idx}">Limpar</button>
    <button class="btn btn-sm btn-ghost" data-ed-fechar="1">Fechar</button></div></div>
<div class="ed-cols">
    <div class="ed-col"><div class="ed-coltitle">Na grade (${ed.codigos.length})</div>${rows || '<div class="muted" style="padding:10px">Nenhuma matéria ainda — clique numa turma da lista ao lado para adicionar.</div>'}</div>
    <div class="ed-col"><div class="ed-coltitle">Disponíveis <span class="muted" style="font-weight:400">— ordenadas por +score; clique numa turma p/ adicionar; turmas riscadas conflitam</span></div>${disp || '<div class="muted" style="padding:10px">Todas as matérias disponíveis já estão na grade.</div>'}</div>
</div></div>`;
}

/* ---------- Formatura / estados terminais ---------- */
// Checklist de integralização (mesma estrutura usada nos cartões de formatura, "quase lá" e "sem solução").
function reqsFormatura(sem) {
    const h = sem.horas; const m = S.manuais;
    return [
        ['Obrigatórias', h.obrigatorias.faltante === 0],
        ['Segundo Estrato [1159]', h.conj1159.faltante === 0],
        ['Humanidades [1161]', h.conj1161.faltante === 0],
        ['3 trilhas validadas + carga', h.trilhas.validadas >= 3 && h.trilhas.faltante === 0],
        ['Eletivas (105h)', h.eletivas.faltante === 0],
        ['Extensão (330h)', h.extensao.faltante === 0],
        ['ENADE Concluinte', m.enade.done],
        ['TCC 2 (ICSX41)', D.cursadasFinal && D.cursadasFinal.has('ICSX41')],
    ];
}
function reqListHTML(reqs) {
    return `<ul class="req-list">${reqs.map(([t, ok]) => `<li><span class="mk">${ok ? '✅' : '⬜'}</span>${esc(t)}</li>`).join('')}</ul>`;
}
function formaturaHTML(sem) {
    return `<div class="formatura-card">
<div class="badge-grad">🎓</div><h2>Formatura projetada em ${esc(sem.rotulo)}!</h2>
<p class="muted">Todos os critérios de integralização foram satisfeitos nesta projeção.</p>
${reqListHTML(reqsFormatura(sem))}</div>`;
}
// Estado intermediário (amarelo): só faltam itens não presenciais / manuais.
function quaseFormaturaHTML(sem) {
    const reqs = reqsFormatura(sem);
    const faltam = reqs.filter(([, ok]) => !ok).map(([t]) => t);
    return `<div class="quase-card">
<div class="badge-grad">🟠</div><h2>Quase lá — ${esc(sem.rotulo)}</h2>
<p class="muted">Você concluiu todas as <b>disciplinas presenciais</b> exigidas. Para se formar faltam apenas itens <b>não presenciais / manuais</b>, que você marca na barra lateral (“🧩 Itens não presenciais / manuais”) conforme realiza:</p>
<div class="quase-faltam">${faltam.length ? faltam.map(t => `<span class="chip" style="color:var(--secondary)">⬜ ${esc(t)}</span>`).join('') : '<span class="muted">—</span>'}</div>
<h4 style="margin:14px 0 6px">Checklist de integralização</h4>
${reqListHTML(reqs)}</div>`;
}
// Estado de inviabilidade (vermelho): não há grade que permita concluir o curso.
function impossivelHTML(sem) {
    const motivos = sem.motivosImpossivel || [];
    const lista = motivos.map(mo => mo.cod
        ? `<li><b class="mono">${esc(mo.cod)}</b> ${esc(mo.nome)} — ${esc(mo.motivo)}</li>`
        : `<li>${esc(mo.motivo)}</li>`).join('');
    return `<div class="impossivel-card">
<div class="badge-grad">⛔</div><h2>Sem solução automática — ${esc(sem.rotulo)}</h2>
<p class="muted">As disciplinas que ainda faltam <b>não cabem em nenhuma grade</b> com as suas restrições atuais (bloqueios e/ou horário de trabalho fixo), ou não têm turma ofertada. Ajuste os <b>horários travados</b> / o <b>trabalho</b> abaixo (ou em semestres anteriores), ou reveja a oferta de Turmas Abertas:</p>
<ul class="motivos-list">${lista}</ul>
<h4 style="margin:14px 0 6px">O que já está integralizado</h4>
${reqListHTML(reqsFormatura(sem))}</div>`;
}

/* ===================================================================
    EVENTOS (delegação)
    =================================================================== */
root.addEventListener('click', onClick);
root.addEventListener('input', onInput);
root.addEventListener('change', onChange);
document.addEventListener('mousemove', onTipMove);
root.addEventListener('mousedown', onDragStart);
root.addEventListener('mouseover', onDragOver);
document.addEventListener('mouseup', onDragEnd);

async function onClick(e) {
    const t = e.target;
    if (t.closest('#abrir-ajuda')) return abrirAjuda();
    const pick = t.closest('[data-pick]'); if (pick) { $(`[data-input="${pick.dataset.pick}"]`).click(); return; }
    if (t.closest('#processar')) return processar();
    if (t.closest('#restaurar')) { setEstado(carregar() || novoEstado()); hidratarPresets(); if (S.fase === 'upload') S.fase = 'upload'; render(); return; }

    // divergências
    const dv = t.closest('[data-div]');
    if (dv) { const d = S.divergPendentes.shift(); if (dv.dataset.div === 'yes') S.equivalencias[d.gnhCod] = d.matrizCod; salvar(); render(); return; }

    // preferências (mesmos controles na tela de onboarding e no slide-over dentro do app)
    const pr = t.closest('[data-pref]'); if (pr) { S.preferencias.campusUnico = !S.preferencias.campusUnico; refreshPrefs(); return; }
    const cs = t.closest('[data-campus]'); if (cs) { S.preferencias.campus = cs.dataset.campus; refreshPrefs(); return; }
    const tu = t.closest('[data-turno]'); if (tu) { const k = tu.dataset.turno; const a = S.preferencias.turnos; const i = a.indexOf(k); if (i >= 0) { if (a.length > 1) a.splice(i, 1); } else a.push(k); refreshPrefs(); return; }
    // Trabalho: Sim/Não e Flex escrevem no rascunho; só "Aplicar" dispara o recálculo
    const tsim = t.closest('[data-trab-sim]'); if (tsim) { const i = +tsim.dataset.trabSim; trabRascunhoSet(i, { trabalha: true }); salvar(); rerenderKeepOpen(); return; }
    const tnao = t.closest('[data-trab-nao]'); if (tnao) { const i = +tnao.dataset.trabNao; trabRascunhoSet(i, { trabalha: false }); salvar(); rerenderKeepOpen(); return; }
    const tmo = t.closest('[data-trab-modo]'); if (tmo) { const i = +tmo.dataset.sem; trabRascunhoSet(i, { modo: tmo.dataset.trabModo }); salvar(); rerenderKeepOpen(); return; }
    const tan = t.closest('[data-trab-ancora]'); if (tan) { const i = +tan.dataset.sem; trabRascunhoSet(i, { ancora: tan.dataset.trabAncora }); salvar(); rerenderKeepOpen(); return; }
    const taj = t.closest('[data-trab-ajustar]'); if (taj) { const i = +taj.dataset.trabAjustar; trabRascunhoSet(i, K.ajustarJanelaParaHoras(trabRascunhoOuSalvo(i))); salvar(); toast('Faixa-limite alargada p/ comportar o total semanal'); rerenderKeepOpen(); return; }
    // Aplicar rascunho -> copia trabalho E bloqueios manuais para o estado salvo e recalcula
    const tapl = t.closest('[data-trab-aplicar]'); if (tapl) { const i = +tapl.dataset.trabAplicar; const a = trabAplicarRascunho(i); const b = bloqAplicarRascunho(i); if (a || b) limparEscolhasDesde(i); toast('Horários travados aplicados · grades recalculadas'); rerenderKeepOpen(); return; }
    // Descartar rascunho -> restaura trabalho E bloqueios salvos
    const tdes = t.closest('[data-trab-descartar]'); if (tdes) { const i = +tdes.dataset.trabDescartar; trabDescartarRascunho(i); bloqDescartarRascunho(i); salvar(); rerenderKeepOpen(); return; }
    const pdel = t.closest('[data-trab-preset-del]'); if (pdel) { const p = (S.trabPresets || []).find(p => p.id === pdel.dataset.trabPresetDel); if (p && confirm(`Excluir a configuração de trabalho "${p.nome}"?`)) excluirPresetTrab(pdel.dataset.trabPresetDel); rerenderKeepOpen(); return; }
    const papp = t.closest('[data-trab-preset-apply]'); if (papp) { const i = +papp.dataset.sem; const p = (S.trabPresets || []).find(x => x.id === papp.dataset.trabPresetApply); if (p) { trabRascunhoSet(i, Object.assign({}, p.cfg, { trabalha: true })); toast('Configuração carregada no rascunho — clique em Aplicar'); } rerenderKeepOpen(); return; }
    const psav = t.closest('[data-trab-preset-save]'); if (psav) { const i = +psav.dataset.trabPresetSave; const nome = (prompt('Nome desta configuração de trabalho (ex.: "Meio período", "Integral"):', '') || '').trim(); if (nome) { salvarPresetTrab(i, nome); toast('Configuração salva'); } rerenderKeepOpen(); return; }
    // bloqueio por clique tratado no mousedown/mouseup (suporta arrastar)
    if (t.closest('#ir-app')) {
        if (!S.preferencias.turnos.length) { toast('Selecione ao menos um turno'); return; }
        if (!trabRespondido(1)) {   // preenchimento obrigatório dos horários travados
            toast('Responda sobre seu trabalho neste semestre (e clique em Aplicar) para continuar');
            const el = document.getElementById('blocos-1') as HTMLDetailsElement | null;
            if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            return;
        }
        S.fase = 'app'; S.abaAtiva = 1; salvar(); render(); return;
    }
    if (t.closest('#voltar-upload')) { S.fase = 'upload'; render(); return; }
    // Preferências no app = slide-over (sem sair do planejamento). Fora do app (onboarding),
    // cai na tela cheia de preferências.
    if (t.closest('[data-editar-pref]')) { if (S.fase === 'app') { S.prefsOpen = true; render(); } else { S.fase = 'preferencias'; render(); } return; }
    if (t.closest('[data-fechar-prefs]')) { S.prefsOpen = false; salvar(); render(); return; }

    // grafo de matérias
    if (t.closest('#ver-grafo')) { S.fase = 'grafo'; salvar(); render(); return; }
    if (t.closest('#voltar-plano')) { S.fase = 'app'; salvar(); render(); return; }
    // S10 — "ver no grafo" a partir de uma matéria da grade/editor
    const ig = t.closest('[data-ir-grafo]'); if (ig) { _grafoFocus = ig.dataset.irGrafo; S.fase = 'grafo'; salvar(); render(); return; }
    const gn = t.closest('[data-grafo-node]'); if (gn) { selecionarNoGrafo(gn.dataset.grafoNode); return; }
    if (t.closest('#grafo-limpar')) { selecionarNoGrafo(null); return; }
    if (t.closest('#grafo-ajustar')) { if (window.__grafoFit) window.__grafoFit(); return; }

    // app
    if (t.closest('#toggle-side')) { S.sidebarCollapsed = !S.sidebarCollapsed; $('#sidebar').classList.toggle('collapsed'); return; }
    if (t.closest('#reiniciar')) { if (confirm('Reiniciar tudo? Isso apaga o estado salvo e volta para a tela de upload.\n(Suas configurações de trabalho salvas são mantidas.)')) { localStorage.removeItem('compass_state'); setEstado(novoEstado()); hidratarPresets(); salvar(); render(); } return; }
    const tc = t.closest('[data-toggle-card]'); if (tc) { tc.closest('.gcard').classList.toggle('open'); return; }
    const ch = t.closest('[data-escolher]'); if (ch) return escolherGrade(ch.dataset.escolher);
    const cg = t.closest('[data-copiar-grade]'); if (cg) return copiarGrade(cg.dataset.copiarGrade, +cg.dataset.sem);
    const rr = t.closest('[data-rm-rasc]'); if (rr) return removerRascunho(rr.dataset.rmRasc);
    // editor de grade
    const emo = t.closest('[data-montar]'); if (emo) return abrirEditor(+emo.dataset.montar, null);
    const eed = t.closest('[data-editar]'); if (eed) return editarGrade(eed.dataset.editar, +eed.dataset.sem);
    const edt = t.closest('[data-ed-turma]'); if (edt) return editorPick(edt.dataset.edTurma, edt.dataset.turma);
    const erm = t.closest('[data-ed-rm]'); if (erm) return editorRm(erm.dataset.edRm);
    const esb = t.closest('[data-ed-subst]'); if (esb) return editorSubst(esb.dataset.edSubst);
    const esu = t.closest('[data-ed-substituir]'); if (esu) return editorSubstituir(esu.dataset.edSubstituir, esu.dataset.novo);
    const esv = t.closest('[data-ed-salvar]'); if (esv) return editorSalvar();
    const elm = t.closest('[data-ed-limpar]'); if (elm) return editorLimpar();
    const efc = t.closest('[data-ed-fechar]'); if (efc) return fecharEditor();
    const dcu = t.closest('[data-del-custom]'); if (dcu) return delCustom(+dcu.dataset.sem, +dcu.dataset.delCustom);
    const upd = t.closest('[data-upd-gnh]'); if (upd) return atualizarGNH(+upd.dataset.updGnh);
    const dc = t.closest('[data-desconfirmar]'); if (dc) { delete S.escolhas[+dc.dataset.desconfirmar]; salvar(); render(); return; }
    const ab = t.closest('[data-abrir-blocos]'); if (ab) { const el = document.getElementById('blocos-' + ab.dataset.abrirBlocos) as HTMLDetailsElement | null; if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }

    // manuais
    const mn = t.closest('[data-manual]'); if (mn) return manualAction(mn);
}

function onInput(e) {
    const r = e.target.closest('[data-range]');
    if (r) {
        const k = r.dataset.range; let v = +r.value; S.preferencias[k] = v;
        if (k === 'cargaMin' && v > S.preferencias.cargaMax) S.preferencias.cargaMax = v;
        if (k === 'cargaMax' && v < S.preferencias.cargaMin) S.preferencias.cargaMin = v;
        $('#lbl-min').textContent = S.preferencias.cargaMin; $('#lbl-max').textContent = S.preferencias.cargaMax; salvar();
    }
}
function onChange(e) {
    // S11 — horas realizadas de um item acumulativo naquele semestre
    const msn = e.target.closest('[data-manual-sem-num]');
    if (msn) {
        const chave = msn.dataset.manualSemNum, i = +msn.dataset.idx, v = +msn.value || 0;
        const item = S.manuais[chave] || (S.manuais[chave] = { porSem: {} });
        if (v > 0) item.porSem[i] = v; else delete item.porSem[i];
        salvar(); render(); return;
    }
    const tr = e.target.closest('[data-trab]');
    if (tr) {
        const i = +tr.dataset.sem, k = tr.dataset.trab;
        // Início e fim definem a janela [inicio, fim] (bloco exato no fixo; faixa-limite no flexível).
        // No fixo, a carga semanal é derivada da janela em normTrab — não há acoplamento manual aqui.
        const updates: any = {};
        if (k === 'comeco') updates.inicio = tr.value;
        else if (k === 'termino') updates.fim = tr.value;
        else if (k === 'horas' || k === 'folga') updates[k] = +tr.value || 0;
        else updates[k] = tr.value;
        trabRascunhoSet(i, updates);
        // Mão única: alterar as horas/semana adapta a faixa-limite (só a alarga se ficou estreita
        // demais p/ o total). Editar a faixa não mexe nas horas — aí o aviso de teto é que aparece.
        if (k === 'horas') trabRascunhoSet(i, K.ajustarJanelaParaHoras(trabRascunhoOuSalvo(i)));
        salvar(); rerenderKeepOpen(); return;
    }
}

/* ---------- Tooltip ---------- */
let tipEl = null;
function onTipMove(e) {
    const el = e.target.closest('[data-tip]');
    if (!el) { if (tipEl) { tipEl.remove(); tipEl = null; } return; }
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
    tipEl.innerHTML = el.dataset.tip.replace(/\\n/g, '<br>').replace(/✓/g, '<span class="ok">✓</span>').replace(/⛔|⚠/g, '<span class="no">$&</span>');
    let x = e.clientX + 14, y = e.clientY + 14;
    const r = tipEl.getBoundingClientRect();
    if (x + r.width > innerWidth) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight) y = e.clientY - r.height - 14;
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}

/* ---------- Ações ---------- */
function rerenderKeepOpen() {
    salvar();
    if (S.fase === 'app') { const open = new Set($$('details.personalize[open]').map(e => e.id)); render(); open.forEach(id => { const e = document.getElementById(id) as HTMLDetailsElement | null; if (e) e.open = true; }); }
    else render();
}
// re-render após mudar uma preferência: no app mantém o slide-over aberto (e o form de trabalho
// expandido, via rerenderKeepOpen); no onboarding, re-renderiza a tela cheia de preferências.
function refreshPrefs() { salvar(); if (S.fase === 'app') rerenderKeepOpen(); else renderPreferencias(); }

/* ---- arrastar p/ bloquear (vertical, mesmo dia) ---- */
let drag = null;
function onDragStart(e) {
    const slot = e.target.closest('.blockgrid .slot'); if (!slot) return;
    e.preventDefault();
    drag = { sem: +slot.dataset.sem, day: +slot.dataset.d, startOrd: +slot.dataset.ord, curOrd: +slot.dataset.ord };
    pintarSelecao();
}
function onDragOver(e) {
    if (!drag) return;
    const slot = e.target.closest('.blockgrid .slot'); if (!slot) return;
    if (+slot.dataset.d !== drag.day) return;          // só no mesmo dia (vertical)
    drag.curOrd = +slot.dataset.ord;
    pintarSelecao();
}
function pintarSelecao() {
    $$('.blockgrid .slot.selecting').forEach(el => el.classList.remove('selecting'));
    if (!drag) return;
    const lo = Math.min(drag.startOrd, drag.curOrd), hi = Math.max(drag.startOrd, drag.curOrd);
    $$(`.blockgrid .slot[data-d="${drag.day}"]`).forEach(el => { const o = +el.dataset.ord; if (o >= lo && o <= hi) el.classList.add('selecting'); });
}
function onDragEnd() {
    if (!drag) return;
    const dr = drag; drag = null;
    $$('.blockgrid .slot.selecting').forEach(el => el.classList.remove('selecting'));
    const lo = Math.min(dr.startOrd, dr.curOrd), hi = Math.max(dr.startOrd, dr.curOrd);
    // Edita o RASCUNHO de bloqueios — só afeta as grades quando o usuário clicar em "Aplicar".
    if (lo === hi) {                                        // clique simples = alternar
        const [p, s] = ORDER[lo];
        if (blocoExisteRasc(dr.sem, dr.day, p, s)) rmBlocoRasc(dr.sem, dr.day, p, s);
        else { const nome = prompt('Nome do bloqueio (ex.: Trabalho, Academia):', 'Bloqueio'); if (nome === null) return; addBlocoRasc(dr.sem, dr.day, p, s, nome || 'Bloqueio'); }
    } else {                                            // arrasto = bloqueia o intervalo
        const nome = prompt('Nome do bloqueio para os horários selecionados:', 'Bloqueio'); if (nome === null) return;
        for (let o = lo; o <= hi; o++) { const [p, s] = ORDER[o]; addBlocoRasc(dr.sem, dr.day, p, s, nome || 'Bloqueio'); }
    }
    rerenderKeepOpen();   // sem recálculo: as grades só mudam no "Aplicar"
}

// S2.1 — ao mudar algo num semestre, limpa as escolhas dos semestres POSTERIORES
// (a oferta/pré-req mudam) para que sejam recalculadas automaticamente, sem "Refazer" manual.
function escolherGrade(i) {
    const sem = D.projecao[S.abaAtiva];
    let g;
    if (String(i).startsWith('p')) g = sem.personalizadas[+i.slice(1)];
    else g = sem.grades[+i];
    if (!g) return;
    S.escolhas[sem.idx] = { codigos: g.sel.map(s => s.disciplina.codigo), turmas: Object.fromEntries(g.sel.map(s => [s.disciplina.codigo, s.turma ? s.turma.turma : null])), score: g.score, custom: g.custom };
    limparEscolhasApos(sem.idx);
    salvar(); toast('Grade confirmada para ' + sem.rotulo); render();
}
// copia texto p/ a área de transferência, com fallback p/ contextos sem a Clipboard API
async function copiarTexto(txt) {
    try { await navigator.clipboard.writeText(txt); return true; }
    catch (e) {
        try {
            const ta = document.createElement('textarea'); ta.value = txt;
            ta.style.position = 'fixed'; ta.style.top = '-1000px'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e2) { return false; }
    }
}
async function copiarGrade(i, semIdx) {
    const sem = D.projecao.find(s => s.idx === semIdx) || D.projecao[S.abaAtiva]; if (!sem) return;
    const g = String(i).startsWith('p') ? (sem.personalizadas || [])[+String(i).slice(1)] : sem.grades[+i];
    if (!g || !g.sel || !g.sel.length) { toast('Grade vazia — nada a copiar'); return; }
    const partes = [extratoGrade(g)];
    const trab = extratoTrabalho(sem, g);
    if (trab) partes.push('', trab);   // linha em branco separando a grade do horário de trabalho
    const ok = await copiarTexto(partes.join('\n'));
    toast(ok ? `Grade copiada${trab ? ' + trabalho' : ''} (${g.sel.length} disciplinas)` : 'Não foi possível copiar');
}
function removerRascunho(cod) {
    const sem = D.projecao[S.abaAtiva];
    const e = S.escolhas[sem.idx]; if (!e) return;
    e.codigos = e.codigos.filter(c => c !== cod); delete e.turmas[cod];
    salvar(); render();
}
// ---------- Ações do editor de grade ----------
function abrirEditor(semIdx, base) {
    S.editor = { idx: semIdx, codigos: base ? base.codigos.slice() : [], turmas: base ? { ...base.turmas } : {}, subst: null, base: !!base };
    salvar(); render();
    setTimeout(() => { const el = document.getElementById('editor-' + semIdx); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 30);
}
function editarGrade(i, semIdx) {
    const sem = D.projecao.find(s => s.idx === semIdx); if (!sem) return;
    const g = String(i).startsWith('p') ? (sem.personalizadas || [])[+String(i).slice(1)] : sem.grades[+i];
    if (!g) return;
    abrirEditor(semIdx, { codigos: g.sel.map(s => s.disciplina.codigo), turmas: Object.fromEntries(g.sel.map(s => [s.disciplina.codigo, s.turma ? s.turma.turma : null])) });
}
function editorPick(cod, turma) { const ed = S.editor; if (!ed) return; if (!ed.codigos.includes(cod)) ed.codigos.push(cod); ed.turmas[cod] = turma; salvar(); render(); }
function editorRm(cod) { const ed = S.editor; if (!ed) return; ed.codigos = ed.codigos.filter(c => c !== cod); delete ed.turmas[cod]; if (ed.subst === cod) ed.subst = null; salvar(); render(); }
function editorSubst(cod) { const ed = S.editor; if (!ed) return; ed.subst = ed.subst === cod ? null : cod; render(); }
function editorSubstituir(cod, novo) {
    const ed = S.editor; if (!ed) return; const i = ed.codigos.indexOf(cod); if (i < 0) return;
    const sem = D.projecao.find(s => s.idx === ed.idx);
    // S4.3 — escolhe a 1ª turma selecionável (sem conflito) na grade já montada
    const ocupSem = editorOcup(sem, cod); const t = melhorTurmaSel(novo, sem, ocupSem) || turmasDe(novo, sem)[0];
    ed.codigos[i] = novo; delete ed.turmas[cod]; ed.turmas[novo] = t ? t.turma : null; ed.subst = null; salvar(); render();
}
function editorSalvar() {
    const ed = S.editor; if (!ed || !ed.codigos.length) return;
    S.custom[ed.idx] = S.custom[ed.idx] || [];
    S.custom[ed.idx].push({ codigos: ed.codigos.slice(), turmas: { ...ed.turmas }, score: 0, custom: true });
    S.editor = null; salvar(); toast('Grade personalizada salva.'); render();
}
function editorLimpar() { const ed = S.editor; if (!ed) return; ed.codigos = []; ed.turmas = {}; ed.subst = null; salvar(); render(); }
function fecharEditor() { S.editor = null; salvar(); render(); }
function delCustom(semIdx, i) {
    const arr = S.custom[semIdx]; if (!arr) return;
    const removida = arr[i];
    arr.splice(i, 1);
    if (!arr.length) delete S.custom[semIdx];
    // Se a grade personalizada excluída estava selecionada, volta a selecionar a recomendada automaticamente.
    const esc = S.escolhas[semIdx];
    const eqCods = (a, b) => { a = (a || []).slice().sort(); b = (b || []).slice().sort(); return a.length === b.length && a.every((x, k) => x === b[k]); };
    if (esc && removida && eqCods(esc.codigos, removida.codigos)) { delete S.escolhas[semIdx]; limparEscolhasApos(semIdx); }
    salvar(); render();
}
function manualAction(btn) {
    const a = btn.dataset.manual, cod = btn.dataset.cod, m = S.manuais;
    const sem = btn.dataset.sem != null ? +btn.dataset.sem : (S.abaAtiva || 0);   // conclui no semestre em exibição
    if (a === 'estagio-do') { m.estagios[cod] = sem; }
    if (a === 'estagio-undo') { delete m.estagios[cod]; }
    if (a === 'enade-do') { m.enade = { done: true, sem }; }
    if (a === 'enade-undo') { m.enade = { done: false, sem: null }; }
    salvar(); render();
}
/* ---------- Turmas Abertas (Portal do Aluno) ---------- */
async function lerTurmas(file) {
    const pages = await extrairPaginas(file); return K.parseTurmasAbertas(pages);
}
function atualizarGNH(semIdx) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.onchange = async () => {
        if (!inp.files[0]) return; toast('Lendo Turmas Abertas…');
        try { const g = await lerTurmas(inp.files[0]); if (!g.length) throw new Error('vazio'); S.parsed.gnh = g; salvar(); toast('Turmas Abertas atualizada com ' + g.length + ' turmas.'); render(); }
        catch (err) { toast('Falha ao ler o PDF de Turmas Abertas.'); console.error(err); }
    };
    inp.click();
}

/* ---------- Processamento dos uploads ---------- */
async function processar() {
    const st = $('#proc-status'); const setp = (m) => { if (st) st.textContent = m; };
    try {
        setp('Lendo Matriz Curricular…');
        const mp = await extrairPaginas(S.files.matriz);
        const matriz = K.parseMatriz(mp);
        if (!matriz.disciplinas.length) throw new Error('matriz');
        setp('Lendo Histórico Escolar…');
        const hp = await extrairPaginas(S.files.historico);
        const historico = K.parseHistorico(hp);
        if (!historico.aluno.matricula) throw new Error('historico');
        setp('Lendo Turmas Abertas…');
        let gnh; try { gnh = await lerTurmas(S.files.gnh); } catch (e) { throw new Error('gnh'); }
        if (!gnh.length) throw new Error('gnh');

        S.parsed = { matriz, historico, gnh };
        const eqd = K.detectarEquivalencias(matriz, gnh);
        S.equivalencias = { ...eqd.auto };
        S.divergPendentes = eqd.divergencias;
        S.divergTotal = eqd.divergencias.length;
        if (!S.preferencias.preferenciaTrilhas.length) S.preferencias.preferenciaTrilhas = Object.keys(K.TRILHA_SUBAREAS);
        setp('Pronto!');
        S.fase = eqd.divergencias.length ? 'divergencias' : 'preferencias';
        salvar(); render();
    } catch (err) {
        const nome = err.message === 'matriz' ? 'Matriz Curricular' : err.message === 'historico' ? 'Histórico Escolar' : err.message === 'gnh' ? 'Turmas Abertas' : '';
        setp('');
        alert(nome ? `Não foi possível extrair dados de [${nome}]. Verifique se o PDF tem texto selecionável (não é imagem escaneada).` : 'Erro ao processar os arquivos: ' + err.message);
        console.error(err);
    }
}

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

/* ---------- Upload handlers (file inputs) ---------- */
document.addEventListener('change', e => {
    const inp = (e.target as HTMLElement).closest('[data-input]') as HTMLInputElement | null; if (!inp) return;
    const k = inp.dataset.input; const file = inp.files[0]; if (!file) return;
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { alert('Selecione um arquivo PDF.'); return; }
    S.files[k] = file; renderUpload();
});
document.addEventListener('dragover', e => { const dz = (e.target as HTMLElement).closest('.dz'); if (dz) { e.preventDefault(); dz.classList.add('drag'); } });
document.addEventListener('dragleave', e => { const dz = (e.target as HTMLElement).closest('.dz'); if (dz) dz.classList.remove('drag'); });
document.addEventListener('drop', e => {
    const dz = (e.target as HTMLElement).closest('.dz') as HTMLElement | null; if (!dz) return; e.preventDefault(); dz.classList.remove('drag');
    const k = dz.dataset.dz; const file = e.dataTransfer.files[0]; if (!file) return;
    if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) { alert('Solte um arquivo PDF.'); return; }
    S.files[k] = file; renderUpload();
});

/* ---------- Bootstrap ---------- */
(function init() {
    const saved = carregar();
    if (saved && saved.parsed && saved.parsed.matriz && saved.fase === 'app') { setEstado(saved); }
    else if (saved && saved.parsed && saved.parsed.matriz) { setEstado(saved); }
    else setEstado(novoEstado());
    hidratarPresets();                                   // configs de trabalho salvas (chave dedicada)
    S.prefsOpen = false;                                 // estado de UI transitório: nunca abre o menu ao restaurar
    // se restaurou em fase app, ok; senão começa upload
    if (!S.parsed || !S.parsed.matriz) S.fase = 'upload';
    render();
})();

/* test hook (sem efeito no browser) */
export { render, renderApp, semestreHTML, blocosSemestreHTML, editorHTML, manuaisHTML, renderGrafo, onClick, onChange };
