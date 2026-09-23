CREATE TABLE reporter_maintenance_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','succeeded','partial','failed')),
  source TEXT CHECK (source IN ('automatic','manual','command')),
  actor TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  scheduler_seen_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO reporter_maintenance_state(id) VALUES (1);
