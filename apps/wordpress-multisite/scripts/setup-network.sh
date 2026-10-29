#!/bin/sh
set -eu

BLOG_URL=http://blog.localhost:8088
NEWS_URL=http://news.localhost:8088

if ! wp core is-installed --network --url="$BLOG_URL" >/dev/null 2>&1; then
  wp core multisite-install \
    --url="$BLOG_URL" \
    --title='HASHPASS Blog' \
    --admin_user="$WP_ADMIN_USER" \
    --admin_password="$WP_ADMIN_PASSWORD" \
    --admin_email="$WP_ADMIN_EMAIL" \
    --skip-email \
    --subdomains
fi

find_news_site_id() {
  wp site list --fields=blog_id,domain --format=csv --url="$BLOG_URL" |
    awk -F, '$2 == "news.localhost:8088" || $2 == "news.blog.localhost:8088" { print $1; exit }'
}

news_id="$(find_news_site_id)"
if [ -z "$news_id" ]; then
  news_id="$(wp site create --slug=news --title='HASHPASS News' --email="$WP_ADMIN_EMAIL" --porcelain)"
fi
wp eval "update_blog_details((int) '$news_id', array('domain' => 'news.localhost:8088', 'path' => '/'));" --url="$BLOG_URL"

ensure_site_user() {
  login="$1"
  email="$2"
  password="$3"
  role="$4"
  site_url="$5"

  if user_id="$(wp user get "$login" --field=ID --url="$site_url" 2>/dev/null)"; then
    is_member="$(wp eval "var_export(is_user_member_of_blog((int) '$user_id', get_current_blog_id()));" --url="$site_url")"
    if [ "$is_member" = "true" ]; then
      wp user set-role "$login" "$role" --url="$site_url"
    else
      wp user add-role "$login" "$role" --url="$site_url"
    fi
  else
    wp user create "$login" "$email" \
      --user_pass="$password" --role="$role" --url="$site_url"
  fi
}

wp theme enable twentytwentyfive --network
wp theme activate twentytwentyfive --url="$BLOG_URL"
wp theme activate twentytwentyfive --url="$NEWS_URL"
wp option update blogname 'HASHPASS Blog' --url="$BLOG_URL"
wp option update blogdescription 'Stories, ideas, and updates from HASHPASS.' --url="$BLOG_URL"
wp option update blogname 'HASHPASS News' --url="$NEWS_URL"
wp option update blogdescription 'Official news and announcements from HASHPASS.' --url="$NEWS_URL"

ensure_site_user blogwriter blog-writer@example.test "$BLOG_WRITER_PASSWORD" contributor "$BLOG_URL"
ensure_site_user newswriter news-writer@example.test "$NEWS_WRITER_PASSWORD" contributor "$NEWS_URL"
ensure_site_user sharededitor editor@example.test "$SHARED_EDITOR_PASSWORD" editor "$BLOG_URL"
ensure_site_user sharededitor editor@example.test "$SHARED_EDITOR_PASSWORD" editor "$NEWS_URL"

ensure_sample_post() {
  site_url="$1"
  slug="$2"
  title="$3"
  content="$4"

  if wp post list --post_type=post --post_status=publish --fields=post_name --format=csv --url="$site_url" |
    grep -qx "$slug"; then
    return
  fi

  wp post create --post_name="$slug" --post_title="$title" \
    --post_content="$content" --post_status=publish --post_type=post \
    --url="$site_url" >/dev/null
}

ensure_sample_post "$BLOG_URL" welcome-hashpass-blog \
  'Welcome to the HASHPASS Blog' \
  'The Blog site is ready for editorial content.'
ensure_sample_post "$NEWS_URL" welcome-hashpass-news \
  'Welcome to HASHPASS News' \
  'The News site is ready for official announcements.'

echo 'Local network provisioned. Blog and News have independent content, site-scoped contributors, and a shared editor.'
