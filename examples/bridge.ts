import { createNextApiBridge } from '../src';

/**
 * Example API bridge instances for different external APIs.
 * These demonstrate how to create multiple bridge instances for different backends.
 */

export const dummyJsonApi = createNextApiBridge({
  baseUrl: 'https://dummyjson.com',
});

export const openWeatherApi = createNextApiBridge({
  baseUrl: 'https://api.openweathermap.org',
});
