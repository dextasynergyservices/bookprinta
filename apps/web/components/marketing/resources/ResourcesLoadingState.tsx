import { ResourceCardSkeleton } from "./ResourceCardSkeleton";

interface ResourcesLoadingStateProps {
  cards?: number;
  ariaLabel: string;
}

export function ResourcesLoadingState({ cards = 6, ariaLabel }: ResourcesLoadingStateProps) {
  const placeholders = Array.from({ length: cards }, (_, index) => `resource-skeleton-${index}`);

  return (
    <ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"
      aria-busy="true"
      aria-label={ariaLabel}
    >
      {placeholders.map((id) => (
        <li key={id} className="list-none">
          <ResourceCardSkeleton />
        </li>
      ))}
    </ul>
  );
}
