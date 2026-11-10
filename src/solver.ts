/* ===================================================================
    Compass+ — Carregamento do HiGHS (WebAssembly) no navegador.
    O `.wasm` é servido pelo próprio app (import `?url`), então nada sai da máquina.
    =================================================================== */
import highsLoader from 'highs';
import highsWasm from 'highs/runtime?url';
import type { Solver } from './planejador';

let instancia: Solver | null = null;
let carregando: Promise<Solver> | null = null;

/** Carrega o solver uma única vez; chamadas seguintes reaproveitam a mesma promessa. */
export function carregarSolver(): Promise<Solver> {
    if (!carregando) carregando = highsLoader({ locateFile: () => highsWasm }).then(h => (instancia = h as unknown as Solver));
    return carregando;
}

/** Solver já carregado; lança se `carregarSolver` ainda não terminou (erro de programação: projetar antes de carregar). */
export function obterSolver(): Solver {
    if (!instancia) throw new Error('Solver ainda não carregado: aguarde carregarSolver() antes de projetar.');
    return instancia;
}
