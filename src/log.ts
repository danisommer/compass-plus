/* ===================================================================
    Compass+ — Log de investigação (só em `npm run dev`).
    Envia eventos e o estado ao plugin `vite-plugin-compass-log`, que grava em
    logs/eventos.jsonl (append, tempo real) e logs/estado.json (estado atual).
    Em produção (`import.meta.env.DEV` falso) todas as funções são no-op.
    =================================================================== */
type Nivel = 'info' | 'warn' | 'error';

const ATIVO = import.meta.env.DEV;
const SESSAO = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ESPERA_EVENTOS_MS = 300, ESPERA_ESTADO_MS = 400, LIMITE_VALOR = 500, PROFUNDIDADE_DIFF = 4;
let seq = 0, fila = [], timerEventos = null;
let estadoPendente = null, timerEstado = null, ultimoEstado = null;

/** Registra um evento (`dados` serializável em JSON); vai em lote para logs/eventos.jsonl. */
function log(evento: string, dados: object = {}, nivel: Nivel = 'info') {
    if (!ATIVO) return;
    fila.push({ t: new Date().toISOString(), seq: ++seq, sessao: SESSAO, nivel, evento, dados });
    if (!timerEventos) timerEventos = setTimeout(enviarEventos, ESPERA_EVENTOS_MS);
}

/** Agenda a gravação do estado em logs/estado.json e registra um evento `estado` com o que mudou. */
function registrarEstado(estado) {
    if (!ATIVO) return;
    estadoPendente = estado;
    clearTimeout(timerEstado);
    timerEstado = setTimeout(enviarEstado, ESPERA_ESTADO_MS);
}

/** Liga a captura de erros não tratados e o envio final ao fechar a aba; registra o início da sessão. */
function iniciarLog(contexto: object) {
    if (!ATIVO) return;
    window.addEventListener('error', e => log('erro.nao_tratado', { mensagem: e.message, origem: `${e.filename}:${e.lineno}:${e.colno}`, stack: e.error && e.error.stack }, 'error'));
    window.addEventListener('unhandledrejection', e => log('erro.promessa_rejeitada', descreverErro(e.reason), 'error'));
    window.addEventListener('pagehide', () => enviarEventos(true));
    log('app.inicio', { ...contexto, url: location.href, navegador: navigator.userAgent });
}

/** Mensagem + stack de um erro qualquer, para o campo `dados` de um evento. */
function descreverErro(err) {
    return { mensagem: String(err && err.message ? err.message : err), stack: err && err.stack };
}

function enviarEventos(aoSair = false) {
    clearTimeout(timerEventos); timerEventos = null;
    if (!fila.length) return;
    const lote = fila; fila = [];
    enviar('/__compass/log', lote, aoSair);
}

function enviarEstado() {
    timerEstado = null;
    const { files, ...persistido } = estadoPendente;
    const atual = JSON.parse(JSON.stringify(persistido));
    if (ultimoEstado === null) log('estado.inicial', { chaves: Object.keys(atual) });
    else {
        const mudancas = [];
        diferencas(ultimoEstado, atual, '', mudancas, 0);
        if (!mudancas.length) return;
        log('estado', { mudancas });
    }
    ultimoEstado = atual;
    enviar('/__compass/estado', { atualizadoEm: new Date().toISOString(), sessao: SESSAO, estado: atual });
}

function enviar(url: string, corpo, keepalive = false) {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), keepalive })
        .then(r => { if (!r.ok) console.warn(`[log] ${url} respondeu ${r.status}`); })
        .catch(err => console.warn(`[log] falha ao enviar para ${url}`, err));
}

// Mudanças entre dois valores JSON como caminhos ("escolhas.2.codigos"); valores grandes viram "‹N bytes›".
function diferencas(antes, depois, caminho: string, out: object[], prof: number) {
    if (JSON.stringify(antes) === JSON.stringify(depois)) return;
    if (ehObjeto(antes) && ehObjeto(depois) && prof < PROFUNDIDADE_DIFF) {
        for (const k of new Set([...Object.keys(antes), ...Object.keys(depois)])) diferencas(antes[k], depois[k], caminho ? `${caminho}.${k}` : k, out, prof + 1);
        return;
    }
    out.push({ caminho, antes: resumir(antes), depois: resumir(depois) });
}
const ehObjeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function resumir(v) {
    if (v === undefined) return '‹ausente›';
    const s = JSON.stringify(v);
    return s.length > LIMITE_VALOR ? `‹${s.length} bytes›` : v;
}

export { log, registrarEstado, iniciarLog, descreverErro };
