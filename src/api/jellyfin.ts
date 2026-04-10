// JellyTUI — Jellyfin API Client

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
  }
  RunTimeTicks?: number
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
      'MediaBrowser Client="JellyTUI"',
      'Device="Terminal"',
      'DeviceId="jellytui-1"',
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

  async getLibraries(): Promise<JellyfinItem[]> {
    const data = await this.request<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items?IncludeItemTypes=CollectionFolder`
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
  }): Promise<JellyfinItemsResponse> {
    const params = new URLSearchParams()
    params.set("ParentId", parentId)
    params.set("Fields", options?.fields ?? "Overview,ImageTags,UserData,MediaSources,CommunityRating,OfficialRating,ProductionYear,RunTimeTicks")
    if (options?.limit) params.set("Limit", String(options.limit))
    if (options?.startIndex) params.set("StartIndex", String(options.startIndex))
    if (options?.sortBy) params.set("SortBy", options.sortBy)
    if (options?.sortOrder) params.set("SortOrder", options.sortOrder)
    if (options?.includeItemTypes) params.set("IncludeItemTypes", options.includeItemTypes)

    return this.request<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items?${params}`
    )
  }

  async getResumeItems(limit = 10): Promise<JellyfinItem[]> {
    const data = await this.request<JellyfinItemsResponse>(
      `/Users/${this.config.userId}/Items/Resume?Limit=${limit}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks&MediaTypes=Video`
    )
    return data.Items
  }

  async getNextUp(limit = 10): Promise<JellyfinItem[]> {
    const data = await this.request<JellyfinItemsResponse>(
      `/Shows/NextUp?UserId=${this.config.userId}&Limit=${limit}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks`
    )
    return data.Items
  }

  async getItem(itemId: string): Promise<JellyfinItem> {
    return this.request<JellyfinItem>(
      `/Users/${this.config.userId}/Items/${itemId}?Fields=Overview,ImageTags,UserData,MediaSources,CommunityRating,OfficialRating,ProductionYear,RunTimeTicks`
    )
  }

  async getSeasons(seriesId: string): Promise<JellyfinItem[]> {
    const data = await this.request<JellyfinItemsResponse>(
      `/Shows/${seriesId}/Seasons?UserId=${this.config.userId}&Fields=Overview,ImageTags,UserData`
    )
    return data.Items
  }

  async getEpisodes(seriesId: string, seasonId: string): Promise<JellyfinItem[]> {
    const data = await this.request<JellyfinItemsResponse>(
      `/Shows/${seriesId}/Episodes?SeasonId=${seasonId}&UserId=${this.config.userId}&Fields=Overview,ImageTags,UserData,MediaSources,RunTimeTicks`
    )
    return data.Items
  }

  getImageUrl(itemId: string, imageType: "Primary" | "Thumb" | "Banner" | "Backdrop" = "Primary", maxWidth = 300): string {
    return `${this.config.serverUrl}/Items/${itemId}/Images/${imageType}?maxWidth=${maxWidth}&quality=90`
  }

  getStreamUrl(itemId: string): string {
    return `${this.config.serverUrl}/Videos/${itemId}/stream?Static=true&api_key=${this.config.accessToken}`
  }

  async markPlayed(itemId: string): Promise<void> {
    await this.request(`/Users/${this.config.userId}/PlayedItems/${itemId}`, {
      method: "POST",
    })
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
  }
}
