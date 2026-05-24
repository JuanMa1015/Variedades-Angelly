const Skeleton = ({ className = '', lines = 1 }) => {
  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-gray-200" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
    );
  }
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} />;
};

export const SkeletonTable = ({ rows = 5, cols = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex gap-4">
        {Array.from({ length: cols }, (_, j) => (
          <Skeleton key={j} className="h-5 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCard = () => (
  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <Skeleton className="mb-3 h-3 w-24" />
    <Skeleton className="h-8 w-20" />
  </div>
);

export default Skeleton;
