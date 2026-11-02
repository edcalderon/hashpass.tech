import { translateNotification } from '../../lib/notification-translations';

const notificationTypes = [
  ['marketing_campaign_approval_requested', 'Campaign approval requested'],
  ['marketing_campaign_approved', 'Campaign approved'],
  ['marketing_campaign_declined', 'Campaign declined'],
] as const;

describe('marketing campaign notifications', () => {
  it.each(notificationTypes)('translates the title for %s and preserves its full description', (type, title) => {
    const message = 'Campaign details, audience, schedule, destination and artwork.';
    const translations: Record<string, string> = { [`types.${type}.title`]: title };
    const translated = translateNotification(
      { type, title: 'Stored notification title', message },
      key => translations[key] || key,
    );

    expect(translated).toEqual({ title, message });
  });
});
