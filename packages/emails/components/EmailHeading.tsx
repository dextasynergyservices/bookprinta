import { Heading } from "@react-email/components";
import { BRAND } from "./EmailLayout";

interface EmailHeadingProps {
  children: React.ReactNode;
  as?: "h1" | "h2" | "h3";
}

export function EmailHeading({ children, as = "h1" }: EmailHeadingProps) {
  const sizes = {
    h1: { fontSize: "26px", lineHeight: "34px" },
    h2: { fontSize: "20px", lineHeight: "28px" },
    h3: { fontSize: "16px", lineHeight: "24px" },
  };

  return (
    <Heading
      as={as}
      style={{
        fontFamily: BRAND.fontDisplay,
        fontWeight: 700,
        color: BRAND.black,
        margin: "0 0 16px",
        ...sizes[as],
      }}
    >
      {children}
    </Heading>
  );
}
