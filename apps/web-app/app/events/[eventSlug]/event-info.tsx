import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, useWindowDimensions } from 'react-native';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import EventBanner from '../../../components/EventBanner';

export default function BSL2025EventInfoScreen() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark, colors);
  const sliderRef = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();
  const slideWidth = Math.max(Math.min(width - 40, 540), 320);
  const slideGap = 12;
  const slidePadding = Math.max(0, (width - slideWidth) / 2);
  const [activeSlide, setActiveSlide] = useState(0);
  const eventId = event?.id || 'bsl';
  const eventDateLabel = event?.eventDateString || event?.subtitle || 'Tour 2026';
  const eventLocationLabel = event?.tour?.city && event?.tour?.country
    ? `${event.tour.city}, ${event.tour.country}`
    : event?.subtitle || 'Latin America';
  const venueLabel = event?.tour?.venue || event?.subtitle || 'Blockchain Summit Latam';
  const isArchiveEvent = event?.tour?.role === 'archive' || eventId === 'bsl2025';
  
  // Check if event is finished
  const [isEventFinished, setIsEventFinished] = useState(false);
  useEffect(() => {
    const checkEventFinished = () => {
      const now = new Date();
      const end = event?.eventEndDate ? new Date(event.eventEndDate) : null;
      setIsEventFinished(Boolean(end && now > end));
    };
    checkEventFinished();
    const interval = setInterval(checkEventFinished, 60000);
    return () => clearInterval(interval);
  }, [event?.eventEndDate]);

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open link:', err));
  };

  const aboutParagraphs = useMemo(
    () => [
      `${event?.title || 'Blockchain Summit Latam'} brings together blockchain, cryptocurrency, and financial technology professionals across Latin America.`,
      'This edition connects industry leaders, regulators, innovators, and entrepreneurs around the future of digital finance and blockchain technology in the region.',
      'Join us for keynotes, interactive panels, networking opportunities, and workshops covering topics from CBDCs and digital banking to regulatory frameworks and emerging technologies.',
    ],
    [event?.title]
  );

  const eventInfo = [
    {
      title: 'Event Details',
      items: [
        { icon: 'event', label: 'Date', value: eventDateLabel },
        { icon: 'location-on', label: 'Location', value: eventLocationLabel },
        { icon: 'business', label: 'Venue', value: venueLabel },
        { icon: 'language', label: 'Language', value: 'Spanish & English' },
      ]
    },
    {
      title: 'Event Information',
      items: [
        { icon: 'info', label: 'Type', value: 'Blockchain & FinTech Summit' },
        { icon: 'group', label: 'Format', value: 'In-Person Conference' },
        { icon: 'schedule', label: 'Duration', value: '3 Days' },
        { icon: 'people', label: 'Expected Attendees', value: '500+ Professionals' },
      ]
    },
    {
      title: 'Key Topics',
      items: [
        { icon: 'account-balance', label: 'CBDCs', value: 'Central Bank Digital Currencies' },
        { icon: 'trending-up', label: 'FinTech', value: 'Financial Technology Innovation' },
        { icon: 'security', label: 'Regulation', value: 'Digital Asset Regulation' },
        { icon: 'payment', label: 'Payments', value: 'Digital Payment Systems' },
        { icon: 'block', label: 'Blockchain', value: 'Blockchain Infrastructure' },
        { icon: 'business-center', label: 'Banking', value: 'Digital Banking Transformation' },
      ]
    },
    {
      title: 'Event Features',
      items: [
        { icon: 'mic', label: 'Keynotes', value: 'Industry Leaders & Experts' },
        { icon: 'group', label: 'Panels', value: 'Interactive Discussions' },
        { icon: 'handshake', label: 'Networking', value: 'Professional Connections' },
        { icon: 'coffee', label: 'Meals', value: 'Catered Breakfast & Lunch' },
        { icon: 'business', label: 'Exhibition', value: 'Technology Showcase' },
        { icon: 'translate', label: 'Translation', value: 'Simultaneous Translation' },
      ]
    }
  ];

  const contactInfo = [
    {
      title: 'Contact Information',
      items: [
        { 
          icon: 'web', 
          label: 'Website', 
          value: event?.website || 'blockchainsummit.la',
          action: () => handleOpenLink(event?.website || 'https://blockchainsummit.la')
        },
        { 
          icon: 'email', 
          label: 'Email', 
          value: 'info@blockchainsummit.la',
          action: () => handleOpenLink('mailto:info@blockchainsummit.la')
        },
        { 
          icon: 'phone', 
          label: 'Phone', 
          value: '+57 (4) 261 9500',
          action: () => handleOpenLink('tel:+5742619500')
        },
        { 
          icon: 'location-on', 
          label: 'Address', 
          value: venueLabel,
          action: () => handleOpenLink(`https://maps.google.com/?q=${encodeURIComponent(venueLabel)}`)
        },
      ]
    }
  ];

  const carouselSections = [...eventInfo, ...contactInfo];

  const handleSliderMomentum = (event: any) => {
    const offsetX = event?.nativeEvent?.contentOffset?.x ?? 0;
    const index = Math.round(offsetX / (slideWidth + slideGap));
    setActiveSlide(Math.max(0, Math.min(index, carouselSections.length)));
  };

  const scrollToSlide = (index: number) => {
    sliderRef.current?.scrollTo({
      x: index * (slideWidth + slideGap),
      animated: true,
    });
    setActiveSlide(index);
  };

  const renderInfoSection = (section: any) => (
    <View key={section.title} style={styles.section}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <View style={styles.sectionContent}>
        {section.items.map((item: any, index: number) => (
          <TouchableOpacity
            key={index}
            style={styles.infoItem}
            onPress={item.action}
            disabled={!item.action}
          >
            <View style={styles.infoItemLeft}>
              <View style={styles.infoIcon}>
                <MaterialIcons 
                  name={item.icon as any} 
                  size={24} 
                  color={isDark ? '#60A5FA' : '#007AFF'} 
                />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoLabel}>{item.label}</Text>
                <Text style={[
                  styles.infoValue,
                  item.action && styles.infoValueLink
                ]}>
                  {item.value}
                </Text>
              </View>
            </View>
            {item.action && (
              <MaterialIcons 
                name="chevron-right" 
                size={20} 
                color={colors.text.secondary} 
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderAboutSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>About the Event</Text>
      <View style={styles.sectionContent}>
        {aboutParagraphs.map((paragraph, index) => (
          <Text
            key={index}
            style={[
              styles.aboutText,
              index === aboutParagraphs.length - 1 && styles.aboutTextLast,
            ]}
          >
            {paragraph}
          </Text>
        ))}
      </View>
    </View>
  );

  const renderArchiveSummary = () => {
    if (!isArchiveEvent) return null;

    return (
      <View style={styles.archiveSummary}>
        <View style={styles.archiveBadge}>
          <MaterialIcons name="history" size={16} color={isDark ? '#E0F2FE' : '#1D4ED8'} />
          <Text style={styles.archiveBadgeText}>Past Event</Text>
        </View>
        <Text style={styles.archiveTitle}>Archived Edition</Text>
        <Text style={styles.archiveDescription}>
          BSL 2025 is preserved here as a reference archive. Swipe through the cards below to review the original details, topics, contacts and context.
        </Text>
        <View style={styles.archiveStats}>
          <View style={styles.archiveStat}>
            <Text style={styles.archiveStatLabel}>Date</Text>
            <Text style={styles.archiveStatValue}>{eventDateLabel}</Text>
          </View>
          <View style={styles.archiveStat}>
            <Text style={styles.archiveStatLabel}>Venue</Text>
            <Text style={styles.archiveStatValue}>{venueLabel}</Text>
          </View>
          <View style={styles.archiveStat}>
            <Text style={styles.archiveStatLabel}>Location</Text>
            <Text style={styles.archiveStatValue}>{eventLocationLabel}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Event Header */}
      <EventBanner
        title="Event Information"
        subtitle="Conference Details & Logistics"
        date={eventDateLabel}
        showCountdown={!isEventFinished && Boolean(event?.eventStartDate)}
        showLiveIndicator={!isEventFinished && Boolean(event?.eventStartDate)}
        isEventFinished={isEventFinished}
        eventStartDate={event?.eventStartDate}
        eventId={eventId}
        eventImage={event?.image}
      />

      {renderArchiveSummary()}

      <View style={styles.sliderSection}>
        <View style={styles.sliderHeader}>
          <View>
            <Text style={styles.sliderTitle}>
              {isArchiveEvent ? 'Browse the archive' : 'Explore the details'}
            </Text>
            <Text style={styles.sliderSubtitle}>
              {isArchiveEvent
                ? 'Swipe through the section cards for a cleaner view of the archived event data.'
                : 'Swipe through the section cards for a cleaner view of the event data.'}
            </Text>
          </View>
          <View style={styles.sliderCounter}>
            <Text style={styles.sliderCounterText}>
              {String(activeSlide + 1).padStart(2, '0')}/{String(carouselSections.length + 1).padStart(2, '0')}
            </Text>
          </View>
        </View>

        <ScrollView
          ref={sliderRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={slideWidth + slideGap}
          snapToAlignment="start"
          contentContainerStyle={[
            styles.sliderTrack,
            { paddingHorizontal: slidePadding },
          ]}
          onMomentumScrollEnd={handleSliderMomentum}
          scrollEventThrottle={16}
        >
          {carouselSections.map((section: any, index: number) => (
            <View
              key={section.title}
              style={[
                styles.sliderSlide,
                {
                  width: slideWidth,
                  marginRight: slideGap,
                },
              ]}
            >
              {renderInfoSection(section)}
            </View>
          ))}
          <View
            key="about"
            style={[
              styles.sliderSlide,
              {
                width: slideWidth,
                marginRight: slideGap,
              },
            ]}
          >
            {renderAboutSection()}
          </View>
        </ScrollView>

        <View style={styles.sliderDots}>
          {[...carouselSections, { title: 'About' }].map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.sliderDot,
                index === activeSlide && styles.sliderDotActive,
              ]}
              onPress={() => scrollToSlide(index)}
              activeOpacity={0.8}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  archiveSummary: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    padding: 18,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(7, 17, 31, 0.92)' : 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(15, 23, 42, 0.12)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 4,
  },
  archiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.10)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(96, 165, 250, 0.24)' : 'rgba(37, 99, 235, 0.16)',
    marginBottom: 12,
  },
  archiveBadgeText: {
    marginLeft: 6,
    color: isDark ? '#E0F2FE' : '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  archiveTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  archiveDescription: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 23,
    marginBottom: 14,
  },
  archiveStats: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  archiveStat: {
    flexGrow: 1,
    minWidth: 92,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(248, 250, 252, 0.96)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(148, 163, 184, 0.18)',
  },
  archiveStatLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  archiveStatValue: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '700',
    lineHeight: 18,
  },
  sliderSection: {
    marginBottom: 30,
  },
  sliderHeader: {
    marginHorizontal: 20,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sliderTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sliderSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    maxWidth: 320,
  },
  sliderCounter: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(96, 165, 250, 0.14)' : 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)',
  },
  sliderCounterText: {
    fontSize: 12,
    fontWeight: '800',
    color: isDark ? '#E0F2FE' : '#1D4ED8',
    letterSpacing: 0.8,
  },
  sliderTrack: {
    alignItems: 'stretch',
  },
  sliderSlide: {
    justifyContent: 'flex-start',
  },
  sliderDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  sliderDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(148, 163, 184, 0.28)',
  },
  sliderDotActive: {
    width: 24,
    backgroundColor: isDark ? '#60A5FA' : '#2563EB',
  },
  section: {
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  sectionContent: {
    backgroundColor: colors.background.paper,
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0, 122, 255, 0.3)' : 'rgba(0, 122, 255, 0.2)',
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 22,
  },
  infoValueLink: {
    color: isDark ? '#60A5FA' : '#007AFF',
  },
  aboutText: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 26,
    marginBottom: 20,
    paddingHorizontal: 20,
    textAlign: 'justify',
  },
  aboutTextLast: {
    marginBottom: 0,
  },
});
