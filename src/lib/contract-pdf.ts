// Contrato con firma electrónica in-house — 2026-08-26/27.
//
// Reemplaza DocuSign/OpenSign (decisión de Jaret: apostar por una experiencia
// premium, mantener al alumno dentro de la plataforma, y no depender de una
// herramienta externa que "muchos pueden ver sketchy"). Mismo pipeline de
// render que receipt-pdf.ts / simple-docs-pdf.ts (html2canvas -> jsPDF), pero
// esta variante NO descarga el archivo (doc.save) — regresa el PDF como
// data URI base64, porque el resultado tiene que subirse a Supabase Storage
// (vía la Edge Function sign-contract) en vez de solo descargarse en el
// navegador de quien lo genera.
//
// ---------------------------------------------------------------------------
// El texto de contractBodyHtml() de abajo viene del contrato real que Jaret
// mandó firmado (2026-08-27): "Contrato de Prestación de Servicios
// Educativos" de Ericka Escamilla Ávila (folio VFP-33-26, producto VIP /
// programa "Trayecto Total", plan Elite, pago único). Se transcribió
// cláusula por cláusula tal cual, cambiando SOLO lo que varía por alumno
// (nombre, contacto, producto, plan, sesiones, duración, precio, fechas) por
// los campos de ContractFields — el resto (mora, cancelaciones, conducta,
// no-contratación, jurisdicción, etc.) es el texto legal real de Jaret,
// sin reescribir ni una palabra.
//
// Dos cosas que se generalizaron a propósito, marcadas abajo con
// "NOTA A JARET" — decisiones tomadas para que la plantilla sirva para
// cualquier alumno, no solo para copiar el caso de Ericka:
//   1. El contrato de Ericka es de PAGO ÚNICO (un total fijo por el paquete
//      completo). Así quedó modelado aquí. Si otros productos (Enterprise/
//      GO/International, que en la app ya manejan precio MENSUAL recurrente
//      vía payment_day/cycle_start) necesitan una cláusula de pago distinta
//      (mensualidades en vez de pago único), avísame y agrego esa variante
//      — no la inventé por mi cuenta para no comprometerte a redactar algo
//      que no revisaste.
//   2. La frase "4 accesos mensuales acumulables" del original es específica
//      del plan Elite (según la tabla de verbo-legal). Como este documento
//      se reutiliza para CUALQUIER plan, esa cifra se dejó genérica
//      ("conforme a la política vigente del plan contratado") en vez de
//      hardcodear "4" para alumnos que no sean Elite.
//   3. El nombre del representante legal venía sin llenar en una de las dos
//      menciones del documento original ("[NOMBRE DEL REPRESENTANTE LEGAL]"
//      en las Declaraciones, mientras que sí aparecía completo más abajo) —
//      se completó con "Jaret Abner Ramírez Jiménez" para que coincida con
//      el resto del documento. Avísame si en realidad debía ser alguien más.
// ---------------------------------------------------------------------------
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import logoUrl from "@/assets/verbo-logo.png";
// Reuses the SAME asset certificate.ts already uses for student
// certificates — found while building this feature: the file exists in the
// repo but is currently a blank 500x695 canvas (no signature actually drawn
// on it yet), so certificates today already render with an empty signature
// slot. Jaret uploading his real signature to this one path fixes BOTH
// certificates and contracts at once — no second upload needed.
import jaretSignatureUrl from "@/assets/jaret-signature.png";

export interface ContractFields {
  studentName: string;
  studentEmail: string;
  studentPhone?: string;
  company?: string;
  product?: string; // display name, e.g. "VIP"
  productProgram?: string; // e.g. "Trayecto Total" — subtítulo comercial del producto, opcional
  accessPlan?: string; // e.g. "Elite"
  contractedLevels?: string[];
  totalSessions?: number; // número total de sesiones del paquete
  sessionsPerWeek?: number;
  sessionDuration?: number; // minutos
  modality?: string; // "Virtual" | "Presencial" | etc.
  reschedulePolicy?: string; // texto libre opcional, además de la tabla oficial de abajo
  totalPrice?: number; // MXN, precio total del paquete (modelo de pago único — ver NOTA A JARET #1)
  paymentDueDate?: string; // ISO date — fecha límite del pago único
  startDate?: string; // ISO date — fecha de inicio de sesiones
  estimatedEndDate?: string; // ISO date — fecha de término estimada (tentativa)
  folio?: string; // p.ej. "VFP-34-26" — se arma en contracts.ts a partir del id del contrato
  // Campos heredados del modelo de cobro mensual recurrente (Enterprise/GO/
  // International) — no usados por la cláusula de pago único de abajo, pero
  // se conservan por si se agrega esa variante más adelante (ver NOTA A
  // JARET #1).
  monthlyPrice?: number;
  paymentDay?: number;
  cycleStart?: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
}

function fmtMoney(n?: number): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
}

/** Convierte un monto a su forma "(tantos pesos 00/100 moneda nacional)",
 *  como en el contrato original ("$12,960.00 M.N. (doce mil novecientos
 *  sesenta pesos 00/100 moneda nacional)"). Cubre de 0 a 999,999,999 pesos
 *  con centavos — suficiente para cualquier paquete real de Verbo. Simplificación
 *  consciente: no aplica el apócope formal "veintiún" antes de "pesos"
 *  (usa "veintiuno pesos"), aceptable para este uso pero no 100% purista. */
function numberToWordsEsMXN(amount?: number): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return "—";
  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);
  const UNITS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const TENS = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const HUNDREDS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

  function under100(n: number): string {
    if (n < 20) return UNITS[n];
    const t = Math.floor(n / 10);
    const u = n % 10;
    if (n < 30) return u === 0 ? "veinte" : `veinti${UNITS[u]}`;
    return u === 0 ? TENS[t] : `${TENS[t]} y ${UNITS[u]}`;
  }
  function under1000(n: number): string {
    if (n === 100) return "cien";
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const restStr = rest > 0 ? ` ${under100(rest)}` : "";
    return h > 0 ? `${HUNDREDS[h]}${restStr}` : under100(rest);
  }
  function under1e6(n: number): string {
    if (n < 1000) return under1000(n);
    const th = Math.floor(n / 1000);
    const rest = n % 1000;
    const thStr = th === 1 ? "mil" : `${under1000(th)} mil`;
    return rest > 0 ? `${thStr} ${under1000(rest)}` : thStr;
  }
  function words(n: number): string {
    if (n === 0) return "cero";
    if (n < 1e6) return under1e6(n);
    const m = Math.floor(n / 1e6);
    const rest = n % 1e6;
    const mStr = m === 1 ? "un millón" : `${under1e6(m)} millones`;
    return rest > 0 ? `${mStr} ${under1e6(rest)}` : mStr;
  }

  const centsStr = String(cents).padStart(2, "0");
  return `${words(whole)} pesos ${centsStr}/100 moneda nacional`;
}

/** Tabla oficial de política de reagendamiento por plan de acceso (idéntica
 *  a la incluida en el contrato real de Jaret) — resalta la fila del plan
 *  que efectivamente contrató este alumno. */
const RESCHEDULE_TABLE: { plan: string; aviso: string; max: string }[] = [
  { plan: "Core", aviso: "24 horas", max: "25%" },
  { plan: "Advance", aviso: "12 horas", max: "40%" },
  { plan: "Elite", aviso: "6 horas", max: "70%" },
  { plan: "Signature", aviso: "Sin restricción", max: "Sin restricción" },
];

function rescheduleTableHtml(accessPlan?: string): string {
  const rows = RESCHEDULE_TABLE.map((r) => {
    const isContracted = accessPlan && r.plan.toLowerCase() === accessPlan.toLowerCase();
    const label = isContracted ? `${r.plan} (contratado)` : r.plan;
    return `<tr${isContracted ? ' style="background:#fff6ec;font-weight:700;"' : ""}><td>${label}</td><td>${r.aviso}</td><td>${r.max}</td></tr>`;
  }).join("");
  return `<table class="concept"><thead><tr><th>Plan</th><th>Aviso mínimo</th><th>Máx. reagendable/mes</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Leyenda de consentimiento — redactada por la skill verbo-legal (2026-08-26),
 *  conforme al Código de Comercio (arts. 89-90, firma electrónica simple).
 *  Este texto SÍ es real y va a producción tal cual. Recomendación del
 *  skill, pasada a Jaret: esto es apoyo de IA para uso interno — vale la
 *  pena una revisión rápida de un abogado mercantil antes de que reciba
 *  tráfico real, igual que el resto de las plantillas legales de Verbo. */
export const CONSENT_LEGEND =
  "He leído el contrato mostrado arriba y estoy de acuerdo con sus términos. " +
  "Entiendo que, al firmar electrónicamente a continuación (dibujando o subiendo mi firma), " +
  "esta firma tiene la misma validez legal que una firma autógrafa, de acuerdo con el Código " +
  "de Comercio mexicano (arts. 89 y 90), y que refleja mi consentimiento libre e informado con " +
  "este documento. Acepto que Verbo Language Solutions registre, como evidencia de esta firma, " +
  "la dirección IP, fecha y hora exactas desde las que firmo, así como una huella digital (hash) " +
  "del documento exacto que estoy firmando.";

export const CONSENT_REMINDER =
  "Una vez que firmes, este documento queda bloqueado y no podrá modificarse. Si necesitas corregir algo, contacta a Verbo para que te reenvíen un nuevo contrato.";

// Datos reales de la empresa (constantes en todo contrato — no cambian por
// alumno) — tomados directamente del contrato firmado que Jaret proporcionó.
const PRESTADOR = {
  razonSocial: "VERBO LANGUAGE SOLUTIONS, S.A.S.",
  rfc: "VLS2607202H7",
  domicilio: "C. Centenario 33, Apizaco Tlaxcala, C.P 90338",
  representante: "Jaret Abner Ramírez Jiménez",
  telefono: "(+52) 246 115 2136",
  correos: "info@verbolanguagesolutions.com, academic@verbolanguagesolutions.com y facturacion@verbolanguagesolutions.com",
  jurisdiccion: "Apizaco, Tlaxcala",
};

function contractBodyHtml(f: ContractFields): string {
  const productLine = f.productProgram ? `${f.product ?? "—"} — programa "${f.productProgram}"` : (f.product ?? "—");
  const totalPriceWords = numberToWordsEsMXN(f.totalPrice);
  return `
    <h1>CONTRATO DE PRESTACIÓN DE SERVICIOS EDUCATIVOS</h1>
    <p style="font-size:11px;color:#6b7c88;margin-top:-10px;">Verbo Language Solutions | Speak the Language of Growth!${f.folio ? ` &nbsp;·&nbsp; Folio: ${f.folio}` : ""}</p>

    <p>Contrato de Prestación de Servicios Educativos que celebran, por una parte, ${PRESTADOR.razonSocial} (en lo sucesivo "EL PRESTADOR" o "Verbo Language Solutions"), representada en este acto por ${PRESTADOR.representante}, y por la otra, la C. ${f.studentName} (en lo sucesivo "EL CLIENTE"), a quienes en lo sucesivo se les denominará conjuntamente como "las partes", al tenor de las siguientes declaraciones y cláusulas:</p>

    <p><strong>DECLARACIONES</strong></p>
    <p><strong>I. Declara "EL PRESTADOR", a través de su representante, bajo protesta de decir verdad:</strong></p>
    <p>a) Que es una sociedad mercantil legalmente constituida conforme a las leyes de los Estados Unidos Mexicanos, bajo la denominación ${PRESTADOR.razonSocial}, con Registro Federal de Contribuyentes ${PRESTADOR.rfc}, con domicilio fiscal en ${PRESTADOR.domicilio}.</p>
    <p>b) Que su representante legal, ${PRESTADOR.representante}, cuenta con facultades suficientes para suscribir el presente contrato, mismas que a la fecha de firma no le han sido revocadas ni limitadas.</p>
    <p>c) Que se dedica, entre otras actividades lícitas, a la prestación de servicios de enseñanza y desarrollo del idioma inglés bajo distintos productos, niveles y planes de acceso, entre ellos el producto ${f.product ?? "—"} objeto del presente contrato.</p>
    <p>d) Que señala como domicilio para efectos del presente contrato el indicado en el inciso a) anterior.</p>

    <p><strong>II. Declara "EL CLIENTE":</strong></p>
    <p>a) Llamarse ${f.studentName}, ser mayor de edad y contar con plena capacidad legal para obligarse en los términos del presente contrato.</p>
    <p>b) Señalar como domicilio y datos de contacto para efectos del presente contrato los que tiene registrados en la plataforma de Verbo Language Solutions: ${f.studentEmail}${f.studentPhone ? `, ${f.studentPhone}` : ""}.</p>
    <p>c) Conocer y aceptar el contenido íntegro del presente contrato, así como los Términos y Condiciones y el Código de Conducta publicados por Verbo Language Solutions, mismos que declara haber leído previamente a la firma.</p>
    <p>Expuesto lo anterior, las partes reconocen la personalidad con la que se ostentan y manifiestan que es su voluntad obligarse en los términos de las siguientes:</p>

    <p><strong>CLÁUSULAS</strong></p>

    <p><strong>PRIMERA. OBJETO DEL CONTRATO.</strong></p>
    <p>"EL PRESTADOR" se obliga a prestar a favor de "EL CLIENTE" servicios de enseñanza y desarrollo del idioma inglés, bajo las siguientes condiciones:</p>
    <ul style="font-size:12.5px;line-height:1.65;color:#3c4650;margin:0 0 14px;padding-left:20px;">
      <li>Producto contratado: ${productLine}.</li>
      <li>Plan de acceso: ${f.accessPlan ?? "—"}.</li>
      <li>Número total de sesiones: ${f.totalSessions ?? "—"}.</li>
      <li>Duración por sesión: ${f.sessionDuration ?? "—"} minutos.</li>
      <li>Modalidad: ${f.modality ?? "Virtual"}.</li>
      <li>Fecha de inicio: ${fmtDate(f.startDate)}.</li>
      <li>Fecha de término estimada (tentativa, sujeta a reagendamientos conforme a la Cláusula Tercera): ${fmtDate(f.estimatedEndDate)}.</li>
    </ul>
    <p>El Plan de acceso ${f.accessPlan ?? "contratado"} otorga a "EL CLIENTE" los beneficios vigentes conforme a la política oficial de Verbo Language Solutions a la fecha de firma, entre ellos accesos mensuales acumulables a cada uno de los productos complementarios Insight, Book Club y Spotlight conforme a la política vigente del plan contratado, y la ventana de reagendamiento descrita en la Cláusula Tercera. Dichos beneficios podrán actualizarse conforme Verbo Language Solutions actualice su política general hacia el futuro, sin que ello implique una modificación unilateral del presente contrato en perjuicio de lo ya adquirido por "EL CLIENTE".</p>

    <p><strong>SEGUNDA. COSTO, FORMA DE PAGO Y PENALIZACIONES.</strong></p>
    <p>El precio total de los servicios objeto del presente contrato es de ${fmtMoney(f.totalPrice)} M.N. (${totalPriceWords}), IVA incluido.</p>
    <p>Pago único de ${fmtMoney(f.totalPrice)} M.N. (IVA incluido), a más tardar el ${fmtDate(f.paymentDueDate)}.</p>
    <p>Los pagos deberán efectuarse exclusivamente a través de los medios de pago vigentes publicados por Verbo Language Solutions en sus canales oficiales al momento de la contratación o durante la vigencia del presente contrato. No se aceptarán pagos a terceros, maestros o colaboradores de Verbo Language Solutions bajo ninguna circunstancia.</p>
    <p>En caso de mora en cualquiera de los pagos pactados, "EL CLIENTE" se obliga a cubrir una penalización de $50.00 M.N. (cincuenta pesos 00/100 moneda nacional) por cada día natural de atraso. A partir del tercer día de mora, Verbo Language Solutions podrá suspender temporalmente la calendarización de sesiones; a partir del décimo día de mora, Verbo Language Solutions podrá dar por rescindido el presente contrato de pleno derecho, sin responsabilidad para Verbo Language Solutions y sin obligación de reembolso alguno. No se reservarán horarios sin el pago correspondiente previamente confirmado. "EL CLIENTE" se obliga a proporcionar el comprobante de pago que le sea requerido por los canales oficiales.</p>
    <p>La obligación de pago de "EL CLIENTE" es independiente de sus circunstancias personales, económicas o laborales. Las penalizaciones por mora, la suspensión del servicio y las demás consecuencias previstas en esta cláusula aplican con independencia del motivo que "EL CLIENTE" invoque para justificar el atraso. Verbo Language Solutions podrá, a su entera discreción y como cortesía excepcional, evaluar una prórroga o facilidad de pago en casos particulares, sin que ello constituya obligación, precedente, ni renuncia a exigir el cumplimiento en casos futuros.</p>
    <p>Facturación: "EL CLIENTE" ha solicitado la emisión de comprobante fiscal digital por Internet (CFDI) por el presente contrato. Para tal efecto, "EL CLIENTE" se obliga a proporcionar a Verbo Language Solutions, previo a la emisión de cada comprobante, los siguientes datos: RFC DEL CLIENTE, NOMBRE/RAZÓN SOCIAL FISCAL DEL CLIENTE, CÓDIGO POSTAL FISCAL DEL CLIENTE, USO DE CFDI Y RÉGIMEN FISCAL DEL CLIENTE. La falta de entrega oportuna de estos datos no exime a "EL CLIENTE" de su obligación de pago conforme a lo pactado en esta cláusula; Verbo Language Solutions emitirá el comprobante fiscal correspondiente dentro de los plazos que establece la legislación fiscal aplicable, una vez recibidos los datos completos. No se hará facturación extemporánea por ninguna razón.</p>

    <p><strong>TERCERA. CANCELACIONES, REAGENDAMIENTOS Y PUNTUALIDAD.</strong></p>
    <p>Conforme al Plan de acceso ${f.accessPlan ?? "contratado"} por "EL CLIENTE", aplican las siguientes condiciones (se incluye la tabla completa de referencia de todos los planes únicamente para contexto; el plan contratado por "EL CLIENTE" es el resaltado):</p>
    ${rescheduleTableHtml(f.accessPlan)}
    <p style="margin-top:10px;">a) "EL CLIENTE" cuenta, además de lo anterior, con 30 (treinta) días naturales contados a partir de la fecha original de cada sesión para reagendarla; transcurrido dicho plazo sin que la sesión haya sido reagendada, esta se tendrá por perdida, sin derecho a reagendamiento ni a reembolso.</p>
    <p>b) Todo reagendamiento y cancelación deberá tramitarse exclusivamente por los canales oficiales de Verbo Language Solutions (nunca directamente con el maestro). Verbo Language Solutions se compromete a respetar el horario agendado, pero el reagendamiento está sujeto a disponibilidad, sin que la falta de disponibilidad genere compensación alguna a favor de "EL CLIENTE".</p>
    <p>c) Tiempo de espera: en caso de retraso de "EL CLIENTE" a una sesión, se guardará un tiempo de espera de 30 (treinta) minutos, transcurrido el cual la sesión se tendrá por impartida para todos los efectos del presente contrato.</p>
    <p>d) No se harán excepciones al límite de reagendamientos ni al aviso mínimo bajo ningún motivo, incluyendo causas personales, laborales o médicas. Una cancelación de último momento por motivos de trabajo se trata exactamente igual que cualquier otra causa para efectos de esta cláusula.</p>
    <p>"EL CLIENTE" reconoce y acepta que ningún maestro, colaborador o directivo de Verbo Language Solutions, incluyendo quienes ejerzan simultáneamente funciones de dirección y docencia, tiene facultad para autorizar reagendamientos, recuperaciones o excepciones a esta política por vía informal, verbal, o en atención a la relación personal que pudiera existir con "EL CLIENTE". Cualquier solicitud en ese sentido deberá canalizarse y resolverse exclusivamente por los medios oficiales descritos en la Cláusula Cuarta, y su ausencia de confirmación escrita por administración la hace inexistente para efectos contractuales.</p>
    <p>"EL CLIENTE" es responsable de contar con una conexión a internet estable, un dispositivo en condiciones adecuadas y el software de videollamada actualizado y funcional para tomar sus sesiones. Las interrupciones, retrasos o imposibilidad de conexión derivados de fallas técnicas, de conectividad o de equipo atribuibles a "EL CLIENTE" no generan obligación alguna de Verbo Language Solutions de reponer, reagendar o compensar la sesión afectada, la cual se tendrá por impartida conforme al inciso c) anterior. Verbo Language Solutions podrá, a su entera discreción y sin que ello constituya precedente ni obligación futura, ofrecer una reposición como cortesía en casos excepcionales. Lo anterior es distinto de las fallas técnicas atribuibles a Verbo Language Solutions (caída de su propia plataforma, falla del maestro, etc.), las cuales sí se reprograman conforme a lo previsto en la Cláusula Octava.</p>

    <p><strong>CUARTA. CANALES OFICIALES DE COMUNICACIÓN Y FACULTADES DEL PERSONAL.</strong></p>
    <p>Toda gestión relacionada con pagos, reagendamientos, descuentos o cambios de calendario deberá tramitarse exclusivamente a través de los canales oficiales de administración de Verbo Language Solutions: a través del numero oficial ${PRESTADOR.telefono} o a los correos ${PRESTADOR.correos}. Queda estrictamente prohibido que "EL CLIENTE" gestione directamente con el maestro o cualquier colaborador docente cualquiera de los asuntos anteriores. El personal docente no está facultado para autorizar pagos, reagendamientos, descuentos ni cambios de calendario, aun cuando dicho personal ejerza simultáneamente funciones directivas.</p>

    <p><strong>QUINTA. CONDUCTA, RESPETO Y CONVIVENCIA PROFESIONAL.</strong></p>
    <p>"EL CLIENTE" se obliga a mantener trato respetuoso y profesional hacia el personal docente, administrativo y directivo de Verbo Language Solutions en todo momento, sin excepción derivada de la cercanía o informalidad de la relación. Constituyen faltas graves, entre otras: faltas de respeto, acoso en cualquiera de sus formas, uso de lenguaje discriminatorio, grabación o difusión no autorizada de sesiones o materiales, y el establecimiento de relaciones personales o sentimentales con el personal de Verbo Language Solutions al margen de los canales profesionales. La comisión de una falta grave faculta a Verbo Language Solutions para suspender o rescindir el presente contrato sin responsabilidad y sin reembolso.</p>

    <p><strong>SEXTA. SUSPENSIÓN Y TERMINACIÓN DEL CONTRATO.</strong></p>
    <p>Se considerará "abandono operativo" la falta de actividad de "EL CLIENTE" por más de 15 días sin previo aviso por los canales oficiales. La "pausa fantasma" (abandono sin aviso ni gestión formal de pausa) será penalizada con el 30% (treinta por ciento) del monto pendiente de pago a la fecha del abandono. La reactivación del servicio tras una pausa no garantiza la disponibilidad del horario ni del maestro originalmente asignado.</p>
    <p>"EL CLIENTE" podrá solicitar la terminación voluntaria anticipada del presente contrato dando aviso por escrito con al menos 8 (ocho) días naturales de anticipación por los canales oficiales; en dicho caso, "EL CLIENTE" se obliga a cubrir una penalización equivalente al 30% (treinta por ciento) del monto que reste pendiente de las sesiones no impartidas a la fecha efectiva de terminación.</p>

    <p><strong>SÉPTIMA. PROPIEDAD INTELECTUAL Y CONFIDENCIALIDAD.</strong></p>
    <p>Todo material didáctico, metodología, ejercicios, presentaciones y demás obras utilizadas en la prestación del servicio son propiedad exclusiva de Verbo Language Solutions. "EL CLIENTE" podrá usarlos únicamente para su uso personal e intransferible, quedando prohibido grabar, reproducir, redistribuir o publicar dicho material sin autorización previa y por escrito de Verbo Language Solutions. "EL CLIENTE" se obliga a mantener confidencialidad respecto de la metodología, precios y procesos internos de Verbo Language Solutions de los que tenga conocimiento con motivo del presente contrato, obligación que subsistirá por un plazo de 5 (cinco) años posteriores a la terminación del presente contrato. El incumplimiento de esta cláusula dará lugar al pago de una pena convencional equivalente al valor total del paquete contratado, es decir ${fmtMoney(f.totalPrice)} M.N., sin perjuicio de las acciones legales adicionales que correspondan.</p>

    <p><strong>OCTAVA. REASIGNACIÓN DE MAESTROS Y FLEXIBILIDAD OPERATIVA.</strong></p>
    <p>Verbo Language Solutions podrá sustituir o rotar al maestro asignado sin que ello constituya incumplimiento del presente contrato, así como ajustar horarios de forma razonable, previo aviso a "EL CLIENTE". Los casos fortuitos o de fuerza mayor, así como las fallas técnicas atribuibles a Verbo Language Solutions, darán lugar a la reprogramación de la sesión afectada sin penalización ni reembolso.</p>

    <p><strong>NOVENA. NO CONTRATACIÓN / NO SOLICITACIÓN DE PERSONAL DOCENTE.</strong></p>
    <p>Durante la vigencia del presente contrato y por un periodo de 24 (veinticuatro) meses posteriores a su terminación, "EL CLIENTE" se obliga a no ofrecer, solicitar, gestionar ni celebrar, directa o indirectamente, cualquier acuerdo de prestación de servicios de enseñanza de idiomas con el personal docente o colaboradores de Verbo Language Solutions que hayan tenido contacto con "EL CLIENTE" derivado del presente contrato, al margen de la plataforma y estructura comercial de Verbo Language Solutions.</p>
    <p>El incumplimiento de esta obligación por parte de "EL CLIENTE" dará lugar, sin necesidad de declaración judicial previa, a: (i) la rescisión inmediata del presente contrato sin derecho a reembolso alguno; (ii) el pago de una pena convencional equivalente al valor total del paquete contratado, es decir ${fmtMoney(f.totalPrice)} M.N., por concepto de los daños y perjuicios ocasionados a Verbo Language Solutions; y (iii) el ejercicio de las acciones legales civiles que en su caso correspondan.</p>
    <p>Verbo Language Solutions hace del conocimiento de "EL CLIENTE" que sus maestros y colaboradores están sujetos a una obligación equivalente de no aceptar este tipo de arreglos, por lo que cualquier oferta en este sentido deberá ser rechazada y reportada por el colaborador; el incumplimiento de dicha obligación por ambas partes agravará las consecuencias aplicables a cada una conforme a su propio contrato.</p>

    <p><strong>DÉCIMA. VIGENCIA Y TERMINACIÓN.</strong></p>
    <p>El presente contrato estará vigente desde la fecha de su firma hasta el cumplimiento total de las ${f.totalSessions ?? "—"} sesiones contratadas, salvo terminación o rescisión anticipada conforme a lo previsto en las cláusulas anteriores.</p>

    <p><strong>DÉCIMA PRIMERA. CONFIDENCIALIDAD GENERAL.</strong></p>
    <p>Ambas partes se obligan a mantener confidencialidad recíproca respecto de la información no pública que se hubieran proporcionado con motivo del presente contrato, salvo que su divulgación sea requerida por autoridad competente.</p>

    <p><strong>DÉCIMA SEGUNDA. JURISDICCIÓN Y LEY APLICABLE.</strong></p>
    <p>Para la interpretación y cumplimiento del presente contrato, las partes se someten expresamente a las leyes aplicables y a la jurisdicción de los tribunales competentes de ${PRESTADOR.jurisdiccion}, renunciando expresamente a cualquier otro fuero que pudiera corresponderles en razón de su domicilio presente o futuro.</p>

    <p>Leídas que fueron las cláusulas del presente contrato por ambas partes y enteradas de su contenido y alcance legal, lo firman de conformidad en la ciudad de ${PRESTADOR.jurisdiccion}, en la fecha de firma electrónica que se indica a continuación.</p>
  `;
}

function signatureBlockHtml(f: ContractFields, opts: { signedAt?: string; studentSignatureDataUrl?: string }): string {
  const studentBlock = opts.studentSignatureDataUrl
    ? `<img src="${opts.studentSignatureDataUrl}" style="height:56px;object-fit:contain;" />`
    : `<div style="height:56px;border-bottom:1px solid #94a3b8;"></div>`;
  return `
    <div class="rule" style="margin-top:28px;"></div>
    <div style="display:flex;justify-content:space-between;margin-top:22px;gap:24px;">
      <div style="flex:1;text-align:center;">
        <img src="${jaretSignatureUrl}" style="height:56px;object-fit:contain;" />
        <div style="border-top:1px solid #94a3b8;margin-top:4px;padding-top:6px;font-size:11px;color:#475569;">
          Por "EL PRESTADOR"<br/>${PRESTADOR.razonSocial}<br/>${PRESTADOR.representante} — Representante Legal
        </div>
      </div>
      <div style="flex:1;text-align:center;">
        ${studentBlock}
        <div style="border-top:1px solid #94a3b8;margin-top:4px;padding-top:6px;font-size:11px;color:#475569;">
          "EL CLIENTE"<br/>${f.studentName}<br/>${f.studentEmail}${f.studentPhone ? ` · ${f.studentPhone}` : ""}
          ${opts.signedAt ? `<br/>Firmado electrónicamente el ${new Date(opts.signedAt).toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" })}` : ""}
        </div>
      </div>
    </div>
  `;
}

/** Misma hoja/estilos que simple-docs-pdf.ts (pageShell) para que el
 *  contrato se vea de la misma familia visual que recibos y constancias. */
function pageHtml(bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:0;font-family:Helvetica,Arial,sans-serif;color:#1c2b36;}
  .page{width:816px;background:#ffffff;padding:40px 56px 32px;}
  .header{display:flex;align-items:flex-start;justify-content:space-between;}
  .brand{display:flex;align-items:center;gap:14px;}
  .brand img{width:52px;height:52px;border-radius:12px;display:block;}
  .brand .top{font-weight:800;font-size:17px;letter-spacing:1.5px;color:#01304a;}
  .brand .sub{font-weight:600;font-size:9px;letter-spacing:2px;color:#f38934;text-transform:uppercase;}
  .doc-tag{text-align:right;}
  .doc-tag .label{font-weight:700;font-size:11px;letter-spacing:2.5px;color:#f38934;text-transform:uppercase;}
  .doc-tag .date{font-size:11px;color:#6b7c88;margin-top:3px;}
  .rule{height:1px;background:#e3e9ed;margin:18px 0 0;}
  .body{margin-top:22px;}
  .body h1{font-weight:800;font-size:19px;color:#01304a;margin:0 0 4px;}
  .body p{font-size:12.5px;line-height:1.65;color:#3c4650;margin:0 0 14px;}
  table.concept{width:100%;border-collapse:collapse;font-size:12.5px;border-radius:12px;overflow:hidden;border:1px solid #e3e9ed;margin:6px 0 14px;}
  table.concept thead th{background:#01304a;color:#fff;text-align:left;padding:8px 14px;font-weight:600;font-size:10.5px;letter-spacing:0.5px;text-transform:uppercase;}
  table.concept tbody td{padding:7px 14px;border-bottom:1px solid #e3e9ed;font-size:12px;}
  table.concept tbody tr:nth-child(even){background:#f4f6f8;}
  .footer{margin-top:28px;padding-top:14px;border-top:1px solid #e3e9ed;text-align:center;}
  .footer .fword{font-weight:800;font-size:12px;letter-spacing:1.5px;color:#01304a;}
  .footer .fsub{font-size:10px;color:#6b7c88;margin-top:4px;line-height:1.5;}
</style></head>
<body>
<div class="page">
  <div class="header">
    <div class="brand">
      <img src="${logoUrl}" alt="Verbo">
      <div>
        <div class="top">VERBO</div>
        <div class="sub">Language Solutions</div>
      </div>
    </div>
    <div class="doc-tag">
      <div class="label">Contrato</div>
      <div class="date">Emitido el ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div class="body">
    ${bodyHtml}
  </div>
  <div class="footer">
    <div class="fword">VERBO LANGUAGE SOLUTIONS</div>
    <div class="fsub">verboacademic.com</div>
  </div>
</div>
</body></html>`;
}

export function renderContractHtml(fields: ContractFields, opts: { signedAt?: string; studentSignatureDataUrl?: string } = {}): string {
  return pageHtml(contractBodyHtml(fields) + signatureBlockHtml(fields, opts));
}

/** Same html2canvas -> jsPDF pipeline as receipt-pdf.ts/simple-docs-pdf.ts,
 *  but returns a base64 data URI instead of calling doc.save() — the caller
 *  (the public signing page) sends this to the sign-contract Edge Function
 *  to be hashed, stored, and emailed, it never gets saved locally here. */
export async function renderContractPdfBase64(fields: ContractFields, opts: { signedAt?: string; studentSignatureDataUrl?: string } = {}): Promise<string> {
  const html = renderContractHtml(fields, opts);
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.innerHTML = html;
  document.body.appendChild(container);
  const pageEl = container.querySelector(".page") as HTMLElement;

  try {
    const canvas = await html2canvas(pageEl, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pdfWidth = doc.internal.pageSize.getWidth();
    const pdfHeight = doc.internal.pageSize.getHeight();
    const ratio = pdfWidth / canvas.width;
    const imgHeightPt = canvas.height * ratio;

    let renderedHeight = 0;
    let page = 0;
    while (renderedHeight < imgHeightPt) {
      if (page > 0) doc.addPage();
      doc.addImage(imgData, "PNG", 0, -renderedHeight, pdfWidth, imgHeightPt);
      renderedHeight += pdfHeight;
      page++;
    }
    return doc.output("datauristring");
  } finally {
    document.body.removeChild(container);
  }
}
