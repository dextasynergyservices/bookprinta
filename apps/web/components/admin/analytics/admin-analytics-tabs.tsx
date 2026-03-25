"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebsiteAnalyticsView } from "./website-analytics-view";

type AdminAnalyticsTabsProps = {
  businessOverviewSlot: React.ReactNode;
};

export function AdminAnalyticsTabs({ businessOverviewSlot }: AdminAnalyticsTabsProps) {
  const t = useTranslations("admin");

  return (
    <Tabs defaultValue="business" className="w-full">
      <TabsList variant="line" className="mb-4 border-b border-[#1F1F1F] pb-0">
        <TabsTrigger
          value="business"
          className="font-sans rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2.5 pt-1 text-sm font-medium text-[#969696] transition-colors hover:bg-transparent hover:text-white data-[state=active]:border-[#007eff] data-[state=active]:text-white data-[state=active]:after:opacity-0"
        >
          {t("web_analytics_tab_business")}
        </TabsTrigger>
        <TabsTrigger
          value="website"
          className="font-sans rounded-none border-b-2 border-transparent bg-transparent px-4 pb-2.5 pt-1 text-sm font-medium text-[#969696] transition-colors hover:bg-transparent hover:text-white data-[state=active]:border-[#007eff] data-[state=active]:text-white data-[state=active]:after:opacity-0"
        >
          {t("web_analytics_tab_website")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="business" className="mt-0 outline-none">
        {businessOverviewSlot}
      </TabsContent>

      <TabsContent value="website" className="mt-0 outline-none">
        <WebsiteAnalyticsView />
      </TabsContent>
    </Tabs>
  );
}
