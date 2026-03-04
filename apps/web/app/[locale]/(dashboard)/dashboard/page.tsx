import { getTranslations } from "next-intl/server";

export default async function DashboardPage() {
  const tDashboard = await getTranslations("dashboard");

  return (
    <section className="min-w-0">
      <h1 className="font-display text-3xl font-bold tracking-tight text-white lg:text-4xl">
        {tDashboard("title")}
      </h1>
    </section>
  );
}
