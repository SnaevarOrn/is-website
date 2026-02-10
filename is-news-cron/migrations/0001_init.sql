-- migrations/0001_init.sql

PRAGMA foreign_keys = ON;

-- 1) Feeds (each RSS URL)
CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  last_polled_at TEXT,
  last_ok_at TEXT,
  last_status INTEGER,
  last_error TEXT,
  UNIQUE(feed_url)
);

CREATE INDEX IF NOT EXISTS idx_feeds_source_id ON feeds(source_id);

-- 2) Articles (deduped by URL)
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  url_norm TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TEXT,
  source_id TEXT NOT NULL,
  source_label TEXT,
  category_id TEXT NOT NULL,
  description TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE(url_norm)
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_source_id ON articles(source_id);
CREATE INDEX IF NOT EXISTS idx_articles_category_id ON articles(category_id);

-- 3) Search index (simple LIKE search)
CREATE TABLE IF NOT EXISTS article_search (
  article_id INTEGER PRIMARY KEY,
  haystack TEXT NOT NULL,
  FOREIGN KEY(article_id) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_article_search_haystack ON article_search(haystack);
