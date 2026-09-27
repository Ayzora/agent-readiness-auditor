CREATE TABLE site (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    host TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_id BIGINT NOT NULL REFERENCES site(id),
    typed_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ruleset_version TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT check_valid_status CHECK (status IN ('running', 'done', 'failed')),
    coverage JSON NOT NULL
);

CREATE TABLE finding(
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    audit_id BIGINT NOT NULL REFERENCES audit(id),
    criterion_key TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT check_valid_status CHECK (status IN ('pass', 'fail', 'warn', 'skip')),
    evidence JSON NOT NULL
);

CREATE INDEX finding_audit_id_id_idx ON finding (audit_id, id);
CREATE INDEX audit_site_id_created_at_idx ON audit (site_id, created_at DESC);

ALTER TABLE site ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE finding ENABLE ROW LEVEL SECURITY;
