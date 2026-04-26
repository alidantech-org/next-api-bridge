/**
 * ANSI color codes for terminal output.
 * Colors are only applied in development mode.
 */
const useColor = process.env.NODE_ENV === 'development';

function color(code: number, value: string) {
  if (!useColor) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

export const colors = {
  red: (s: string) => color(31, s),
  green: (s: string) => color(32, s),
  yellow: (s: string) => color(33, s),
  blue: (s: string) => color(34, s),
  magenta: (s: string) => color(35, s),
  cyan: (s: string) => color(36, s),
  bold: (s: string) => color(1, s),
};
