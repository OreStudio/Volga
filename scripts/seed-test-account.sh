#!/usr/bin/env bash
# Seed a deterministic test account for the TypeScript client.
#
# The password hash must come from the project's own hasher, so this script
# calls a small C++ helper linked against libores.security rather than
# reimplementing scrypt here. A hash built any other way would risk a subtly
# different format that the server rejects.
#
# The service under test runs with a tenant context, and row level security
# restricts every read to that tenant. The account is therefore created in an
# explicit tenant and granted that tenant's parties, so the login resolves and
# the party selection path has something to select.
#
# Idempotent: re-running retires the previous row and inserts a fresh one, so
# exactly one current row exists and the password is whatever was passed.
#
# Usage:
#   scripts/seed-test-account.sh [username] [password]
#
# Environment:
#   TENANT_ID      Tenant for the new account (default: the system tenant).
#   AUDIT_ACCOUNT  Real username recorded in the audit columns.
set -euo pipefail

CHECKOUT="${CHECKOUT:-/mnt/development/OreStudio/ores_dev_festive_dijkstra}"
USERNAME="${1:-volga_probe}"
PASSWORD="${2:-Secure-Password-123}"
TENANT_ID="${TENANT_ID:-ffffffff-ffff-ffff-ffff-ffffffffffff}"
AUDIT_ACCOUNT="${AUDIT_ACCOUNT:-sysadmin}"
CHANGE_REASON="${CHANGE_REASON:-system.test}"

WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$WORKSPACE/.runtime/build/make-test-hash"

if [[ ! -x "$HELPER" ]]; then
  echo "helper not built: $HELPER (build with the command in the README)" >&2
  exit 1
fi

export PGPASSWORD="$(sed -n 's/^PGPASSWORD=//p' "$CHECKOUT/.env" | head -1)"

psql_admin() {
  psql -h localhost -U postgres -d ores_dev_festive_dijkstra -v ON_ERROR_STOP=1 -qtA "$@"
}

HASH="$(LD_LIBRARY_PATH="$CHECKOUT/build/output/linux-clang-debug-make/publish/lib" \
  "$HELPER" "$USERNAME" "$PASSWORD" | cut -f2)"

if [[ -z "$HASH" ]]; then
  echo "helper produced no hash" >&2
  exit 1
fi

# Every mutation is a data-modifying CTE, and the final `select` is what makes
# the engine evaluate them. `target` pins the current row before retirement, so
# the party rows close against the same account id.
psql_admin <<SQL
begin;

with target as (
  select id, tenant_id
    from ores_iam_accounts_tbl
   where username = '${USERNAME}'
     and valid_to = ores_utility_infinity_timestamp_fn()
),
retire_parties as (
  update ores_iam_account_parties_tbl
     set valid_to = now()
   where (account_id, tenant_id) in (select id, tenant_id from target)
     and valid_to = ores_utility_infinity_timestamp_fn()
  returning 1
),
retire_account as (
  update ores_iam_accounts_tbl
     set valid_to = now()
   where (id, tenant_id) in (select id, tenant_id from target)
     and valid_to = ores_utility_infinity_timestamp_fn()
  returning 1
),
inserted_account as (
  insert into ores_iam_accounts_tbl (
    id, tenant_id, version, account_type, username, full_name,
    password_hash, password_salt, totp_secret, email,
    modified_by, change_reason_code, change_commentary, performed_by,
    valid_from, valid_to
  )
  values (
    gen_random_uuid(),
    '${TENANT_ID}',
    0,
    'user',
    '${USERNAME}',
    'Volga Test Account',
    '${HASH}',
    '',
    '',
    '${USERNAME}@volga.test',
    '${AUDIT_ACCOUNT}',
    '${CHANGE_REASON}',
    'seeded by volga seed-test-account.sh',
    '${AUDIT_ACCOUNT}',
    now(),
    ores_utility_infinity_timestamp_fn()
  )
  returning id, tenant_id
),
granted_parties as (
  insert into ores_iam_account_parties_tbl (
    account_id, tenant_id, party_id, version,
    modified_by, performed_by, change_reason_code, change_commentary,
    valid_from, valid_to
  )
  select
    ia.id, ia.tenant_id, p.id, 0,
    '${AUDIT_ACCOUNT}', '${AUDIT_ACCOUNT}', '${CHANGE_REASON}',
    'seeded by volga seed-test-account.sh',
    now(), ores_utility_infinity_timestamp_fn()
  from inserted_account ia
  join ores_refdata_parties_tbl p
    on p.tenant_id = ia.tenant_id
   and p.valid_to = ores_utility_infinity_timestamp_fn()
   and p.status = 'Active'
  returning 1
),
-- The login handler refuses an account with no tracking row, and increments
-- failed_logins on it, so every loginable account needs one.
login_tracking as (
  insert into ores_iam_login_info_tbl (
    tenant_id, account_id, last_ip, last_attempt_ip,
    failed_logins, locked, last_login, online, password_reset_required
  )
  select
    ia.tenant_id, ia.id, '0.0.0.0', '0.0.0.0',
    0, 0, now(), 0, 0
  from inserted_account ia
  on conflict (account_id) do update
    set tenant_id = excluded.tenant_id,
        failed_logins = 0,
        locked = 0,
        online = 0,
        password_reset_required = 0
  returning 1
)
select
  (select count(*) from retire_account) as retired,
  (select count(*) from inserted_account) as inserted,
  (select count(*) from granted_parties) as parties,
  (select count(*) from login_tracking) as tracking;

commit;
SQL

echo "seeded ${USERNAME} in tenant ${TENANT_ID} with password ${PASSWORD}"
psql_admin -c "
select a.username || ' tenant=' || a.tenant_id || ' parties=' || count(ap.party_id)
from ores_iam_accounts_tbl a
left join ores_iam_account_parties_tbl ap
  on ap.account_id = a.id and ap.tenant_id = a.tenant_id
 and ap.valid_to = ores_utility_infinity_timestamp_fn()
where a.username = '${USERNAME}'
  and a.valid_to = ores_utility_infinity_timestamp_fn()
group by a.username, a.tenant_id"
