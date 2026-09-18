import {
  connectionsCatalogSchema,
  type ConnectionInput,
  type ConnectionsCatalog,
  type EnvironmentInput,
  type FolderInput,
  type ImportReport,
  type UnlockResult,
} from '@volga/contracts';
import { ApiFailure, request } from './transport.js';

/**
 * The connections surface.
 *
 * These calls all run before sign-in, so none of them depend on a session. A
 * saved password is never among the results: the browser is told which
 * connections have one, not what it is.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export const connectionsApi = {
  async catalog(): Promise<ConnectionsCatalog> {
    return connectionsCatalogSchema.parse(await request('/api/connections', { method: 'GET' }));
  },

  async unlock(masterPassword: string): Promise<UnlockResult> {
    return (await request('/api/connections/unlock', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ masterPassword }),
    })) as UnlockResult;
  },

  async saveEnvironment(input: EnvironmentInput, id?: string): Promise<void> {
    await request(id === undefined ? '/api/connections/environments' : `/api/connections/environments/${id}`, {
      method: id === undefined ? 'POST' : 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  },

  async deleteEnvironment(id: string): Promise<void> {
    await request(`/api/connections/environments/${id}`, { method: 'DELETE' });
  },

  async saveConnection(input: ConnectionInput, id?: string): Promise<void> {
    await request(id === undefined ? '/api/connections/connections' : `/api/connections/connections/${id}`, {
      method: id === undefined ? 'POST' : 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  },

  async deleteConnection(id: string): Promise<void> {
    await request(`/api/connections/connections/${id}`, { method: 'DELETE' });
  },

  async saveFolder(input: FolderInput): Promise<void> {
    await request('/api/connections/folders', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  },

  async deleteFolder(id: string): Promise<void> {
    await request(`/api/connections/folders/${id}`, { method: 'DELETE' });
  },

  /**
   * Downloads the store's database through the browser.
   *
   * The browser writes it wherever the person's save dialog points, so the
   * destination is theirs and this server never chooses it.
   */
  async downloadDatabase(): Promise<void> {
    const response = await fetch('/api/connections/database', { credentials: 'same-origin' });
    if (!response.ok) {
      throw new ApiFailure(response.status, {
        code: 'internal',
        message: 'Could not read the connections database.',
      });
    }
    const blob = await response.blob();
    saveBlob(blob, filenameFrom(response.headers.get('Content-Disposition'), 'connections.db'));
  },

  async downloadSnapshot(includePasswords: boolean): Promise<void> {
    const response = await fetch(
      `/api/connections/snapshot?includePasswords=${includePasswords ? 'true' : 'false'}`,
      { credentials: 'same-origin' },
    );
    if (!response.ok) {
      throw new ApiFailure(response.status, {
        code: 'internal',
        message: 'Could not read the connections snapshot.',
      });
    }
    const blob = await response.blob();
    saveBlob(
      blob,
      filenameFrom(response.headers.get('Content-Disposition'), 'connections.snapshot.json'),
    );
  },

  /**
   * Imports a file the person chose.
   *
   * The file is read in the browser and posted as bytes, so the server never
   * opens a path it was handed.
   */
  async importDatabase(input: {
    readonly file: File;
    readonly sourcePassword: string;
    readonly includeCredentials: boolean;
    readonly conflict: 'skip' | 'rename' | 'replace';
    readonly targetPassword: string;
    readonly dryRun: boolean;
  }): Promise<ImportReport> {
    const database = await fileToBase64(input.file);
    return (await request('/api/connections/import', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        database,
        sourcePassword: input.sourcePassword,
        includeCredentials: input.includeCredentials,
        conflict: input.conflict,
        targetPassword: input.targetPassword,
        dryRun: input.dryRun,
      }),
    })) as ImportReport;
  },
};

/** Reads the filename the server suggested, falling back to a default. */
function filenameFrom(disposition: string | null, fallback: string): string {
  if (disposition === null) {
    return fallback;
  }
  const match = /filename="([^"]+)"/.exec(disposition);
  return match?.[1] ?? fallback;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers, so it waits
  // for the next tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a file into base64 without going through a data URL string. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // A chunked encode cannot blow the argument limit on a large file.
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}
