"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SUPPORT_WHATSAPP_URL = "https://wa.me/2348103208297";

type DashboardRefundPolicyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DashboardRefundPolicyDialog({
  open,
  onOpenChange,
}: DashboardRefundPolicyDialogProps) {
  const tDashboard = useTranslations("dashboard");
  const tRefund = useTranslations("legal_refund");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto border-[#2A2A2A] bg-[#111111] p-5 text-white sm:p-6">
        <DialogHeader className="space-y-2 text-left">
          <DialogTitle className="font-display text-2xl font-semibold tracking-tight text-white">
            {tDashboard("order_tracking_refund_policy_modal_title")}
          </DialogTitle>
          <DialogDescription className="font-sans text-sm text-[#d0d0d0]">
            {tDashboard("order_tracking_refund_policy_modal_subtitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="font-sans text-xs text-[#8f8f8f]">{tRefund("updated")}</p>
          <p className="font-sans text-sm text-[#d8d8d8]">
            {tDashboard("order_tracking_refund_policy_modal_intro")}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#2A2A2A]">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[#2A2A2A] bg-[#0A0A0A] px-3 py-2">
            <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#9d9d9d] uppercase">
              {tDashboard("order_tracking_refund_policy_stage_header")}
            </p>
            <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-[#9d9d9d] uppercase">
              {tDashboard("order_tracking_refund_policy_amount_header")}
            </p>
          </div>
          <div className="space-y-0 divide-y divide-[#2A2A2A]">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
              <p className="font-sans text-sm text-[#d8d8d8]">
                {tDashboard("order_tracking_refund_policy_rule_before_processing")}
              </p>
              <p className="font-sans text-sm font-semibold text-[#007eff]">
                {tDashboard("order_tracking_refund_policy_rule_before_processing_amount")}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
              <p className="font-sans text-sm text-[#d8d8d8]">
                {tDashboard("order_tracking_refund_policy_rule_ai_processing")}
              </p>
              <p className="font-sans text-sm font-semibold text-[#facc15]">
                {tDashboard("order_tracking_refund_policy_rule_ai_processing_amount")}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
              <p className="font-sans text-sm text-[#d8d8d8]">
                {tDashboard("order_tracking_refund_policy_rule_after_approval")}
              </p>
              <p className="font-sans text-sm font-semibold text-[#ef4444]">
                {tDashboard("order_tracking_refund_policy_rule_after_approval_amount")}
              </p>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-3">
              <p className="font-sans text-sm text-[#d8d8d8]">
                {tDashboard("order_tracking_refund_policy_rule_after_printing")}
              </p>
              <p className="font-sans text-sm font-semibold text-[#ef4444]">
                {tDashboard("order_tracking_refund_policy_rule_after_printing_amount")}
              </p>
            </div>
          </div>
        </div>

        <p className="font-sans text-sm text-[#d0d0d0]">
          {tDashboard("order_tracking_refund_policy_modal_support")}
        </p>

        <div className="flex flex-wrap gap-2">
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans inline-flex min-h-11 items-center justify-center rounded-full bg-[#007eff] px-5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-[#0066d1] focus-visible:outline-2 focus-visible:outline-[#007eff] focus-visible:outline-offset-2"
          >
            {tDashboard("order_tracking_refund_policy_modal_contact")}
          </a>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-sans min-h-11 rounded-full border-[#2A2A2A] bg-[#000000] px-5 text-sm text-white hover:border-[#007eff] hover:bg-[#151515]"
          >
            {tDashboard("order_tracking_refund_policy_modal_close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
