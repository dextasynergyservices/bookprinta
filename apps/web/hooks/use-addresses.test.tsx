import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  createAddressRequest,
  DASHBOARD_ADDRESSES_QUERY_KEY,
  deleteAddressRequest,
  fetchAddresses,
  updateAddressRequest,
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useUpdateAddress,
} from "./use-addresses";

const throwApiErrorMock = jest.fn();

jest.mock("@/lib/api-error", () => ({
  throwApiError: (...args: unknown[]) => throwApiErrorMock(...args),
}));

const addressOne = {
  id: "cmaddress111111111111111111111",
  fullName: "Ada Okafor",
  phoneNumber: "+2348012345678",
  street: "14 Marina Road",
  city: "Lagos",
  state: "Lagos",
  country: "Nigeria",
  zipCode: "101001",
  isDefault: false,
  createdAt: "2026-03-10T09:00:00.000Z",
  updatedAt: "2026-03-10T09:00:00.000Z",
} as const;

const addressTwo = {
  id: "cmaddress222222222222222222222",
  fullName: "Grace Bello",
  phoneNumber: "+2348098765432",
  street: "7 Admiralty Way",
  city: "Lekki",
  state: "Lagos",
  country: "Nigeria",
  zipCode: "106104",
  isDefault: true,
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
} as const;

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("use-addresses data layer", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("fetchAddresses requests /addresses with credentials and normalizes response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        data: {
          items: [addressTwo, addressOne],
        },
      }),
    } as unknown as Response);

    const result = await fetchAddresses();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/addresses"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    );
    expect(result).toEqual({
      items: [addressTwo, addressOne],
    });
  });

  it("delegates failed address fetches to throwApiError", async () => {
    const expectedError = new Error("Unable to load your addresses");
    throwApiErrorMock.mockRejectedValueOnce(expectedError);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: jest.fn().mockResolvedValue({ message: "Internal Server Error" }),
      headers: { get: jest.fn().mockReturnValue(null) },
    } as unknown as Response);

    await expect(fetchAddresses()).rejects.toThrow(expectedError);
    expect(throwApiErrorMock).toHaveBeenCalledTimes(1);
  });

  it("sends POST, PATCH, and DELETE requests to the addresses endpoints", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(addressTwo),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            ...addressOne,
            city: "Victoria Island",
            updatedAt: "2026-03-12T11:00:00.000Z",
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            id: addressOne.id,
            deleted: true,
          },
        }),
      } as unknown as Response);

    await expect(
      createAddressRequest({
        fullName: addressTwo.fullName,
        phoneNumber: addressTwo.phoneNumber,
        street: addressTwo.street,
        city: addressTwo.city,
        state: addressTwo.state,
        country: addressTwo.country,
        zipCode: addressTwo.zipCode,
        isDefault: addressTwo.isDefault,
      })
    ).resolves.toEqual(addressTwo);

    await expect(
      updateAddressRequest({
        addressId: addressOne.id,
        input: {
          city: "Victoria Island",
        },
      })
    ).resolves.toMatchObject({
      id: addressOne.id,
      city: "Victoria Island",
    });

    await expect(
      deleteAddressRequest({
        addressId: addressOne.id,
      })
    ).resolves.toEqual({
      id: addressOne.id,
      deleted: true,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/api/v1/addresses");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`/api/v1/addresses/${addressOne.id}`);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "PATCH",
      credentials: "include",
    });
    expect(fetchMock.mock.calls[2]?.[0]).toContain(`/api/v1/addresses/${addressOne.id}`);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "DELETE",
      credentials: "include",
    });
  });

  it("updates the cached address list after create, update, and delete mutations", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    client.setQueryData(DASHBOARD_ADDRESSES_QUERY_KEY, {
      items: [addressOne],
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(addressTwo),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            ...addressOne,
            isDefault: false,
            city: "Victoria Island",
            updatedAt: "2026-03-12T12:00:00.000Z",
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            id: addressOne.id,
            deleted: true,
          },
        }),
      } as unknown as Response);

    const createHook = renderHook(() => useCreateAddress(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await createHook.result.current.createAddress({
        fullName: addressTwo.fullName,
        phoneNumber: addressTwo.phoneNumber,
        street: addressTwo.street,
        city: addressTwo.city,
        state: addressTwo.state,
        country: addressTwo.country,
        zipCode: addressTwo.zipCode,
        isDefault: addressTwo.isDefault,
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<{
          items: Array<{ id: string }>;
        }>(DASHBOARD_ADDRESSES_QUERY_KEY)
      ).toMatchObject({
        items: [{ id: addressTwo.id }, { id: addressOne.id }],
      });
    });

    const updateHook = renderHook(() => useUpdateAddress(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await updateHook.result.current.updateAddress({
        addressId: addressOne.id,
        input: {
          city: "Victoria Island",
        },
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<{
          items: Array<{ id: string; city: string }>;
        }>(DASHBOARD_ADDRESSES_QUERY_KEY)
      ).toMatchObject({
        items: [
          { id: addressTwo.id, city: "Lekki" },
          { id: addressOne.id, city: "Victoria Island" },
        ],
      });
    });

    const deleteHook = renderHook(() => useDeleteAddress(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await deleteHook.result.current.deleteAddress({
        addressId: addressOne.id,
      });
    });

    await waitFor(() => {
      expect(
        client.getQueryData<{
          items: Array<{ id: string }>;
        }>(DASHBOARD_ADDRESSES_QUERY_KEY)
      ).toEqual({
        items: [addressTwo],
      });
    });
  });

  it("refetches the active addresses query after a mutation so server-side default changes stay in sync", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const serverUpdatedDefaultAddress = {
      ...addressOne,
      isDefault: true,
      updatedAt: "2026-03-12T13:00:00.000Z",
    };
    const serverDemotedAddress = {
      ...addressTwo,
      isDefault: false,
      updatedAt: "2026-03-12T13:00:00.000Z",
    };

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            items: [addressTwo, addressOne],
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: serverUpdatedDefaultAddress,
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: {
            items: [serverUpdatedDefaultAddress, serverDemotedAddress],
          },
        }),
      } as unknown as Response);

    const addressesHook = renderHook(() => useAddresses(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(addressesHook.result.current.addresses).toEqual([addressTwo, addressOne]);
    });

    const updateHook = renderHook(() => useUpdateAddress(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await updateHook.result.current.updateAddress({
        addressId: addressOne.id,
        input: {
          isDefault: true,
        },
      });
    });

    await waitFor(() => {
      expect(addressesHook.result.current.addresses).toEqual([
        serverUpdatedDefaultAddress,
        serverDemotedAddress,
      ]);
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/api/v1/addresses"),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
  });
});
