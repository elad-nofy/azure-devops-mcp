import { z } from 'zod';

const ConfigSchema = z.object({
  serverUrl: z.string().url('AZURE_DEVOPS_URL must be a valid URL'),
  pat: z.string().min(1, 'AZURE_DEVOPS_PAT is required'),
  collection: z.string().default('DefaultCollection'),
  defaultProject: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const config = {
    serverUrl: process.env.AZURE_DEVOPS_URL || '',
    pat: process.env.AZURE_DEVOPS_PAT || '',
    collection: process.env.AZURE_DEVOPS_COLLECTION || 'DefaultCollection',
    defaultProject: process.env.AZURE_DEVOPS_PROJECT || undefined,
  };

  // Remove trailing slash from URL if present
  if (config.serverUrl.endsWith('/')) {
    config.serverUrl = config.serverUrl.slice(0, -1);
  }

  const result = ConfigSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Configuration error:\n${errors}`);
  }

  return result.data;
}

export function getCollectionUrl(config: Config): string {
  return `${config.serverUrl}/${config.collection}`;
}
