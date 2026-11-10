/* ===================================================================
    Compass+ — Extração do texto posicionado dos PDFs (pura; roda no navegador e no Node).
    Recebe um documento já aberto pelo PDF.js — o app usa o build padrão e o script de
    fixtures usa o build legado — e devolve as páginas no formato lido pelo `parser.ts`.
    =================================================================== */
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Trecho de texto (uma palavra) com a posição na página, em pt: `x` da esquerda e `yTop` a partir do topo. */
export interface ItemPdf { str: string; x: number; yTop: number; w: number; h: number; }
/** Página como lista de palavras posicionadas; `h` é a altura da página em pt. */
export interface PaginaPdf { h: number; items: ItemPdf[]; }

/** Quebra um trecho do PDF.js em palavras, repartindo a largura proporcionalmente ao nº de caracteres. */
function palavrasDoTrecho(str: string, x: number, yTop: number, w: number, h: number): ItemPdf[] {
    const words = str.trim().split(/\s+/);
    if (words.length <= 1) return [{ str: str.trim(), x, yTop, w, h }];
    const total = str.length; let ci = 0;
    return words.map(wd => {
        const idx = str.indexOf(wd, ci); const off = idx < 0 ? ci : idx;
        ci = off + wd.length;
        return { str: wd, x: x + (off / total) * w, yTop, w: (wd.length / total) * w, h };
    });
}

/** Lê todas as páginas do documento; `onProg` recebe a fração já lida (0..1). */
export async function extrairPaginasDoDocumento(pdf: PDFDocumentProxy, onProg?: (fracao: number) => void): Promise<PaginaPdf[]> {
    const pages: PaginaPdf[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items: ItemPdf[] = [];
        for (const it of tc.items as any[]) {
            const str = it.str; if (!str || !str.trim()) continue;
            items.push(...palavrasDoTrecho(str, it.transform[4], vp.height - it.transform[5], it.width || str.length * 5, it.height || 9));
        }
        pages.push({ h: vp.height, items });
        if (onProg) onProg(p / pdf.numPages);
    }
    return pages;
}
