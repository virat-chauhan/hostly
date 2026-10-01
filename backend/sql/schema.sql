CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('github', 'upload')),
  repo_url TEXT,
  repo_branch TEXT,
  zip_path TEXT,
  runtime TEXT NOT NULL DEFAULT 'node20',
  build_command TEXT NOT NULL DEFAULT '',
  start_command TEXT NOT NULL,
  port INT NOT NULL DEFAULT 3000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS env_vars (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE (project_id, key)
);

CREATE TABLE IF NOT EXISTS deployments (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'building', 'starting', 'running', 'failed', 'stopped', 'cancelled')),
  image_tag TEXT,
  container_id TEXT,
  container_name TEXT,
  host_port INT,
  worker_pid INT,
  cpu_percent REAL,
  mem_usage TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_deployments_project ON deployments(project_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);

CREATE TABLE IF NOT EXISTS build_logs (
  id BIGSERIAL PRIMARY KEY,
  deployment_id INT NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
  line TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_logs_deployment ON build_logs(deployment_id, id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS memory_mb INT NOT NULL DEFAULT 128;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hook_token TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_hook ON projects(hook_token);

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS mem_mb REAL;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS disk_mb REAL;
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS image_mb REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  host TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domains_project ON domains(project_id);

CREATE TABLE IF NOT EXISTS request_logs (
  id BIGSERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INT NOT NULL,
  duration_ms INT NOT NULL,
  wait_ms INT NOT NULL DEFAULT 0,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_project_time ON request_logs(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS usage_samples (
  id BIGSERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cpu_cores REAL NOT NULL,
  mem_mb REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_samples_project_time ON usage_samples(project_id, created_at DESC);
