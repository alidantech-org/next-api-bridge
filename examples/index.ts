/**
 * Example exports for next-api-bridge.
 * These demonstrate real-world usage patterns with typed Server Actions.
 */

export { dummyJsonApi, openWeatherApi } from './bridge';

export {
  getProductsExampleAction,
  searchProductsExampleAction,
  createProductExampleAction,
  updateProductExampleAction,
  type Product,
  type ProductsResponse,
  type CreateProductBody,
  type CreateProductResponse,
  type UpdateProductBody,
  type UpdateProductResponse,
} from './products.actions';

export {
  getWeatherExampleAction,
  type WeatherResponse,
} from './weather.actions';
