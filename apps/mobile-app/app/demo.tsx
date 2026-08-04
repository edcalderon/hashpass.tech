import React, { useRef, useState } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { MaterialIcons } from '../lib/vector-icons';
import { getHashpassFullLogo } from '../lib/hashpass-logo';
import { DemoVideoPlayer } from '../components/DemoVideoPlayer';
import { DemoCaptionBar } from '../components/DemoCaptionBar';
import QuickSettingsPanel from '../components/QuickSettingsPanel';
import {
  bslChapters,
  demoBslShowcase,
  demoChaptersEn,
  demoChaptersEs,
  demoVideoSources,
  type DemoVideoLocale,
} from '../lib/demo-chapters';
import { demoCaptionsEn, demoCaptionsEs, type DemoCaptionCue } from '../lib/demo-captions';
import { bslCaptionsEn, bslCaptionsEs } from '../lib/demo-bsl-captions';
import { demoCaptionTextByLocale } from '../lib/demo-captions-i18n';

// The header sits on a plain flat page background on every theme, unlike the
// hero/auth screens which composite the logo over a colorful gradient — the
// shared getHashpassFullLogo() light-mode asset mixes near-white and dark
// fills tuned for that gradient, so on a flat white page it reads as faint
// or missing letters. auth.tsx hits the same flat-background case on web and
// solves it the same way: force the white-background wordmark variant, which
// renders as solid dark text with the red "#" accent on light or white.
const HASHPASS_HEADER_LOGO_LIGHT_WEB = require('../assets/logos/hashpass/logo-full-hashpass-white.svg');

// Cue timing only exists for the two locales the narration was actually
// recorded in (EN/ES — see lib/demo-captions.ts). Every other UI locale
// still plays the English audio track (demoVideoSources falls back to 'en'
// for any non-'es' locale below), so its captions reuse the English cue
// timing and only swap in translated text — see demo-captions-i18n.ts.
function getDemoCaptionCues(uiLocale: string, audioLocale: DemoVideoLocale): DemoCaptionCue[] {
  if (audioLocale === 'es') return demoCaptionsEs;
  const translated = demoCaptionTextByLocale[uiLocale];
  if (!translated) return demoCaptionsEn;
  return demoCaptionsEn.map((cue: DemoCaptionCue, i: number) => ({ ...cue, text: translated[i] ?? cue.text }));
}

type Tab = 'tutorial' | 'bsl';

export default function DemoPage() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('demo');
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('tutorial');
  const [muted, setMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [activeChapter, setActiveChapter] = useState(0);
  const [currentCaption, setCurrentCaption] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const styles = getStyles(colors);

  // Driven by the app's real, global language setting (the same one
  // QuickSettingsPanel's language picker controls below) rather than a
  // one-off toggle on this page — useTranslation() re-renders this
  // component whenever it changes, so this always reads fresh.
  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  const uiLocale = getCurrentLocale();
  const audioLocale: DemoVideoLocale = uiLocale === 'es' ? 'es' : 'en';
  const tutorialChapters = audioLocale === 'en' ? demoChaptersEn : demoChaptersEs;
  const tutorialCaptionCues: DemoCaptionCue[] = getDemoCaptionCues(uiLocale, audioLocale);
  const source = demoVideoSources[audioLocale];
  // Always the narrated cut — the separate mute/CC icons on the video frame
  // now cover what a "silent" source used to be for, so there's no longer a
  // second video file to switch between.
  const videoSrc = source.narrated;

  const bslSource = demoBslShowcase[audioLocale];
  const bslVideoSrc = bslSource.narrated;
  // BslShowcaseNarrated has real EN and ES voice tracks (unlike the app
  // tutorial's non-ES-non-EN locales, which dub English audio) — no
  // translated-text-over-English-audio fallback needed here, just the
  // matching-language cue set, falling back to EN captions for every other
  // UI locale since there's no ES-quality translation for those yet.
  const bslCaptionCues = audioLocale === 'es' ? bslCaptionsEs : bslCaptionsEn;

  const chapters = tab === 'tutorial' ? tutorialChapters : bslChapters;
  const captionCues = tab === 'tutorial' ? tutorialCaptionCues : bslCaptionCues;

  const logoSource =
    Platform.OS === 'web' && !isDark ? HASHPASS_HEADER_LOGO_LIGHT_WEB : getHashpassFullLogo(isDark);

  const seekTo = (seconds: number, index: number) => {
    const el = videoRef.current;
    if (el) {
      el.currentTime = seconds;
      void el.play();
    }
    setActiveChapter(index);
  };

  const onTimeUpdate = () => {
    const el = videoRef.current;
    if (!el) return;

    let current = 0;
    for (let i = 0; i < chapters.length; i += 1) {
      if (el.currentTime >= chapters[i].startSeconds) current = i;
    }
    setActiveChapter(current);

    const cue = captionCues.find((c) => el.currentTime >= c.start && el.currentTime <= c.end);
    setCurrentCaption(cue ? cue.text : null);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <QuickSettingsPanel forceVisible />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBackPress} activeOpacity={0.7}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.logoRow}>
        <Image source={logoSource} style={styles.headerLogo} resizeMode="contain" />
      </View>

      <Animated.View entering={FadeInDown.duration(500).delay(50)} style={styles.hero}>
        <View style={[styles.eyebrow, { borderColor: colors.primary }]}>
          <View style={[styles.eyebrowDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.eyebrowText, { color: colors.primary }]}>{t('eyebrow') || 'See it in action'}</Text>
        </View>
        <Text style={styles.title}>{t('title') || 'Watch HASHPASS in action'}</Text>
        <Text style={styles.subtitle}>
          {t('subtitle') ||
            'A full walkthrough of the app, screen by screen — from landing page to installing HASHPASS on your home screen.'}
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(500).delay(150)} style={styles.tabRow}>
        <TabButton
          active={tab === 'tutorial'}
          label={t('appTutorialTab') || 'App walkthrough'}
          colors={colors}
          onPress={() => {
            setTab('tutorial');
            setActiveChapter(0);
            setCurrentCaption(null);
          }}
        />
        <TabButton
          active={tab === 'bsl'}
          label={t('bslShowcaseTab') || 'BSL On Tour showcase'}
          colors={colors}
          onPress={() => {
            setTab('bsl');
            setActiveChapter(0);
            setCurrentCaption(null);
          }}
        />
      </Animated.View>

      {tab === 'tutorial' ? (
        <Animated.View key="tutorial" entering={FadeIn.duration(350)}>
          <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.videoCard}>
            <View style={styles.videoFrame}>
              <DemoVideoPlayer
                ref={videoRef}
                src={videoSrc}
                poster={source.poster}
                muted={muted}
                onTimeUpdate={onTimeUpdate}
                fallbackText={t('webOnlyNotice') || 'This demo is available on the web at hashpass.tech/demo.'}
              />

              <View style={styles.mediaControls}>
                <MediaControlButton
                  icon={muted ? 'volume-off' : 'volume-up'}
                  active={!muted}
                  colors={colors}
                  onPress={() => setMuted((m) => !m)}
                  accessibilityLabel={muted ? 'Unmute' : 'Mute'}
                />
                <MediaControlButton
                  icon={showCaptions ? 'subtitles' : 'subtitles-off'}
                  active={showCaptions}
                  colors={colors}
                  onPress={() => setShowCaptions((s) => !s)}
                  accessibilityLabel="Toggle captions"
                  label="CC"
                />
              </View>
            </View>

            <DemoCaptionBar text={showCaptions ? currentCaption : null} visible={showCaptions} colors={colors} />
          </Animated.View>

          <Text style={styles.caption}>
            {t('appTutorialSubtitle') || 'Landing, sign-up, dashboard, profile, events, and installing the app'}
          </Text>

          <Text style={styles.sectionHeading}>{t('chapters') || 'Chapters'}</Text>
          <View style={styles.chapterGrid}>
            {chapters.map((chapter, index) => {
              const active = index === activeChapter;
              return (
                <Animated.View key={chapter.slug} entering={FadeIn.duration(300).delay(80 * index)}>
                  <TouchableOpacity
                    style={[styles.chapterButton, active && styles.chapterButtonActive]}
                    onPress={() => seekTo(chapter.startSeconds, index)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="chevron-right"
                      size={16}
                      color={active ? colors.primary : colors.text.secondary}
                    />
                    <Text style={[styles.chapterButtonText, active && styles.chapterButtonTextActive]}>
                      {t(chapter.titleKey) || chapter.slug}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      ) : (
        <Animated.View key="bsl" entering={FadeIn.duration(350)}>
          <Animated.View entering={FadeInUp.duration(500).delay(200)} style={styles.videoCard}>
            <View style={styles.videoFrame}>
              <DemoVideoPlayer
                ref={videoRef}
                src={bslVideoSrc}
                poster={bslSource.poster}
                muted={muted}
                onTimeUpdate={onTimeUpdate}
                fallbackText={t('webOnlyNotice') || 'This demo is available on the web at hashpass.tech/demo.'}
              />

              <View style={styles.mediaControls}>
                <MediaControlButton
                  icon={muted ? 'volume-off' : 'volume-up'}
                  active={!muted}
                  colors={colors}
                  onPress={() => setMuted((m) => !m)}
                  accessibilityLabel={muted ? 'Unmute' : 'Mute'}
                />
                <MediaControlButton
                  icon={showCaptions ? 'subtitles' : 'subtitles-off'}
                  active={showCaptions}
                  colors={colors}
                  onPress={() => setShowCaptions((s) => !s)}
                  accessibilityLabel="Toggle captions"
                  label="CC"
                />
              </View>
            </View>

            <DemoCaptionBar text={showCaptions ? currentCaption : null} visible={showCaptions} colors={colors} />
          </Animated.View>

          <Text style={styles.caption}>
            {t('bslShowcaseSubtitle') || 'The event platform in action at Blockchain Summit Latam'}
          </Text>

          <Text style={styles.sectionHeading}>{t('chapters') || 'Chapters'}</Text>
          <View style={styles.chapterGrid}>
            {bslChapters.map((chapter, index) => {
              const active = index === activeChapter;
              return (
                <Animated.View key={chapter.slug} entering={FadeIn.duration(300).delay(80 * index)}>
                  <TouchableOpacity
                    style={[styles.chapterButton, active && styles.chapterButtonActive]}
                    onPress={() => seekTo(chapter.startSeconds, index)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="chevron-right"
                      size={16}
                      color={active ? colors.primary : colors.text.secondary}
                    />
                    <Text style={[styles.chapterButtonText, active && styles.chapterButtonTextActive]}>
                      {t(chapter.titleKey) || chapter.slug}
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

function TabButton({
  active,
  label,
  colors,
  onPress,
}: {
  active: boolean;
  label: string;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        tabButtonBase,
        {
          borderColor: active ? colors.primary : colors.divider,
          backgroundColor: active ? colors.primary : 'transparent',
        },
      ]}
    >
      <Text style={{ color: active ? '#ffffff' : colors.text.secondary, fontWeight: '600', fontSize: 14 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MediaControlButton({
  icon,
  active,
  colors,
  onPress,
  accessibilityLabel,
  label,
}: {
  icon: string;
  active: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onPress: () => void;
  accessibilityLabel: string;
  label?: string;
}) {
  // Always a solid dark backing regardless of active state — these overlay
  // arbitrary video frames (sometimes near-white screens), so contrast can't
  // depend on state the way it can for buttons on a fixed page background.
  // Active/inactive is instead shown by icon color alone (brand red vs.
  // white), which stays legible on the solid backing either way.
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={accessibilityLabel}
      style={[
        mediaControlBase,
        {
          backgroundColor: 'rgba(0,0,0,0.65)',
          borderColor: active ? colors.primary : 'rgba(255,255,255,0.35)',
        },
      ]}
    >
      <MaterialIcons name={icon as any} size={16} color={active ? colors.primary : '#ffffff'} />
      {label ? (
        <Text style={[mediaControlLabelStyle, { color: active ? colors.primary : '#ffffff' }]}>{label}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const tabButtonBase = {
  paddingVertical: 10,
  paddingHorizontal: 20,
  borderRadius: 999,
  borderWidth: 1,
} as const;

const mediaControlBase = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 999,
  borderWidth: 1,
};

const mediaControlLabelStyle = {
  color: '#ffffff',
  fontSize: 11,
  fontWeight: '700' as const,
};

const getStyles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    content: {
      paddingBottom: 80,
      maxWidth: 900,
      width: '100%',
      alignSelf: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 4,
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoRow: {
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: 8,
    },
    headerLogo: {
      height: 30,
      width: 180,
    },
    placeholder: {
      width: 40,
    },
    hero: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 24,
      paddingBottom: 32,
    },
    eyebrow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      marginBottom: 16,
    },
    eyebrowDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    eyebrowText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 12,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 15,
      color: colors.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 560,
    },
    tabRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 16,
      marginBottom: 20,
      flexWrap: 'wrap',
    },
    videoCard: {
      marginHorizontal: 16,
    },
    videoFrame: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.divider,
      aspectRatio: 16 / 9,
      backgroundColor: '#000000',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 28,
      elevation: 6,
      position: 'relative',
    },
    mediaControls: {
      position: 'absolute',
      top: 12,
      right: 12,
      flexDirection: 'row',
      gap: 8,
    },
    caption: {
      textAlign: 'center',
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 14,
      paddingHorizontal: 24,
    },
    sectionHeading: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: colors.text.secondary,
      marginTop: 28,
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    chapterGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      paddingHorizontal: 16,
    },
    chapterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.surface,
      minWidth: 200,
    },
    chapterButtonActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}18`,
    },
    chapterButtonText: {
      fontSize: 13,
      color: colors.text.primary,
      fontWeight: '500',
    },
    chapterButtonTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
