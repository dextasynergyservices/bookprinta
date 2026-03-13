import { AdminBookDetailView } from "./AdminBookDetailView";

type AdminBookDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminBookDetailPage({ params }: AdminBookDetailPageProps) {
  const { id } = await params;

  return <AdminBookDetailView bookId={id} />;
}
