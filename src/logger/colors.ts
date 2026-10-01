import type { BridgeLogColor } from '../types';

export interface TerminalColors {
  dim(value: string): string;
  red(value: string): string;
  green(value: string): string;
  yellow(value: string): string;
  cyan(value: string): string;
}

export function shouldUseColor(mode: BridgeLogColor): boolean {
  if (mode === false) return false;
  if (mode === true) return true;
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.TERM === 'dumb') return false;
  return Boolean(process.stdout?.isTTY);
}

function paint(enabled: boolean, code: number, value: string): string {
  if (!enabled) return value;
  return `\x1b[${code}m${value}\x1b[0m`;
}

export function createTerminalColors(enabled: boolean): TerminalColors {
  return {
    dim: (value) => paint(enabled, 2, value),
    red: (value) => paint(enabled, 31, value),
    green: (value) => paint(enabled, 32, value),
    yellow: (value) => paint(enabled, 33, value),
    cyan: (value) => paint(enabled, 36, value),
  };
}
