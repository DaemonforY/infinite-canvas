#!/bin/sh
set -e

# Executed automatically by the official nginx image entrypoint through /docker-entrypoint.d/*.sh before nginx starts.
# Generate runtime config.js from environment variables. Each analytics provider has an independent variable;
# unset providers remain disabled, load no scripts, and send no external requests. Multiple providers may be enabled together.

# GA4 and Baidu IDs contain only letters, numbers, and hyphens. Remove other characters
# so quotes and similar values cannot break the JavaScript strings in config.js as a defense-in-depth measure.
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

# URLs may contain scheme, host, port and path characters only; names allow letters, digits, spaces and a few separators.
sanitize_url() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9:/._%-'
}
sanitize_name() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9 ._-'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")
BAIDU_ID=$(sanitize_id "${ANALYTICS_BAIDU_ID:-}")
MAIN_SITE_URL_VALUE=$(sanitize_url "${MAIN_SITE_URL:-}")
MAIN_SITE_NAME_VALUE=$(sanitize_name "${MAIN_SITE_NAME:-}")
MAIN_SITE_API_BASE_URL_VALUE=$(sanitize_url "${MAIN_SITE_API_BASE_URL:-}")
DEFAULT_SKIN_VALUE=$(sanitize_id "${DEFAULT_SKIN:-}")
# "Name|https://url,Name2|https://url2": letters, digits, URL characters, | and , only.
PARTNER_SITES_VALUE=$(printf '%s' "${PARTNER_SITES:-}" | tr -cd 'A-Za-z0-9:/._%|, -')

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  ANALYTICS_GA4_ID: "${GA4_ID}",
  ANALYTICS_BAIDU_ID: "${BAIDU_ID}",
  MAIN_SITE_URL: "${MAIN_SITE_URL_VALUE}",
  MAIN_SITE_NAME: "${MAIN_SITE_NAME_VALUE}",
  MAIN_SITE_API_BASE_URL: "${MAIN_SITE_API_BASE_URL_VALUE}",
  DEFAULT_SKIN: "${DEFAULT_SKIN_VALUE}",
  PARTNER_SITES: "${PARTNER_SITES_VALUE}"
};
EOF
