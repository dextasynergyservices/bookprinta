import {
  normalizeAddressesListPayload,
  normalizeCreateAddressPayload,
  normalizeDeleteAddressPayload,
  normalizeUpdateAddressPayload,
} from "./addresses-contract";

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

describe("addresses contract normalization", () => {
  it("normalizes an enveloped addresses list payload", () => {
    const payload = {
      data: {
        items: [address],
      },
    };

    expect(normalizeAddressesListPayload(payload)).toEqual({
      items: [address],
    });
  });

  it("normalizes direct create and update payloads", () => {
    expect(normalizeCreateAddressPayload(address)).toEqual(address);
    expect(
      normalizeUpdateAddressPayload({
        data: address,
      })
    ).toEqual(address);
  });

  it("normalizes delete payloads", () => {
    expect(
      normalizeDeleteAddressPayload({
        data: {
          id: address.id,
          deleted: true,
        },
      })
    ).toEqual({
      id: address.id,
      deleted: true,
    });
  });

  it("throws when the addresses list payload cannot be normalized", () => {
    expect(() => normalizeAddressesListPayload({ data: { items: [{ id: "broken" }] } })).toThrow(
      "Unable to normalize addresses response"
    );
  });

  it("throws when the create payload cannot be normalized", () => {
    expect(() => normalizeCreateAddressPayload({ data: { id: address.id } })).toThrow(
      "Unable to normalize address creation response"
    );
  });

  it("throws when the update payload cannot be normalized", () => {
    expect(() => normalizeUpdateAddressPayload({ invalid: true })).toThrow(
      "Unable to normalize address update response"
    );
  });

  it("throws when the delete payload cannot be normalized", () => {
    expect(() =>
      normalizeDeleteAddressPayload({ data: { id: address.id, deleted: false } })
    ).toThrow("Unable to normalize address deletion response");
  });
});
