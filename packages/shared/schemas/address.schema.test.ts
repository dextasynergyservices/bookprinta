import { describe, expect, it } from "bun:test";
import {
  AddressesListResponseSchema,
  AddressParamsSchema,
  CreateAddressBodySchema,
  DeleteAddressResponseSchema,
  UpdateAddressBodySchema,
} from "./address.schema";

const address = {
  id: "cmaddress111111111111111111111",
  fullName: "Ada Okafor",
  phoneNumber: "+2348012345678",
  street: "14 Marina Road",
  city: "Lagos",
  state: "Lagos",
  country: "Nigeria",
  zipCode: "101001",
  isDefault: true,
  createdAt: "2026-03-12T09:00:00.000Z",
  updatedAt: "2026-03-12T09:00:00.000Z",
} as const;

describe("address schema", () => {
  it("normalizes blank postal codes to null on create", () => {
    expect(
      CreateAddressBodySchema.parse({
        fullName: "  Ada Okafor  ",
        phoneNumber: "  +2348012345678  ",
        street: " 14 Marina Road ",
        city: " Lagos ",
        state: " Lagos ",
        country: " Nigeria ",
        zipCode: "   ",
      })
    ).toEqual({
      fullName: "Ada Okafor",
      phoneNumber: "+2348012345678",
      street: "14 Marina Road",
      city: "Lagos",
      state: "Lagos",
      country: "Nigeria",
      zipCode: null,
    });
  });

  it("rejects empty update payloads", () => {
    const result = UpdateAddressBodySchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Provide at least one field to update");
  });

  it("validates address params and list responses", () => {
    expect(AddressParamsSchema.parse({ id: address.id })).toEqual({ id: address.id });
    expect(
      AddressesListResponseSchema.parse({
        items: [address],
      })
    ).toEqual({
      items: [address],
    });
  });

  it("rejects invalid delete response payloads", () => {
    const result = DeleteAddressResponseSchema.safeParse({
      id: address.id,
      deleted: false,
    });

    expect(result.success).toBe(false);
  });
});
