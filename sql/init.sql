-- Used to initialize the database schema

-- Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    salt TEXT NOT NULL,
    binary BLOB NOT NULL,
    encryption_key TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id ON users (id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users (last_login DESC);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at DESC);

-- Tokens
CREATE TABLE IF NOT EXISTS tokens (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    owner TEXT NOT NULL,
    token BLOB NOT NULL,
    encryption_key TEXT NOT NULL,
    encryption_iv TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    lookup_hash TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    is_session BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at TIMESTAMP DEFAULT (datetime('now', '+30 days')) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_lookup_hash ON tokens (lookup_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_owner ON tokens (owner);
CREATE INDEX IF NOT EXISTS idx_tokens_is_session ON tokens (is_session);
CREATE INDEX IF NOT EXISTS idx_tokens_expires_at ON tokens (expires_at);

-- Events

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    binary BLOB NOT NULL,
    hostId TEXT NOT NULL,
    name TEXT NOT NULL,
    attendees TEXT NOT NULL,
    latitude DOUBLE,
    longitude DOUBLE,
    date DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_id ON events(id);
CREATE INDEX IF NOT EXISTS idx_events_hostId ON events(hostId);
CREATE INDEX IF NOT EXISTS idx_events_name ON events(name);
CREATE INDEX IF NOT EXISTS idx_events_attendees ON events(attendees);
CREATE INDEX IF NOT EXISTS idx_events_latitude ON events(latitude);
CREATE INDEX IF NOT EXISTS idx_events_longitude ON events(longitude);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);

-- Activities

CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    binary BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_id ON activities(id);

-- Prompts
CREATE TABLE IF NOT EXISTS prompts (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    prompt TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'PUBLIC',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prompts_owner_id ON prompts(owner_id);
CREATE INDEX IF NOT EXISTS idx_prompts_prompt ON prompts(prompt);
CREATE INDEX IF NOT EXISTS idx_prompts_visibility ON prompts(visibility);

CREATE TABLE IF NOT EXISTS prompt_responses (
    id TEXT PRIMARY KEY NOT NULL UNIQUE,
    prompt_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_responses_prompt_id ON prompt_responses(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_responses_owner_id ON prompt_responses(owner_id);
CREATE INDEX IF NOT EXISTS idx_prompt_responses_response ON prompt_responses(response);
CREATE INDEX IF NOT EXISTS idx_prompt_responses_created_at ON prompt_responses(created_at);