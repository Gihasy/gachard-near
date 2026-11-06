/** Placeholders in the shape of what is coming, while the chain is read. */
export function CardGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skeleton aspect-[63/88] rounded-xl" />
          <div className="skeleton mt-3 h-3.5 w-3/4 rounded-full" />
          <div className="skeleton mt-2 h-3 w-1/3 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12" role="status">
      <span className="sr-only">{label}</span>
      <div className="skeleton h-9 w-56 rounded-full" />
      <div className="skeleton mt-4 h-4 w-80 max-w-full rounded-full" />
      <div className="skeleton mt-8 mb-8 h-16 rounded-2xl" />
      <CardGridSkeleton />
    </div>
  );
}
