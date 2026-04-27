-- 0001_init.sql — initial schema

CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  handle      TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id            BIGSERIAL PRIMARY KEY,
  author_id     BIGINT NOT NULL REFERENCES users(id),
  body          TEXT NOT NULL,
  published_at  TIMESTAMPTZ
);

CREATE TABLE comments (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES posts(id),
  author_id   BIGINT NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
