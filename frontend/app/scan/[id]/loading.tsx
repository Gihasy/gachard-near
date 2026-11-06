export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 grid md:grid-cols-[minmax(240px,340px)_1fr] gap-8 lg:gap-12" role="status">
      <span className="sr-only">Reading this card from the public record</span>
      <div className="skeleton aspect-[63/88] rounded-2xl max-w-[300px] md:max-w-none mx-auto w-full" />
      <div className="space-y-4">
        <div className="skeleton h-4 w-32 rounded-full" />
        <div className="skeleton h-10 w-64 rounded-full" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
        <div className="skeleton h-40 rounded-2xl" />
      </div>
    </div>
  );
}
