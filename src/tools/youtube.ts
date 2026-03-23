import { McpServer }       from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }               from "zod";
import axios, { AxiosError } from "axios";
import { CHARACTER_LIMIT } from "../constants.js";

const READ_ONLY = {
  readOnlyHint:    true,
  destructiveHint: false,
  idempotentHint:  true,
  openWorldHint:   true,
};

const YT_BASE = "https://www.googleapis.com/youtube/v3";

// ─── API Key helper ───────────────────────────────────────────────────────────
function getApiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error(
    "YOUTUBE_API_KEY is not set. Get one at https://console.cloud.google.com/ → YouTube Data API v3"
  );
  return key;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function ytGet<T>(endpoint: string, params: Record<string, unknown>): Promise<T> {
  try {
    const res = await axios.get<T>(`${YT_BASE}/${endpoint}`, {
      params: { ...params, key: getApiKey() },
      timeout: 15_000,
    });
    return res.data;
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const msg    = (err.response?.data as Record<string, unknown>)?.error;
      if (status === 403) throw new Error("YouTube API quota exceeded or key restricted. Check your Google Cloud Console.");
      if (status === 400) throw new Error(`YouTube API bad request: ${JSON.stringify(msg)}`);
      throw new Error(`YouTube API error (${status}): ${JSON.stringify(msg)}`);
    }
    throw err;
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT
    ? text
    : text.slice(0, CHARACTER_LIMIT) + "\n\n[... truncated]";
}

function formatDuration(iso: string): string {
  // PT1H2M3S → 1:02:03
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return iso;
  const [, h, m, s] = match;
  const parts = [];
  if (h) parts.push(h);
  parts.push((m ?? "0").padStart(parts.length ? 2 : 1, "0"));
  parts.push((s ?? "0").padStart(2, "0"));
  return parts.join(":");
}

function fmtNum(n: string | undefined): string {
  if (!n) return "?";
  const num = parseInt(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(1)}K`;
  return n;
}

// ─── YouTube Types ────────────────────────────────────────────────────────────
interface YtSearchItem {
  id:      { kind: string; videoId?: string; channelId?: string; playlistId?: string };
  snippet: {
    title:       string;
    description: string;
    channelTitle: string;
    publishedAt:  string;
    thumbnails:   { default: { url: string } };
  };
}

interface YtSearchResponse {
  pageInfo:      { totalResults: number };
  nextPageToken?: string;
  items:         YtSearchItem[];
}

interface YtVideoItem {
  id: string;
  snippet: {
    title: string; description: string; channelTitle: string;
    publishedAt: string; tags?: string[];
  };
  statistics?: {
    viewCount?: string; likeCount?: string; commentCount?: string;
  };
  contentDetails?: { duration: string };
}

interface YtVideoResponse { items: YtVideoItem[] }

interface YtChannelItem {
  id: string;
  snippet:    { title: string; description: string; customUrl?: string; publishedAt: string };
  statistics: { viewCount?: string; subscriberCount?: string; videoCount?: string };
}

interface YtChannelResponse { items: YtChannelItem[] }

interface YtCommentThread {
  snippet: {
    topLevelComment: {
      snippet: {
        authorDisplayName: string;
        textDisplay:       string;
        likeCount:         number;
        publishedAt:       string;
      };
    };
    totalReplyCount: number;
  };
}

interface YtCommentsResponse { items: YtCommentThread[] }

// ─────────────────────────────────────────────────────────────────────────────
// 1. youtube_search — Search videos, channels, playlists
// ─────────────────────────────────────────────────────────────────────────────
export function registerYoutubeSearch(server: McpServer): void {
  server.registerTool("youtube_search", {
    title: "YouTube Search",
    description: `Search YouTube for videos, channels, or playlists using YouTube Data API v3.

Args:
  - query: Search terms
  - type: Content type — 'video' (default), 'channel', 'playlist', or 'all'
  - num: Number of results (1–50, default 10)
  - order: Sort order — 'relevance' (default), 'date', 'viewCount', 'rating'
  - duration: Video duration filter — 'short' (<4 min), 'medium' (4–20 min), 'long' (>20 min)
  - published_after: ISO date string e.g. '2024-01-01T00:00:00Z'
  - lang: Language/region code (e.g. 'ar', 'en')
  - safe_search: 'none', 'moderate' (default), 'strict'
  - response_format: 'markdown' or 'json'

Returns: Video/channel/playlist results with titles, URLs, view counts, durations.`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500),
      type:            z.enum(["video","channel","playlist","all"]).default("video"),
      num:             z.number().int().min(1).max(50).default(10),
      order:           z.enum(["relevance","date","viewCount","rating"]).default("relevance"),
      duration:        z.enum(["short","medium","long"]).optional()
                        .describe("short <4min, medium 4-20min, long >20min"),
      published_after: z.string().optional().describe("ISO date: '2024-01-01T00:00:00Z'"),
      lang:            z.string().optional().describe("Language code: 'ar', 'en', 'fr'"),
      safe_search:     z.enum(["none","moderate","strict"]).default("moderate"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, type, num, order, duration, published_after, lang, safe_search, response_format }) => {
    const params: Record<string, unknown> = {
      part:       "snippet",
      q:          query,
      type:       type === "all" ? undefined : type,
      maxResults: num,
      order,
      safeSearch: safe_search,
    };
    if (duration)        params["videoDuration"]  = duration;
    if (published_after) params["publishedAfter"] = published_after;
    if (lang)            params["relevanceLanguage"] = lang;

    const data = await ytGet<YtSearchResponse>("search", params);
    const items = data.items ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: truncate(JSON.stringify(items, null, 2)) }] };
    }

    if (!items.length) {
      return { content: [{ type: "text", text: `No results found for "${query}".` }] };
    }

    const lines = items.map((item, i) => {
      const { title, channelTitle, publishedAt, description } = item.snippet;
      const date = publishedAt.slice(0, 10);
      let url = "";
      if (item.id.videoId)     url = `https://youtube.com/watch?v=${item.id.videoId}`;
      else if (item.id.channelId)  url = `https://youtube.com/channel/${item.id.channelId}`;
      else if (item.id.playlistId) url = `https://youtube.com/playlist?list=${item.id.playlistId}`;

      return [
        `**${i + 1}. [${title}](${url})**`,
        `📺 ${channelTitle} · 📅 ${date}`,
        description ? `> ${description.slice(0, 150).replace(/\n/g, " ")}` : "",
      ].filter(Boolean).join("\n");
    });

    return {
      content: [{
        type: "text",
        text: `## 📹 YouTube: "${query}" (${data.pageInfo?.totalResults?.toLocaleString() ?? "?"} results)\n\n${lines.join("\n\n")}`,
      }],
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. youtube_video_details — Full details, stats, and comments for a video
// ─────────────────────────────────────────────────────────────────────────────
export function registerYoutubeVideoDetails(server: McpServer): void {
  server.registerTool("youtube_video_details", {
    title: "YouTube Video Details",
    description: `Get full details, statistics, and top comments for a YouTube video.

Args:
  - video_id: YouTube video ID (the part after ?v= in the URL, e.g. 'dQw4w9WgXcQ')
  - include_comments: Whether to fetch top comments (default: true)
  - max_comments: Number of top comments to return (1–20, default 5)
  - response_format: 'markdown' or 'json'

Returns: Title, description, channel, publish date, view/like/comment counts,
         duration, tags, and top comments with likes.`,
    inputSchema: z.object({
      video_id:         z.string().min(5).max(20).describe("YouTube video ID, e.g. 'dQw4w9WgXcQ'"),
      include_comments: z.boolean().default(true),
      max_comments:     z.number().int().min(1).max(20).default(5),
      response_format:  z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ video_id, include_comments, max_comments, response_format }) => {
    // Fetch video details
    const videoData = await ytGet<YtVideoResponse>("videos", {
      part:  "snippet,statistics,contentDetails",
      id:    video_id,
    });

    const video = videoData.items?.[0];
    if (!video) {
      return { content: [{ type: "text", text: `Video not found: ${video_id}` }] };
    }

    const { snippet, statistics, contentDetails } = video;

    // Optionally fetch comments
    let comments: YtCommentThread[] = [];
    if (include_comments) {
      try {
        const commentData = await ytGet<YtCommentsResponse>("commentThreads", {
          part:       "snippet",
          videoId:    video_id,
          maxResults: max_comments,
          order:      "relevance",
        });
        comments = commentData.items ?? [];
      } catch {
        // Comments might be disabled — silently skip
      }
    }

    if (response_format === "json") {
      return {
        content: [{
          type: "text",
          text: truncate(JSON.stringify({
            id: video_id,
            title:       snippet.title,
            channel:     snippet.channelTitle,
            publishedAt: snippet.publishedAt,
            description: snippet.description,
            duration:    contentDetails ? formatDuration(contentDetails.duration) : null,
            statistics,
            tags:        snippet.tags?.slice(0, 20),
            comments:    comments.map(c => c.snippet.topLevelComment.snippet),
          }, null, 2)),
        }],
      };
    }

    const url  = `https://youtube.com/watch?v=${video_id}`;
    const dur  = contentDetails ? formatDuration(contentDetails.duration) : "?";
    const views = fmtNum(statistics?.viewCount);
    const likes = fmtNum(statistics?.likeCount);
    const comms = fmtNum(statistics?.commentCount);

    const parts = [
      `## 📹 [${snippet.title}](${url})`,
      `**Channel:** ${snippet.channelTitle}`,
      `**Published:** ${snippet.publishedAt.slice(0, 10)}  |  **Duration:** ${dur}`,
      `**Views:** ${views}  |  **Likes:** ${likes}  |  **Comments:** ${comms}`,
      "",
      "### 📝 Description",
      `> ${snippet.description.slice(0, 500).replace(/\n/g, "\n> ")}`,
    ];

    if (snippet.tags?.length) {
      parts.push(`\n**Tags:** ${snippet.tags.slice(0, 10).join(", ")}`);
    }

    if (comments.length) {
      parts.push("\n### 💬 Top Comments");
      comments.forEach((c, i) => {
        const cs = c.snippet.topLevelComment.snippet;
        parts.push(
          `**${i + 1}. ${cs.authorDisplayName}** _(${cs.likeCount} 👍)_\n> ${cs.textDisplay.slice(0, 200)}`
        );
      });
    }

    return { content: [{ type: "text", text: truncate(parts.join("\n")) }] };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. youtube_channel_info — Channel stats and latest videos
// ─────────────────────────────────────────────────────────────────────────────
export function registerYoutubeChannelInfo(server: McpServer): void {
  server.registerTool("youtube_channel_info", {
    title: "YouTube Channel Info",
    description: `Get statistics and latest videos for a YouTube channel.

Args:
  - channel_id: YouTube channel ID (starts with 'UC...') OR channel username/handle
  - latest_videos: Number of latest videos to fetch (0–20, default 5)
  - response_format: 'markdown' or 'json'

Returns: Channel name, subscriber count, total views, video count, and recent uploads.

Tip: To find a channel ID, search the channel name with youtube_search(type='channel').`,
    inputSchema: z.object({
      channel_id:    z.string().min(2).describe("Channel ID (UC...) or username handle"),
      latest_videos: z.number().int().min(0).max(20).default(5),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ channel_id, latest_videos, response_format }) => {
    // Support both channel ID and handle/username
    const isChannelId = channel_id.startsWith("UC");
    const channelParams: Record<string, unknown> = {
      part: "snippet,statistics",
      ...(isChannelId ? { id: channel_id } : { forHandle: channel_id }),
    };

    const channelData = await ytGet<YtChannelResponse>("channels", channelParams);
    const channel = channelData.items?.[0];

    if (!channel) {
      return { content: [{ type: "text", text: `Channel not found: "${channel_id}". Try searching with youtube_search(type='channel').` }] };
    }

    const { snippet, statistics } = channel;

    // Fetch latest videos if requested
    let latestVideos: YtSearchItem[] = [];
    if (latest_videos > 0) {
      const searchData = await ytGet<YtSearchResponse>("search", {
        part:       "snippet",
        channelId:  channel.id,
        type:       "video",
        order:      "date",
        maxResults: latest_videos,
      });
      latestVideos = searchData.items ?? [];
    }

    if (response_format === "json") {
      return {
        content: [{
          type: "text",
          text: truncate(JSON.stringify({
            id:          channel.id,
            title:       snippet.title,
            customUrl:   snippet.customUrl,
            description: snippet.description,
            createdAt:   snippet.publishedAt,
            statistics,
            latestVideos: latestVideos.map(v => ({
              videoId: v.id.videoId,
              title:   v.snippet.title,
              date:    v.snippet.publishedAt.slice(0, 10),
              url:     `https://youtube.com/watch?v=${v.id.videoId}`,
            })),
          }, null, 2)),
        }],
      };
    }

    const channelUrl = `https://youtube.com/channel/${channel.id}`;
    const subs  = fmtNum(statistics.subscriberCount);
    const views = fmtNum(statistics.viewCount);
    const vids  = fmtNum(statistics.videoCount);

    const parts = [
      `## 📺 [${snippet.title}](${channelUrl})`,
      snippet.customUrl ? `**Handle:** @${snippet.customUrl.replace("@","")}` : "",
      `**Subscribers:** ${subs}  |  **Total Views:** ${views}  |  **Videos:** ${vids}`,
      `**Created:** ${snippet.publishedAt.slice(0, 10)}`,
      snippet.description
        ? `\n### 📝 About\n> ${snippet.description.slice(0, 300).replace(/\n/g, " ")}`
        : "",
    ].filter(Boolean);

    if (latestVideos.length) {
      parts.push("\n### 🕐 Latest Videos");
      latestVideos.forEach((v, i) => {
        const vid = v.id.videoId ?? "";
        const date = v.snippet.publishedAt.slice(0, 10);
        parts.push(`${i + 1}. **[${v.snippet.title}](https://youtube.com/watch?v=${vid})** · ${date}`);
      });
    }

    return { content: [{ type: "text", text: truncate(parts.join("\n")) }] };
  });
}
