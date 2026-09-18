import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  siteConfigurationSchema,
  type EnvironmentDefinition,
  type SiteConfiguration,
} from '@volga/contracts';

/**
 * Loading the site configuration.
 *
 * One file declares every environment, which one this site serves, and whether
 * the developer surface exists. It is read once at startup and validated, so a
 * mistake fails the process with a readable message rather than surfacing as a
 * connection error on the first sign-in.
 *
 * The environment can be chosen on the command line for a one-off, or in the
 * file for a deployment:
 *
 *   volga --env bright_hopper
 */

/** Overrides the configuration file. Useful for a deployment or a test. */
export const SITE_CONFIG_VARIABLE = 'VOLGA_SITE_CONFIG';
/** Chooses the environment. Equivalent to `--env`. */
export const ENVIRONMENT_VARIABLE = 'VOLGA_ENV';
/** Overrides `developerTools`, so a deployment can turn it off without editing the file. */
export const DEVELOPER_TOOLS_VARIABLE = 'VOLGA_DEVELOPER_TOOLS';

export class ConfigurationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConfigurationError';
  }
}

export interface LoadedSiteConfiguration {
  readonly configuration: SiteConfiguration;
  /** The environment this site serves, already resolved. */
  readonly environment: EnvironmentDefinition;
  /** Where the file was read from, so a startup log can say so. */
  readonly source: string;
}

export interface LoadOptions {
  readonly environment?: NodeJS.ProcessEnv;
  /** The `--env` value, which wins over the file and the environment variable. */
  readonly environmentId?: string;
  /** The repository root, so the default path resolves regardless of the cwd. */
  readonly projectRoot?: string;
}

/** Resolves the default configuration file location. */
export function defaultConfigPath(projectRoot: string): string {
  return resolve(projectRoot, 'config', 'environments.json');
}

export function loadSiteConfiguration(options: LoadOptions = {}): LoadedSiteConfiguration {
  const environment = options.environment ?? process.env;
  const source =
    environment[SITE_CONFIG_VARIABLE] !== undefined &&
    environment[SITE_CONFIG_VARIABLE].trim().length > 0
      ? resolve(environment[SITE_CONFIG_VARIABLE])
      : defaultConfigPath(options.projectRoot ?? process.cwd());

  let text: string;
  try {
    text = readFileSync(source, 'utf8');
  } catch (cause) {
    throw new ConfigurationError(
      `Cannot read the site configuration at ${source}. ` +
        `Set ${SITE_CONFIG_VARIABLE} to point somewhere else.`,
      { cause },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ConfigurationError(`${source} is not valid JSON`, { cause });
  }

  const result = siteConfigurationSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigurationError(
      `${source} is not a usable site configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  const configuration = result.data;

  // The command line wins over the file, so a one-off run against another
  // environment needs no edit.
  const requested =
    options.environmentId ??
    (environment[ENVIRONMENT_VARIABLE]?.trim().length
      ? environment[ENVIRONMENT_VARIABLE]?.trim()
      : undefined) ??
    (configuration.active.length > 0 ? configuration.active : undefined);

  const chosen =
    requested === undefined
      ? configuration.environments[0]
      : configuration.environments.find((item) => item.id === requested);

  if (chosen === undefined) {
    throw new ConfigurationError(
      `No environment '${requested}' in ${source}. Available: ` +
        configuration.environments.map((item) => item.id).join(', '),
    );
  }

  // A deployment that turns the developer surface off must not have it turned
  // back on by the file, and the reverse is a deliberate local choice.
  const developerOverride = environment[DEVELOPER_TOOLS_VARIABLE];
  const developerTools =
    developerOverride === undefined
      ? configuration.developerTools
      : developerOverride === '1' || developerOverride.toLowerCase() === 'true';

  return {
    configuration: { ...configuration, developerTools, active: chosen.id },
    environment: chosen,
    source,
  };
}

/** Resolves the certificate material, letting an environment override the shared values. */
export function tlsMaterialFor(
  configuration: SiteConfiguration,
  environment: EnvironmentDefinition,
): { readonly ca: string; readonly cert: string; readonly key: string } {
  return {
    ca: environment.tls.ca ?? configuration.tls.ca,
    cert: environment.tls.cert ?? configuration.tls.cert,
    key: environment.tls.key ?? configuration.tls.key,
  };
}
