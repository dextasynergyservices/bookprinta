import { getTranslations } from "next-intl/server";

export default async function DashboardBooksPage() {
  const tDashboard = await getTranslations("dashboard");

  return (
    <section className="min-w-0">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-white lg:text-3xl">
        {tDashboard("my_books")}
      </h2>
    </section>
  );
}
