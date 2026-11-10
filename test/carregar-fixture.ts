import { readFileSync } from 'node:fs';
import type { PaginaPdf } from '../src/pdf-extracao';

/** Páginas anonimizadas de test/fixtures/<nome>.json; falha com instrução de como gerar se o arquivo não existir. */
export function carregarFixture(nome: 'matriz' | 'historico' | 'turmas'): PaginaPdf[] {
    const url = new URL(`./fixtures/${nome}.json`, import.meta.url);
    try {
        return JSON.parse(readFileSync(url, 'utf8'));
    } catch (err) {
        if (err && err.code === 'ENOENT') throw new Error(`Fixture test/fixtures/${nome}.json ausente. Gere com: npm run fixture -- --matriz <pdf> --historico <pdf> --turmas <pdf>`);
        throw err;
    }
}
