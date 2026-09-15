// Utilidad compartida para renderizar un documento HTML autónomo (contrato,
// recibo, nómina, certificado, constancia, etc.) a un <canvas> vía
// html2canvas, antes de pasarlo a jsPDF.
//
// 2026-09-15: BUG real encontrado y corregido aquí mientras se diagnosticaba
// por qué el nuevo botón "Descargar borrador (PDF)" de contract-pdf.ts
// fallaba en producción con el error genérico "No se pudo generar el PDF".
//
// Root cause confirmado con un repro headless (Playwright + Chromium local +
// el CSS YA COMPILADO de un build de producción real, no una hipótesis):
// las 6 funciones de generación de PDF que había en la app — contrato (tanto
// el borrador como, más grave, `renderContractPdfBase64`, el PDF REAL que se
// sube a Storage cuando un alumno firma), recibos, nómina, certificados y
// las 4 constancias de simple-docs-pdf.ts — montaban su HTML en un <div>
// insertado directamente en `document.body` antes de llamar a html2canvas.
// html2canvas SIEMPRE clona el documento COMPLETO (no solo el elemento que
// se le pide) para calcular el contexto de stacking/layout correctamente, lo
// que significa que también recorre y parsea los estilos de TODA la app real
// que esté montada en ese momento (el modal abierto detrás, `body`, etc., no
// solo nuestro <div> aislado). Esa app real carga el CSS global de Tailwind
// v4 (`src/styles.css`), que define casi todos sus colores con
// `oklch()`/`lab()`/`color-mix()`. html2canvas 1.4.1 (lanzado antes de que
// Tailwind v4 existiera) no sabe parsear esas funciones de color y truena
// con "Attempting to parse an unsupported color function" en cuanto
// encuentra CUALQUIER elemento pintado así — sin que tenga nada que ver con
// el documento que en realidad se quería generar.
//
// Por qué nadie lo había visto antes: nunca se había generado un PDF real
// desde DENTRO de la app en producción — `student_contracts` sigue vacía
// (ningún alumno ha firmado un contrato todavía, confirmado 2026-09-15) — así
// que este bug habría tronado la firma real del PRIMER alumno que la
// intentara, además de cualquier descarga de recibo/nómina/certificado/
// constancia hecha desde que la app usa Tailwind v4.
//
// Fix: renderizar dentro de un <iframe> oculto con SU PROPIO documento
// (únicamente nuestro HTML/CSS vía `srcdoc`, sin Tailwind) — html2canvas
// entonces clona el documento del iframe, nunca el de la app, así que jamás
// ve esos colores. Mismo resultado visual, cero contaminación. Verificado
// con el mismo repro: el mismo HTML que antes tronaba ahora renderiza bien
// incluso con el CSS real de la app cargado en la página anfitriona.
//
// 2026-09-15 (mismo día, segunda corrección): al arreglar lo anterior, Jaret
// probó un contrato real (varias páginas de texto legal) y reportó texto
// "cortado, encimado y sin márgenes inferiores". Causa: la paginación vieja
// (duplicada en cada uno de los 6 archivos) cortaba el canvas renderizado en
// rebanadas de altura FIJA (exactamente `pdfHeight`), sin margen y sin saber
// dónde había un párrafo/fila de tabla — así que el corte caía literalmente
// a la mitad de una línea o de una fila el 99% de las veces. Nunca se notó
// antes porque el único caso "multi-página" real hasta ahora era el HTML de
// prueba de este mismo diagnóstico; los documentos cortos (recibos,
// constancias) casi siempre caben en una sola página, donde este bug es
// invisible. `renderHtmlToPdf()` (nueva, abajo) reemplaza esa paginación
// ingenua: mide en el propio DOM (antes de rasterizar) dónde empieza y
// termina cada párrafo/li/fila/tabla/etc., y solo corta de página en página
// en un hueco seguro entre dos de esos elementos — nunca a la mitad de uno
// — además de dejar un margen superior/inferior real en cada página.
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

interface LoadedFrame {
  pageEl: HTMLElement;
  cleanup: () => void;
}

async function loadHtmlIntoIframe(html: string, selector: string, width: number, height: number): Promise<LoadedFrame> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const cleanup = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    const idoc = iframe.contentDocument;
    const pageEl = (idoc?.querySelector(selector) ?? null) as HTMLElement | null;
    if (!pageEl) {
      cleanup();
      throw new Error(`renderHtmlToCanvas: no se encontró el selector "${selector}" en el HTML a renderizar.`);
    }
    return { pageEl, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

export async function renderHtmlToCanvas(
  html: string,
  opts: { selector?: string; backgroundColor?: string; width?: number; height?: number } = {},
): Promise<HTMLCanvasElement> {
  const { pageEl, cleanup } = await loadHtmlIntoIframe(html, opts.selector ?? ".page", opts.width ?? 816, opts.height ?? 1200);
  try {
    return await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: opts.backgroundColor ?? "#ffffff" });
  } finally {
    cleanup();
  }
}

/** Encuentra los puntos de corte (en px de CANVAS, eje Y) que dividen un
 *  documento largo en páginas de a lo más `maxSliceHeight` de alto, sin caer
 *  nunca a la mitad —ni demasiado cerca— de una de las `zones` (rectángulos
 *  [top,bottom) de los elementos que no deben partirse — párrafos, filas de
 *  tabla, etc.). `bufferPx` agranda cada zona por ambos lados antes de
 *  buscar un corte seguro: html2canvas NO es pixel-perfecto contra el DOM
 *  real (medido con getBoundingClientRect) — se confirmó en pruebas que
 *  puede pintar el texto de un `<li>` unos px más abajo de donde el DOM dice
 *  que termina su caja, así que cortar EXACTO en el borde medido a veces
 *  cortaba la cola de la última línea de una lista. El buffer da margen de
 *  sobra para ese tipo de imprecisión, sin importar el elemento. Si un solo
 *  elemento (más su buffer) es más alto que una página completa (caso raro,
 *  no esperado con el contenido actual), se corta a la fuerza en el límite
 *  como último recurso — mejor una tabla partida que una página en blanco
 *  infinita. */
function computePageBreaks(totalHeight: number, maxSliceHeight: number, zones: { top: number; bottom: number }[], bufferPx: number): number[] {
  const EPS = 0.5;
  const isUnsafe = (y: number) => zones.some((z) => y > z.top - bufferPx + EPS && y < z.bottom + bufferPx - EPS);
  const breaks = [0];
  let cursor = 0;
  while (cursor < totalHeight - EPS) {
    const limit = cursor + maxSliceHeight;
    if (limit >= totalHeight) {
      breaks.push(totalHeight);
      break;
    }
    let candidate: number | null = null;
    if (!isUnsafe(limit)) {
      candidate = limit;
    } else {
      const boundaries = zones
        .flatMap((z) => [z.top - bufferPx, z.bottom + bufferPx])
        .filter((y) => y > cursor + EPS && y <= limit)
        .sort((a, b) => b - a);
      for (const b of boundaries) {
        if (!isUnsafe(b)) {
          candidate = b;
          break;
        }
      }
    }
    if (candidate === null || candidate <= cursor + EPS) {
      // No safe break point in range — an atomic element spans past one
      // full page. Cut at the hard limit rather than looping forever.
      candidate = limit;
    }
    breaks.push(candidate);
    cursor = candidate;
  }
  return breaks;
}

/** Pipeline completo HTML -> jsPDF, con paginación "inteligente": nunca
 *  corta un párrafo, `<li>`, fila de tabla, etc. a la mitad, y deja un
 *  margen real arriba/abajo de cada página. Reemplaza el patrón viejo
 *  (duplicado en contract-pdf.ts/receipt-pdf.ts/payroll-pdf.ts/
 *  simple-docs-pdf.ts) de rebanar el canvas cada `pdfHeight` puntos exactos
 *  sin importar qué hubiera ahí. `certificate.ts` NO usa esto — su `.cert`
 *  es un layout fijo de una sola página con su propio tamaño de PDF, no
 *  aplica el concepto de "salto de página". */
export async function renderHtmlToPdf(
  html: string,
  opts: {
    selector?: string;
    backgroundColor?: string;
    width?: number;
    unit?: "pt" | "px" | "in" | "mm" | "cm";
    format?: string;
    marginPt?: number;
    atomicSelector?: string;
    breakBufferPx?: number;
  } = {},
): Promise<jsPDF> {
  const selector = opts.selector ?? ".page";
  const marginPt = opts.marginPt ?? 28;
  // Listas y tablas COMPLETAS como bloque atómico (no cada <li>/<tr> por
  // separado) — ver nota en computePageBreaks sobre la imprecisión de
  // html2canvas específicamente con listas; de paso, una tabla nunca queda
  // con el encabezado en una página y las filas en la siguiente.
  const atomicSelector = opts.atomicSelector ?? "p, ul, ol, table.concept, h1, h2, h3, .rule, .footer";
  const breakBufferCssPx = opts.breakBufferPx ?? 6;

  const { pageEl, cleanup } = await loadHtmlIntoIframe(html, selector, opts.width ?? 816, 1200);

  let canvas: HTMLCanvasElement;
  let zonesCss: { top: number; bottom: number }[];
  let pageWidthCss: number;
  try {
    const pageRect = pageEl.getBoundingClientRect();
    pageWidthCss = pageRect.width;
    const zoneEls = Array.from(pageEl.querySelectorAll(atomicSelector));
    zonesCss = zoneEls.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top - pageRect.top, bottom: r.bottom - pageRect.top };
    });
    canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: opts.backgroundColor ?? "#ffffff" });
  } finally {
    cleanup();
  }

  const doc = new jsPDF({ unit: opts.unit ?? "pt", format: opts.format ?? "letter" });
  const pdfWidth = doc.internal.pageSize.getWidth();
  const pdfHeight = doc.internal.pageSize.getHeight();

  const ptPerCanvasPx = pdfWidth / canvas.width;
  const canvasPxPerCssPx = canvas.width / pageWidthCss;
  const usableHeightPt = pdfHeight - marginPt * 2;
  const usableHeightCanvasPx = usableHeightPt / ptPerCanvasPx;
  const zonesCanvas = zonesCss.map((z) => ({ top: z.top * canvasPxPerCssPx, bottom: z.bottom * canvasPxPerCssPx }));
  const breakBufferPx = breakBufferCssPx * canvasPxPerCssPx;

  const breaks = computePageBreaks(canvas.height, usableHeightCanvasPx, zonesCanvas, breakBufferPx);

  for (let i = 0; i < breaks.length - 1; i++) {
    const sliceStartPx = breaks[i];
    const sliceHeightPx = breaks[i + 1] - sliceStartPx;
    if (sliceHeightPx <= 0) continue;

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeightPx;
    const ctx = sliceCanvas.getContext("2d");
    if (!ctx) throw new Error("renderHtmlToPdf: no se pudo obtener el contexto 2D del canvas.");
    ctx.drawImage(canvas, 0, sliceStartPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    if (i > 0) doc.addPage();
    const sliceHeightPt = sliceHeightPx * ptPerCanvasPx;
    doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", 0, marginPt, pdfWidth, sliceHeightPt);
  }

  return doc;
}
