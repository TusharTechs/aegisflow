# Xano setup (optional — LOCAL mode is the default)

1. Create a Xano workspace and four tables with exactly these fields:

**incident**: incident_key (text), supplier (text), affected_product (text), status (text),
inventory_days (integer), revenue_exposure (integer), state (text), evidence_json (json)

**supplier**: incident_id (integer), supplier_key (text), name (text), location (text),
lead_time_days (integer), cost_multiplier (float), risk_score (integer),
recommendation (boolean), recommendation_reasoning (text)

**claim**: supplier_id (integer), claim_key (text), text (text), source (text), ts (text),
confidence (integer), status (text), conflict_reason (text), document_evidence (json)

**audit_event**: incident_id (integer), event_ts (text), event (text), actor (text)

2. Create standard CRUD endpoints for each table (Xano generates these).
3. Set env vars:

```
XANO_API_BASE=https://api.xano.com/api:YOUR_WORKSPACE
XANO_API_TOKEN=            # only if endpoints require auth
XANO_AUTO_SEED=true        # seeds INC-1042 on first access
```

4. Restart. The shell footer shows `Persistence: XANO`.