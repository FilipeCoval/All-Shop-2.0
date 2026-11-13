export function BrandLogo({ className = '' }: { className?: string }) {
  return <span className={`allshop-logo ${className}`.trim()} role="img" aria-label="All-Shop">
    <svg viewBox="0 0 64 48" aria-hidden="true"><path d="M12 16h40l-4.2 24H16.2L12 16Z" /><path d="M23 16C23 8.8 26.8 4 32 4s9 4.8 9 12" /></svg>
    <span><b>All</b><strong>Shop</strong></span>
  </span>;
}
