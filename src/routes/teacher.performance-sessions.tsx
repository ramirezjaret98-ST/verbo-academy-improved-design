import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, Compass, Briefcase, Globe, FileDown, Pencil } from "lucide-react";
import { Pill, GhostButton } from "@/components/verbo/ui";
import { CurriculumBreadcrumb } from "@/components/verbo/CurriculumBreadcrumb";
import { useAuth } from "@/lib/auth";
import {
  type ProductId,
  type ProductCourse,
  type CourseLevel,
  type CourseUnit,
  PRODUCT_META,
  PRODUCT_ORDER,
  loadCourses,
  subscribeCourses,
  teacherSetCourseUnitPdf,
} from "@/lib/product-courses-store";
import { UnitDetail } from "./student.courses";
import { UnitPdfModal } from "@/components/verbo/UnitPdfManager";

export const Route = createFileRoute("/teacher/performance-sessions")({
  head: () => ({
    meta: [
      { title: "Performance Sessions — Verbo Academy" },
      { name: "description", content: "Browse the full curriculum and try any exercise in preview mode." },
    ],
  }),
  component: Page,
});

const PRODUCT_ICON: Record<ProductId, React.ComponentType<{ className?: string }>> = {
  go: Compass,
  enterprise: Briefcase,
  international: Globe,
};

const PRODUCT_ICON_GRADIENT: Record<ProductId, string> = {
  go: "linear-gradient(150deg, #b2ece3 0%, #7cd7cb 55%, #3ebbad 100%)",
  enterprise: "linear-gradient(150deg, #073756 0%, #01304a 55%, #001a29 100%)",
  international: "linear-gradient(150deg, #dea3ee 0%, #c86fe1 55%, #a34ac0 100%)",
};

const PREVIEW_STUDENT_ID = "teacher-preview";

function Page() {
  const { user } = useAuth();
  const canManagePdfs = !!user?.can_manage_unit_pdfs;
  const [courses, setCourses] = useState<ProductCourse[]>(loadCourses);
  const [productId, setProductId] = useState<ProductId | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [pdfModalUnit, setPdfModalUnit] = useState<CourseUnit | null>(null);

  useEffect(() => {
    setCourses(loadCourses());
    return subscribeCourses(() => setCourses(loadCourses()));
  }, []);

  const product = productId ? courses.find((c) => c.product === productId) ?? null : null;
  const level: CourseLevel | null = product && levelId ? product.levels.find((l) => l.id === levelId) ?? null : null;
  const unit: CourseUnit | null = level && unitId ? level.units.find((u) => u.id === unitId) ?? null : null;

  const crumbs = (extra: { label: string; onClick?: () => void }[]) => [
    { label: "Dashboard", to: "/teacher" },
    { label: "Courses", onClick: () => { setProductId(null); setLevelId(null); setUnitId(null); } },
    ...extra,
  ];

  const header = (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Performance Sessions</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Browse the full curriculum and try any exercise — nothing you complete here is saved to a student's record.
      </p>
    </div>
  );

  if (unit && level && product) {
    return (
      <div className="space-y-4">
        <CurriculumBreadcrumb
          items={crumbs([
            { label: PRODUCT_META[product.product].label, onClick: () => { setLevelId(null); setUnitId(null); } },
            { label: level.name, onClick: () => setUnitId(null) },
            { label: unit.title },
          ])}
        />
        <UnitDetail
        level={level}
        unit={unit}
        studentId={PREVIEW_STUDENT_ID}
        readOnly={false}
        previewMode
        onBack={() => setUnitId(null)}
          onChange={() => { /* no-op in preview */ }}
        />
      </div>
    );
  }

  if (level && product) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <GhostButton onClick={() => setLevelId(null)}>
            <ArrowLeft className="h-3.5 w-3.5" /> {PRODUCT_META[product.product].label} levels
          </GhostButton>
          <CurriculumBreadcrumb
            items={crumbs([
              { label: PRODUCT_META[product.product].label, onClick: () => { setLevelId(null); setUnitId(null); } },
              { label: level.name },
            ])}
          />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{level.name}</h1>
          <p className="text-sm text-muted-foreground">{level.units.length} units · click any unit to preview its content.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {level.units.map((u) => (
            <div
              key={u.id}
              role="button"
              tabIndex={0}
              onClick={() => setUnitId(u.id)}
              onKeyDown={(e) => { if (e.key === "Enter") setUnitId(u.id); }}
              className="group flex cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-card p-5 text-left shadow-sm verbo-lift hover:border-accent hover:shadow-elevated"
            >
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{u.id}</div>
              <div className="text-base font-semibold tracking-tight text-foreground">{u.title}</div>
              {u.block && <div className="text-xs text-muted-foreground">{u.block}</div>}
              <div className="mt-2 flex items-center justify-between">
                <Pill tone="muted">Preview</Pill>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
              {canManagePdfs && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPdfModalUnit(u); }}
                  className="mt-1 inline-flex items-center justify-center gap-1.5 self-start rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
                >
                  {u.pdf_url ? <FileDown className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {u.pdf_url ? "Manage PDF" : "Add PDF"}
                </button>
              )}
            </div>
          ))}
        </div>
        {pdfModalUnit && (
          <UnitPdfModal
            unitTitle={pdfModalUnit.title}
            target={{ kind: "course", unitCode: pdfModalUnit.id, currentUrl: pdfModalUnit.pdf_url || "" }}
            onClose={() => setPdfModalUnit(null)}
            onSave={(url) => teacherSetCourseUnitPdf(pdfModalUnit.id, url)}
            onRemove={() => teacherSetCourseUnitPdf(pdfModalUnit.id, "")}
          />
        )}
      </div>
    );
  }

  if (product) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <GhostButton onClick={() => setProductId(null)}>
            <ArrowLeft className="h-3.5 w-3.5" /> All products
          </GhostButton>
          <CurriculumBreadcrumb items={crumbs([{ label: PRODUCT_META[product.product].label }])} />
          {header}
          <div className="text-sm text-muted-foreground">{PRODUCT_META[product.product].label} · choose a level.</div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {product.levels.map((lvl) => (
            <button
              key={lvl.id}
              onClick={() => setLevelId(lvl.id)}
              className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 text-left shadow-sm verbo-lift hover:border-accent hover:shadow-elevated"
            >
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{lvl.id}</div>
              <div className="text-lg font-semibold tracking-tight text-foreground">{lvl.name}</div>
              <div className="mt-2 flex items-center justify-between">
                <Pill tone="muted">{lvl.units.length} units</Pill>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <CurriculumBreadcrumb items={[{ label: "Dashboard", to: "/teacher" }, { label: "Courses" }]} />
      {header}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCT_ORDER.map((pid) => {
          const Icon = PRODUCT_ICON[pid];
          const c = courses.find((x) => x.product === pid);
          const levelCount = c?.levels.length ?? 0;
          const unitCount = c?.levels.reduce((s, l) => s + l.units.length, 0) ?? 0;
          return (
            <button
              key={pid}
              onClick={() => { setProductId(pid); setLevelId(null); setUnitId(null); }}
              className="group flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-6 text-left shadow-sm verbo-lift hover:border-accent hover:shadow-elevated"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-xl text-white" style={{ backgroundImage: PRODUCT_ICON_GRADIENT[pid] }}>
                <Icon className="h-7 w-7" />
              </span>
              <div>
                <div className="text-lg font-semibold tracking-tight text-foreground">{PRODUCT_META[pid].label}</div>
                <div className="mt-1 text-sm text-muted-foreground">{PRODUCT_META[pid].description}</div>
              </div>
              <div className="mt-auto flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <Pill tone="muted">{levelCount} levels</Pill>
                <Pill tone={unitCount ? "success" : "muted"}>{unitCount} units</Pill>
                <ChevronRight className="ml-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
