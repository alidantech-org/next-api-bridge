import { colors } from './colors';

export type VerboseLogOption = 'request' | 'body' | 'response';

/**
 * Check if specific verbose logging option is enabled.
 */
export function shouldLog(option: VerboseLogOption, verbose?: string): boolean {
  return (verbose ?? '')
    .toLowerCase()
    .split(',')
    .map((opt) => opt.trim())
    .filter(Boolean)
    .includes(option);
}

/**
 * Logs a message with optional status and success flag.
 * Determines color based on success flag and status code.
 */
export function log(message: string, status?: number, success?: boolean): void {
  const nodeEnv = process.env.NODE_ENV;
  const shouldLogError = nodeEnv !== 'test';
  const shouldLogSuccess = nodeEnv === 'development';

  let coloredMessage = message;

  if (status !== undefined) {
    coloredMessage = `${message} ${colors.yellow(String(status))}`;
  }

  if (success === true) {
    if (shouldLogSuccess) console.log(colors.green(coloredMessage));
  } else if (success === false) {
    if (shouldLogError) console.error(colors.red(coloredMessage));
  } else if (status !== undefined && (status < 200 || status >= 300)) {
    if (shouldLogError) console.error(colors.red(coloredMessage));
  } else {
    if (shouldLogError) console.log(coloredMessage);
  }
}
