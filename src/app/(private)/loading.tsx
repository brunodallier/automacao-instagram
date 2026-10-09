export default function Loading() {
  return (
    <div className="loading-page" role="status" aria-label="Carregando página">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-description" />
      <div className="metric-grid">
        {[1, 2, 3, 4].map((id) => (
          <div className="skeleton skeleton-card" key={id} />
        ))}
      </div>
      <div className="skeleton skeleton-content" />
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
