import { Button } from "@react-email/components";
import { BRAND } from "./EmailLayout";

interface EmailButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function EmailButton({ href, children, variant = "primary" }: EmailButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <Button
      href={href}
      style={{
        display: "inline-block",
        backgroundColor: isPrimary ? BRAND.black : BRAND.white,
        color: isPrimary ? BRAND.white : BRAND.black,
        fontFamily: BRAND.fontSans,
        fontSize: "15px",
        fontWeight: 600,
        textDecoration: "none",
        textAlign: "center" as const,
        padding: "14px 32px",
        borderRadius: "8px",
        border: isPrimary ? "none" : `2px solid ${BRAND.black}`,
        lineHeight: "100%",
      }}
    >
      {children}
    </Button>
  );
}
