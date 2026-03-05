import { OrderTrackingView } from "./OrderTrackingView";

type DashboardOrderTrackingPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardOrderTrackingPage({
  params,
}: DashboardOrderTrackingPageProps) {
  const { id } = await params;
  return <OrderTrackingView orderId={id} />;
}
