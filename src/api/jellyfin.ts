// tuifin — Jellyfin API Client

import { debug } from "../utils/debug"

export interface JellyfinConfig {
  serverUrl: string
  userId?: string
  accessToken?: string
}

export interface AuthResult {
  userId: string
  accessToken: string
  serverId: string
  username: string
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type: "Movie" | "Series" | "Season" | "Episode" | "CollectionFolder" | "Folder" | string
  Overview?: string
  CommunityRating?: number
  OfficialRating?: string
  ProductionYear?: number
  ImageTags?: { Primary?: string; Thumb?: string; Banner?: string }
  BackdropImageTags?: string[]
  SeriesName?: string
  SeriesId?: string
  SeasonId?: string
  ParentIndexNumber?: number // Season number
  IndexNumber?: number // Episode number
  UserData?: {
    PlaybackPositionTicks: number
    PlayedPercentage?: number
    Played: boolean
    IsFavorite: boolean
    UnplayedItemCount?: number
  }
  RunTimeTicks?: number
  ChildCount?: number
  MediaSources?: MediaSource[]
}

export interface MediaSource {
  Id: string
  Path: string
  Protocol: string
  DirectStreamUrl?: string
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[]
  TotalRecordCount: number
}

export class JellyfinClient {
  private config: JellyfinConfig
  /** In-memory cache: path → { data, timestamp } */
  private cache = new Map<string, { data: any; timestamp: number }>()
  /** Max cache age in ms before background revalidation (30 seconds) */
  private readonly CACHE_TTL = 30_000

  constructor(config: JellyfinConfig) {
    this.config = config
  }

  get serverUrl(): string {
    return this.config.serverUrl
  }

  get userId(): string | undefined {
    return this.config.userId
  }

  get accessToken(): string | undefined {
    return this.config.accessToken
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    const authParts = [
      'MediaBrowser Client="tuifin"',
      'Device="Terminal"',
      'DeviceId="tuifin-1"',
      'Version="0.1.0"',
    ]
    if (this.config.accessToken) {
      authParts.push(`Token="${this.config.accessToken}"`)
    }
    headers["Authorization"] = authParts.join(", ")
    return headers
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.config.serverUrl}${path}`
    debug("api", `${options?.method ?? "GET"} ${path}`)
    const res = await fetch(url, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    })
    if (!res.ok) {
      const errMsg = `Jellyfin API error: ${res.status} ${res.statusText} — ${path}`
      debug("api", errMsg)
      throw new Error(errMsg)
    }
    debug("api", `${options?.method ?? "GET"} ${path} → ${res.status}`)
    return res.json() as Promise<T>
  }

  /**
   * Stale-while-revalidate request.
   * Returns cached data immediately if available, then revalidates in background.
   * Calls onUpdate with fresh data if it differs from cache.
   */
  private async cachedRequest<T>(
    path: string,
    onUpdate?: (data: T) => void,
  ): Promise<T> {
    const cached = this.cache.get(path)
    const now = Date.now()

    if (cached) {
      debug("api", `Cache hit: ${path} (age: ${now - cached.timestamp}ms)`)

      // Revalidate in background if stale
      if (now - cached.timestamp > this.CACHE_TTL) {
        debug("api", `Revalidating: ${path}`)
        this.request<T>(path)
          .then((freshData) => {
            const freshJson = JSON.stringify(freshData)
            const cachedJson = JSON.stringify(cached.data)
            this.cache.set(path, { data: freshData, timestamp: Date.now() })
            if (freshJson !== cachedJson) {
              debug("api", `Cache updated (data changed): ${path}`)
              onUpdate?.(freshData)
            } else {
              debug("api", `Cache validated (no change): ${path}`)
            }
          })
          .catch((err) => {
            debug("api", `Revalidation failed: ${path}`, { error: String(err) })
          })
      }

      return cached.data as T
    }

    // No cache — fetch and store
    debug("api", `Cache miss: ${path}`)
    const data = await this.request<T>(path)
    this.cache.set(path, { data, timestamp: now })
    return data
  }

  /** Clear all cached data */
  clearCache() {
    this.cache.clear()
    debug("api", "Cache cleared")
  }

  /** Invalidate cache entries whose path starts with the given prefix */
  private invalidateCachePrefix(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        debug("api", `Cache invalidated: ${key}`)
      }
    }
  }

  async authenticate(username: string, password: string): Promise<AuthResult> {
    debug("api", `Authenticating as "${username}" to ${this.config.serverUrl}`)
    const data = await this.request<{
      User: { Id: string; Name: string }
      AccessToken: string
      ServerId: string
    }>("/Users/AuthenticateByName", {
      method: "POST",
      body: JSON.stringify({ Username: username, Pw: password }),
    })

    this.config.userId = data.User.Id
    this.config.accessToken = data.AccessToken

    return {
      userId: data.User.Id,
      accessToken: data.AccessToken,
      serverId: data.ServerId,
      username: data.User.Name,
    }
  }

  async getLibraries(onUpdate?: (items: JellyfinItem[]) => void): Promise<JellyfinItem[]> {
    const data = await this.cachedRequest<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items?IncludeItemTypes=CollectionFolder`,
      onUpdate ? (d) => onUpdate(d.Items) : undefined,
    )
    return data.Items
  }

  async getItems(parentId: string, options?: {
    limit?: number
    startIndex?: number
    sortBy?: string
    sortOrder?: "Ascending" | "Descending"
    includeItemTypes?: string
    fields?: string
  }, onUpdate?: (data: JellyfinItemsResponse) => void): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams()
    params.set("ParentId", parentId)
    params.set("Fields", options?.fields ?? "Overview,ImageTags,UserData,MediaSources,CommunityRating,OfficialRating,ProductionYear,RunTimeTicks")
    if (options?.limit) params.set("Limit", String(options.limit))
    if (options?.startIndex) params.set("StartIndex", String(options.startIndex))
    if (options?.sortBy) params.set("SortBy", options.sortBy)
    if (options?.sortOrder) params.set("SortOrder", options.sortOrder)
    if (options?.includeItemTypes) params.set("IncludeItemTypes", options.includeItemTypes)

    return this.cachedRequest<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items?${params}`,
      onUpdate,
    )
  }

  async getResumeItems(limit = 10, onUpdate?: (items: JellyfinItem[]) => void): Promise<JellyfinItem[]> {
    const data = await this.cachedRequest<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items/Resume?Limit=${limit}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks&MediaTypes=Video`,
      onUpdate ? (d) => onUpdate(d.Items) : undefined,
    )
    return data.Items
  }

  async getNextUp(limit = 10, onUpdate?: (items: JellyfinItem[]) => void): Promise<JellyfinItem[]> {
    const data = await this.cachedRequest<JellyfinItemsResponse>(
      `/Shows/NextUp?UserId=${this.config.userId}&Limit=${limit}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks`,
      onUpdate ? (d) => onUpdate(d.Items) : undefined,
    )
    return data.Items
  }

  async getItem(itemId: string, onUpdate?: (item: JellyfinItem) => void): Promise<JellyfinItem> {
    return this.cachedRequest<JellyfinItem>(
      `/Users/${this.config.userId}/Items/${itemId}?Fields=Overview,ImageTags,UserData,MediaSources,CommunityRating,OfficialRating,ProductionYear,RunTimeTicks`,
      onUpdate,
    )
  }

  async getSeasons(seriesId: string, onUpdate?: (items: JellyfinItem[]) => void): Promise<JellyfinItem[]> {
    const data = await this.cachedRequest<JellyfinItemsResponse>(
      `/Shows/${seriesId}/Seasons?UserId=${this.config.userId}&Fields=Overview,ImageTags,UserData,CommunityRating`,
      onUpdate ? (d) => onUpdate(d.Items) : undefined,
    )
    return data.Items
  }

  async getEpisodes(seriesId: string, seasonId: string, onUpdate?: (items: JellyfinItem[]) => void): Promise<JellyfinItem[]> {
    const data = await this.cachedRequest<JellyfinItemsResponse>(
      `/Shows/${seriesId}/Episodes?SeasonId=${seasonId}&UserId=${this.config.userId}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks`,
      onUpdate ? (d) => onUpdate(d.Items) : undefined,
    )
    return data.Items
  }

  getImageUrl(itemId: string, imageType: "Primary" | "Thumb" | "Banner" | "Backdrop" = "Primary", maxWidth = 300): string {
    return `${this.config.serverUrl}/Items/${itemId}/Images/${imageType}?maxWidth=${maxWidth}&quality=90`
  }

  getStreamUrl(itemId: string): string {
    let base = this.config.serverUrl
    if (!base.startsWith("http://") && !base.startsWith("https://")) {
      base = `http://${base}`
    }
    return `${base}/Videos/${itemId}/stream?Static=true&api_key=${this.config.accessToken}`
  }

  async markPlayed(itemId: string): Promise<void> {
    await this.request(`/Users/${this.config.userId}/PlayedItems/${itemId}`, {
      method: "POST",
    })
    // Invalidate caches that might show play state
    this.invalidateCachePrefix(`/Users/${this.config.userId}/Items`)
    this.invalidateCachePrefix(`/Shows/NextUp`)
  }

  async reportPlaybackProgress(itemId: string, positionTicks: number): Promise<void> {
    await this.request("/Sessions/Playing/Progress", {
      method: "POST",
      body: JSON.stringify({
        ItemId: itemId,
        PositionTicks: positionTicks,
        IsPaused: false,
      }),
    })
  }

  async reportPlaybackStopped(itemId: string, positionTicks: number): Promise<void> {
    await this.request("/Sessions/Playing/Stopped", {
      method: "POST",
      body: JSON.stringify({
        ItemId: itemId,
        PositionTicks: positionTicks,
      }),
    })
    // Invalidate caches that show play state/resume
    this.invalidateCachePrefix(`/Users/${this.config.userId}/Items`)
    this.invalidateCachePrefix(`/Shows/NextUp`)
  }

  /**
   * Get the next episode after the given episode.
   * Returns null if this is the last episode of the series.
   */
  async getNextEpisode(currentEpisode: JellyfinItem): Promise<JellyfinItem | null> {
    if (currentEpisode.Type !== "Episode" || !currentEpisode.SeriesId || !currentEpisode.SeasonId) {
      return null
    }

    const seriesId = currentEpisode.SeriesId
    const seasonId = currentEpisode.SeasonId
    const currentEpisodeNumber = currentEpisode.IndexNumber ?? 0
    const currentSeasonNumber = currentEpisode.ParentIndexNumber ?? 1

    debug("api", `Finding next episode after S${currentSeasonNumber}E${currentEpisodeNumber}`)

    // Get all episodes in current season
    const episodes = await this.getEpisodes(seriesId, seasonId)
    
    // Find next episode in same season
    const nextInSeason = episodes.find((ep) => (ep.IndexNumber ?? 0) === currentEpisodeNumber + 1)
    if (nextInSeason) {
      debug("api", `Next episode: S${currentSeasonNumber}E${nextInSeason.IndexNumber} "${nextInSeason.Name}"`)
      return nextInSeason
    }

    debug("api", "No more episodes in season, checking next season...")

    // No more episodes in current season — try next season
    const seasons = await this.getSeasons(seriesId)
    const nextSeason = seasons.find((s) => (s.IndexNumber ?? 0) === currentSeasonNumber + 1)
    
    if (!nextSeason) {
      debug("api", "No next season found — series complete")
      return null
    }

    // Get first episode of next season
    const nextSeasonEpisodes = await this.getEpisodes(seriesId, nextSeason.Id)
    const firstEpisode = nextSeasonEpisodes.find((ep) => ep.IndexNumber === 1) ?? nextSeasonEpisodes[0]
    
    if (firstEpisode) {
      debug("api", `Next episode: S${nextSeason.IndexNumber}E${firstEpisode.IndexNumber} "${firstEpisode.Name}"`)
    } else {
      debug("api", "Next season has no episodes")
    }

    return firstEpisode ?? null
  }

  /**
   * Get all episodes in a series as a playlist, centered around the current episode.
   * Returns episodes in order: entire series from S01E01 onwards.
   * The startIndex in the returned object indicates where currentEpisode is in the array.
   */
  async getSeriesPlaylist(currentEpisode: JellyfinItem): Promise<{ episodes: JellyfinItem[]; startIndex: number }> {
    if (currentEpisode.Type !== "Episode" || !currentEpisode.SeriesId) {
      return { episodes: [currentEpisode], startIndex: 0 }
    }

    const seriesId = currentEpisode.SeriesId
    const currentSeasonNumber = currentEpisode.ParentIndexNumber ?? 1
    const currentEpisodeNumber = currentEpisode.IndexNumber ?? 1

    debug("api", `Fetching full series playlist (current: S${currentSeasonNumber}E${currentEpisodeNumber})`)

    // Get all seasons
    const seasons = await this.getSeasons(seriesId)
    const sortedSeasons = seasons.sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0))

    const allEpisodes: JellyfinItem[] = []
    let startIndex = 0

    for (const season of sortedSeasons) {
      const seasonNumber = season.IndexNumber ?? 0
      
      const episodes = await this.getEpisodes(seriesId, season.Id)
      const sortedEpisodes = episodes.sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0))

      for (const episode of sortedEpisodes) {
        const epNumber = episode.IndexNumber ?? 0
        
        // Track where the current episode is in the playlist
        if (seasonNumber === currentSeasonNumber && epNumber === currentEpisodeNumber) {
          startIndex = allEpisodes.length
        }

        allEpisodes.push(episode)
      }
    }

    debug("api", `Built playlist with ${allEpisodes.length} episodes, starting at index ${startIndex}`)
    return { episodes: allEpisodes, startIndex }
  }
}
