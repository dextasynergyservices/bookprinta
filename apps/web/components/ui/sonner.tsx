"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="top-right"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!bg-[#1a1a2e] !border-white/10 !text-white !shadow-xl",
          title: "!text-white !font-semibold",
          description: "!text-white/60",
          success: "!bg-emerald-950/90 !border-emerald-500/30 !text-emerald-100",
          error: "!bg-red-950/90 !border-red-500/30 !text-red-100",
          warning: "!bg-amber-950/90 !border-amber-500/30 !text-amber-100",
          info: "!bg-blue-950/90 !border-blue-500/30 !text-blue-100",
        },
      }}
      style={
        {
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
