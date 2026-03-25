import { AdminAnalyticsTabs } from "@/components/admin/analytics/admin-analytics-tabs";
import { AdminAnalyticsLanding } from "../AdminAnalyticsLanding";

export default function AdminAnalyticsPage() {
  return <AdminAnalyticsTabs businessOverviewSlot={<AdminAnalyticsLanding />} />;
}
