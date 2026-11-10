/* ===================================================================
    Compass+ — Tema claro/escuro.
    O tema inicial é aplicado pelo script do <head> (index.html) antes da primeira
    pintura: a escolha salva ou, sem ela, o `prefers-color-scheme` do sistema.
    =================================================================== */
const CHAVE_TEMA = 'compass_tema';
type Tema = 'light' | 'dark';

function lerTemaSalvo(): Tema | null {
    try {
        const v = window.localStorage.getItem(CHAVE_TEMA);
        return v === 'light' || v === 'dark' ? v : null;
    } catch {
        return null;
    }
}

function salvarTema(tema: Tema) {
    try {
        window.localStorage.setItem(CHAVE_TEMA, tema);
    } catch (erro) {
        console.warn('Tema não foi salvo; vale só nesta visita:', erro);
    }
}

export function temaAtual(): Tema {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function sincronizarBotoes() {
    for (const botao of document.querySelectorAll('[data-theme-toggle]')) botao.setAttribute('aria-pressed', String(temaAtual() === 'dark'));
}

/** Alterna entre claro e escuro e guarda a escolha (a partir daí o sistema não manda mais). */
export function alternarTema() {
    const proximo: Tema = temaAtual() === 'dark' ? 'light' : 'dark';
    salvarTema(proximo);
    document.documentElement.dataset.theme = proximo;
    sincronizarBotoes();
}

/** Acompanha a troca de tema do sistema enquanto o usuário não escolheu um tema no app. */
export function iniciarTema() {
    const consulta = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
    if (consulta) consulta.addEventListener('change', e => {
        if (lerTemaSalvo()) return;
        document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
        sincronizarBotoes();
    });
}
