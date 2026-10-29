#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/compose.yaml"
PROJECT="hashpass-content-smoke-$$"
ENV_FILE="$(mktemp)"
chmod 600 "$ENV_FILE"
cat >"$ENV_FILE" <<'ENV'
WORDPRESS_DB_PASSWORD=smoke-db-password-only
MARIADB_ROOT_PASSWORD=smoke-root-password-only
WP_ADMIN_USER=smokeadmin
WP_ADMIN_PASSWORD=smoke-admin-password-only
WP_ADMIN_EMAIL=smoke@example.test
BLOG_WRITER_PASSWORD=smoke-blog-password-only
NEWS_WRITER_PASSWORD=smoke-news-password-only
SHARED_EDITOR_PASSWORD=smoke-editor-password-only
ENV
WP_CLI=(docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$COMPOSE_FILE" run --rm --no-deps wp-cli)

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing local WordPress Multisite compose file: $COMPOSE_FILE" >&2
  exit 1
fi

cleanup() {
  docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$ENV_FILE"
}
trap cleanup EXIT

assert_news_login_uses_mapped_domain() {
  local news_url=http://news.localhost:8088
  local news_home news_siteurl news_login_form news_login_headers

  news_home="$("${WP_CLI[@]}" option get home --url="$news_url")"
  news_siteurl="$("${WP_CLI[@]}" option get siteurl --url="$news_url")"
  [[ "$news_home" == "$news_url" ]] || {
    echo "Expected News home URL $news_url, got $news_home" >&2
    return 1
  }
  [[ "$news_siteurl" == "$news_url" ]] || {
    echo "Expected News site URL $news_url, got $news_siteurl" >&2
    return 1
  }

  news_login_form="$(curl --silent --show-error --resolve news.localhost:8088:127.0.0.1 "$news_url/wp-login.php")"
  grep -Fq 'action="http://news.localhost:8088/wp-login.php"' <<<"$news_login_form" || {
    echo 'News login form action does not use the mapped domain' >&2
    return 1
  }
  grep -Fq 'value="http://news.localhost:8088/wp-admin/"' <<<"$news_login_form" || {
    echo 'News login redirect does not use the mapped domain' >&2
    return 1
  }

  news_login_headers="$(curl --silent --show-error --resolve news.localhost:8088:127.0.0.1 --dump-header - --output /dev/null "$news_url/wp-login.php")"
  grep -Eiq 'Set-Cookie: wordpress_test_cookie=[^;]+;[[:space:]]*path=/;[[:space:]]*domain=\.?news\.localhost;' <<<"$news_login_headers" || {
    echo 'News login test cookie does not use the mapped domain' >&2
    return 1
  }
}

# Use a unique project and throw away all test data on exit.
docker compose --env-file "$ENV_FILE" -p "$PROJECT" -f "$COMPOSE_FILE" up -d db wordpress
WP_ENV_FILE="$ENV_FILE" WP_PROJECT="$PROJECT" "$ROOT_DIR/scripts/setup-local.sh"

sites="$("${WP_CLI[@]}" site list --fields=domain --format=csv)"
grep -Eq '^blog\.localhost(:8088)?$' <<<"$sites"
grep -Eq '^news\.localhost(:8088)?$' <<<"$sites"
assert_news_login_uses_mapped_domain

blog_role="$("${WP_CLI[@]}" user get blogwriter --field=roles --url=http://blog.localhost:8088)"
news_role="$("${WP_CLI[@]}" user get newswriter --field=roles --url=http://news.localhost:8088)"
blog_editor_role="$("${WP_CLI[@]}" user get sharededitor --field=roles --url=http://blog.localhost:8088)"
news_editor_role="$("${WP_CLI[@]}" user get sharededitor --field=roles --url=http://news.localhost:8088)"
[[ "$blog_role" == *contributor* ]]
[[ "$news_role" == *contributor* ]]
[[ "$blog_editor_role" == *editor* ]]
[[ "$news_editor_role" == *editor* ]]

blog_writer_can_edit_others="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "blogwriter"), "edit_others_posts"));' --url=http://blog.localhost:8088)"
blog_writer_can_publish="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "blogwriter"), "publish_posts"));' --url=http://blog.localhost:8088)"
blog_writer_on_news="$("${WP_CLI[@]}" eval 'var_export(is_user_member_of_blog(get_user_by("login", "blogwriter")->ID, get_current_blog_id()));' --url=http://news.localhost:8088)"
news_writer_on_blog="$("${WP_CLI[@]}" eval 'var_export(is_user_member_of_blog(get_user_by("login", "newswriter")->ID, get_current_blog_id()));' --url=http://blog.localhost:8088)"
news_writer_can_edit_others="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "newswriter"), "edit_others_posts"));' --url=http://news.localhost:8088)"
news_writer_can_publish="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "newswriter"), "publish_posts"));' --url=http://news.localhost:8088)"
shared_editor_can_edit_others="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "sharededitor"), "edit_others_posts"));' --url=http://news.localhost:8088)"
shared_editor_can_publish_blog="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "sharededitor"), "publish_posts"));' --url=http://blog.localhost:8088)"
shared_editor_can_publish_news="$("${WP_CLI[@]}" eval 'var_export(user_can(get_user_by("login", "sharededitor"), "publish_posts"));' --url=http://news.localhost:8088)"
admin_is_super_admin="$("${WP_CLI[@]}" eval 'var_export(is_super_admin(get_user_by("login", "smokeadmin")->ID));' --url=http://blog.localhost:8088)"
blog_writer_is_super_admin="$("${WP_CLI[@]}" eval 'var_export(is_super_admin(get_user_by("login", "blogwriter")->ID));' --url=http://blog.localhost:8088)"
news_writer_is_super_admin="$("${WP_CLI[@]}" eval 'var_export(is_super_admin(get_user_by("login", "newswriter")->ID));' --url=http://news.localhost:8088)"
shared_editor_is_super_admin="$("${WP_CLI[@]}" eval 'var_export(is_super_admin(get_user_by("login", "sharededitor")->ID));' --url=http://blog.localhost:8088)"
[[ "$blog_writer_can_edit_others" == "false" ]]
[[ "$blog_writer_can_publish" == "false" ]]
[[ "$blog_writer_on_news" == "false" ]]
[[ "$news_writer_on_blog" == "false" ]]
[[ "$news_writer_can_edit_others" == "false" ]]
[[ "$news_writer_can_publish" == "false" ]]
[[ "$shared_editor_can_edit_others" == "true" ]]
[[ "$shared_editor_can_publish_blog" == "true" ]]
[[ "$shared_editor_can_publish_news" == "true" ]]
[[ "$admin_is_super_admin" == "true" ]]
[[ "$blog_writer_is_super_admin" == "false" ]]
[[ "$news_writer_is_super_admin" == "false" ]]
[[ "$shared_editor_is_super_admin" == "false" ]]

blogwriter_id_before="$("${WP_CLI[@]}" user get blogwriter --field=ID --url=http://blog.localhost:8088)"
newswriter_id_before="$("${WP_CLI[@]}" user get newswriter --field=ID --url=http://news.localhost:8088)"
sharededitor_id_before="$("${WP_CLI[@]}" user get sharededitor --field=ID --url=http://blog.localhost:8088)"

# Simulate an interrupted bootstrap: the network exists but News was removed.
news_site_id="$("${WP_CLI[@]}" site list --fields=blog_id,domain --format=csv --url=http://blog.localhost:8088 | awk -F, '$2 == "news.localhost:8088" { print $1 }')"
[[ -n "$news_site_id" ]]
"${WP_CLI[@]}" site delete "$news_site_id" --yes --url=http://blog.localhost:8088
WP_ENV_FILE="$ENV_FILE" WP_PROJECT="$PROJECT" "$ROOT_DIR/scripts/setup-local.sh"
restored_sites="$("${WP_CLI[@]}" site list --fields=domain --format=csv --url=http://blog.localhost:8088)"
grep -Eq '^news\.localhost(:8088)?$' <<<"$restored_sites"
assert_news_login_uses_mapped_domain
restored_news_role="$("${WP_CLI[@]}" user get newswriter --field=roles --url=http://news.localhost:8088)"
[[ "$restored_news_role" == *contributor* ]]
[[ "$("${WP_CLI[@]}" user get blogwriter --field=ID --url=http://blog.localhost:8088)" == "$blogwriter_id_before" ]]
[[ "$("${WP_CLI[@]}" user get newswriter --field=ID --url=http://news.localhost:8088)" == "$newswriter_id_before" ]]
[[ "$("${WP_CLI[@]}" user get sharededitor --field=ID --url=http://blog.localhost:8088)" == "$sharededitor_id_before" ]]
blog_post_names="$("${WP_CLI[@]}" post list --post_type=post --post_status=publish --fields=post_name --format=csv --url=http://blog.localhost:8088)"
news_post_names="$("${WP_CLI[@]}" post list --post_type=post --post_status=publish --fields=post_name --format=csv --url=http://news.localhost:8088)"
[[ "$(grep -xc 'welcome-hashpass-blog' <<<"$blog_post_names")" == 1 ]]
[[ "$(grep -xc 'welcome-hashpass-news' <<<"$news_post_names")" == 1 ]]

blog_status="$(curl --silent --show-error --location --resolve blog.localhost:8088:127.0.0.1 --output /dev/null --write-out '%{http_code}' http://blog.localhost:8088/)"
news_status="$(curl --silent --show-error --location --resolve news.localhost:8088:127.0.0.1 --output /dev/null --write-out '%{http_code}' http://news.localhost:8088/)"
blog_body="$(curl --silent --show-error --location --resolve blog.localhost:8088:127.0.0.1 http://blog.localhost:8088/)"
news_body="$(curl --silent --show-error --location --resolve news.localhost:8088:127.0.0.1 http://news.localhost:8088/)"
[[ "$blog_status" == 200 ]]
[[ "$news_status" == 200 ]]
grep -q 'Welcome to the HASHPASS Blog' <<<"$blog_body"
grep -q 'Welcome to HASHPASS News' <<<"$news_body"

echo "WordPress Multisite smoke passed: both sites serve, scoped writers are contributors, and shared editor can edit both."
