/* ===================================================================
    Compass+ — Gera as fixtures de teste a partir dos PDFs do Portal do Aluno.
    Extrai as páginas no mesmo formato do app (`src/pdf-extracao.ts`), troca os dados
    pessoais por valores falsos e grava só o JSON anonimizado em test/fixtures/.
    Uso: npm run fixture -- --matriz <pdf> --historico <pdf> --turmas <pdf>
    =================================================================== */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { extrairPaginasDoDocumento, type ItemPdf, type PaginaPdf } from '../src/pdf-extracao';
import { norm, parseHistorico } from '../src/parser';

const ARQUIVOS = ['matriz', 'historico', 'turmas'] as const;
type Arquivo = typeof ARQUIVOS[number];
const DESTINO = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const USO = 'Uso: npm run fixture -- --matriz <matriz.pdf> --historico <historico.pdf> --turmas <turmas_abertas.pdf>';

const MIN_DIGITOS_RA = 5;
const MIN_LETRAS_NOME_EMBUTIDO = 4;
const TOLERANCIA_LINHA = 3.2;
const CONECTIVOS_NOME = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const NOMES_FICTICIOS = ['FULANO', 'BELTRANO', 'SICRANO', 'TAL', 'SILVA', 'SOUZA', 'PEREIRA', 'OLIVEIRA', 'COSTA', 'LIMA'];
const PALAVRAS_DE_ROTULO_SENSIVEL = new Set([
    'IDENTIDADE', 'RG', 'CPF', 'NASCIMENTO', 'NASC', 'ENDERECO', 'LOGRADOURO', 'BAIRRO', 'CIDADE', 'MUNICIPIO', 'CEP',
    'TELEFONE', 'CELULAR', 'FONE', 'EMAIL', 'MAIL', 'MAE', 'PAI', 'FILIACAO', 'NATURALIDADE', 'NACIONALIDADE',
    'ELEITOR', 'TITULO', 'RACA', 'COR', 'SEXO', 'GENERO', 'CIVIL', 'SOCIAL',
    'AUTENTICACAO', 'VERIFICACAO', 'VALIDACAO', 'ABSOLUTO', 'NORMALIZADO',
]);
const PADROES: [string, RegExp, string][] = [
    ['e-mail', /[^\s@]+@[^\s@]+/g, 'aluno@example.com'],
    ['url', /https?:\/\/\S+/gi, 'https://example.invalid/'],
    ['cpf', /\d{3}\.\d{3}\.\d{3}-\d{2}/g, '000.000.000-00'],
    ['data', /\d{2}\/\d{2}\/\d{4}/g, '01/01/2000'],
    ['cep', /\d{5}-\d{3}/g, '00000-000'],
];
const MIN_CARACTERES_VALOR_RASTREADO = 4;
const BENIGNOS_NA_REVISAO = [/^\d[MTN]\d\(/, /^\*{0,2}[A-Z]{1,3}-[\dA-Z]{2,4}\)$/, /^Matriz:\d+$/, /^\(?\d+,\d+$/, /^,?\d+$/, /^\d{4}\/\d$/];

interface Identidade { ra: string; raFicticio: string; palavrasNome: string[]; substitutoNome: Map<string, string>; }
type Contagem = Record<string, number>;

function lerArgumentos(argv: string[]): Record<Arquivo, string> {
    const caminhos: Partial<Record<Arquivo, string>> = {};
    for (let i = 0; i < argv.length; i += 2) {
        const chave = argv[i].replace(/^--/, '') as Arquivo;
        if (!ARQUIVOS.includes(chave) || !argv[i + 1]) throw new Error(`Argumento inválido: ${argv[i]}\n${USO}`);
        caminhos[chave] = argv[i + 1];
    }
    const faltando = ARQUIVOS.filter(k => !caminhos[k]);
    if (faltando.length) throw new Error(`Faltou: ${faltando.join(', ')}\n${USO}`);
    return caminhos as Record<Arquivo, string>;
}

async function lerPdf(caminho: string): Promise<PaginaPdf[]> {
    const pdf = await getDocument({ data: new Uint8Array(await readFile(caminho)) }).promise;
    try { return await extrairPaginasDoDocumento(pdf as any); }
    finally { await pdf.destroy(); }
}

function identidadeDoAluno(historico: PaginaPdf[]): Identidade {
    const { aluno } = parseHistorico(historico);
    if (!aluno.matricula || aluno.matricula.length < MIN_DIGITOS_RA) throw new Error('Não encontrei o RA ("Aluno: <RA> - <nome>") no histórico; sem ele não dá para anonimizar com segurança.');
    const nome = (aluno.nome || '').split(/\s+\S+:/)[0];
    const palavrasNome = [...new Set(norm(nome).split(' ').filter(p => p.length >= 3 && !CONECTIVOS_NOME.has(p)))];
    if (!palavrasNome.length) throw new Error('Não encontrei o nome do aluno no histórico; sem ele não dá para anonimizar com segurança.');
    const ficticios = NOMES_FICTICIOS.filter(n => !palavrasNome.includes(n));
    const substitutoNome = new Map(palavrasNome.map((p, i) => [p, ficticios[i % ficticios.length]]));
    const raFicticio = '1234567890'.repeat(Math.ceil(aluno.matricula.length / 10)).slice(0, aluno.matricula.length);
    return { ra: aluno.matricula, raFicticio, palavrasNome, substitutoNome };
}

function comCaixaDe(modelo: string, palavra: string): string {
    if (modelo === modelo.toUpperCase()) return palavra;
    if (modelo === modelo.toLowerCase()) return palavra.toLowerCase();
    return palavra[0] + palavra.slice(1).toLowerCase();
}
function mascarar(s: string): string { return s.replace(/\d/g, '0').replace(/\p{L}/gu, 'X'); }
const contar = (c: Contagem, k: string) => { c[k] = (c[k] || 0) + 1; };

const ehRotuloSensivel = (s: string) => /:$/.test(s) && norm(s).split(' ').some(p => PALAVRAS_DE_ROTULO_SENSIVEL.has(p));
function valoresDeRotulosSensiveis(items: ItemPdf[]): Set<ItemPdf> {
    const valores = new Set<ItemPdf>();
    for (const rotulo of items) {
        if (!ehRotuloSensivel(rotulo.str)) continue;
        const aDireita = items.filter(i => i !== rotulo && Math.abs(i.yTop - rotulo.yTop) <= TOLERANCIA_LINHA && i.x > rotulo.x).sort((a, b) => a.x - b.x);
        for (const it of aDireita) { if (/:$/.test(it.str)) break; valores.add(it); }
    }
    return valores;
}

function anonimizarItem(it: ItemPdf, id: Identidade, sensivel: boolean, contagem: Contagem): string {
    if (sensivel) { contar(contagem, 'valor de rótulo sensível'); return mascarar(it.str); }
    const substituto = id.substitutoNome.get(norm(it.str));
    if (substituto) { contar(contagem, 'nome'); return comCaixaDe(it.str, substituto); }
    let s = it.str;
    if (s.includes(id.ra)) { contar(contagem, 'RA'); s = s.split(id.ra).join(id.raFicticio); }
    for (const [categoria, re, falso] of PADROES) {
        s = s.replace(re, () => { contar(contagem, categoria); return falso; });
    }
    return s;
}

const arred = (v: number) => Math.round(v * 100) / 100;
/** Anonimiza as páginas; `rastreados` são os trechos numéricos dos valores mascarados, procurados depois em todas as saídas. */
function anonimizar(paginas: PaginaPdf[], id: Identidade): { paginas: PaginaPdf[]; contagem: Contagem; rastreados: string[] } {
    const contagem: Contagem = {};
    const rastreados = new Set<string>();
    const saida = paginas.map(pg => {
        const sensiveis = valoresDeRotulosSensiveis(pg.items);
        sensiveis.forEach(it => (it.str.match(/\d{5,}/g) || []).forEach(d => rastreados.add(d)));
        return {
            h: arred(pg.h),
            items: pg.items.map(it => ({ str: anonimizarItem(it, id, sensiveis.has(it), contagem), x: arred(it.x), yTop: arred(it.yTop), w: arred(it.w), h: arred(it.h) })),
        };
    });
    return { paginas: saida, contagem, rastreados: [...rastreados] };
}

function residuosPessoais(paginas: PaginaPdf[], id: Identidade, rastreados: string[]): string[] {
    const achados = new Set<string>();
    for (const pg of paginas) for (const it of pg.items) {
        if (it.str.includes(id.ra)) achados.add('RA');
        if (id.palavrasNome.includes(norm(it.str))) achados.add('nome');
        if (it.str.includes('@') && it.str !== 'aluno@example.com') achados.add('e-mail');
        if (rastreados.some(r => r.length >= MIN_CARACTERES_VALOR_RASTREADO && it.str.includes(r))) achados.add('valor de rótulo sensível repetido');
    }
    return [...achados];
}

function paraRevisar(paginas: PaginaPdf[], id: Identidade): string[] {
    const suspeitos = new Set<string>();
    const nomesLongos = id.palavrasNome.filter(p => p.length >= MIN_LETRAS_NOME_EMBUTIDO);
    paginas.forEach((pg, p) => pg.items.forEach(it => {
        if (BENIGNOS_NA_REVISAO.some(re => re.test(it.str))) return;
        const digitosLongos = /\d{6,}/.test(it.str);
        const codigoAlfanumerico = it.str.length >= 8 && /\d/.test(it.str) && /[A-Za-z]/.test(it.str) && !/^[A-Z]{2,5}\d/.test(it.str);
        const nomeEmbutido = nomesLongos.some(n => norm(it.str).replace(/ /g, '').includes(n));
        if (digitosLongos || codigoAlfanumerico || nomeEmbutido) suspeitos.add(`pág. ${p + 1}: "${it.str}"`);
    }));
    return [...suspeitos];
}

function serializar(paginas: PaginaPdf[]): string {
    return '[\n' + paginas.map(pg => `{"h":${pg.h},"items":[\n${pg.items.map(i => JSON.stringify(i)).join(',\n')}\n]}`).join(',\n') + '\n]\n';
}

async function main() {
    const caminhos = lerArgumentos(process.argv.slice(2));
    const brutos = {} as Record<Arquivo, PaginaPdf[]>;
    for (const k of ARQUIVOS) brutos[k] = await lerPdf(caminhos[k]);
    const id = identidadeDoAluno(brutos.historico);
    console.log(`Identificados: RA com ${id.ra.length} dígitos e ${id.palavrasNome.length} palavra(s) de nome.`);

    const anonimos = ARQUIVOS.map(k => ({ k, ...anonimizar(brutos[k], id) }));
    const rastreados = [...new Set(anonimos.flatMap(a => a.rastreados))];
    const prontos = anonimos.map(({ k, paginas, contagem }) => {
        const residuos = residuosPessoais(paginas, id, rastreados);
        if (residuos.length) throw new Error(`[${k}] ainda contém dados pessoais (${residuos.join(', ')}). Nada foi gravado.`);
        return { k, paginas, contagem };
    });

    await mkdir(DESTINO, { recursive: true });
    for (const { k, paginas, contagem } of prontos) {
        await writeFile(`${DESTINO}${k}.json`, serializar(paginas), 'utf8');
        const itens = paginas.reduce((a, pg) => a + pg.items.length, 0);
        console.log(`\n${k}.json — ${paginas.length} página(s), ${itens} itens. Substituições: ${JSON.stringify(contagem)}`);
        const revisar = paraRevisar(paginas, id);
        if (revisar.length) console.log(`  Revise antes do commit (números longos / códigos):\n  ${revisar.join('\n  ')}`);
    }
    console.log(`\nGravado em ${DESTINO}. Confira o conteúdo antes de commitar.`);
}

main().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
