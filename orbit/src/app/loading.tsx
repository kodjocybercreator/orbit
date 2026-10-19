export default function Loading() {
  return (
    <div className="flex min-h-[40dvh] items-center justify-center pt-2" role="status" aria-label="Loading">
      <span
        className="h-6 w-6 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--card-border)", borderTopColor: "var(--accent)" }}
      />
    </div>
  );
}
