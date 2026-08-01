export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div
        className="w-full max-w-md rounded-2xl border bg-white p-10 text-center shadow-sm"
        style={{ borderColor: "rgba(1, 48, 74, 0.08)" }}
      >
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </div>
        <h1
          className="mt-3 text-2xl font-semibold tracking-tight"
          style={{ color: "#01304a" }}
        >
          This section is coming soon.
        </h1>
      </div>
    </div>
  );
}
