// ─── Common ───────────────────────────────────────────────────────────────────
export interface PaginationMeta {
  total_results?: number;
  has_more:       boolean;
  next_page?:     number;
}

export type ResponseFormat = "json" | "markdown";

// ─── SerpAPI ──────────────────────────────────────────────────────────────────
export interface SerpApiParams {
  engine?:   string;
  q?:        string;
  query?:    string;
  api_key:   string;
  num?:      number;
  start?:    number;
  hl?:       string;
  gl?:       string;
  location?: string;
  tbm?:      string;
  tbs?:      string;
  safe?:     string;
  [key: string]: unknown;
}

// ─── Google Web Results ───────────────────────────────────────────────────────
export interface GoogleOrganicResult {
  position:     number;
  title:        string;
  link:         string;
  displayed_link?: string;
  snippet?:     string;
  date?:        string;
  sitelinks?:   { title: string; link: string }[];
}

export interface GoogleSearchResponse {
  search_metadata: { status: string; total_time_taken?: number };
  search_information?: { total_results?: string; time_taken_displayed?: number };
  organic_results?:    GoogleOrganicResult[];
  answer_box?:         Record<string, unknown>;
  knowledge_graph?:    Record<string, unknown>;
  related_questions?:  { question: string; snippet?: string; link?: string }[];
  ai_overview?:        { text_blocks?: { type: string; snippet?: string }[] };
  pagination?:         { next?: string; next_page_token?: string };
}

// ─── Google Images ────────────────────────────────────────────────────────────
export interface GoogleImageResult {
  position:         number;
  title:            string;
  original:         string;
  original_width?:  number;
  original_height?: number;
  source:           string;
  link:             string;
  thumbnail:        string;
}

export interface GoogleImagesResponse {
  images_results?: GoogleImageResult[];
  pagination?:     { next?: string; next_page_token?: string };
}

// ─── Google News ──────────────────────────────────────────────────────────────
export interface GoogleNewsResult {
  position:   number;
  title:      string;
  link:       string;
  source:     string;
  date?:      string;
  snippet?:   string;
  thumbnail?: string;
}

export interface GoogleNewsResponse {
  news_results?: GoogleNewsResult[];
}

// ─── Google Scholar ───────────────────────────────────────────────────────────
export interface ScholarResult {
  position:     number;
  title:        string;
  link?:        string;
  result_id?:   string;
  snippet?:     string;
  publication_info?: {
    summary?: string;
    authors?: { name: string; link?: string }[];
  };
  inline_links?: {
    cited_by?:   { total?: number; link?: string };
    versions?:   { total?: number; link?: string };
    html_version?: string;
    pdf?:        { link?: string };
  };
}

export interface GoogleScholarResponse {
  organic_results?: ScholarResult[];
  pagination?:      { next?: string };
}

// ─── Google AI Overview ───────────────────────────────────────────────────────
export interface AiOverviewBlock {
  type:     string;
  snippet?: string;
  list?:    string[];
}

export interface GoogleAiResponse extends GoogleSearchResponse {
  ai_overview?: {
    text_blocks?: AiOverviewBlock[];
    sources?:     { title: string; link: string }[];
  };
}

// ─── Bing ─────────────────────────────────────────────────────────────────────
export interface BingOrganicResult {
  position:   number;
  title:      string;
  link:       string;
  snippet?:   string;
  date?:      string;
}

export interface BingSearchResponse {
  organic_results?: BingOrganicResult[];
  pagination?:      { next?: string };
}

export interface BingImageResult {
  position:          number;
  title:             string;
  link:              string;
  image?:            string;
  thumbnail?:        string;
  source:            string;
  image_width?:      number;
  image_height?:     number;
}

export interface BingImagesResponse {
  images_results?: BingImageResult[];
}

export interface BingNewsResult {
  position: number;
  title:    string;
  link:     string;
  source?:  string;
  date?:    string;
  snippet?: string;
}

export interface BingNewsResponse {
  organic_results?: BingNewsResult[];
}

// ─── DuckDuckGo ───────────────────────────────────────────────────────────────
export interface DdgTopic {
  Text?:         string;
  FirstURL?:     string;
  Icon?:         { URL?: string };
  Topics?:       DdgTopic[];
  Name?:         string;
}

export interface DdgInstantResponse {
  Abstract?:      string;
  AbstractURL?:   string;
  AbstractText?:  string;
  AbstractSource?: string;
  Answer?:        string;
  AnswerType?:    string;
  Definition?:    string;
  DefinitionURL?: string;
  Entity?:        string;
  Heading?:       string;
  Image?:         string;
  RelatedTopics?: DdgTopic[];
  Results?:       { Text?: string; FirstURL?: string }[];
  Type?:          string;
}

export interface DdgResult {
  title:    string;
  url:      string;
  snippet?: string;
}
