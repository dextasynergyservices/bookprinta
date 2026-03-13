import { z } from "zod";

const MAX_ADDRESS_NAME_LENGTH = 200;
const MAX_ADDRESS_PHONE_LENGTH = 40;
const MAX_ADDRESS_STREET_LENGTH = 255;
const MAX_ADDRESS_LOCALITY_LENGTH = 120;
const MAX_ADDRESS_COUNTRY_LENGTH = 120;
const MAX_ADDRESS_POSTAL_CODE_LENGTH = 32;

function createOptionalNullableStringSchema(schema: z.ZodString) {
  return z
    .preprocess((value) => {
      if (typeof value !== "string") return value;

      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }, z.unknown())
    .pipe(schema.nullable().optional());
}

export const AddressIdSchema = z.string().cuid();
export type AddressId = z.infer<typeof AddressIdSchema>;

export const AddressFullNameSchema = z.string().trim().min(1).max(MAX_ADDRESS_NAME_LENGTH);
export type AddressFullName = z.infer<typeof AddressFullNameSchema>;

export const AddressPhoneNumberSchema = z.string().trim().min(1).max(MAX_ADDRESS_PHONE_LENGTH);
export type AddressPhoneNumber = z.infer<typeof AddressPhoneNumberSchema>;

export const AddressStreetSchema = z.string().trim().min(1).max(MAX_ADDRESS_STREET_LENGTH);
export type AddressStreet = z.infer<typeof AddressStreetSchema>;

export const AddressCitySchema = z.string().trim().min(1).max(MAX_ADDRESS_LOCALITY_LENGTH);
export type AddressCity = z.infer<typeof AddressCitySchema>;

export const AddressStateSchema = z.string().trim().min(1).max(MAX_ADDRESS_LOCALITY_LENGTH);
export type AddressState = z.infer<typeof AddressStateSchema>;

export const AddressCountrySchema = z.string().trim().min(1).max(MAX_ADDRESS_COUNTRY_LENGTH);
export type AddressCountry = z.infer<typeof AddressCountrySchema>;

export const AddressZipCodeSchema = z.string().trim().min(1).max(MAX_ADDRESS_POSTAL_CODE_LENGTH);
export type AddressZipCode = z.infer<typeof AddressZipCodeSchema>;

export const AddressSchema = z
  .object({
    id: AddressIdSchema,
    fullName: AddressFullNameSchema,
    phoneNumber: AddressPhoneNumberSchema,
    street: AddressStreetSchema,
    city: AddressCitySchema,
    state: AddressStateSchema,
    country: AddressCountrySchema,
    zipCode: AddressZipCodeSchema.nullable(),
    isDefault: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type Address = z.infer<typeof AddressSchema>;

export const AddressParamsSchema = z
  .object({
    id: AddressIdSchema,
  })
  .strict();
export type AddressParamsInput = z.infer<typeof AddressParamsSchema>;

export const CreateAddressBodySchema = z
  .object({
    fullName: AddressFullNameSchema,
    phoneNumber: AddressPhoneNumberSchema,
    street: AddressStreetSchema,
    city: AddressCitySchema,
    state: AddressStateSchema,
    country: AddressCountrySchema,
    zipCode: createOptionalNullableStringSchema(AddressZipCodeSchema),
    isDefault: z.boolean().optional(),
  })
  .strict();
export type CreateAddressBodyInput = z.infer<typeof CreateAddressBodySchema>;

export const UpdateAddressBodySchema = CreateAddressBodySchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "Provide at least one field to update"
);
export type UpdateAddressBodyInput = z.infer<typeof UpdateAddressBodySchema>;

export const AddressesListResponseSchema = z
  .object({
    items: z.array(AddressSchema),
  })
  .strict();
export type AddressesListResponse = z.infer<typeof AddressesListResponseSchema>;

export const CreateAddressResponseSchema = AddressSchema;
export type CreateAddressResponse = z.infer<typeof CreateAddressResponseSchema>;

export const UpdateAddressResponseSchema = AddressSchema;
export type UpdateAddressResponse = z.infer<typeof UpdateAddressResponseSchema>;

export const DeleteAddressResponseSchema = z
  .object({
    id: AddressIdSchema,
    deleted: z.literal(true),
  })
  .strict();
export type DeleteAddressResponse = z.infer<typeof DeleteAddressResponseSchema>;
