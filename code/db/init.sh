#!/bin/sh
# Only schema scripts belong in first-run initialization; demos run manually.
(
    set -eu
    for script in /schema/[0-9][0-9]_*.sql; do
        echo "Applying $script"
        psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
            --set ON_ERROR_STOP=1 --file "$script"
    done
)
