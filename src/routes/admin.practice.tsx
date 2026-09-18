import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  usePracticeActivities,
  upsertPracticeActivity,
  removePracticeActivity,
  addPracticeActivitiesBulk,
  validateBulkPracticeItems,
  PRACTICE_CATEGORIES,
  PRACTICE_FORMAT_LABELS,
  type PracticeActivity,
  type PracticeExercise,
  type PracticeExerciseType,
  type PracticeProductLine,
  type ComparativaContent,
} from "@/lib/practice-store";
import { categoryTheme } from "@/lib/challenge-theme";
import { PracticeComparativaCard } from "@/components/verbo/practice/PracticeComparativaCard";
import { Card, GhostButton, Pill, PrimaryButton, SectionTitle } from "@/components/verbo/ui";
import { notifySuccess, notifyError } from "@/lib/notify";
import { Pencil, Trash2, X, Plus, Upload, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/practice")({ component: Page });

const ACCENT = "#5fca16"; // brand lime, same convention as admin.materials.tsx
const ACTIVE = "#01304a"; // navy — active/selected chip background

const PRODUCT_LINE_LABELS: Record<PracticeProductLine, string> = {
  go: "GO",
  enterprise: "Enterprise",
  international: "International",
  vip: "VIP",
};
const ALL_PRODUCT_LINES = Object.keys(PRODUCT_LINE_LABELS) as PracticeProductLine[];

type ExerciseKind = "fill_gaps" | "true_false" | "multiple_choice";

function ChoiceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
      style={active ? { background: ACTIVE, borderColor: ACTIVE, color: "#fff" } : { background: "transparent", borderColor: "var(--border)", color: "var(--foreground)" }}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-semibold text-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}

const inputCls = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const textareaCls = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function emptyPanel() {
  return { tag: "", word: "", definition: "", example: "", more: [] as string[] };
}

function Page() {
  const items = usePracticeActivities();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState(PRACTICE_CATEGORIES[0]);
  const [subcategory, setSubcategory] = useState("");
  const [productLines, setProductLines] = useState<PracticeProductLine[]>([]);
  const [title, setTitle] = useState("");
  const [eyebrow, setEyebrow] = useState("");
  const [left, setLeft] = useState(emptyPanel());
  const [right, setRight] = useState(emptyPanel());
  const [exKind, setExKind] = useState<ExerciseKind>("fill_gaps");
  const [paragraph, setParagraph] = useState("");
  const [answer, setAnswer] = useState("");
  const [altAnswersRaw, setAltAnswersRaw] = useState("");
  const [question, setQuestion] = useState("");
  const [tfCorrect, setTfCorrect] = useState<0 | 1>(0);
  const [mcOptionsRaw, setMcOptionsRaw] = useState("");
  const [mcCorrect, setMcCorrect] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hint, setHint] = useState("");
  const [premium, setPremium] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PracticeActivity | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string | "all">("all");

  const resetForm = () => {
    setEditingId(null);
    setCategory(PRACTICE_CATEGORIES[0]);
    setSubcategory("");
    setProductLines([]);
    setTitle("");
    setEyebrow("");
    setLeft(emptyPanel());
    setRight(emptyPanel());
    setExKind("fill_gaps");
    setParagraph("");
    setAnswer("");
    setAltAnswersRaw("");
    setQuestion("");
    setTfCorrect(0);
    setMcOptionsRaw("");
    setMcCorrect(0);
    setFeedback("");
    setHint("");
    setPremium(false);
  };

  const toggleProductLine = (v: PracticeProductLine) => {
    setProductLines((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const buildExercise = (): PracticeExercise | null => {
    if (exKind === "fill_gaps") {
      if (!paragraph.trim() || !answer.trim()) return null;
      const answers = altAnswersRaw.split(",").map((s) => s.trim()).filter(Boolean);
      return { type: "fill_gaps", paragraph: paragraph.trim(), answer: answer.trim(), answers: answers.length ? answers : undefined, feedback: feedback.trim() || undefined, hint: hint.trim() || undefined };
    }
    if (exKind === "true_false") {
      if (!question.trim()) return null;
      return { type: "read_select", question: question.trim(), options: ["True", "False"], correctIndex: tfCorrect, feedback: feedback.trim() || undefined, hint: hint.trim() || undefined };
    }
    const options = mcOptionsRaw.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!question.trim() || options.length < 2) return null;
    return { type: "read_select" as PracticeExerciseType, question: question.trim(), options, correctIndex: Math.min(mcCorrect, options.length - 1), feedback: feedback.trim() || undefined, hint: hint.trim() || undefined };
  };

  const exercise = buildExercise();

  const previewContent: ComparativaContent = { eyebrow: eyebrow.trim() || undefined, left, right };
  const previewItem: PracticeActivity = {
    id: editingId ?? "preview",
    format: "comparativa",
    category,
    subcategory: subcategory.trim() || undefined,
    product_lines: productLines,
    title: title.trim() || "Sin título",
    content: previewContent,
    exercises: exercise ? [exercise] : [],
    premium,
  };

  const canSave = title.trim() && category && left.tag && left.word && left.definition && left.example && right.tag && right.word && right.definition && right.example && !!exercise;

  const save = () => {
    if (!canSave) return;
    upsertPracticeActivity({ ...previewItem, id: editingId ?? `p${Date.now()}` });
    notifySuccess(editingId ? "Practice card updated" : "Practice card created");
    resetForm();
  };

  const startEdit = (p: PracticeActivity) => {
    if (p.format !== "comparativa") return; // only format editable in this v1 admin screen
    const c = p.content as ComparativaContent;
    setEditingId(p.id);
    setCategory(p.category);
    setSubcategory(p.subcategory ?? "");
    setProductLines(p.product_lines ?? []);
    setTitle(p.title);
    setEyebrow(c.eyebrow ?? "");
    setLeft({ ...c.left, more: c.left.more ?? [] });
    setRight({ ...c.right, more: c.right.more ?? [] });
    const ex = p.exercises[0];
    if (ex?.type === "fill_gaps") {
      setExKind("fill_gaps");
      setParagraph(ex.paragraph ?? "");
      setAnswer(ex.answer ?? "");
      setAltAnswersRaw((ex.answers ?? []).join(", "));
    } else if (ex?.type === "read_select") {
      const opts = ex.options ?? [];
      if (opts.length === 2 && opts[0] === "True" && opts[1] === "False") {
        setExKind("true_false");
        setQuestion(ex.question ?? "");
        setTfCorrect((ex.correctIndex as 0 | 1) ?? 0);
      } else {
        setExKind("multiple_choice");
        setQuestion(ex.question ?? "");
        setMcOptionsRaw(opts.join("\n"));
        setMcCorrect(ex.correctIndex ?? 0);
      }
    }
    setFeedback(ex?.feedback ?? "");
    setHint(ex?.hint ?? "");
    setPremium(!!p.premium);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filtered = useMemo(
    () => (filterCategory === "all" ? items : items.filter((p) => p.category === filterCategory)),
    [items, filterCategory],
  );

  return (
    <div className="space-y-8 p-6">
      <SectionTitle
        action={
          <GhostButton onClick={() => setBulkOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Bulk JSON
          </GhostButton>
        }
      >
        Práctica Complementaria
      </SectionTitle>
      <p className="-mt-6 max-w-2xl text-sm text-muted-foreground">
        Actividades snackable (vocabulario, gramática, negocios, speaking, listening, study tips) que viven fuera del temario de unidad — nunca bloquean ni afectan el progreso de una unidad. v1: formato <b>Comparativa</b> únicamente; Grid/Ficha de lectura/Carrusel llegan en fases siguientes.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---- Form ---- */}
        <Card className="space-y-5">
          <Field label="Título interno (no lo ve el alumno)">
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Disagree vs Object" />
          </Field>

          <Field label="Categoría">
            <div className="flex flex-wrap gap-2">
              {PRACTICE_CATEGORIES.map((c) => (
                <ChoiceButton key={c} active={category === c} onClick={() => setCategory(c)}>{c}</ChoiceButton>
              ))}
            </div>
          </Field>

          <Field label="Subcategoría" hint='Texto libre — ej. "idioms", "phrasal verbs", "synonyms & near-synonyms"'>
            <input className={inputCls} value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
          </Field>

          <Field label="Líneas de producto" hint="Ninguna seleccionada = universal/transversal (mezcla las 3 líneas, como decidiste 2026-09-17).">
            <div className="flex flex-wrap gap-2">
              {ALL_PRODUCT_LINES.map((v) => (
                <ChoiceButton key={v} active={productLines.includes(v)} onClick={() => toggleProductLine(v)}>{PRODUCT_LINE_LABELS[v]}</ChoiceButton>
              ))}
            </div>
          </Field>

          <Field label="Eyebrow (opcional)" hint='Línea de contexto arriba de los paneles — ej. "GO · Confident Voice"'>
            <input className={inputCls} value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {([["left", left, setLeft] , ["right", right, setRight]] as const).map(([side, panel, setPanel]) => (
              <div key={side} className="space-y-2 rounded-xl border border-border p-3">
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Panel {side === "left" ? "izquierdo" : "derecho"}</div>
                <input className={inputCls} placeholder="Tag (Verb, Noun...)" value={panel.tag} onChange={(e) => setPanel({ ...panel, tag: e.target.value })} />
                <input className={inputCls} placeholder="Palabra" value={panel.word} onChange={(e) => setPanel({ ...panel, word: e.target.value })} />
                <textarea className={textareaCls} rows={2} placeholder="Definición" value={panel.definition} onChange={(e) => setPanel({ ...panel, definition: e.target.value })} />
                <textarea className={textareaCls} rows={2} placeholder="Ejemplo" value={panel.example} onChange={(e) => setPanel({ ...panel, example: e.target.value })} />
              </div>
            ))}
          </div>

          <Field label="Tipo de ejercicio">
            <div className="flex flex-wrap gap-2">
              <ChoiceButton active={exKind === "fill_gaps"} onClick={() => setExKind("fill_gaps")}>Completar</ChoiceButton>
              <ChoiceButton active={exKind === "true_false"} onClick={() => setExKind("true_false")}>Verdadero/Falso</ChoiceButton>
              <ChoiceButton active={exKind === "multiple_choice"} onClick={() => setExKind("multiple_choice")}>Opción múltiple</ChoiceButton>
            </div>
          </Field>

          {exKind === "fill_gaps" ? (
            <div className="space-y-2">
              <Field label="Oración" hint='Usa "[blank]" donde va el espacio a llenar.'>
                <textarea className={textareaCls} rows={2} value={paragraph} onChange={(e) => setParagraph(e.target.value)} placeholder="I [blank] with that." />
              </Field>
              <Field label="Respuesta correcta">
                <input className={inputCls} value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </Field>
              <Field label="Respuestas alternas (opcional)" hint='Sinónimos válidos separados por coma — ej. "went" también se acepta si la correcta es "traveled".'>
                <input className={inputCls} value={altAnswersRaw} onChange={(e) => setAltAnswersRaw(e.target.value)} placeholder="went, has gone" />
              </Field>
            </div>
          ) : exKind === "true_false" ? (
            <div className="space-y-2">
              <Field label="Afirmación">
                <textarea className={textareaCls} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
              </Field>
              <Field label="Respuesta correcta">
                <div className="flex gap-2">
                  <ChoiceButton active={tfCorrect === 0} onClick={() => setTfCorrect(0)}>Verdadero</ChoiceButton>
                  <ChoiceButton active={tfCorrect === 1} onClick={() => setTfCorrect(1)}>Falso</ChoiceButton>
                </div>
              </Field>
            </div>
          ) : (
            <div className="space-y-2">
              <Field label="Pregunta">
                <textarea className={textareaCls} rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
              </Field>
              <Field label="Opciones" hint="Una por línea, 2 o más.">
                <textarea className={textareaCls} rows={3} value={mcOptionsRaw} onChange={(e) => setMcOptionsRaw(e.target.value)} />
              </Field>
              <Field label="Índice de la opción correcta (0 = primera)">
                <input type="number" min={0} className={inputCls} value={mcCorrect} onChange={(e) => setMcCorrect(Number(e.target.value))} />
              </Field>
            </div>
          )}

          <Field label="Feedback si falla (opcional)">
            <input className={inputCls} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
          </Field>
          <Field label="Hint (opcional)">
            <input className={inputCls} value={hint} onChange={(e) => setHint(e.target.value)} />
          </Field>

          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={premium} onChange={(e) => setPremium(e.target.checked)} className="h-4 w-4 rounded border-input" style={{ accentColor: ACCENT }} />
            Premium (solo Advance/Elite)
          </label>

          <div className="flex items-center gap-3 pt-2">
            <PrimaryButton accentColor={ACCENT} disabled={!canSave} onClick={save}>
              {editingId ? "Guardar cambios" : "Crear tarjeta"}
            </PrimaryButton>
            {editingId && <GhostButton onClick={resetForm}>Cancelar edición</GhostButton>}
          </div>
        </Card>

        {/* ---- Live preview ---- */}
        <div className="space-y-2 lg:sticky lg:top-6 lg:self-start">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> Vista previa (como la ve el alumno)
          </div>
          <PracticeComparativaCard practice={previewItem} studentId="" readOnly />
        </div>
      </div>

      {/* ---- List ---- */}
      <div className="space-y-4">
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-2">
              <ChoiceButton active={filterCategory === "all"} onClick={() => setFilterCategory("all")}>Todas</ChoiceButton>
              {PRACTICE_CATEGORIES.map((c) => (
                <ChoiceButton key={c} active={filterCategory === c} onClick={() => setFilterCategory(c)}>{c}</ChoiceButton>
              ))}
            </div>
          }
        >
          {filtered.length} {filtered.length === 1 ? "tarjeta" : "tarjetas"}
        </SectionTitle>

        <div className="grid gap-3">
          {filtered.map((p) => {
            const theme = categoryTheme(p.category);
            return (
              <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: theme.solid }}>{p.category}</span>
                  <Pill tone="muted">{PRACTICE_FORMAT_LABELS[p.format]}</Pill>
                  <span className="text-sm font-medium text-foreground">{p.title}</span>
                  {p.subcategory && <span className="text-xs text-muted-foreground">· {p.subcategory}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <GhostButton onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></GhostButton>
                  <GhostButton onClick={() => setConfirmDelete(p)}><Trash2 className="h-3.5 w-3.5" /></GhostButton>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <Card className="text-sm text-muted-foreground">Todavía no hay tarjetas en esta categoría.</Card>}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-floating" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-foreground">¿Eliminar "{confirmDelete.title}"?</div>
            <p className="mt-1 text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
            <div className="mt-4 flex justify-end gap-2">
              <GhostButton onClick={() => setConfirmDelete(null)}>Cancelar</GhostButton>
              <PrimaryButton
                accentColor="#e11d48"
                onClick={() => {
                  removePracticeActivity(confirmDelete.id);
                  setConfirmDelete(null);
                  notifySuccess("Practice card deleted");
                }}
              >
                Eliminar
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {bulkOpen && <PracticeBulkUploadModal onClose={() => setBulkOpen(false)} />}
    </div>
  );
}

function PracticeBulkUploadModal({ onClose }: { onClose: () => void }) {
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<PracticeActivity[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file?: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data)) throw new Error("not an array");
        const { valid, errs } = validateBulkPracticeItems(data);
        setParsed(valid);
        setErrors(errs);
      } catch {
        setParsed([]);
        setErrors(["El archivo no es JSON válido — debe ser un array de tarjetas de práctica."]);
      }
    };
    reader.readAsText(file);
  };

  const grouped = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of parsed) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()];
  }, [parsed]);

  const doImport = async () => {
    setImporting(true);
    const res = await addPracticeActivitiesBulk(parsed);
    setImporting(false);
    if (!res.ok) {
      notifyError(res.error, { context: "Importando práctica complementaria" });
      return;
    }
    setImported(res.count);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-floating" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="text-base font-semibold text-foreground">Bulk Upload — Práctica Complementaria</div>
          <GhostButton onClick={onClose}><X className="h-4 w-4" /></GhostButton>
        </div>

        {imported !== null ? (
          <div className="rounded-lg border border-dashed border-emerald-500/60 bg-emerald-500/10 p-6 text-center text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            {imported} tarjetas importadas correctamente.
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex h-24 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 text-sm text-muted-foreground transition-colors hover:bg-secondary">
              <Upload className="h-4 w-4" />
              {fileName || "Sube un archivo .json"}
              <input ref={inputRef} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
            </label>

            {errors.length > 0 && (
              <div className="space-y-1 rounded-lg border border-dashed border-destructive/60 bg-destructive/5 p-3 text-[11px] leading-relaxed text-destructive">
                <div className="font-semibold">{errors.length} elemento(s) con error — no se importarán.</div>
                {errors.slice(0, 20).map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}

            {parsed.length > 0 && (
              <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-foreground">
                <div className="mb-1 font-semibold">{parsed.length} tarjeta(s) válidas, por categoría:</div>
                {grouped.map(([cat, n]) => <div key={cat}>{cat}: {n}</div>)}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <GhostButton onClick={onClose}>Cancelar</GhostButton>
              <PrimaryButton accentColor={ACCENT} disabled={parsed.length === 0 || importing} onClick={doImport}>
                <Plus className="h-4 w-4" /> {importing ? "Importando…" : `Importar ${parsed.length}`}
              </PrimaryButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
