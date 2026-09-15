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
import html2canvas from "html2canvas";

export async function renderHtmlToCanvas(
  html: string,
  opts: { selector?: string; backgroundColor?: string; width?: number; height?: number } = {},
): Promise<HTMLCanvasElement> {
  const selector = opts.selector ?? ".page";
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = `${opts.width ?? 816}px`;
  iframe.style.height = `${opts.height ?? 1200}px`;
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.onload = () => resolve();
      iframe.srcdoc = html;
    });
    const idoc = iframe.contentDocument;
    const pageEl = (idoc?.querySelector(selector) ?? null) as HTMLElement | null;
    if (!pageEl) {
      throw new Error(`renderHtmlToCanvas: no se encontró el selector "${selector}" en el HTML a renderizar.`);
    }
    return await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: opts.backgroundColor ?? "#ffffff" });
  } finally {
    document.body.removeChild(iframe);
  }
}
