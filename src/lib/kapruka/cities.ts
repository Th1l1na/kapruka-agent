import { callKapruka } from "./client";
import { cached } from "./cache";
import type { City, CityResolution, DeliveryCitiesResponse } from "./types";

/**
 * `kapruka_list_delivery_cities` wrapper (Sprint 2).
 *
 * Resolves user-typed city input to a canonical Kapruka delivery city. This is
 * the ONLY path to a city name in the app — the model must resolve before any
 * check_delivery or create_order (system-prompt rule + belt-and-braces here).
 *
 * The aliases quirk (notes/data-shapes.md): the MCP returns `aliases` as a
 * one-element array holding a single space-separated string
 * (e.g. `["malabe thalahe thalahena akuregoda"]`). We split it into individual
 * tokens so a match on any single alias works.
 *
 * Cached (city list is stable; also softens the shared 60 req/min limit).
 */
const CITIES_TTL_MS = 30 * 60 * 1000;
const MAX_CANDIDATES = 5;

/** Split the space-separated alias blob into individual, de-duplicated tokens. */
function normaliseAliases(raw: string[]): string[] {
  const tokens = new Set<string>();
  for (const blob of raw ?? []) {
    for (const t of String(blob).split(/\s+/)) {
      const tok = t.trim();
      if (tok) tokens.add(tok);
    }
  }
  return [...tokens];
}

async function listCities(query: string): Promise<City[]> {
  const q = query.trim();
  const key = `cities:${q.toLowerCase()}`;
  const data = await cached(key, CITIES_TTL_MS, () =>
    callKapruka<DeliveryCitiesResponse>("kapruka_list_delivery_cities", {
      query: q,
      limit: 50,
      response_format: "json",
    }),
  );
  return (data.cities ?? []).map((c) => ({
    name: c.name,
    aliases: normaliseAliases(c.aliases),
  }));
}

/**
 * Resolve raw user input to a canonical city.
 *
 * Ranking: exact name match → exact alias match → first candidate. Returns up
 * to 5 candidates for the model to disambiguate common names (e.g. "colombo"
 * matches many zones).
 */
export async function resolveCity(raw: string): Promise<CityResolution> {
  const query = raw.trim();
  const cities = await listCities(query);
  const candidates = cities.slice(0, MAX_CANDIDATES);
  const lower = query.toLowerCase();

  const exactName = cities.find((c) => c.name.toLowerCase() === lower);
  const exactAlias = cities.find((c) =>
    c.aliases.some((a) => a.toLowerCase() === lower),
  );
  const match = exactName ?? exactAlias ?? cities[0] ?? null;

  return { query, match, candidates };
}
