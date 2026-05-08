import type { ErrorHelp } from "@/lib/error-help";

type ErrorHelpPanelProps = {
  help: ErrorHelp;
};

export function ErrorHelpPanel({ help }: ErrorHelpPanelProps) {
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-[var(--card-shadow)]">
      <div className="text-xs uppercase tracking-[0.25em] text-amber-700">Recovery Guidance</div>
      <div className="mt-2 text-base font-semibold">{help.title}</div>
      <p className="mt-2 text-sm text-amber-900">{help.message}</p>
      {help.actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {help.actions.map((action) => (
            <span
              key={action}
              className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-amber-800"
            >
              {action}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
