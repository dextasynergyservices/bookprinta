import { create } from "zustand";

export type BookSize = "A4" | "A5" | "A6";
export type PaperColor = "white" | "cream";
export type Lamination = "matt" | "gloss";

type NullableBoolean = boolean | null;

export interface PricingState {
  hasCoverDesign: NullableBoolean;
  hasFormatting: NullableBoolean;
  bookSize: BookSize | null;
  paperColor: PaperColor | null;
  lamination: Lamination | null;
  setHasCoverDesign: (value: NullableBoolean) => void;
  setHasFormatting: (value: NullableBoolean) => void;
  setBookSize: (value: BookSize | null) => void;
  setPaperColor: (value: PaperColor | null) => void;
  setLamination: (value: Lamination | null) => void;
  resetConfiguration: () => void;
}

const INITIAL_STATE = {
  hasCoverDesign: null,
  hasFormatting: null,
  bookSize: null,
  paperColor: null,
  lamination: null,
} satisfies Pick<
  PricingState,
  "hasCoverDesign" | "hasFormatting" | "bookSize" | "paperColor" | "lamination"
>;

export const usePricingStore = create<PricingState>((set) => ({
  ...INITIAL_STATE,
  setHasCoverDesign: (value) => set({ hasCoverDesign: value }),
  setHasFormatting: (value) => set({ hasFormatting: value }),
  setBookSize: (value) => set({ bookSize: value }),
  setPaperColor: (value) => set({ paperColor: value }),
  setLamination: (value) => set({ lamination: value }),
  resetConfiguration: () => set(INITIAL_STATE),
}));

export function isPricingConfigurationComplete(
  state: Pick<PricingState, keyof typeof INITIAL_STATE>
) {
  return (
    state.hasCoverDesign !== null &&
    state.hasFormatting !== null &&
    state.bookSize !== null &&
    state.paperColor !== null &&
    state.lamination !== null
  );
}
