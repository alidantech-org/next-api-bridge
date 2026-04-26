"use server";

import { dummyJsonApi } from "./bridge";
import { getCleanFormData } from "../src/form";

/**
 * Example: Product types for DummyJSON API
 */

export interface Product {
  id: number;
  title: string;
  price: number;
  thumbnail: string;
}

export interface ProductsResponse {
  products: Product[];
  total: number;
  skip: number;
  limit: number;
}

/**
 * Example: Typed GET request
 */
export async function getProductsExampleAction() {
  return dummyJsonApi.get<ProductsResponse>("/products");
}

/**
 * Example: Search with query params
 */
export async function searchProductsExampleAction(search: string) {
  return dummyJsonApi.get<ProductsResponse>("/products/search", {
    query: {
      q: search,
    },
  });
}

/**
 * Example: Typed form submit
 */
export interface CreateProductBody {
  title: string;
  price: number;
  description: string;
}

export interface CreateProductResponse {
  id: number;
  title: string;
  price: number;
  description: string;
}

export async function createProductExampleAction(
  _prev: unknown,
  data: FormData,
) {
  const body = getCleanFormData<CreateProductBody>(data, {
    number: ["price"],
  });

  const response = await dummyJsonApi.post<CreateProductResponse>(
    "/products/add",
    body,
  );

  return {
    formdata: body,
    ...response,
  };
}

/**
 * Example: Typed PATCH request
 */
export interface UpdateProductBody {
  title?: string;
  price?: number;
}

export interface UpdateProductResponse {
  id: number;
  title: string;
  price: number;
}

export async function updateProductExampleAction(
  id: number,
  _prev: unknown,
  data: FormData,
) {
  const body = getCleanFormData<UpdateProductBody>(data, {
    number: ["price"],
  });

  return dummyJsonApi.patch<UpdateProductResponse>(`/products/${id}`, body);
}
