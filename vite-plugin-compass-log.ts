import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

/**
 * Plugin só de desenvolvimento (`npm run dev`): recebe do app os eventos de log e o estado atual
 * e grava em `logs/` — `eventos.jsonl` (uma linha JSON por evento, em append) e `estado.json`
 * (sobrescrito a cada atualização). Responde 204 em sucesso, 400 para JSON inválido e 500 se a
 * gravação falhar.
 */
export default function compassLog(): Plugin {
    return {
        name: 'compass-log',
        apply: 'serve',
        configureServer(server) {
            const dir = resolve(server.config.root, 'logs');
            const arqEventos = resolve(dir, 'eventos.jsonl');
            const arqEstado = resolve(dir, 'estado.json');
            const pronto = mkdir(dir, { recursive: true });
            pronto.catch(err => server.config.logger.error(`[compass-log] não foi possível criar ${dir}: ${err}`));
            let fila: Promise<unknown> = Promise.resolve();
            const enfileirar = (tarefa: () => Promise<unknown>) => {
                const p = fila.then(() => pronto).then(tarefa);
                fila = p.catch(() => undefined);
                return p;
            };

            server.middlewares.use('/__compass/log', (req, res, next) => {
                if (req.method !== 'POST') return next();
                lerJson(req)
                    .then(eventos => {
                        if (!Array.isArray(eventos)) return responder(res, 400, 'esperado um array de eventos');
                        const linhas = eventos.map(ev => JSON.stringify(ev) + '\n').join('');
                        return enfileirar(() => appendFile(arqEventos, linhas, 'utf8')).then(() => responder(res, 204));
                    })
                    .catch(err => responder(res, 500, String(err)));
            });

            server.middlewares.use('/__compass/estado', (req, res, next) => {
                if (req.method !== 'POST') return next();
                lerJson(req)
                    .then(estado => {
                        if (estado === undefined) return responder(res, 400, 'JSON inválido');
                        return enfileirar(() => writeFile(arqEstado, JSON.stringify(estado, null, 2), 'utf8')).then(() => responder(res, 204));
                    })
                    .catch(err => responder(res, 500, String(err)));
            });

            server.config.logger.info(`  ➜  Log do Compass+: ${dir}`);
        },
    };
}

/** Corpo da requisição como JSON; `undefined` se não for JSON válido. */
async function lerJson(req: IncomingMessage) {
    const partes: Buffer[] = [];
    for await (const parte of req) partes.push(parte as Buffer);
    try { return JSON.parse(Buffer.concat(partes).toString('utf8')); }
    catch { return undefined; }
}

function responder(res: ServerResponse, status: number, msg?: string) {
    res.statusCode = status;
    res.end(msg);
}
