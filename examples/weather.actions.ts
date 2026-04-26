'use server';

import { openWeatherApi } from './bridge';

/**
 * Example: OpenWeather API types
 */

export interface WeatherResponse {
  name: string;
  main: {
    temp: number;
    humidity: number;
  };
  weather: {
    main: string;
    description: string;
  }[];
}

/**
 * Example: OpenWeather action with query params
 */
export async function getWeatherExampleAction({
  apiKey,
  lat,
  lng,
}: {
  apiKey: string;
  lat: number;
  lng: number;
}) {
  return openWeatherApi.get<WeatherResponse>('/data/2.5/weather', {
    query: {
      lat,
      lon: lng,
      appid: apiKey,
      units: 'metric',
    },
  });
}
