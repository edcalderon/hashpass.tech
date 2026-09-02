# Event banner media standard

Event banners render live title, subtitle, date, countdown, program status, and
calls to action. The banner copy is the source of truth; the media supports it.

## Rule

- Use a clean video, photo, texture, or illustration behind banner copy.
- Never use a flyer, poster, sponsor lock-up, wordmark, agenda, date card, or
  other asset containing readable promotional text as a banner background.
- Static image media is blocked by default. It can only render behind banner
  copy when its `textOverlaySafe` flag is explicitly set to `true` after visual
  review at desktop and mobile widths.
- Use `heroVideo` for a clean event film on event-detail, agenda, and speaker
  pages. It is muted, looping, and paired with the event's logo as its loader.

## Review checklist

1. The focal area behind the title, date, and timer is quiet enough to read.
2. No text or logo inside the asset overlaps or repeats live UI copy.
3. The built-in dark gradient still achieves clear contrast in light and dark
   mode.
4. The event logo appears once in the intended brand position, not baked into
   the background.

The `EventBanner` component enforces the static-image rule, and
`EventBannerCarousel` passes approval only from `media.textOverlaySafe`.
