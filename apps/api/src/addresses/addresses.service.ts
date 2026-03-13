import type {
  Address,
  AddressesListResponse,
  CreateAddressBodyInput,
  CreateAddressResponse,
  DeleteAddressResponse,
  UpdateAddressBodyInput,
  UpdateAddressResponse,
} from "@bookprinta/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";

const ADDRESS_LINKED_TO_ORDER_ERROR =
  "This address is already linked to an active or historical order and cannot be deleted.";

const ADDRESS_SELECT = {
  id: true,
  fullName: true,
  phoneNumber: true,
  street: true,
  city: true,
  state: true,
  country: true,
  zipCode: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

type AddressRow = Prisma.AddressGetPayload<{ select: typeof ADDRESS_SELECT }>;

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyAddresses(userId: string): Promise<AddressesListResponse> {
    const items = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: ADDRESS_SELECT,
    });

    return {
      items: items.map((item) => this.serializeAddress(item)),
    };
  }

  async createAddress(
    userId: string,
    input: CreateAddressBodyInput
  ): Promise<CreateAddressResponse> {
    const created = await this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.address.count({
        where: { userId },
      });
      const isDefault = existingCount === 0 ? true : input.isDefault === true;

      if (isDefault && existingCount > 0) {
        await tx.address.updateMany({
          where: {
            userId,
            isDefault: true,
          },
          data: {
            isDefault: false,
          },
        });
      }

      return tx.address.create({
        data: {
          userId,
          fullName: input.fullName,
          phoneNumber: input.phoneNumber,
          street: input.street,
          city: input.city,
          state: input.state,
          country: input.country,
          zipCode: input.zipCode ?? null,
          isDefault,
        },
        select: ADDRESS_SELECT,
      });
    });

    return this.serializeAddress(created);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    input: UpdateAddressBodyInput
  ): Promise<UpdateAddressResponse> {
    await this.getOwnedAddressOrThrow(userId, addressId);

    const data = this.buildUpdateData(input);

    const updated =
      input.isDefault === true
        ? await this.prisma.$transaction(async (tx) => {
            await tx.address.updateMany({
              where: {
                userId,
                isDefault: true,
                NOT: {
                  id: addressId,
                },
              },
              data: {
                isDefault: false,
              },
            });

            return tx.address.update({
              where: { id: addressId },
              data,
              select: ADDRESS_SELECT,
            });
          })
        : await this.prisma.address.update({
            where: { id: addressId },
            data,
            select: ADDRESS_SELECT,
          });

    return this.serializeAddress(updated);
  }

  async deleteAddress(userId: string, addressId: string): Promise<DeleteAddressResponse> {
    const address = await this.getOwnedAddressOrThrow(userId, addressId);

    const linkedOrdersCount = await this.prisma.order.count({
      where: {
        shippingAddressId: addressId,
      },
    });

    if (linkedOrdersCount > 0) {
      throw new ConflictException(ADDRESS_LINKED_TO_ORDER_ERROR);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.address.delete({
          where: { id: addressId },
        });

        if (!address.isDefault) {
          return;
        }

        const nextDefault = await tx.address.findFirst({
          where: { userId },
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
          },
        });

        if (!nextDefault) {
          return;
        }

        await tx.address.update({
          where: { id: nextDefault.id },
          data: {
            isDefault: true,
          },
        });
      });
    } catch (error) {
      if (this.isPrismaForeignKeyViolation(error)) {
        throw new ConflictException(ADDRESS_LINKED_TO_ORDER_ERROR);
      }

      throw error;
    }

    return {
      id: addressId,
      deleted: true,
    };
  }

  private async getOwnedAddressOrThrow(userId: string, addressId: string): Promise<AddressRow> {
    const address = await this.prisma.address.findFirst({
      where: {
        id: addressId,
        userId,
      },
      select: ADDRESS_SELECT,
    });

    if (!address) {
      throw new NotFoundException(`Address "${addressId}" not found`);
    }

    return address;
  }

  private buildUpdateData(input: UpdateAddressBodyInput): Prisma.AddressUpdateInput {
    const data: Prisma.AddressUpdateInput = {};

    if (input.fullName !== undefined) {
      data.fullName = input.fullName;
    }

    if (input.phoneNumber !== undefined) {
      data.phoneNumber = input.phoneNumber;
    }

    if (input.street !== undefined) {
      data.street = input.street;
    }

    if (input.city !== undefined) {
      data.city = input.city;
    }

    if (input.state !== undefined) {
      data.state = input.state;
    }

    if (input.country !== undefined) {
      data.country = input.country;
    }

    if ("zipCode" in input) {
      data.zipCode = input.zipCode ?? null;
    }

    if (input.isDefault !== undefined) {
      data.isDefault = input.isDefault;
    }

    return data;
  }

  private serializeAddress(row: AddressRow): Address {
    return {
      id: row.id,
      fullName: row.fullName,
      phoneNumber: row.phoneNumber,
      street: row.street,
      city: row.city,
      state: row.state,
      country: row.country,
      zipCode: row.zipCode ?? null,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private isPrismaForeignKeyViolation(error: unknown): boolean {
    return Boolean(
      error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2003"
    );
  }
}
