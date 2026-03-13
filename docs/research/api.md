# TV Episode Ratings API Research

Research completed March 12, 2026. The goal is to find free (ideally keyless) APIs that provide episode-by-episode TV ratings for GraphTV.

## Summary

| API | Auth | Episode Ratings | Rating Source | Rate Limits | CORS | Verdict |
|-----|------|-----------------|---------------|-------------|------|---------|
| **TVmaze** | None | Yes | TVmaze community | 20/10s per IP | Yes | Best keyless option |
| **TMDB** (current) | Bearer token | Yes | TMDB community | ~40/s per IP | Yes | Already working |
| **OMDb** (old) | API key | Yes | IMDb | 1,000/day free | Works | Best ratings, tight limits |
| **Trakt.tv** | Client ID | Yes | Trakt community | 1,000/5min | Per-domain whitelist | Complex CORS setup |
| **TheTVDB** | API key + PIN | Not really | N/A | Unspecified | Unknown | Metadata only |
| **EpisoDate** | None | No | N/A | Unknown | Unknown | Disqualified |
| **IMDb Datasets** | None (download) | Yes | IMDb | N/A (static files) | N/A | Needs backend |
| **Wikidata SPARQL** | None | Extremely sparse | Various | 60s timeout | Yes | Not viable |

## Detailed findings

### TVmaze — best keyless option

- **URL:** https://www.tvmaze.com/api
- **Auth:** None. Completely open public API.
- **Episode ratings:** Yes. Each episode object has a `rating.average` field (1-10 float, or `null` if no votes).
- **Rate limits:** 20 calls per 10 seconds per IP. HTTP 429 when exceeded. Plenty for GraphTV since one show load is ~1 search + 1 show + N season calls.
- **CORS:** Explicitly supported. Docs state all endpoints are CORS enabled for direct browser use.
- **Coverage:** 70,000+ shows across 200+ networks. All major shows have full episode data. Breaking Bad: 62/62 episodes rated. Game of Thrones: 73/73 episodes rated.
- **Limitations:** Ratings from TVmaze's own community (smaller voter pool than IMDb). Niche shows may have `null` ratings. No vote count in the public API. Data cached for 60 minutes.
- **Key endpoints:**
  - Search: `GET /search/shows?q=:query`
  - Show details: `GET /shows/:id`
  - All episodes: `GET /shows/:id/episodes`
  - Single episode: `GET /shows/:id/episodebynumber?season=:season&number=:number`
  - Seasons list: `GET /shows/:id/seasons`
- **Cross-references:** The `externals` field includes IMDb ID, TheTVDB ID, and TVRage ID.

### TMDB — currently used

- **URL:** https://developer.themoviedb.org/
- **Auth:** Bearer token (JWT) from free account registration. Client-side use is accepted by TMDB for read-only access.
- **Episode ratings:** Yes. `/tv/{id}/season/{season}` returns episodes with `vote_average` and `vote_count`.
- **Rate limits:** ~40 requests/second per IP. Very generous.
- **CORS:** Yes, returns `Access-Control-Allow-Origin: *`.
- **Coverage:** Massive database. However, episode-level vote counts tend to be low compared to IMDb, making individual episode ratings less representative.
- **Limitations:** Requires registration and token. Token exposed in client code. Attribution required. Non-commercial free tier.

### OMDb — previously used, best rating quality

- **URL:** https://www.omdbapi.com/
- **Auth:** API key required (free registration via email).
- **Episode ratings:** Yes. `?i={imdbId}&season={n}` returns episodes with `imdbRating`. This is actual IMDb data — gold standard for episode ratings.
- **Rate limits:** 1,000 requests/day on free tier. Paid tiers via Patreon.
- **CORS:** Not documented but was used client-side in this codebase.
- **Limitations:** 1,000/day is restrictive for a popular app. Single-maintainer project. Previously deprecated in this codebase (likely due to rate limits).

### Trakt.tv — viable but complex

- **URL:** https://trakt.docs.apiary.io/
- **Auth:** Client ID required in `trakt-api-key` header. OAuth needed for user-specific actions but not for public reads.
- **Episode ratings:** Yes. `/shows/{id}/seasons?extended=episodes` with `extended=full` returns per-episode ratings and vote counts.
- **Rate limits:** 1,000 GET calls per 5 minutes. Trakt is actively tightening limits for 2026.
- **CORS:** Supported but requires per-domain whitelisting when registering your app. Has had intermittent issues (most recently Nov 2025).
- **Limitations:** CORS domain whitelisting is a significant friction point (separate registration for localhost vs production). Rate limits being tightened.

### TheTVDB — metadata only, not useful

- **URL:** https://thetvdb.com/api-information
- **Auth:** API key + user PIN, JWT-based.
- **Episode ratings:** Not a ratings-focused database. Primarily metadata (titles, air dates, descriptions, images).
- **Verdict:** Not suitable for this use case.

### EpisoDate — no episode ratings

- **URL:** https://www.episodate.com/api
- **Auth:** None.
- **Episode ratings:** No. Episodes only contain season/episode number, name, and air date. Show-level rating exists but episodes do not have individual ratings.
- **Verdict:** Disqualified.

### IMDb Non-Commercial Datasets — best data, needs backend

- **URL:** https://developer.imdb.com/non-commercial-datasets/
- **Auth:** None (direct download of TSV files).
- **Episode ratings:** Yes. Cross-reference `title.episode.tsv.gz` with `title.ratings.tsv.gz` for per-episode IMDb ratings. Highest quality rating data available.
- **Limitations:** Static downloadable files, not an API. Requires a backend to process, host, and serve. Files are hundreds of MB compressed. Non-commercial use only.
- **Verdict:** Best possible data but not viable for a purely client-side app.

### Wikidata SPARQL — too sparse

- **URL:** https://query.wikidata.org/
- **Auth:** None.
- **Episode ratings:** Property P444 can store review scores, but almost no TV episodes have this data populated.
- **Verdict:** Not viable due to extremely sparse coverage.

## Recommendation

**Simplest improvement: add TVmaze as a provider.** Zero auth, full CORS, episode ratings, and the API shape maps directly to GraphTV's existing architecture. The only trade-off is a smaller voter pool than IMDb.

**Hybrid approach worth considering:** Use TVmaze for search and metadata (no auth needed), fall back to TMDB for ratings where TVmaze returns `null`.

**If rating quality matters most and a backend is acceptable:** Build a lightweight API on top of IMDb Non-Commercial Datasets. Daily-refreshed, gold-standard ratings. Significant infrastructure cost.

**Current setup (TMDB) is fine to keep.** It works, has generous rate limits, and good CORS support. The exposed token is a minor risk for a read-only API.
