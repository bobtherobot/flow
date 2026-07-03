export interface AppConfig {
  appName: string;
  googleClientId: string;
  driveFolderName: string;
}

const FALLBACK: AppConfig = {
  appName: "Wimp",
  googleClientId: "",
  driveFolderName: "My Drawings",
};

let cached: AppConfig | null = null;

/**
 * Loads runtime config from `config.json` next to index.html. Editing that file
 * on the server reconfigures a deployment without rebuilding the bundle.
 */
export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  let result: AppConfig;
  try {
    const res = await fetch(new URL("config.json", document.baseURI), {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`config.json ${res.status}`);
    result = { ...FALLBACK, ...(await res.json()) };
  } catch {
    result = FALLBACK;
  }
  cached = result;
  return result;
}
