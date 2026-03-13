jest.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { getAddressFormMotionProps } from "./address-form-panel";
import { getDeleteAddressDialogMotionProps } from "./delete-address-dialog";

describe("address motion helpers", () => {
  it("uses a bottom-sheet motion path for the mobile address form", () => {
    expect(getAddressFormMotionProps(false, true)).toEqual({
      overlay: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.18, ease: "easeOut" },
      },
      panel: {
        initial: { y: "100%" },
        animate: { y: 0 },
        exit: { y: "100%" },
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      },
    });
  });

  it("uses a right-side slide motion path for the desktop address form", () => {
    expect(getAddressFormMotionProps(false, false)).toEqual({
      overlay: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.18, ease: "easeOut" },
      },
      panel: {
        initial: { x: "100%" },
        animate: { x: 0 },
        exit: { x: "100%" },
        transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
      },
    });
  });

  it("uses a centered scale-and-fade motion path for the delete confirmation dialog", () => {
    expect(getDeleteAddressDialogMotionProps(false)).toEqual({
      overlay: {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.18, ease: "easeOut" },
      },
      panel: {
        initial: { opacity: 0, scale: 0.96, y: 16 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.97, y: 12 },
        transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
      },
    });
  });

  it("disables motion for the mobile address form when reduced motion is preferred", () => {
    expect(getAddressFormMotionProps(true, true)).toEqual({
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { y: 0 },
        animate: { y: 0 },
        exit: { y: 0 },
        transition: { duration: 0 },
      },
    });
  });

  it("disables motion for the desktop address form when reduced motion is preferred", () => {
    expect(getAddressFormMotionProps(true, false)).toEqual({
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { x: 0 },
        animate: { x: 0 },
        exit: { x: 0 },
        transition: { duration: 0 },
      },
    });
  });

  it("disables motion for the delete confirmation dialog when reduced motion is preferred", () => {
    expect(getDeleteAddressDialogMotionProps(true)).toEqual({
      overlay: {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
        transition: { duration: 0 },
      },
      panel: {
        initial: { opacity: 1, scale: 1, y: 0 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 1, scale: 1, y: 0 },
        transition: { duration: 0 },
      },
    });
  });
});
