"use client";

import type { Address } from "@bookprinta/shared";
import { MapPin, PencilLine, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type AddressCardProps = {
  address: Address;
  onDelete: (address: Address) => void;
  onEdit: (address: Address) => void;
};

function buildAddressLines(address: Address) {
  const localityLine = [address.city, address.state].filter(Boolean).join(", ");
  const countryLine = [address.country, address.zipCode].filter(Boolean).join(" ");

  return [address.street, localityLine, countryLine].filter((line) => line.length > 0);
}

export function AddressCard({ address, onDelete, onEdit }: AddressCardProps) {
  const tDashboard = useTranslations("dashboard");
  const addressLines = buildAddressLines(address);

  return (
    <article className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-2xl font-semibold tracking-tight text-white">
                {address.fullName}
              </h3>
              {address.isDefault ? (
                <span className="font-sans inline-flex min-h-8 items-center rounded-full border border-[#007eff]/40 bg-[#007eff]/12 px-3 text-[11px] font-semibold tracking-[0.16em] text-[#7fc0ff] uppercase">
                  {tDashboard("addresses_default_badge")}
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              <p className="font-sans text-sm font-medium text-white">{address.phoneNumber}</p>
              <div className="flex items-start gap-2 text-sm leading-6 text-[#BDBDBD]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[#007eff]" aria-hidden="true" />
                <div className="space-y-1">
                  {addressLines.map((line) => (
                    <p key={line} className="font-sans">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:w-auto sm:items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onEdit(address)}
              aria-label={tDashboard("addresses_edit_aria", { name: address.fullName })}
              className="font-sans min-h-11 w-full rounded-full border-[#2A2A2A] bg-[#0B0B0B] px-5 text-sm font-semibold text-white hover:border-[#007eff] hover:bg-[#141414] sm:w-auto"
            >
              <PencilLine className="mr-2 size-4" aria-hidden="true" />
              {tDashboard("addresses_edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onDelete(address)}
              aria-label={tDashboard("addresses_delete_aria", { name: address.fullName })}
              className="font-sans min-h-11 w-full rounded-full border-[#482020] bg-[#140909] px-5 text-sm font-semibold text-[#ffb2b2] hover:border-[#dc2626]/70 hover:bg-[#1d0d0d] sm:w-auto"
            >
              <Trash2 className="mr-2 size-4" aria-hidden="true" />
              {tDashboard("addresses_delete")}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
