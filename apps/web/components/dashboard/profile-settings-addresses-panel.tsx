"use client";

import type { Address, CreateAddressBodyInput } from "@bookprinta/shared";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AddressCard } from "@/components/dashboard/address-card";
import { AddressFormPanel } from "@/components/dashboard/address-form-panel";
import { AddressListSkeleton } from "@/components/dashboard/address-list-skeleton";
import { DeleteAddressDialog } from "@/components/dashboard/delete-address-dialog";
import { Button } from "@/components/ui/button";
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useUpdateAddress,
} from "@/hooks/use-addresses";

export function ProfileSettingsAddressesPanel() {
  const tDashboard = useTranslations("dashboard");
  const { addresses, error, isError, isFetching, isLoading, refetch } = useAddresses();
  const { createAddress, isPending: isCreating } = useCreateAddress();
  const { updateAddress, isPending: isUpdating } = useUpdateAddress();
  const { deleteAddress, isPending: isDeleting } = useDeleteAddress();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addressPendingDelete, setAddressPendingDelete] = useState<Address | null>(null);
  const returnFocusElementRef = useRef<HTMLElement | null>(null);

  const captureActiveTrigger = () => {
    returnFocusElementRef.current =
      typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  };

  const openCreatePanel = () => {
    captureActiveTrigger();
    setEditingAddress(null);
    setIsFormOpen(true);
  };

  const handleFormOpenChange = (open: boolean) => {
    setIsFormOpen(open);

    if (!open) {
      setEditingAddress(null);
    }
  };

  const handleDeleteOpenChange = (open: boolean) => {
    if (!open) {
      setAddressPendingDelete(null);
    }
  };

  const handleFormSubmit = async (input: CreateAddressBodyInput) => {
    if (editingAddress) {
      await updateAddress({
        addressId: editingAddress.id,
        input,
      });
      setIsFormOpen(false);
      setEditingAddress(null);
      toast.success(tDashboard("addresses_update_success"));
      return;
    }

    await createAddress(input);
    setIsFormOpen(false);
    toast.success(tDashboard("addresses_save_success"));
  };

  const handleDeleteConfirm = async () => {
    if (!addressPendingDelete) {
      return;
    }

    await deleteAddress({
      addressId: addressPendingDelete.id,
    });
    setAddressPendingDelete(null);
    toast.success(tDashboard("addresses_delete_success"));
  };

  return (
    <>
      <section data-testid="profile-settings-addresses-panel" className="grid gap-4">
        <div className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h2 className="font-display text-[2rem] font-semibold tracking-tight text-white">
                {tDashboard("addresses_intro_title")}
              </h2>
              <p className="font-sans max-w-2xl text-sm leading-6 text-[#BDBDBD]">
                {tDashboard("addresses_intro_description")}
              </p>
              {isFetching && !isLoading ? (
                <p className="font-sans text-[11px] font-semibold tracking-[0.16em] text-[#7fc0ff] uppercase">
                  {tDashboard("addresses_syncing")}
                </p>
              ) : null}
            </div>

            <Button
              type="button"
              onClick={openCreatePanel}
              className="font-sans min-h-12 w-full rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df] sm:w-auto"
            >
              <Plus className="mr-2 size-4" aria-hidden="true" />
              {tDashboard("addresses_add")}
            </Button>
          </div>
        </div>

        {isLoading && addresses.length === 0 ? <AddressListSkeleton /> : null}

        {isError ? (
          <section className="rounded-[32px] border border-[#2A2A2A] bg-[#111111] p-5">
            <h2 className="font-sans text-sm font-medium text-white">
              {tDashboard("addresses_load_error_title")}
            </h2>
            <p className="font-sans mt-2 text-sm leading-6 text-[#A3A3A3]">
              {error instanceof Error
                ? error.message
                : tDashboard("addresses_load_error_description")}
            </p>
            <Button
              type="button"
              onClick={() => {
                void refetch();
              }}
              className="font-sans mt-4 min-h-11 rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white hover:bg-[#0a72df]"
            >
              {tDashboard("addresses_retry")}
            </Button>
          </section>
        ) : null}

        {!isLoading && !isError && addresses.length === 0 ? (
          <section className="rounded-[32px] border border-dashed border-[#2A2A2A] bg-[#111111] px-5 py-12 text-center sm:px-8">
            <div className="mx-auto max-w-lg space-y-3">
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white">
                {tDashboard("addresses_empty_title")}
              </h2>
              <p className="font-sans text-sm leading-6 text-[#BDBDBD]">
                {tDashboard("addresses_empty_description")}
              </p>
            </div>
            <Button
              type="button"
              onClick={openCreatePanel}
              className="font-sans mt-6 min-h-12 w-full rounded-full bg-[#007eff] px-6 text-sm font-semibold text-white hover:bg-[#0a72df] sm:w-auto"
            >
              {tDashboard("addresses_add_first")}
            </Button>
          </section>
        ) : null}

        {!isLoading && !isError && addresses.length > 0 ? (
          <div className="grid gap-4">
            {addresses.map((address) => (
              <AddressCard
                key={address.id}
                address={address}
                onEdit={(selectedAddress) => {
                  captureActiveTrigger();
                  setEditingAddress(selectedAddress);
                  setIsFormOpen(true);
                }}
                onDelete={(selectedAddress) => {
                  captureActiveTrigger();
                  setAddressPendingDelete(selectedAddress);
                }}
              />
            ))}
          </div>
        ) : null}
      </section>

      <AddressFormPanel
        open={isFormOpen}
        address={editingAddress}
        isPending={isCreating || isUpdating}
        onOpenChange={handleFormOpenChange}
        onSubmit={handleFormSubmit}
        returnFocusElement={returnFocusElementRef.current}
      />

      <DeleteAddressDialog
        open={addressPendingDelete !== null}
        address={addressPendingDelete}
        isPending={isDeleting}
        onOpenChange={handleDeleteOpenChange}
        onConfirm={handleDeleteConfirm}
        returnFocusElement={returnFocusElementRef.current}
      />
    </>
  );
}
