import { useQuery } from "@tanstack/react-query";

function getApiV1BaseUrl() {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/+$/, "");

  if (base.endsWith("/api/v1")) return base;
  if (base.endsWith("/api")) return `${base}/v1`;
  return `${base}/api/v1`;
}

const API_V1_BASE_URL = getApiV1BaseUrl();

export type Addon = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  pricingType: "fixed" | "per_word";
  price: number | null;
  pricePerWord: number | null;
  sortOrder: number;
  isActive: boolean;
};

export function useAddons() {
  return useQuery<Addon[]>({
    queryKey: ["addons"],
    queryFn: async () => {
      const res = await fetch(`${API_V1_BASE_URL}/addons`);
      if (!res.ok) throw new Error("Failed to fetch addons");
      const addons = (await res.json()) as Addon[];
      return addons.sort((a, b) => a.sortOrder - b.sortOrder);
    },
    staleTime: 1000 * 60 * 10,
  });
}
