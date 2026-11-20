import type { TrackingStep } from "@/lib/public-tracking-timeline";
import { dateOnly, dateTime, inputDate } from "@/lib/status";

export function LookupTimeline({
  steps,
  label,
}: {
  steps: TrackingStep[];
  label: string;
}) {
  if (!steps.length) return null;
  return (
    <ol className="timeline lookup-timeline" aria-label={label}>
      {steps.map((step) => (
        <li key={step.id}>
          <strong>{step.label}</strong>
          <time
            dateTime={
              step.dateOnly ? inputDate(step.occurredAt) : step.occurredAt
            }
          >
            {step.dateOnly
              ? dateOnly(step.occurredAt)
              : dateTime(step.occurredAt)}
          </time>
        </li>
      ))}
    </ol>
  );
}
