import { BooksDetailView } from "./BooksDetailView";

type DashboardBookDetailPageProps = {
  params: Promise<{
    bookId: string;
  }>;
};

export default async function DashboardBookDetailPage({ params }: DashboardBookDetailPageProps) {
  const { bookId } = await params;
  return <BooksDetailView bookId={bookId} />;
}
