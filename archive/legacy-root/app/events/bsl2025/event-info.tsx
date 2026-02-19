import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useEvent } from '../../../contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import EventBanner from '../../../components/EventBanner';

export default function BSL2025EventInfoScreen() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark, colors);
  
  // Check if event is finished
  const [isEventFinished, setIsEventFinished] = React.useState(false);
  React.useEffect(() => {
    const checkEventFinished = () => {
      const now = new Date();
      const end = new Date('2025-11-14T23:59:59-05:00');
      setIsEventFinished(now > end);
    };
    checkEventFinished();
    const interval = setInterval(checkEventFinished, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open link:', err));
  };

  const eventInfo = [
    {
      title: 'Event Details',
      items: [
        { icon: 'event', label: 'Date', value: 'November 12-14, 2025' },
        { icon: 'location-on', label: 'Location', value: 'Medellín, Colombia' },
        { icon: 'business', label: 'Venue', value: 'Universidad EAFIT' },
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
          value: 'blockchainsummit.la',
          action: () => handleOpenLink('https://blockchainsummit.la')
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
          value: 'Universidad EAFIT, Medellín, Colombia',
          action: () => handleOpenLink('https://maps.google.com/?q=Universidad+EAFIT+Medellin')
        },
      ]
    }
  ];

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
        date="November 12-14, 2025 • Medellín, Colombia"
        showCountdown={!isEventFinished}
        showLiveIndicator={!isEventFinished}
        isEventFinished={isEventFinished}
        eventId="bsl2025"
      />

      {/* Event Information Sections */}
      {eventInfo.map(renderInfoSection)}

      {/* Contact Information */}
      {contactInfo.map(renderInfoSection)}

      {/* Additional Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About the Event</Text>
        <View style={styles.sectionContent}>
          <Text style={styles.aboutText}>
            Blockchain Summit Latam 2025 is the premier gathering for blockchain, 
            cryptocurrency, and financial technology professionals in Latin America. 
            This three-day conference brings together industry leaders, regulators, 
            innovators, and entrepreneurs to discuss the future of digital finance 
            and blockchain technology in the region.
          </Text>
          <Text style={styles.aboutText}>
            Join us for insightful keynotes, interactive panels, networking opportunities, 
            and hands-on workshops covering topics from CBDCs and digital banking to 
            regulatory frameworks and emerging technologies.
          </Text>
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
  section: {
    marginBottom: 32,
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
});
