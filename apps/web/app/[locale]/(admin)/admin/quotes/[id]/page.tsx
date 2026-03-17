import { AdminQuoteDetailView } from "./AdminQuoteDetailView";

type AdminQuoteDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminQuoteDetailPage({ params }: AdminQuoteDetailPageProps) {
  const { id } = await params;

  return <AdminQuoteDetailView quoteId={id} />;
}
