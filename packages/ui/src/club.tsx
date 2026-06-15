"use client";

import * as React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  type ViewProps,
  ViewStyle,
} from 'react-native';

import { clubTheme } from './club-theme';

type Tone = 'default' | 'accent' | 'warm' | 'success' | 'warning' | 'danger';
type CardVariant = 'default' | 'raised' | 'accent';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return 'HP';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function toneColor(tone: Tone): string {
  switch (tone) {
    case 'accent':
      return clubTheme.colors.accent;
    case 'warm':
      return clubTheme.colors.accentWarm;
    case 'success':
      return clubTheme.colors.success;
    case 'warning':
      return clubTheme.colors.warning;
    case 'danger':
      return clubTheme.colors.danger;
    default:
      return clubTheme.colors.muted;
  }
}

function cardBackground(variant: CardVariant): ViewStyle {
  switch (variant) {
    case 'accent':
      return {
        backgroundColor: 'rgba(94, 141, 230, 0.15)',
        borderColor: 'rgba(134, 182, 255, 0.3)',
      };
    case 'raised':
      return {
        backgroundColor: clubTheme.colors.surfaceRaised,
        borderColor: clubTheme.colors.borderStrong,
      };
    default:
      return {
        backgroundColor: clubTheme.colors.surface,
        borderColor: clubTheme.colors.border,
      };
  }
}

export function ClubShell({
  children,
  style,
  contentStyle,
}: React.PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[styles.shell, style]}>
      <View pointerEvents="none" style={styles.glowTopLeft} />
      <View pointerEvents="none" style={styles.glowBottomRight} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={[styles.shellInner, contentStyle]}>{children}</View>
      </ScrollView>
    </View>
  );
}

export function ClubStack({
  children,
  gap = 16,
  style,
  ...props
}: React.PropsWithChildren<
  Omit<ViewProps, 'children'> & {
    gap?: number;
  }
>) {
  const nodes = React.Children.toArray(children).filter(Boolean);

  return (
    <View {...props} style={style}>
      {nodes.map((child, index) => (
        <View key={index} style={index === 0 ? undefined : { marginTop: gap }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ClubRow({
  children,
  gap = 12,
  style,
  wrap = false,
  align = 'center',
  ...props
}: React.PropsWithChildren<
  Omit<ViewProps, 'children'> & {
    gap?: number;
    wrap?: boolean;
    align?: 'start' | 'center' | 'end' | 'stretch';
  }
>) {
  const nodes = React.Children.toArray(children).filter(Boolean);
  const alignItems =
    align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align === 'stretch' ? 'stretch' : 'center';

  return (
    <View
      {...props}
      style={[
        { flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', alignItems },
        style,
      ]}
    >
      {nodes.map((child, index) => (
        <View key={index} style={index === 0 ? undefined : { marginLeft: gap }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export function ClubBadge({
  children,
  tone = 'default',
  style,
  textStyle,
}: React.PropsWithChildren<{
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}>) {
  return (
    <View
      style={[
        styles.badge,
        { borderColor: toneColor(tone), backgroundColor: `${toneColor(tone)}18` },
        style,
      ]}
    >
      <Text style={[styles.badgeText, { color: toneColor(tone) }, textStyle]}>{children}</Text>
    </View>
  );
}

export function ClubEyebrow({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

export function ClubHeading({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.heading, style]}>{children}</Text>;
}

export function ClubLead({
  children,
  style,
}: React.PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.lead, style]}>{children}</Text>;
}

export function ClubSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  style,
  ...props
}: React.PropsWithChildren<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
} & Omit<ViewProps, 'children'>>) {
  return (
    <View {...props} style={[styles.section, style]}>
      <ClubRow gap={16} align="start" wrap style={styles.sectionHeader}>
        <View style={styles.sectionHeaderCopy}>
          {eyebrow ? <ClubEyebrow>{eyebrow}</ClubEyebrow> : null}
          <ClubHeading style={styles.sectionTitle}>{title}</ClubHeading>
          {description ? <ClubLead style={styles.sectionDescription}>{description}</ClubLead> : null}
        </View>
        {actions ? <View style={styles.sectionActions}>{actions}</View> : null}
      </ClubRow>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function ClubCard({
  eyebrow,
  title,
  description,
  children,
  variant = 'default',
  style,
  contentStyle,
}: React.PropsWithChildren<{
  eyebrow?: string;
  title?: string;
  description?: string;
  variant?: CardVariant;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <View style={[styles.card, cardBackground(variant), style]}>
      <View style={[styles.cardContent, contentStyle]}>
        {eyebrow ? <ClubEyebrow>{eyebrow}</ClubEyebrow> : null}
        {title ? <ClubHeading style={styles.cardTitle}>{title}</ClubHeading> : null}
        {description ? <ClubLead style={styles.cardDescription}>{description}</ClubLead> : null}
        {children ? <View style={title || description ? styles.cardBodySpacing : undefined}>{children}</View> : null}
      </View>
    </View>
  );
}

export function ClubMetricCard({
  label,
  value,
  helper,
  tone = 'default',
  style,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.metricCard, cardBackground('raised'), style]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: toneColor(tone) }]}>{value}</Text>
      {helper ? <Text style={styles.metricHelper}>{helper}</Text> : null}
    </View>
  );
}

export function ClubButton({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onPress,
  style,
  textStyle,
  accessibilityLabel,
}: React.PropsWithChildren<{
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        buttonVariantStyles[variant],
        buttonSizeStyles[size],
        pressed && !disabled ? styles.buttonPressed : undefined,
        disabled ? styles.buttonDisabled : undefined,
        style,
      ]}
    >
      <Text style={[styles.buttonText, buttonTextVariantStyles[variant], textStyle]}>{children}</Text>
    </Pressable>
  );
}

export function ClubAvatar({
  name,
  imageUrl,
  size = 48,
  tone = 'accent',
  style,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}) {
  const initials = getInitials(name);

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: `${toneColor(tone)}20`,
          borderColor: `${toneColor(tone)}40`,
        },
        style,
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, { color: toneColor(tone) }]}>{initials}</Text>
      )}
    </View>
  );
}

export function ClubListRow({
  title,
  description,
  meta,
  leading,
  trailing,
  style,
}: {
  title: string;
  description?: string;
  meta?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.listRow, style]}>
      <View style={styles.listRowLeading}>{leading}</View>
      <View style={styles.listRowBody}>
        <ClubRow gap={10} align="start" wrap>
          <View style={styles.listRowTextWrap}>
            <Text style={styles.listRowTitle}>{title}</Text>
            {description ? <Text style={styles.listRowDescription}>{description}</Text> : null}
          </View>
          {meta ? <ClubBadge tone="default">{meta}</ClubBadge> : null}
        </ClubRow>
      </View>
      {trailing ? <View style={styles.listRowTrailing}>{trailing}</View> : null}
    </View>
  );
}

export function ClubDivider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

const buttonVariantStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: clubTheme.colors.accentStrong,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  secondary: {
    backgroundColor: clubTheme.colors.surfaceRaised,
    borderColor: clubTheme.colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  destructive: {
    backgroundColor: 'rgba(234, 122, 122, 0.16)',
    borderColor: 'rgba(234, 122, 122, 0.3)',
  },
};

const buttonSizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { minHeight: 36, paddingHorizontal: 12, borderRadius: clubTheme.radius.pill },
  md: { minHeight: 44, paddingHorizontal: 16, borderRadius: clubTheme.radius.pill },
  lg: { minHeight: 52, paddingHorizontal: 20, borderRadius: clubTheme.radius.pill },
};

const buttonTextVariantStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: '#FFFFFF' },
  secondary: { color: clubTheme.colors.text },
  ghost: { color: clubTheme.colors.text },
  destructive: { color: clubTheme.colors.danger },
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: clubTheme.colors.canvas,
  },
  scrollContent: {
    flexGrow: 1,
  },
  shellInner: {
    width: '100%',
    maxWidth: 1260,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
  },
  glowTopLeft: {
    position: 'absolute',
    top: -120,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(134, 182, 255, 0.12)',
    opacity: 0.8,
  },
  glowBottomRight: {
    position: 'absolute',
    right: -140,
    bottom: -120,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: 'rgba(214, 165, 92, 0.1)',
    opacity: 0.85,
  },
  section: {
    width: '100%',
  },
  sectionHeader: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionHeaderCopy: {
    flex: 1,
    minWidth: 260,
  },
  sectionActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sectionBody: {
    width: '100%',
  },
  sectionTitle: {
    marginTop: 4,
  },
  sectionDescription: {
    marginTop: 8,
    maxWidth: 720,
  },
  eyebrow: {
    color: clubTheme.colors.accentWarm,
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    fontSize: 11,
    fontWeight: '700',
    fontFamily: clubTheme.fonts.mono,
  },
  heading: {
    color: clubTheme.colors.text,
    fontFamily: clubTheme.fonts.display,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  lead: {
    color: clubTheme.colors.muted,
    fontFamily: clubTheme.fonts.body,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderWidth: 1,
    borderRadius: clubTheme.radius.lg,
    overflow: 'hidden',
    ...clubTheme.shadows.card,
  },
  cardContent: {
    padding: 20,
  },
  cardBodySpacing: {
    marginTop: 16,
  },
  cardTitle: {
    marginTop: 4,
    fontSize: 24,
    lineHeight: 30,
  },
  cardDescription: {
    marginTop: 8,
  },
  badge: {
    borderWidth: 1,
    borderRadius: clubTheme.radius.pill,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontFamily: clubTheme.fonts.mono,
  },
  metricCard: {
    minHeight: 148,
    padding: 18,
    borderWidth: 1,
    borderRadius: clubTheme.radius.md,
  },
  metricLabel: {
    color: clubTheme.colors.muted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    fontFamily: clubTheme.fonts.mono,
  },
  metricValue: {
    marginTop: 14,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontFamily: clubTheme.fonts.display,
  },
  metricHelper: {
    marginTop: 10,
    color: clubTheme.colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: clubTheme.fonts.body,
  },
  button: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    ...clubTheme.shadows.soft,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }, { scale: 0.985 }],
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: clubTheme.fonts.body,
  },
  avatar: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    fontFamily: clubTheme.fonts.mono,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: clubTheme.colors.border,
  },
  listRowLeading: {
    marginRight: 12,
  },
  listRowBody: {
    flex: 1,
    minWidth: 0,
  },
  listRowTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  listRowTitle: {
    color: clubTheme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: clubTheme.fonts.body,
  },
  listRowDescription: {
    marginTop: 4,
    color: clubTheme.colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: clubTheme.fonts.body,
  },
  listRowTrailing: {
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: clubTheme.colors.border,
    width: '100%',
  },
});
