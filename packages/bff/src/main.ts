import { parseArgs } from 'node:util';
import { buildServer } from './server.js';
import { loadConfig } from './config.js';
import { loadSiteConfiguration } from './site-config.js';

/**
 * Entry point.
 *
 * Configuration is validated before anything binds, so a missing certificate
 * or session secret stops the process with a readable message rather than
 * failing on the first login.
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      env: { type: 'string', short: 'e' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (values.help === true) {
    process.stdout.write(
      'Usage: volga-bff [--env <environment>]\n\n' +
        '  --env, -e   Which ORE Studio environment to serve. Overrides the\n' +
        '              site configuration. See config/environments.json.\n',
    );
    return;
  }

  const config = loadConfig();
  const site = loadSiteConfiguration({
    projectRoot: process.cwd(),
    ...(values.env === undefined ? {} : { environmentId: values.env }),
  });

  const server = buildServer({ config, site });

  // Say which environment this process serves, first thing, because the worst
  // failure mode is not knowing whether you are looking at staging or
  // production.
  server.log.info(
    {
      environment: site.environment.id,
      displayName: site.environment.displayName,
      nonProduction: site.environment.nonProduction,
      developerTools: site.configuration.developerTools,
      configFile: site.source,
    },
    `serving '${site.environment.displayName}' (${site.environment.id})`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ signal }, 'shutting down');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await server.listen({ port: config.port, host: config.host });
}

main().catch((error: unknown) => {
  console.error('failed to start:', error);
  process.exit(1);
});
