import { useQuery } from "@tanstack/react-query";

export type PackageFeature = {
  name: string;
  included: boolean;
  value?: string;
  group?: string; // e.g. "Print Specs", "Extras"
  originalText?: string;
};

export type Package = {
  id: string;
  key: string;
  name: string;
  description: string;
  basePrice: number;
  pageLimit: number;
  includesISBN: boolean;
  popular?: boolean;
  features: PackageFeature[];
};

export function usePackages() {
  return useQuery({
    queryKey: ["packages"],
    queryFn: () =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/packages`).then((r) => {
        if (!r.ok) {
          throw new Error("Network response was not ok");
        }
        return r.json().then((data: any[]) => {
          return data.map((pkg, index) => ({
            ...pkg,
            popular: index === 1, // highlight the middle package as recommended
            features: pkg.features.map((feat: string) => {
              let name = feat;
              let value: string | undefined;
              const group = "Features";

              if (feat.includes("copies, A5 size")) {
                name = "Printed Copies";
                value = feat.split(",")[0]; // "25 copies"
              } else if (feat.startsWith("Up to ") && feat.includes(" pages")) {
                name = "Page Limit";
                value = feat;
              } else if (feat.includes("Promo Flyers")) {
                const match = feat.match(/^(\d+)\s+(.+)$/);
                if (match) {
                  value = match[1];
                  name = match[2];
                }
              } else if (feat.includes("Promo Bookmarks")) {
                const match = feat.match(/^(\d+)\s+(.+)$/);
                if (match) {
                  value = match[1];
                  name = match[2];
                }
              } else if (feat.includes("e-Marketing Flyers")) {
                const match = feat.match(/^(\d+)\s+(.+)$/);
                if (match) {
                  value = match[1];
                  name = match[2];
                }
              }

              return {
                name,
                included: true,
                value,
                originalText: feat,
                group,
              };
            }),
          })) as Package[];
        });
      }),
    staleTime: 1000 * 60 * 10, // 10 minutes — packages change rarely
  });
}
