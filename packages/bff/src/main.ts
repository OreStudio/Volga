import { buildServer } from './server.js';
import { loadConfig } from './config.js';

/**
 * Entry point.
 *
 * Configuration is validated before anything binds, so a missing certificate
 * or session secret stops the process with a readable message rather than
 * failing on the first login.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const server = buildServer({ config });

  const shutdown = async (signal: string): Promise<void> => {
    server.log.info({ signal }, 'shutting down');
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await server.listen({ port: config.port, host: config.host });
  server.log.info(
    {
      nats: config.nats.url,
      prefix: config.nats.subjectPrefix,
      format: config.nats.format,
    },
    'bff ready',
  );
}

main().catch((error: unknown) => {
  console.error('failed to start:', error);
  process.exit(1);
});
