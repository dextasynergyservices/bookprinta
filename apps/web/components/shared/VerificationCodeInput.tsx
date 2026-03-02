"use client";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";

const DEFAULT_CODE_LENGTH = 6;

type VerificationCodeInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  codeLength?: number;
  align?: "start" | "center";
};

function sanitizeCode(value: string, codeLength: number) {
  return value.replace(/\D/g, "").slice(0, codeLength);
}

export function VerificationCodeInput({
  id,
  label,
  value,
  onChange,
  onComplete,
  disabled = false,
  required = false,
  codeLength = DEFAULT_CODE_LENGTH,
  align = "start",
}: VerificationCodeInputProps) {
  const normalizedValue = sanitizeCode(value, codeLength);
  const slotIndexes = Array.from({ length: codeLength }, (_, slot) => slot);
  const isCentered = align === "center";

  return (
    <div className={cn("space-y-2", isCentered && "text-center")}>
      <label
        htmlFor={id}
        className={cn(
          "font-sans text-xs font-medium tracking-[0.08em] text-white/55 uppercase",
          isCentered && "block text-center"
        )}
      >
        {label}
      </label>
      <InputOTP
        id={id}
        maxLength={codeLength}
        value={normalizedValue}
        onChange={(nextValue) => onChange(sanitizeCode(nextValue, codeLength))}
        onComplete={(completeValue) => onComplete?.(sanitizeCode(completeValue, codeLength))}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        aria-label={label}
        disabled={disabled}
        required={required}
        containerClassName={cn("gap-2", isCentered ? "justify-center" : "justify-start")}
        className="font-sans text-white"
      >
        <InputOTPGroup className={cn("gap-2", isCentered && "justify-center")}>
          {slotIndexes.map((slot) => (
            <InputOTPSlot
              key={`otp-slot-${slot}`}
              index={slot}
              className="h-11 w-11 rounded-xl border border-white/15 bg-black text-sm font-semibold text-white shadow-none first:rounded-xl first:border last:rounded-xl last:border data-[active=true]:border-[#007eff] data-[active=true]:ring-2 data-[active=true]:ring-[#007eff]/35"
            />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}
