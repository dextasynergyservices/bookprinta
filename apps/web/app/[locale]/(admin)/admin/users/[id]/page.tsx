import { AdminUserDetailView } from "./AdminUserDetailView";

type AdminUserDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps) {
  const { id } = await params;

  return <AdminUserDetailView userId={id} />;
}
