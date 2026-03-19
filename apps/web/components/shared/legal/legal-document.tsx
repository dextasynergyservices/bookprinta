import type { ReactNode } from "react";

export type LegalDocumentTextBlock = {
  id: string;
  content: ReactNode;
};

export type LegalDocumentSectionData = {
  id: string;
  title: string;
  paragraphs?: LegalDocumentTextBlock[];
  content?: ReactNode;
  bodyClassName?: string;
};

type LegalDocumentProps = {
  title: string;
  lastUpdatedLabel: string;
  lastUpdatedDate: string;
  intro?: LegalDocumentTextBlock[];
  sections: LegalDocumentSectionData[];
  className?: string;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function LegalSection({ index, section }: { index: number; section: LegalDocumentSectionData }) {
  const bodyClassName =
    section.bodyClassName ??
    "space-y-4 font-serif text-[1.02rem] leading-8 text-foreground/80 sm:text-[1.08rem]";

  return (
    <section
      aria-labelledby={section.id}
      data-legal-section="true"
      className="px-5 py-7 sm:px-8 sm:py-9 lg:px-12 lg:py-10"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-10">
        <div className="space-y-3">
          <p className="font-sans text-[0.68rem] font-medium uppercase tracking-[0.28em] text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </p>
          <h2
            id={section.id}
            className="font-display text-xl leading-tight text-foreground sm:text-2xl"
          >
            {section.title}
          </h2>
        </div>

        <div data-legal-section-body="true" className={bodyClassName}>
          {section.content ??
            section.paragraphs?.map((paragraph) => <p key={paragraph.id}>{paragraph.content}</p>)}
        </div>
      </div>
    </section>
  );
}

export function LegalDocument({
  title,
  lastUpdatedLabel,
  lastUpdatedDate,
  intro = [],
  sections,
  className,
}: LegalDocumentProps) {
  return (
    <section
      className={joinClasses(
        "relative mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8 lg:pb-24 lg:pt-12",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-4 top-0 h-40 rounded-[2rem] bg-gradient-to-b from-muted/90 via-muted/35 to-transparent sm:inset-x-6 lg:inset-x-8"
      />

      <article
        data-legal-document="true"
        className="relative overflow-hidden rounded-[2rem] border border-border bg-background shadow-[0_20px_60px_-40px_rgba(0,0,0,0.35)]"
      >
        <div className="h-1.5 w-full bg-primary" />

        <header className="border-b border-border bg-muted/35 px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
            <div className="max-w-3xl space-y-4">
              <h1 className="font-display text-4xl leading-none tracking-[-0.04em] text-foreground sm:text-5xl lg:text-6xl">
                {title}
              </h1>

              {intro.length > 0 ? (
                <div
                  data-legal-intro="true"
                  className="max-w-2xl space-y-4 font-serif text-[1.04rem] leading-8 text-foreground/80 sm:text-[1.1rem]"
                >
                  {intro.map((paragraph) => (
                    <p key={paragraph.id}>{paragraph.content}</p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 rounded-full border border-border bg-background px-4 py-2 text-left md:text-right">
              <p className="font-sans text-sm text-foreground">
                {lastUpdatedLabel} {lastUpdatedDate}
              </p>
            </div>
          </div>
        </header>

        <div className="divide-y divide-border">
          {sections.map((section, index) => (
            <LegalSection key={section.id} index={index} section={section} />
          ))}
        </div>
      </article>
    </section>
  );
}
