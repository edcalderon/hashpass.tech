import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from "react-native";
import { MaterialIcons } from "../../../lib/vector-icons";
import { useTheme } from "../../../hooks/useTheme";
import { useAuth } from "../../../hooks/useAuth";
import type { AdminRole } from "../../../lib/admin-utils";
import { getCurrentAdminAccess } from "../../../lib/admin-access";
import { supabase } from "../../../lib/supabase";
import {
  EventPassTier,
  PassType,
  PassStatus,
  resolvePassStorageEventId,
} from "../../../lib/pass-system";
import { QRScanResult } from "../../../lib/qr-system";
import AdminQRScanner from "../../../components/AdminQRScanner";
import LoadingScreen from "../../../components/LoadingScreen";
import { useRouter } from "expo-router";
import { resolveActiveEventId } from "../../../lib/event-path";
import { apiClient } from "../../../lib/api-client";
import {
  highestEventRole,
  EventRole,
  EventRoleGrant,
} from "../../../lib/event-admin-access";
import UnifiedSearchAndFilter from "../../../components/UnifiedSearchAndFilter";

type TabType =
  | "passes"
  | "pass-settings"
  | "pass-codes"
  | "qr-scanner"
  | "meetings"
  | "emails"
  | "roles"
  | "speaker-roles";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Pass {
  id: string;
  user_id: string;
  event_id: string;
  pass_type: PassType;
  status: PassStatus;
  pass_number: string;
  max_meeting_requests: number;
  used_meeting_requests: number;
  max_boost_amount: number;
  used_boost_amount: number;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
  username?: string;
}

interface PassClaimCode {
  id: string;
  event_id: string;
  label: string;
  pass_type: PassType;
  max_claims: number | null;
  claimed_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface User {
  id: string;
  email?: string;
  name?: string;
  username?: string;
  created_at?: string;
}

interface Speaker {
  id: string;
  name: string;
  title?: string;
  company?: string;
  user_id?: string;
}

interface SpeakerRoleRecord {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  imageUrl: string | null;
  userId: string | null;
  isActive: boolean;
  isAcceptingMeetings: boolean;
  claim: {
    email_normalized: string;
    status: "unclaimed" | "claimed" | "needs_review";
    claim_error: string | null;
  } | null;
}

interface MeetingRequest {
  id: string;
  requester_id: string;
  speaker_id: string;
  requester_name: string;
  speaker_name: string;
  status: string;
  created_at: string;
}

interface EventRoleRow {
  id: string;
  user_id: string;
  role: EventRole;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
}

interface GlobalAdminRoleRow {
  id: string;
  user_id: string;
  role: AdminRole;
  created_at: string;
  expires_at: string | null;
}

export default function AdminPanel() {
  const { colors, isDark } = useTheme();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("passes");
  const tabScrollRef = useRef<ScrollView>(null);
  const tabScrollOffsetRef = useRef(0);
  const tabContentWidthRef = useRef(0);
  const tabViewportWidthRef = useRef(0);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [tabsAtEnd, setTabsAtEnd] = useState(true);
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Event scoping — global admins keep the ambient (host-resolved) event and
  // are unaffected by any of this. A user who is only an event_admin/
  // moderator (event_roles, not user_roles) is scoped to the event(s) they
  // were granted, with a switcher when they hold more than one.
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [accessibleEvents, setAccessibleEvents] = useState<EventRoleGrant[]>(
    [],
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(() =>
    resolveActiveEventId(),
  );
  const [currentEventRole, setCurrentEventRole] = useState<EventRole | null>(
    null,
  );

  // Pass Management State
  const [passes, setPasses] = useState<Pass[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersNextCursor, setUsersNextCursor] = useState<string | null>(null);
  const userSearchCache = useRef(
    new Map<string, { users: User[]; nextCursor: string | null }>(),
  );
  const latestUserSearchRequest = useRef(0);
  const [passesLoading, setPassesLoading] = useState(false);
  const [showCreatePassModal, setShowCreatePassModal] = useState(false);
  const [selectedPass, setSelectedPass] = useState<Pass | null>(null);
  const [showPassDetailsModal, setShowPassDetailsModal] = useState(false);
  const [newPassUserId, setNewPassUserId] = useState("");
  const [newPassType, setNewPassType] = useState<PassType>("general");
  const [searchQuery, setSearchQuery] = useState("");
  const [passTypeFilter, setPassTypeFilter] = useState<PassType | "all">("all");
  const [passStatusFilter, setPassStatusFilter] = useState<PassStatus | "all">("all");
  const [eventPassTiers, setEventPassTiers] = useState<EventPassTier[]>([]);
  const [passTiersLoading, setPassTiersLoading] = useState(false);
  const [savingPassTier, setSavingPassTier] = useState<PassType | null>(null);

  // Pass-code campaigns are event scoped. Raw values are only held long
  // enough to create/display a code and are never returned by the list API.
  const [passClaimCodes, setPassClaimCodes] = useState<PassClaimCode[]>([]);
  const [passCodesLoading, setPassCodesLoading] = useState(false);
  const [showCreatePassCodeModal, setShowCreatePassCodeModal] = useState(false);
  const [newPassCode, setNewPassCode] = useState("");
  const [newPassCodeLabel, setNewPassCodeLabel] = useState("");
  const [newPassCodeType, setNewPassCodeType] = useState<PassType>("general");
  const [newPassCodeLimit, setNewPassCodeLimit] = useState("");

  // Meeting Matcher State
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<MeetingRequest[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(
    null,
  );
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [randomMatchCount, setRandomMatchCount] = useState("5");
  const [campaignSubject, setCampaignSubject] = useState("");
  const [campaignHeading, setCampaignHeading] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [campaignAudience, setCampaignAudience] = useState("attendees");
  const [campaignTemplate, setCampaignTemplate] = useState<"branded" | "raw">("branded");
  const [campaignPreview, setCampaignPreview] = useState<any>(null);
  const [campaignSending, setCampaignSending] = useState(false);

  // Staff & Roles State
  const [eventRoles, setEventRoles] = useState<EventRoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [showGrantRoleModal, setShowGrantRoleModal] = useState(false);
  const [newRoleUserId, setNewRoleUserId] = useState("");
  const [newRoleType, setNewRoleType] = useState<EventRole>("moderator");
  const [globalAdmins, setGlobalAdmins] = useState<GlobalAdminRoleRow[]>([]);
  const [globalAdminsLoading, setGlobalAdminsLoading] = useState(false);
  const [showGrantGlobalAdminModal, setShowGrantGlobalAdminModal] =
    useState(false);
  const [newGlobalAdminEmail, setNewGlobalAdminEmail] = useState("");

  // Speaker roles are a claimed account-to-directory-profile link. They are
  // managed through an event-admin API so the browser never writes identity
  // records directly.
  const [speakerRoles, setSpeakerRoles] = useState<SpeakerRoleRecord[]>([]);
  const [speakerRolesLoading, setSpeakerRolesLoading] = useState(false);
  const [showGrantSpeakerRoleModal, setShowGrantSpeakerRoleModal] =
    useState(false);
  const [selectedSpeakerRole, setSelectedSpeakerRole] =
    useState<SpeakerRoleRecord | null>(null);
  const [newSpeakerAccountEmail, setNewSpeakerAccountEmail] = useState("");

  const styles = getStyles(isDark, colors);
  const updateTabScrollState = (offsetX = 0) => {
    const maxOffset = Math.max(
      tabContentWidthRef.current - tabViewportWidthRef.current,
      0,
    );
    setTabsOverflow(maxOffset > 4);
    setTabsAtEnd(maxOffset <= 4 || offsetX >= maxOffset - 4);
  };
  const scrollTabStripTo = (offsetX: number) => {
    const maxOffset = Math.max(
      tabContentWidthRef.current - tabViewportWidthRef.current,
      0,
    );
    const nextOffset = Math.max(0, Math.min(offsetX, maxOffset));
    tabScrollOffsetRef.current = nextOffset;
    tabScrollRef.current?.scrollTo({ x: nextOffset, animated: true });
    updateTabScrollState(nextOffset);
  };
  const handleTabStripWheel = (event: any) => {
    if (Platform.OS !== "web") return;

    const wheelEvent = event.nativeEvent || event;
    const delta =
      Math.abs(wheelEvent.deltaX || 0) > Math.abs(wheelEvent.deltaY || 0)
        ? wheelEvent.deltaX
        : wheelEvent.deltaY;

    if (!delta || tabContentWidthRef.current <= tabViewportWidthRef.current)
      return;
    event.preventDefault?.();
    wheelEvent.preventDefault?.();
    scrollTabStripTo(tabScrollOffsetRef.current + delta);
  };

  // Wait for auth to finish loading before checking admin access
  useEffect(() => {
    // Don't check admin access while auth is still loading
    if (authLoading) {
      return;
    }

    // If auth finished loading and no user, redirect
    if (!user) {
      router.replace("/(shared)/dashboard/explore");
      return;
    }

    // Now check admin access
    checkAdminAccess();
  }, [user, authLoading]);

  useEffect(() => {
    if (isUserAdmin) {
      loadInitialData();
    }
  }, [isUserAdmin, activeTab, selectedEventId]);

  // Moderators don't get pass management (see V013 / task decisions) — the
  // Passes tab is hidden for them, so bounce off it if it was the default.
  useEffect(() => {
    if (
      !isGlobalAdmin &&
      currentEventRole === "moderator" &&
      activeTab === "passes"
    ) {
      setActiveTab("qr-scanner");
    }
  }, [isGlobalAdmin, currentEventRole, activeTab]);

  const checkAdminAccess = async () => {
    if (!user) {
      router.replace("/(shared)/dashboard/explore");
      return;
    }

    setLoading(true);

    try {
      const access = await getCurrentAdminAccess();
      const globalAdmin = Boolean(access.globalRole);

      if (globalAdmin) {
        setIsGlobalAdmin(true);
        setIsUserAdmin(true);
        setAdminRole(access.globalRole);
        setLoading(false);
        return;
      }

      // Not a global admin — fall back to per-event event_admin/moderator grants.
      const eventRoles = access.eventRoles;
      if (eventRoles.length === 0) {
        Alert.alert("Access Denied", "You do not have admin privileges.");
        router.replace("/(shared)/dashboard/explore");
        return;
      }

      setAccessibleEvents(eventRoles);
      setIsUserAdmin(true);
      setAdminRole(null);

      const ambientEventId = resolveActiveEventId();
      const defaultEventId = eventRoles.some(
        (g: EventRoleGrant) => g.eventId === ambientEventId,
      )
        ? ambientEventId
        : eventRoles[0].eventId;
      setSelectedEventId(defaultEventId);
      setCurrentEventRole(highestEventRole(eventRoles, defaultEventId));
      setLoading(false);
    } catch (error) {
      console.error("Error checking admin access:", error);
      Alert.alert("Error", "Failed to verify admin access. Please try again.");
      router.replace("/(shared)/dashboard/explore");
    }
  };

  const handleSelectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    if (!isGlobalAdmin) {
      setCurrentEventRole(highestEventRole(accessibleEvents, eventId));
    }
  };

  const loadInitialData = async () => {
    if (activeTab === "passes") {
      await Promise.all([loadPasses(), loadUsers()]);
    } else if (activeTab === "pass-settings") {
      await loadEventPassTiers();
    } else if (activeTab === "pass-codes") {
      await loadPassClaimCodes();
    } else if (activeTab === "meetings") {
      await loadMeetingRequests();
      await loadSpeakers();
    } else if (activeTab === "roles") {
      await Promise.all([
        loadEventRoles(),
        adminRole === "super_admin" ? loadGlobalAdmins() : Promise.resolve(),
      ]);
    } else if (activeTab === "speaker-roles") {
      await loadSpeakerRoles();
    }
  };

  const loadSpeakerRoles = async () => {
    setSpeakerRolesLoading(true);
    try {
      const result = await apiClient.get(
        `/admin/speaker-roles?eventId=${encodeURIComponent(selectedEventId)}`,
        { skipEventSegment: true },
      );
      if (!result.success)
        throw new Error(result.error || "Unable to load speakers");
      setSpeakerRoles(
        (result.data as { data?: SpeakerRoleRecord[] })?.data || [],
      );
    } catch (error: any) {
      Alert.alert(
        "Error",
        "Failed to load speaker access: " + (error.message || "Unknown error"),
      );
    } finally {
      setSpeakerRolesLoading(false);
    }
  };

  const mutateSpeakerRole = async (
    action: "grant" | "revoke" | "activate" | "deactivate",
    speaker: SpeakerRoleRecord,
    targetEmail?: string,
  ) => {
    try {
      setSpeakerRolesLoading(true);
      const result = await apiClient.post(
        "/admin/speaker-roles",
        {
          action,
          eventId: selectedEventId,
          speakerId: speaker.id,
          ...(targetEmail ? { targetEmail } : {}),
        },
        { skipEventSegment: true },
      );
      if (!result.success)
        throw new Error(result.error || "Unable to update speaker access");
      await loadSpeakerRoles();
      return true;
    } catch (error: any) {
      Alert.alert(
        "Speaker access not updated",
        error.message || "Please try again.",
      );
      return false;
    } finally {
      setSpeakerRolesLoading(false);
    }
  };

  const handleGrantSpeakerRole = async () => {
    const email = newSpeakerAccountEmail.trim().toLowerCase();
    if (!selectedSpeakerRole || !email.includes("@")) {
      Alert.alert(
        "Account email required",
        "Enter the email for an existing account.",
      );
      return;
    }
    if (await mutateSpeakerRole("grant", selectedSpeakerRole, email)) {
      setShowGrantSpeakerRoleModal(false);
      setSelectedSpeakerRole(null);
      setNewSpeakerAccountEmail("");
      Alert.alert(
        "Speaker role granted",
        `${selectedSpeakerRole.name} is now active for ${selectedEventId}.`,
      );
    }
  };

  const handleRevokeSpeakerRole = (speaker: SpeakerRoleRecord) => {
    Alert.alert(
      "Remove speaker access?",
      `${speaker.name} will no longer be linked to this account or available for meeting requests.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void mutateSpeakerRole("revoke", speaker);
          },
        },
      ],
    );
  };

  const loadEventRoles = async () => {
    setRolesLoading(true);
    try {
      const result = await apiClient.get(
        `/admin/roles?eventId=${encodeURIComponent(selectedEventId)}`,
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);
      setEventRoles((result.data as { data: EventRoleRow[] })?.data || []);
    } catch (error: any) {
      console.error("Error loading event roles:", error);
      Alert.alert("Error", "Failed to load roles: " + error.message);
    } finally {
      setRolesLoading(false);
    }
  };

  const handleGrantRole = async () => {
    if (!UUID_PATTERN.test(newRoleUserId.trim())) {
      Alert.alert("Error", "Please enter a valid user UUID");
      return;
    }
    try {
      setRolesLoading(true);
      const result = await apiClient.post(
        "/admin/roles",
        {
          action: "grant",
          eventId: selectedEventId,
          targetUserId: newRoleUserId.trim(),
          role: newRoleType,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);

      Alert.alert("Success", `Granted ${newRoleType} for ${selectedEventId}`);
      setShowGrantRoleModal(false);
      setNewRoleUserId("");
      setNewRoleType("moderator");
      await loadEventRoles();
    } catch (error: any) {
      console.error("Error granting role:", error);
      Alert.alert("Error", "Failed to grant role: " + error.message);
    } finally {
      setRolesLoading(false);
    }
  };

  const handleRevokeRole = async (targetUserId: string, role: EventRole) => {
    try {
      setRolesLoading(true);
      const result = await apiClient.post(
        "/admin/roles",
        {
          action: "revoke",
          eventId: selectedEventId,
          targetUserId,
          role,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);

      await loadEventRoles();
    } catch (error: any) {
      console.error("Error revoking role:", error);
      Alert.alert("Error", "Failed to revoke role: " + error.message);
    } finally {
      setRolesLoading(false);
    }
  };

  const loadGlobalAdmins = async () => {
    if (adminRole !== "super_admin") return;
    setGlobalAdminsLoading(true);
    try {
      const result = await apiClient.get("/admin/global-roles", {
        skipEventSegment: true,
      });
      if (!result.success) throw new Error(result.error);
      setGlobalAdmins(
        (result.data as { data?: GlobalAdminRoleRow[] })?.data || [],
      );
    } catch (error: any) {
      console.error("Error loading global administrators:", error);
      Alert.alert(
        "Error",
        "Failed to load global administrators: " + error.message,
      );
    } finally {
      setGlobalAdminsLoading(false);
    }
  };

  const mutateGlobalAdmin = async (
    action: "grant" | "revoke",
    target: string,
    targetIsUserId = false,
  ) => {
    try {
      setGlobalAdminsLoading(true);
      const result = await apiClient.post(
        "/admin/global-roles",
        {
          action,
          ...(targetIsUserId
            ? { targetUserId: target }
            : { targetEmail: target }),
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);
      await loadGlobalAdmins();
      return true;
    } catch (error: any) {
      console.error("Error updating global administrator:", error);
      Alert.alert(
        "Error",
        "Failed to update global administrator: " + error.message,
      );
      return false;
    } finally {
      setGlobalAdminsLoading(false);
    }
  };

  const handleGrantGlobalAdmin = async () => {
    const email = newGlobalAdminEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    if (await mutateGlobalAdmin("grant", email)) {
      setShowGrantGlobalAdminModal(false);
      setNewGlobalAdminEmail("");
      Alert.alert("Success", `${email} is now a global admin`);
    }
  };

  const loadPasses = async () => {
    setPassesLoading(true);
    try {
      const eventId = resolvePassStorageEventId(selectedEventId);
      const allPasses: Pass[] = [];
      let cursor: string | null = null;
      do {
        const query = `/admin/passes?eventId=${encodeURIComponent(eventId)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const result = await apiClient.get(query, { skipEventSegment: true });
        if (!result.success) throw new Error(result.error);
        const payload = result.data as { data?: Pass[]; nextCursor?: string | null };
        allPasses.push(...(payload.data || []));
        cursor = payload.nextCursor || null;
      } while (cursor && allPasses.length < 5000);
      setPasses(allPasses);
    } catch (error: any) {
      console.error("Error loading passes:", error);
      Alert.alert("Error", "Failed to load passes: " + error.message);
    } finally {
      setPassesLoading(false);
    }
  };

  const loadEventPassTiers = async () => {
    setPassTiersLoading(true);
    try {
      const result = await apiClient.get(
        `/admin/pass-tiers?eventId=${encodeURIComponent(resolvePassStorageEventId(selectedEventId))}`,
        { skipEventSegment: true },
      );
      if (!result.success)
        throw new Error(result.error || "Unable to load pass tier settings");
      setEventPassTiers(
        (result.data as { data?: EventPassTier[] })?.data || [],
      );
    } catch (error: any) {
      Alert.alert(
        "Error",
        "Failed to load pass tier settings: " +
          (error.message || "Unknown error"),
      );
    } finally {
      setPassTiersLoading(false);
    }
  };

  const updateEventPassTier = async (tier: EventPassTier) => {
    try {
      setSavingPassTier(tier.pass_type);
      const result = await apiClient.post(
        "/admin/pass-tiers",
        {
          eventId: resolvePassStorageEventId(selectedEventId),
          passType: tier.pass_type,
          maxMeetingRequests: tier.max_meeting_requests,
          maxBoostAmount: tier.max_boost_amount,
          priceCents: tier.price_cents,
          currency: tier.currency,
          priceLabel: tier.price_label,
        },
        { skipEventSegment: true },
      );
      if (!result.success)
        throw new Error(result.error || "Unable to update pass tier settings");
      await loadEventPassTiers();
      Alert.alert(
        "Pass tier updated",
        `${tier.pass_type.toUpperCase()} settings now apply to new passes and pass-code claims.`,
      );
    } catch (error: any) {
      Alert.alert(
        "Pass tier not updated",
        error.message || "Please try again.",
      );
    } finally {
      setSavingPassTier(null);
    }
  };

  const loadPassClaimCodes = async () => {
    setPassCodesLoading(true);
    try {
      const result = await apiClient.get(
        `/admin/pass-codes?eventId=${encodeURIComponent(selectedEventId)}`,
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);
      setPassClaimCodes(
        (result.data as { data?: PassClaimCode[] })?.data || [],
      );
    } catch (error: any) {
      const message = error?.message || "Unable to load pass codes.";
      Alert.alert(
        message.includes("Pass-code storage is not installed")
          ? "Pass-code setup pending"
          : "Error",
        message,
      );
    } finally {
      setPassCodesLoading(false);
    }
  };

  const handleCreatePassCode = async () => {
    const label = newPassCodeLabel.trim();
    const rawCode = newPassCode.trim();
    const limitText = newPassCodeLimit.trim();
    const maxClaims = limitText ? Number(limitText) : null;
    if (!label) {
      Alert.alert("Error", "Please give this code a label for your team.");
      return;
    }
    if (
      limitText &&
      (typeof maxClaims !== "number" ||
        !Number.isInteger(maxClaims) ||
        maxClaims < 1)
    ) {
      Alert.alert(
        "Error",
        "Use a positive whole-number claim limit, or leave it blank for unlimited use.",
      );
      return;
    }

    try {
      setPassCodesLoading(true);
      const result = await apiClient.post(
        "/admin/pass-codes",
        {
          action: "create",
          eventId: selectedEventId,
          code: rawCode || undefined,
          label,
          passType: newPassCodeType,
          maxClaims,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);

      const createdCode = (result.data as { code?: string })?.code;
      setShowCreatePassCodeModal(false);
      setNewPassCode("");
      setNewPassCodeLabel("");
      setNewPassCodeType("general");
      setNewPassCodeLimit("");
      await loadPassClaimCodes();
      Alert.alert(
        "Pass code created",
        `Share this code now: ${createdCode || rawCode.toUpperCase()}\n\nFor security, its raw value is not stored and will not be shown again.`,
      );
    } catch (error: any) {
      console.error("Error creating pass code:", error);
      Alert.alert("Error", "Failed to create pass code: " + error.message);
    } finally {
      setPassCodesLoading(false);
    }
  };

  const handlePassCodeStatus = async (code: PassClaimCode) => {
    const action = code.is_active ? "deactivate" : "reactivate";
    try {
      setPassCodesLoading(true);
      const result = await apiClient.post(
        "/admin/pass-codes",
        {
          action,
          eventId: selectedEventId,
          codeId: code.id,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);
      await loadPassClaimCodes();
    } catch (error: any) {
      console.error("Error updating pass code:", error);
      Alert.alert("Error", "Failed to update pass code: " + error.message);
    } finally {
      setPassCodesLoading(false);
    }
  };

  const loadUsers = async (
    query = "",
    cursor: string | null = null,
    requestId = ++latestUserSearchRequest.current,
  ) => {
    const normalizedQuery = query.trim().toLowerCase();
    const cacheKey = `${selectedEventId}:${normalizedQuery}`;
    if (!cursor && userSearchCache.current.has(cacheKey)) {
      const cached = userSearchCache.current.get(cacheKey)!;
      if (requestId !== latestUserSearchRequest.current) return;
      setUsers(cached.users);
      setUsersNextCursor(cached.nextCursor);
      return;
    }
    setUsersLoading(true);
    try {
      const eventId = resolvePassStorageEventId(selectedEventId);
      const result = await apiClient.get(
        `/admin/users?eventId=${encodeURIComponent(eventId)}&q=${encodeURIComponent(normalizedQuery)}&limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);
      const payload = result.data as {
        data?: User[];
        nextCursor?: string | null;
      };
      if (requestId !== latestUserSearchRequest.current) return;
      const nextUsers = cursor
        ? [...users, ...(payload.data || [])]
        : payload.data || [];
      setUsers(nextUsers);
      setUsersNextCursor(payload.nextCursor || null);
      if (!cursor)
        userSearchCache.current.set(cacheKey, {
          users: nextUsers,
          nextCursor: payload.nextCursor || null,
        });
    } catch (error: any) {
      console.error("Error loading users:", error);
      // Fallback: empty array
      if (requestId === latestUserSearchRequest.current) setUsers([]);
    } finally {
      if (requestId === latestUserSearchRequest.current) setUsersLoading(false);
    }
  };

  useEffect(() => {
    const requestId = ++latestUserSearchRequest.current;
    if (!showCreatePassModal) return;
    const timer = setTimeout(
      () => void loadUsers(userSearchQuery, null, requestId),
      300,
    );
    return () => clearTimeout(timer);
  }, [showCreatePassModal, userSearchQuery, selectedEventId]);

  const loadSpeakers = async () => {
    try {
      const { data, error } = await supabase
        .from("bsl_speakers")
        .select("id, name, title, company, user_id")
        .order("name")
        .limit(200);

      if (error) throw error;
      setSpeakers(data || []);
    } catch (error: any) {
      console.error("Error loading speakers:", error);
    }
  };

  const loadMeetingRequests = async () => {
    setMeetingsLoading(true);
    try {
      const { data, error } = await supabase
        .from("meeting_requests")
        .select(
          "id, requester_id, speaker_id, requester_name, speaker_name, status, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setMeetingRequests(data || []);
    } catch (error: any) {
      console.error("Error loading meeting requests:", error);
      Alert.alert("Error", "Failed to load meeting requests: " + error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const handleCreatePass = async () => {
    if (!newPassUserId.trim()) {
      Alert.alert("Error", "Please enter a user ID or email");
      return;
    }

    try {
      setPassesLoading(true);

      // Check if input is email or UUID
      let userId = newPassUserId.trim();
      const isEmail = userId.includes("@");

      // If email, we need to find the user ID (this would require an API endpoint)
      // For now, assume it's a UUID
      if (isEmail) {
        Alert.alert(
          "Info",
          "Email lookup requires API endpoint. Please use user UUID for now.",
        );
        return;
      }

      const result = await apiClient.post(
        "/admin/passes",
        {
          action: "create",
          eventId: resolvePassStorageEventId(selectedEventId),
          userId,
          passType: newPassType,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);

      const createdPassId = (result.data as { data: { id: string } }).data.id;
      Alert.alert(
        "Success",
        `Pass created successfully! Pass ID: ${createdPassId}`,
      );
      setShowCreatePassModal(false);
      setNewPassUserId("");
      setNewPassType("general");
      await loadPasses();
    } catch (error: any) {
      console.error("Error creating pass:", error);
      Alert.alert("Error", "Failed to create pass: " + error.message);
    } finally {
      setPassesLoading(false);
    }
  };

  const handleUpdatePassStatus = async (
    passId: string,
    newStatus: PassStatus,
  ) => {
    try {
      const result = await apiClient.post(
        "/admin/passes",
        {
          action: "update",
          eventId: resolvePassStorageEventId(selectedEventId),
          passId,
          status: newStatus,
        },
        { skipEventSegment: true },
      );
      if (!result.success) throw new Error(result.error);

      Alert.alert("Success", "Pass status updated");
      await loadPasses();
    } catch (error: any) {
      console.error("Error updating pass:", error);
      Alert.alert("Error", "Failed to update pass: " + error.message);
    }
  };

  const handleUpdatePassType = async (passId: string, passType: PassType) => {
    try {
      const result = await apiClient.post("/admin/passes", {
        action: "update",
        eventId: resolvePassStorageEventId(selectedEventId),
        passId,
        passType,
      }, { skipEventSegment: true });
      if (!result.success) throw new Error(result.error);
      Alert.alert("Pass updated", `Pass tier changed to ${passType.toUpperCase()}.`);
      await loadPasses();
    } catch (error: any) {
      Alert.alert("Unable to update pass", error.message || "Please try again.");
    }
  };

  const handleQRScanSuccess = (_result: QRScanResult) => {
    // Don't close scanner - keep it open to show details
    // The scanner component will handle showing the details
  };

  const handleCreateMatch = async () => {
    if (!selectedRequest || !selectedSlot) {
      Alert.alert("Error", "Please select a request and time slot");
      return;
    }

    try {
      setMeetingsLoading(true);

      // meeting_requests.speaker_id is UUID (user_id), not bsl_speakers.id
      // We need to find the bsl_speakers.id from the user_id
      const { data: speakerData, error: speakerError } = await supabase
        .from("bsl_speakers")
        .select("id")
        .eq("user_id", selectedRequest.speaker_id)
        .single();

      if (speakerError || !speakerData) {
        // Try alternative: maybe speaker_id is already bsl_speakers.id
        const speaker = speakers.find(
          (s) =>
            s.id === selectedRequest.speaker_id ||
            s.user_id === selectedRequest.speaker_id,
        );
        if (!speaker || !speaker.id) {
          throw new Error(
            "Speaker not found. Please ensure the speaker has a bsl_speakers record.",
          );
        }

        const { data, error } = await supabase.rpc("accept_meeting_request", {
          p_request_id: selectedRequest.id,
          p_speaker_id: speaker.id,
          p_slot_start_time: selectedSlot,
          p_speaker_response: "Meeting scheduled by admin",
        });

        if (error) throw error;

        if (
          data &&
          typeof data === "object" &&
          "success" in data &&
          !data.success
        ) {
          throw new Error(data.error || "Failed to create match");
        }

        Alert.alert("Success", "Meeting match created successfully!");
        setShowMatchModal(false);
        setSelectedRequest(null);
        setSelectedSlot("");
        await loadMeetingRequests();
        return;
      }

      // Use the found speaker ID
      const { data, error } = await supabase.rpc("accept_meeting_request", {
        p_request_id: selectedRequest.id,
        p_speaker_id: speakerData.id,
        p_slot_start_time: selectedSlot,
        p_speaker_response: "Meeting scheduled by admin",
      });

      if (error) throw error;

      if (
        data &&
        typeof data === "object" &&
        "success" in data &&
        !data.success
      ) {
        throw new Error(data.error || "Failed to create match");
      }

      Alert.alert("Success", "Meeting match created successfully!");
      setShowMatchModal(false);
      setSelectedRequest(null);
      setSelectedSlot("");
      await loadMeetingRequests();
    } catch (error: any) {
      console.error("Error creating match:", error);
      Alert.alert("Error", "Failed to create match: " + error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const generateRandomMatches = async () => {
    setMeetingsLoading(true);
    try {
      const result = await apiClient.post('/admin/matchmaking', { eventId: selectedEventId, mode: 'random', count: Number(randomMatchCount) || 1 }, { skipEventSegment: true });
      if (!result.success) throw new Error(result.error);
      const summary = (result.data as any).data;
      Alert.alert('Matches generated', `${summary.created.length} matches created; ${summary.failures.length} skipped. Notifications and email delivery were triggered.`);
      await loadMeetingRequests();
    } catch (error: any) { Alert.alert('Unable to generate matches', error.message); }
    finally { setMeetingsLoading(false); }
  };

  const submitCampaign = async (preview: boolean) => {
    setCampaignSending(true);
    try {
      const result = await apiClient.post('/admin/communications', { eventId: selectedEventId, audience: campaignAudience, subject: campaignSubject, heading: campaignHeading, message: campaignMessage, template: campaignTemplate, preview }, { skipEventSegment: true });
      if (!result.success) throw new Error(result.error);
      if (preview) setCampaignPreview((result.data as any).data);
      else Alert.alert('Campaign complete', `${(result.data as any).data.sent} sent, ${(result.data as any).data.failed} failed.`);
    } catch (error: any) { Alert.alert('Campaign error', error.message); }
    finally { setCampaignSending(false); }
  };

  const getAvailableSlots = async (speakerId: string) => {
    try {
      const { data, error } = await supabase.rpc(
        "get_speaker_available_slots",
        {
          p_speaker_id: speakerId,
          p_event_id: selectedEventId,
          p_duration_minutes: 15,
        },
      );

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error("Error loading slots:", error);
      return [];
    }
  };

  const filteredPasses = passes.filter((pass) => {
    if (passTypeFilter !== "all" && pass.pass_type !== passTypeFilter) return false;
    if (passStatusFilter !== "all" && pass.status !== passStatusFilter) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pass.pass_number?.toLowerCase().includes(query) ||
      pass.user_id.toLowerCase().includes(query) ||
      pass.user_email?.toLowerCase().includes(query) ||
      pass.user_name?.toLowerCase().includes(query) ||
      pass.username?.toLowerCase().includes(query) ||
      pass.pass_type.toLowerCase().includes(query)
    );
  });

  const filteredRequests = meetingRequests.filter((req) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      req.requester_name?.toLowerCase().includes(query) ||
      req.speaker_name?.toLowerCase().includes(query) ||
      req.status.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <LoadingScreen
        icon="admin-panel-settings"
        message="Checking admin access..."
      />
    );
  }

  if (!isUserAdmin) {
    return null; // Will redirect
  }

  const canManagePasses = isGlobalAdmin || currentEventRole === "event_admin";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Text style={styles.headerSubtitle}>
          Role:{" "}
          {isGlobalAdmin
            ? adminRole || "Admin"
            : `${currentEventRole || "admin"} @ ${selectedEventId}`}
        </Text>
        {!isGlobalAdmin && accessibleEvents.length > 1 && (
          <View style={styles.eventSwitcher}>
            {accessibleEvents.map((grant) => (
              <TouchableOpacity
                key={grant.eventId}
                style={[
                  styles.eventSwitcherChip,
                  selectedEventId === grant.eventId &&
                    styles.eventSwitcherChipActive,
                ]}
                onPress={() => handleSelectEvent(grant.eventId)}
              >
                <Text
                  style={[
                    styles.eventSwitcherChipText,
                    selectedEventId === grant.eventId &&
                      styles.eventSwitcherChipTextActive,
                  ]}
                >
                  {grant.eventId}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Tabs stay on one row; scroll instead of wrapping actions into a second line. */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          style={styles.tabs}
          contentContainerStyle={styles.tabsContent}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          accessibilityHint="Swipe horizontally to reveal additional admin sections"
          onLayout={({ nativeEvent }) => {
            tabViewportWidthRef.current = nativeEvent.layout.width;
            updateTabScrollState();
          }}
          onContentSizeChange={(width) => {
            tabContentWidthRef.current = width;
            updateTabScrollState();
          }}
          onScroll={({ nativeEvent }) => {
            tabScrollOffsetRef.current = nativeEvent.contentOffset.x;
            updateTabScrollState(nativeEvent.contentOffset.x);
          }}
          scrollEventThrottle={16}
          {...({ onWheel: handleTabStripWheel } as any)}
        >
          {canManagePasses && (
            <TouchableOpacity
              style={[styles.tab, activeTab === "passes" && styles.tabActive]}
              onPress={() => setActiveTab("passes")}
            >
              <MaterialIcons
                name="card-membership"
                size={20}
                color={activeTab === "passes" ? "#fff" : colors.text.secondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  activeTab === "passes" && styles.tabTextActive,
                ]}
              >
                Passes
              </Text>
            </TouchableOpacity>
          )}
          {canManagePasses && (
            <TouchableOpacity
              style={[styles.tab, activeTab === "pass-settings" && styles.tabActive]}
              onPress={() => setActiveTab("pass-settings")}
            >
              <MaterialIcons
                name="tune"
                size={20}
                color={activeTab === "pass-settings" ? "#fff" : colors.text.secondary}
              />
              <Text numberOfLines={1} style={[styles.tabText, activeTab === "pass-settings" && styles.tabTextActive]}>
                Pass Settings
              </Text>
            </TouchableOpacity>
          )}
          {canManagePasses && (
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "pass-codes" && styles.tabActive,
              ]}
              onPress={() => setActiveTab("pass-codes")}
            >
              <MaterialIcons
                name="confirmation-number"
                size={20}
                color={
                  activeTab === "pass-codes" ? "#fff" : colors.text.secondary
                }
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  activeTab === "pass-codes" && styles.tabTextActive,
                ]}
              >
                Pass Codes
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.tab, activeTab === "qr-scanner" && styles.tabActive]}
            onPress={() => setActiveTab("qr-scanner")}
          >
            <MaterialIcons
              name="qr-code-scanner"
              size={20}
              color={
                activeTab === "qr-scanner" ? "#fff" : colors.text.secondary
              }
            />
            <Text
              numberOfLines={1}
              style={[
                styles.tabText,
                activeTab === "qr-scanner" && styles.tabTextActive,
              ]}
            >
              QR Scanner
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "meetings" && styles.tabActive]}
            onPress={() => setActiveTab("meetings")}
          >
            <MaterialIcons
              name="people"
              size={20}
              color={activeTab === "meetings" ? "#fff" : colors.text.secondary}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.tabText,
                activeTab === "meetings" && styles.tabTextActive,
              ]}
            >
              Meetings
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === "emails" && styles.tabActive]} onPress={() => setActiveTab("emails")}>
            <MaterialIcons name="email" size={20} color={activeTab === "emails" ? "#fff" : colors.text.secondary} />
            <Text numberOfLines={1} style={[styles.tabText, activeTab === "emails" && styles.tabTextActive]}>Emails</Text>
          </TouchableOpacity>
          {canManagePasses && (
            <TouchableOpacity
              style={[styles.tab, activeTab === "roles" && styles.tabActive]}
              onPress={() => setActiveTab("roles")}
            >
              <MaterialIcons
                name="admin-panel-settings"
                size={20}
                color={activeTab === "roles" ? "#fff" : colors.text.secondary}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  activeTab === "roles" && styles.tabTextActive,
                ]}
              >
                Staff & Roles
              </Text>
            </TouchableOpacity>
          )}
          {canManagePasses && (
            <TouchableOpacity
              style={[
                styles.tab,
                activeTab === "speaker-roles" && styles.tabActive,
              ]}
              onPress={() => setActiveTab("speaker-roles")}
            >
              <MaterialIcons
                name="record-voice-over"
                size={20}
                color={
                  activeTab === "speaker-roles" ? "#fff" : colors.text.secondary
                }
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  activeTab === "speaker-roles" && styles.tabTextActive,
                ]}
              >
                Speakers
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
        {tabsOverflow && (
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.tabScrollHint}
            accessibilityLabel={
              tabsAtEnd
                ? "Scroll admin sections back to the beginning"
                : "Show more admin sections"
            }
            accessibilityHint={
              tabsAtEnd
                ? "Scrolls the tab row to the left"
                : "Scrolls the tab row to the right"
            }
            onPress={() =>
              scrollTabStripTo(tabsAtEnd ? 0 : tabContentWidthRef.current)
            }
          >
            <MaterialIcons
              name={tabsAtEnd ? "chevron-left" : "chevron-right"}
              size={20}
              color="#007AFF"
            />
            <Text style={styles.tabScrollHintText}>
              {tabsAtEnd ? "Back" : "More"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === "passes" && (
          <PassManagementTab
            styles={styles}
            colors={colors}
            passes={filteredPasses}
            loading={passesLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            passTypeFilter={passTypeFilter}
            passStatusFilter={passStatusFilter}
            onPassTypeFilterChange={setPassTypeFilter}
            onPassStatusFilterChange={setPassStatusFilter}
            onCreatePass={() => setShowCreatePassModal(true)}
            onPassPress={(pass: Pass) => { setSelectedPass(pass); setShowPassDetailsModal(true); }}
            onUpdateStatus={handleUpdatePassStatus}
            onUpdateType={handleUpdatePassType}
            onRefresh={loadPasses}
          />
        )}

        {activeTab === "pass-settings" && (
          <View style={styles.tabContent}>
            <PassTierSettings
              styles={styles}
              key={eventPassTiers.map((tier) => `${tier.event_id}:${tier.pass_type}:${tier.updated_at || ""}`).join("|")}
              tiers={eventPassTiers}
              loading={passTiersLoading}
              savingPassType={savingPassTier}
              onRefresh={loadEventPassTiers}
              onSave={updateEventPassTier}
            />
          </View>
        )}

        {activeTab === "pass-codes" && (
          <PassCodeManagementTab
            styles={styles}
            colors={colors}
            codes={passClaimCodes}
            loading={passCodesLoading}
            onCreate={() => setShowCreatePassCodeModal(true)}
            onUpdateStatus={handlePassCodeStatus}
            onRefresh={loadPassClaimCodes}
          />
        )}

        {activeTab === "qr-scanner" && (
          <QRScannerTab
            styles={styles}
            colors={colors}
            onScanPress={() => setShowQRScanner(true)}
          />
        )}

        {activeTab === "meetings" && (
          <MeetingMatcherTab
            styles={styles}
            colors={colors}
            requests={filteredRequests}
            speakers={speakers}
            loading={meetingsLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onMatchPress={(request: MeetingRequest) => {
              setSelectedRequest(request);
              setShowMatchModal(true);
            }}
            onRefresh={loadMeetingRequests}
            randomMatchCount={randomMatchCount}
            onRandomMatchCountChange={setRandomMatchCount}
            onRandomMatch={generateRandomMatches}
          />
        )}

        {activeTab === "emails" && <CommunicationsTab styles={styles} colors={colors} subject={campaignSubject} heading={campaignHeading} message={campaignMessage} audience={campaignAudience} template={campaignTemplate} preview={campaignPreview} sending={campaignSending} onSubject={setCampaignSubject} onHeading={setCampaignHeading} onMessage={setCampaignMessage} onAudience={setCampaignAudience} onTemplate={setCampaignTemplate} onPreview={() => submitCampaign(true)} onSend={() => submitCampaign(false)} />}

        {activeTab === "roles" && (
          <RolesTab
            styles={styles}
            colors={colors}
            eventId={selectedEventId}
            roles={eventRoles}
            loading={rolesLoading}
            canGrantEventAdmin={adminRole === "super_admin"}
            canManageGlobalAdmins={adminRole === "super_admin"}
            globalAdmins={globalAdmins}
            globalAdminsLoading={globalAdminsLoading}
            onGrantGlobalAdmin={() => setShowGrantGlobalAdminModal(true)}
            onRevokeGlobalAdmin={(userId: string) =>
              mutateGlobalAdmin("revoke", userId, true)
            }
            onGrantPress={() => setShowGrantRoleModal(true)}
            onRevoke={handleRevokeRole}
            onRefresh={loadEventRoles}
          />
        )}

        {activeTab === "speaker-roles" && (
          <SpeakerRoleManagementTab
            styles={styles}
            speakers={speakerRoles}
            loading={speakerRolesLoading}
            onAssign={(speaker: SpeakerRoleRecord) => {
              setSelectedSpeakerRole(speaker);
              setNewSpeakerAccountEmail("");
              setShowGrantSpeakerRoleModal(true);
            }}
            onRevoke={handleRevokeSpeakerRole}
            onToggleActive={(speaker: SpeakerRoleRecord) => {
              void mutateSpeakerRole(
                speaker.isActive ? "deactivate" : "activate",
                speaker,
              );
            }}
            onRefresh={loadSpeakerRoles}
          />
        )}
      </ScrollView>

      {/* Pass details / administrative controls */}
      <Modal
        visible={showPassDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPassDetailsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pass details</Text>
            {selectedPass && (
              <>
                <Text style={styles.passNumber}>{selectedPass.pass_number}</Text>
                <Text style={styles.passInfo}>{selectedPass.user_name || selectedPass.username || selectedPass.user_email || selectedPass.user_id}</Text>
                <Text style={styles.passInfo}>{selectedPass.user_email || selectedPass.user_id}</Text>
                <Text style={styles.passInfo}>Status: {selectedPass.status}</Text>
                <Text style={styles.modalLabel}>Change tier</Text>
                <View style={styles.passTypeButtons}>
                  {(["general", "business", "vip"] as PassType[]).map((type) => (
                    <TouchableOpacity key={type} style={[styles.passTypeButton, selectedPass.pass_type === type && styles.passTypeButtonActive]} onPress={() => { void handleUpdatePassType(selectedPass.id, type); setSelectedPass({ ...selectedPass, pass_type: type }); }}>
                      <Text style={[styles.passTypeButtonText, selectedPass.pass_type === type && styles.passTypeButtonTextActive]}>{type.toUpperCase()}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity style={[styles.actionButton, selectedPass.status === "active" ? undefined : styles.actionButtonSuccess]} onPress={() => { const nextStatus: PassStatus = selectedPass.status === "active" ? "suspended" : "active"; void handleUpdatePassStatus(selectedPass.id, nextStatus); setSelectedPass({ ...selectedPass, status: nextStatus }); }}>
                  <Text style={styles.actionButtonText}>{selectedPass.status === "active" ? "Revoke / suspend pass" : "Reactivate pass"}</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity style={[styles.modalButton, styles.modalButtonCancel, { marginTop: 16 }]} onPress={() => setShowPassDetailsModal(false)}>
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Pass Modal */}
      <Modal
        visible={showCreatePassModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreatePassModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Pass</Text>

            <Text style={styles.modalLabel}>Find an active user</Text>
            <TextInput
              style={styles.modalInput}
              value={userSearchQuery}
              onChangeText={(query) => {
                setUserSearchQuery(query);
                setNewPassUserId("");
              }}
              placeholder="Search ID, username, name, or email"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
            />
            <ScrollView
              style={{ maxHeight: 230, marginTop: 8 }}
              nestedScrollEnabled
            >
              {users.map((candidate) => {
                const selected = newPassUserId === candidate.id;
                return (
                  <TouchableOpacity
                    key={candidate.id}
                    style={[
                      styles.passCard,
                      selected && styles.passTypeButtonActive,
                      { marginBottom: 8 },
                    ]}
                    onPress={() => setNewPassUserId(candidate.id)}
                  >
                    <Text
                      style={[
                        styles.passNumber,
                        selected && styles.passTypeButtonTextActive,
                      ]}
                    >
                      {candidate.name ||
                        candidate.username ||
                        candidate.email ||
                        "Unnamed user"}
                    </Text>
                    <Text
                      style={[
                        styles.passInfo,
                        selected && styles.passTypeButtonTextActive,
                      ]}
                    >
                      {[
                        candidate.username ? `@${candidate.username}` : null,
                        candidate.email,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <Text
                      style={[
                        styles.passInfo,
                        selected && styles.passTypeButtonTextActive,
                      ]}
                    >
                      {candidate.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {usersLoading && <ActivityIndicator color="#007AFF" />}
              {!usersLoading && users.length === 0 && (
                <Text style={styles.emptyText}>
                  No active users match this search
                </Text>
              )}
              {usersNextCursor && !usersLoading && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() =>
                    void loadUsers(userSearchQuery, usersNextCursor)
                  }
                >
                  <Text style={styles.actionButtonText}>Load more users</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <Text style={styles.modalLabel}>Pass Type</Text>
            <View style={styles.passTypeButtons}>
              {(["general", "business", "vip"] as PassType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.passTypeButton,
                    newPassType === type && styles.passTypeButtonActive,
                  ]}
                  onPress={() => setNewPassType(type)}
                >
                  <Text
                    style={[
                      styles.passTypeButtonText,
                      newPassType === type && styles.passTypeButtonTextActive,
                    ]}
                  >
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCreatePassModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleCreatePass}
                disabled={passesLoading}
              >
                {passesLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextConfirm,
                    ]}
                  >
                    Create
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Create Pass Code Modal */}
      <Modal
        visible={showCreatePassCodeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreatePassCodeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Create Pass Code for {selectedEventId}
            </Text>

            <Text style={styles.modalLabel}>Internal label</Text>
            <TextInput
              style={styles.modalInput}
              value={newPassCodeLabel}
              onChangeText={setNewPassCodeLabel}
              placeholder="e.g. Sponsor VIP giveaway"
              placeholderTextColor={colors.text.secondary}
            />

            <Text style={styles.modalLabel}>Code (optional)</Text>
            <TextInput
              style={styles.modalInput}
              value={newPassCode}
              onChangeText={setNewPassCode}
              placeholder="Leave blank to generate a secure code"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="characters"
              autoCorrect={false}
            />

            <Text style={styles.modalLabel}>Pass type</Text>
            <View style={styles.passTypeButtons}>
              {(["general", "business", "vip"] as PassType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.passTypeButton,
                    newPassCodeType === type && styles.passTypeButtonActive,
                  ]}
                  onPress={() => setNewPassCodeType(type)}
                >
                  <Text
                    style={[
                      styles.passTypeButtonText,
                      newPassCodeType === type &&
                        styles.passTypeButtonTextActive,
                    ]}
                  >
                    {type.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Claim limit</Text>
            <TextInput
              style={styles.modalInput}
              value={newPassCodeLimit}
              onChangeText={setNewPassCodeLimit}
              placeholder="1 for one-time; blank for unlimited"
              placeholderTextColor={colors.text.secondary}
              keyboardType="number-pad"
            />
            <Text style={[styles.modalLabel, { fontSize: 12, marginTop: 4 }]}>
              A code can only grant one pass to each account. The raw code is
              shown once after creation and is never stored.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCreatePassCodeModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleCreatePassCode}
                disabled={passCodesLoading}
              >
                {passCodesLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextConfirm,
                    ]}
                  >
                    Create code
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Match Meeting Modal */}
      <Modal
        visible={showMatchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowMatchModal(false)}
      >
        <MatchMeetingModal
          styles={styles}
          colors={colors}
          request={selectedRequest}
          speakers={speakers}
          selectedSlot={selectedSlot}
          onSlotChange={setSelectedSlot}
          onConfirm={handleCreateMatch}
          onCancel={() => {
            setShowMatchModal(false);
            setSelectedRequest(null);
            setSelectedSlot("");
          }}
          loading={meetingsLoading}
          onLoadSlots={getAvailableSlots}
        />
      </Modal>

      {/* Grant Role Modal */}
      <Modal
        visible={showGrantRoleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGrantRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              Grant Role for {selectedEventId}
            </Text>

            <Text style={styles.modalLabel}>User ID (UUID)</Text>
            <TextInput
              style={styles.modalInput}
              value={newRoleUserId}
              onChangeText={setNewRoleUserId}
              placeholder="Enter user UUID from auth.users"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
            />

            <Text style={styles.modalLabel}>Role</Text>
            <View style={styles.passTypeButtons}>
              <TouchableOpacity
                style={[
                  styles.passTypeButton,
                  newRoleType === "moderator" && styles.passTypeButtonActive,
                ]}
                onPress={() => setNewRoleType("moderator")}
              >
                <Text
                  style={[
                    styles.passTypeButtonText,
                    newRoleType === "moderator" &&
                      styles.passTypeButtonTextActive,
                  ]}
                >
                  MODERATOR
                </Text>
              </TouchableOpacity>
              {adminRole === "super_admin" && (
                <TouchableOpacity
                  style={[
                    styles.passTypeButton,
                    newRoleType === "event_admin" &&
                      styles.passTypeButtonActive,
                  ]}
                  onPress={() => setNewRoleType("event_admin")}
                >
                  <Text
                    style={[
                      styles.passTypeButtonText,
                      newRoleType === "event_admin" &&
                        styles.passTypeButtonTextActive,
                    ]}
                  >
                    EVENT ADMIN
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {adminRole !== "super_admin" && (
              <Text
                style={[styles.modalLabel, { fontSize: 12, marginTop: -12 }]}
              >
                Only a super admin can grant event_admin. You can grant
                moderator.
              </Text>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowGrantRoleModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleGrantRole}
                disabled={rolesLoading}
              >
                {rolesLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextConfirm,
                    ]}
                  >
                    Grant
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Grant Global Administrator Modal */}
      <Modal
        visible={showGrantGlobalAdminModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGrantGlobalAdminModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Grant Global Admin</Text>

            <Text style={styles.modalLabel}>Account email</Text>
            <TextInput
              style={styles.modalInput}
              value={newGlobalAdminEmail}
              onChangeText={setNewGlobalAdminEmail}
              placeholder="admin@example.com"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Text style={[styles.modalLabel, { fontSize: 12, marginTop: 4 }]}>
              Global admins can manage event operations but cannot grant global
              admin access.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowGrantGlobalAdminModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleGrantGlobalAdmin}
                disabled={globalAdminsLoading}
              >
                {globalAdminsLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextConfirm,
                    ]}
                  >
                    Grant
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Grant Speaker Role Modal */}
      <Modal
        visible={showGrantSpeakerRoleModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGrantSpeakerRoleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Speaker Account</Text>
            <Text style={styles.modalLabel}>
              {selectedSpeakerRole
                ? `Speaker: ${selectedSpeakerRole.name}`
                : "Speaker"}
            </Text>
            <Text style={styles.modalLabel}>Existing account email</Text>
            <TextInput
              style={styles.modalInput}
              value={newSpeakerAccountEmail}
              onChangeText={setNewSpeakerAccountEmail}
              placeholder="speaker@example.com"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <Text style={[styles.modalLabel, { fontSize: 12, marginTop: 4 }]}>
              This activates the linked speaker profile. The account must
              already exist.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowGrantSpeakerRoleModal(false)}
                disabled={speakerRolesLoading}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleGrantSpeakerRole}
                disabled={speakerRolesLoading}
              >
                {speakerRolesLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalButtonText,
                      styles.modalButtonTextConfirm,
                    ]}
                  >
                    Assign
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* QR Scanner */}
      <AdminQRScanner
        visible={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScanSuccess={handleQRScanSuccess}
      />
    </View>
  );
}

// Pass Management Tab Component
function PassManagementTab({
  styles,
  colors,
  passes,
  loading,
  searchQuery,
  onSearchChange,
  passTypeFilter,
  passStatusFilter,
  onPassTypeFilterChange,
  onPassStatusFilterChange,
  onCreatePass,
  onPassPress,
  onUpdateStatus,
  onUpdateType,
  onRefresh,
}: any) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.passCard}>
        <View style={styles.passCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.passNumber}>Pass registry</Text>
            <Text style={styles.passInfo}>Search, filter, revoke, and upgrade passes issued for this event.</Text>
          </View>
          <TouchableOpacity style={styles.actionButton} onPress={onRefresh} disabled={loading}>
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {(["all", "general", "business", "vip"] as const).map((type) => (
            <TouchableOpacity key={type} style={[styles.passTypeButton, passTypeFilter === type && styles.passTypeButtonActive]} onPress={() => onPassTypeFilterChange(type)}>
              <Text style={[styles.passTypeButtonText, passTypeFilter === type && styles.passTypeButtonTextActive]}>{type === "all" ? "All tiers" : type.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {(["all", "active", "suspended", "used", "expired", "cancelled"] as const).map((status) => (
            <TouchableOpacity key={status} style={[styles.filterChip, passStatusFilter === status && styles.filterChipActive]} onPress={() => onPassStatusFilterChange(status)}>
              <Text style={[styles.filterChipText, passStatusFilter === status && styles.filterChipTextActive]}>{status === "all" ? "All status" : status}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search passes..."
          placeholderTextColor={colors.text.secondary}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
      </View>

      <TouchableOpacity style={styles.createButton} onPress={onCreatePass}>
        <MaterialIcons name="add" size={24} color="#fff" />
        <Text style={styles.createButtonText}>Create New Pass</Text>
      </TouchableOpacity>
      <Text style={styles.passInfo}>{passes.length} matching pass{passes.length === 1 ? "" : "es"}</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {passes.map((pass: Pass) => (
            <View key={pass.id} style={styles.passCard}>
              <View style={styles.passCardHeader}>
                <TouchableOpacity onPress={() => onPassPress(pass)} accessibilityRole="button">
                  <Text style={styles.passNumber}>{pass.pass_number}</Text>
                </TouchableOpacity>
                <View
                  style={[
                    styles.statusBadge,
                    styles[`statusBadge${pass.status}`],
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{pass.status}</Text>
                </View>
              </View>
              <Text style={styles.passInfo}>
                Type: {pass.pass_type.toUpperCase()}
              </Text>
              <Text style={styles.passInfo}>User: {pass.user_id}</Text>
              {(pass.user_name || pass.username || pass.user_email) && (
                <Text style={styles.passInfo}>
                  {[
                    pass.user_name,
                    pass.username ? `@${pass.username}` : null,
                    pass.user_email,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
              <Text style={styles.passInfo}>
                Requests: {pass.used_meeting_requests} /{" "}
                {pass.max_meeting_requests}
              </Text>
              <Text style={styles.passInfo}>
                Boost: {pass.used_boost_amount} / {pass.max_boost_amount}
              </Text>
              <View style={styles.passActions}>
                {(["general", "business", "vip"] as PassType[]).filter((type) => type !== pass.pass_type).map((type) => (
                  <TouchableOpacity key={type} style={[styles.actionButton, type === "vip" && styles.actionButtonWarning]} onPress={() => onUpdateType(pass.id, type)}>
                    <Text style={styles.actionButtonText}>Upgrade {type.toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
                {pass.status === "active" && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onUpdateStatus(pass.id, "suspended")}
                  >
                    <Text style={styles.actionButtonText}>Suspend</Text>
                  </TouchableOpacity>
                )}
                {pass.status === "suspended" && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSuccess]}
                    onPress={() => onUpdateStatus(pass.id, "active")}
                  >
                    <Text style={styles.actionButtonText}>Activate</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))}
          {passes.length === 0 && (
            <Text style={styles.emptyText}>No passes found</Text>
          )}
        </View>
      )}
    </View>
  );
}

function PassTierSettings({
  styles,
  tiers,
  loading,
  savingPassType,
  onRefresh,
  onSave,
}: {
  styles: any;
  tiers: EventPassTier[];
  loading: boolean;
  savingPassType: PassType | null;
  onRefresh: () => void;
  onSave: (tier: EventPassTier) => void;
}) {
  const draftsRef = useRef<EventPassTier[]>(tiers);

  const updateDraft = (passType: PassType, update: Partial<EventPassTier>) => {
    draftsRef.current = draftsRef.current.map((tier) =>
      tier.pass_type === passType ? { ...tier, ...update } : tier,
    );
  };

  return (
    <View style={[styles.list, { marginBottom: 20 }]}>
      <View style={styles.passCard}>
        <View style={styles.passCardHeader}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.passNumber}>Pass tier settings</Text>
            <Text style={styles.passInfo}>
              Controls the price and new-pass allowances for this event.
              Existing passes keep their issued limits.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onRefresh}
            disabled={loading}
          >
            <MaterialIcons name="refresh" size={16} color="#fff" />
            <Text style={styles.actionButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        tiers.map((tier) => {
          const priceValue =
            tier.price_cents === null ? "" : String(tier.price_cents / 100);
          const isSaving = savingPassType === tier.pass_type;
          return (
            <View key={tier.pass_type} style={styles.passCard}>
              <Text style={styles.passNumber}>
                {tier.pass_type.toUpperCase()}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Meeting requests</Text>
                  <TextInput
                    style={styles.modalInput}
                    defaultValue={String(tier.max_meeting_requests)}
                    onChangeText={(value) =>
                      updateDraft(tier.pass_type, {
                        max_meeting_requests:
                          Number(value.replace(/[^0-9]/g, "")) || 0,
                      })
                    }
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Boost points</Text>
                  <TextInput
                    style={styles.modalInput}
                    defaultValue={String(tier.max_boost_amount)}
                    onChangeText={(value) =>
                      updateDraft(tier.pass_type, {
                        max_boost_amount:
                          Number(value.replace(/[^0-9]/g, "")) || 0,
                      })
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Price ({tier.currency})</Text>
                  <TextInput
                    style={styles.modalInput}
                    defaultValue={priceValue}
                    onChangeText={(value) => {
                      const normalized = value.replace(/[^0-9.]/g, "");
                      updateDraft(tier.pass_type, {
                        price_cents: normalized
                          ? Math.round(Number(normalized) * 100)
                          : null,
                      });
                    }}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 99"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Price label (optional)</Text>
                  <TextInput
                    style={styles.modalInput}
                    defaultValue={tier.price_label || ""}
                    onChangeText={(value) =>
                      updateDraft(tier.pass_type, {
                        price_label: value || null,
                      })
                    }
                    placeholder="e.g. Premium"
                  />
                </View>
              </View>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.actionButtonSuccess,
                  { alignSelf: "flex-start" },
                ]}
                onPress={() => {
                  const draft = draftsRef.current.find(
                    (item) => item.pass_type === tier.pass_type,
                  );
                  if (draft) onSave(draft);
                }}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.actionButtonText}>
                    Save {tier.pass_type}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })
      )}
    </View>
  );
}

function PassCodeManagementTab({
  styles,
  colors,
  codes,
  loading,
  onCreate,
  onUpdateStatus,
  onRefresh,
}: any) {
  return (
    <View style={styles.tabContent}>
      <Text style={[styles.passInfo, { marginBottom: 12 }]}>
        Manage reusable promotions and one-time courtesy upgrades for this
        event.
      </Text>
      <TouchableOpacity style={styles.createButton} onPress={onCreate}>
        <MaterialIcons name="add" size={24} color="#fff" />
        <Text style={styles.createButtonText}>Create Pass Code</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.actionButton,
          { alignSelf: "flex-end", marginBottom: 10 },
        ]}
        onPress={onRefresh}
      >
        <MaterialIcons name="refresh" size={16} color="#fff" />
        <Text style={styles.actionButtonText}>Refresh</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {codes.map((code: PassClaimCode) => {
            const limit =
              code.max_claims === null
                ? "Unlimited"
                : `${code.claimed_count} / ${code.max_claims}`;
            const expires = code.expires_at
              ? new Date(code.expires_at).toLocaleDateString()
              : "Never";
            return (
              <View key={code.id} style={styles.passCard}>
                <View style={styles.passCardHeader}>
                  <Text style={styles.passNumber}>{code.label}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor: code.is_active ? "#16A34A" : "#6B7280",
                      },
                    ]}
                  >
                    <Text style={styles.statusBadgeText}>
                      {code.is_active ? "ACTIVE" : "INACTIVE"}
                    </Text>
                  </View>
                </View>
                <Text style={styles.passInfo}>
                  Pass: {code.pass_type.toUpperCase()}
                </Text>
                <Text style={styles.passInfo}>Claims: {limit}</Text>
                <Text style={styles.passInfo}>Expires: {expires}</Text>
                <View style={styles.passActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      !code.is_active && styles.actionButtonSuccess,
                    ]}
                    onPress={() => onUpdateStatus(code)}
                  >
                    <Text style={styles.actionButtonText}>
                      {code.is_active ? "Deactivate" : "Reactivate"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
          {codes.length === 0 && (
            <Text style={styles.emptyText}>
              No pass codes for this event yet
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// Staff & Roles Tab Component
function RolesTab({
  styles,
  colors,
  eventId,
  roles,
  loading,
  canGrantEventAdmin,
  canManageGlobalAdmins,
  globalAdmins,
  globalAdminsLoading,
  onGrantGlobalAdmin,
  onRevokeGlobalAdmin,
  onGrantPress,
  onRevoke,
  onRefresh,
}: any) {
  return (
    <View style={styles.tabContent}>
      {canManageGlobalAdmins && (
        <>
          <Text style={[styles.passNumber, { marginBottom: 8 }]}>
            Global Administrators
          </Text>
          <Text style={[styles.passInfo, { marginBottom: 12 }]}>
            Only a super admin can grant or revoke this role.
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={onGrantGlobalAdmin}
          >
            <MaterialIcons name="admin-panel-settings" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Grant Global Admin</Text>
          </TouchableOpacity>
          {globalAdminsLoading ? (
            <ActivityIndicator
              size="large"
              color="#007AFF"
              style={styles.loader}
            />
          ) : (
            <View style={[styles.list, { marginBottom: 24 }]}>
              {globalAdmins.map((roleRow: GlobalAdminRoleRow) => (
                <View key={roleRow.id} style={styles.passCard}>
                  <View style={styles.passCardHeader}>
                    <Text style={styles.passNumber}>{roleRow.user_id}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            roleRow.role === "super_admin"
                              ? "#DC2626"
                              : "#7C3AED",
                        },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>{roleRow.role}</Text>
                    </View>
                  </View>
                  <Text style={styles.passInfo}>
                    Granted: {new Date(roleRow.created_at).toLocaleDateString()}
                  </Text>
                  {roleRow.role === "admin" && (
                    <View style={styles.passActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => onRevokeGlobalAdmin(roleRow.user_id)}
                      >
                        <Text style={styles.actionButtonText}>Revoke</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
              {globalAdmins.length === 0 && (
                <Text style={styles.emptyText}>
                  No standard global administrators granted
                </Text>
              )}
            </View>
          )}
          <Text style={[styles.passNumber, { marginBottom: 8 }]}>
            Event Staff
          </Text>
        </>
      )}
      <TouchableOpacity style={styles.createButton} onPress={onGrantPress}>
        <MaterialIcons name="person-add" size={24} color="#fff" />
        <Text style={styles.createButtonText}>Grant Role</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {roles.map((roleRow: EventRoleRow) => (
            <View key={roleRow.id} style={styles.passCard}>
              <View style={styles.passCardHeader}>
                <Text style={styles.passNumber}>{roleRow.user_id}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        roleRow.role === "event_admin" ? "#007AFF" : "#8E8E93",
                    },
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{roleRow.role}</Text>
                </View>
              </View>
              <Text style={styles.passInfo}>Event: {eventId}</Text>
              <Text style={styles.passInfo}>
                Granted: {new Date(roleRow.granted_at).toLocaleDateString()}
                {roleRow.expires_at
                  ? ` · Expires: ${new Date(roleRow.expires_at).toLocaleDateString()}`
                  : ""}
              </Text>
              {(roleRow.role === "moderator" || canGrantEventAdmin) && (
                <View style={styles.passActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onRevoke(roleRow.user_id, roleRow.role)}
                  >
                    <Text style={styles.actionButtonText}>Revoke</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {roles.length === 0 && (
            <Text style={styles.emptyText}>
              No staff roles granted for this event yet
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function SpeakerRoleManagementTab({
  styles,
  speakers,
  loading,
  onAssign,
  onRevoke,
  onToggleActive,
  onRefresh,
}: any) {
  const speakerSearchData = useMemo(
    () =>
      speakers.map((speaker: SpeakerRoleRecord) => {
        const hasAccount = Boolean(speaker.userId);
        const assignmentStatus = speaker.isActive
          ? "Active"
          : hasAccount
            ? "Inactive"
            : "Unassigned";
        const accountLabel =
          speaker.claim?.email_normalized ||
          (hasAccount ? "Account linked" : "No account assigned");

        return {
          ...speaker,
          accountLabel,
          assignmentStatus,
        };
      }),
    [speakers],
  );
  const [filteredSpeakers, setFilteredSpeakers] = useState(speakerSearchData);
  const orderedSpeakers = useMemo(
    () =>
      [...filteredSpeakers].sort((left, right) => {
        const priority = (speaker: SpeakerRoleRecord) =>
          speaker.isActive && speaker.userId ? 0 : speaker.userId ? 1 : 2;
        return (
          priority(left) - priority(right) ||
          left.name.localeCompare(right.name)
        );
      }),
    [filteredSpeakers],
  );

  return (
    <View style={styles.tabContent}>
      <Text style={[styles.passInfo, { marginBottom: 12 }]}>
        Assign an existing account to a speaker profile, then control whether
        that speaker is available for networking.
      </Text>
      <TouchableOpacity
        style={[styles.actionButton, styles.speakerRefreshButton]}
        onPress={onRefresh}
        disabled={loading}
      >
        <MaterialIcons name="refresh" size={16} color="#fff" />
        <Text style={styles.actionButtonText}>Refresh</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <>
          <UnifiedSearchAndFilter
            data={speakerSearchData}
            onFilteredData={setFilteredSpeakers}
            onSearchChange={() => undefined}
            searchPlaceholder="Search speakers, organization, or account..."
            searchFields={["name", "title", "company", "accountLabel"]}
            filterGroups={[
              {
                key: "assignmentStatus",
                label: "Assignment status",
                type: "chips",
                options: [],
              },
            ]}
            showResultsCount
          />
          <View style={styles.list}>
            {orderedSpeakers.map(
              (
                speaker: SpeakerRoleRecord & {
                  accountLabel: string;
                  assignmentStatus: string;
                },
              ) => {
                const hasAccount = Boolean(speaker.userId);
                const status = speaker.isActive
                  ? "ACTIVE"
                  : hasAccount
                    ? "INACTIVE"
                    : "UNASSIGNED";
                const statusColor = speaker.isActive
                  ? "#34A853"
                  : hasAccount
                    ? "#8E8E93"
                    : "#D97706";

                return (
                  <View key={speaker.id} style={styles.passCard}>
                    <View style={styles.passCardHeader}>
                      <View style={styles.speakerRoleTitleWrap}>
                        <Text style={styles.passNumber}>{speaker.name}</Text>
                        {speaker.title || speaker.company ? (
                          <Text style={styles.passInfo}>
                            {[speaker.title, speaker.company]
                              .filter(Boolean)
                              .join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: statusColor },
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>{status}</Text>
                      </View>
                    </View>
                    <Text style={styles.passInfo}>{speaker.accountLabel}</Text>
                    {speaker.claim?.status === "needs_review" &&
                    speaker.claim.claim_error ? (
                      <Text style={styles.speakerRoleWarning}>
                        {speaker.claim.claim_error}
                      </Text>
                    ) : null}
                    <View style={styles.passActions}>
                      {!hasAccount ? (
                        <TouchableOpacity
                          style={[
                            styles.actionButton,
                            styles.actionButtonSuccess,
                          ]}
                          onPress={() => onAssign(speaker)}
                        >
                          <Text style={styles.actionButtonText}>
                            Assign account
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={[
                              styles.actionButton,
                              speaker.isActive
                                ? undefined
                                : styles.actionButtonSuccess,
                            ]}
                            onPress={() => onToggleActive(speaker)}
                          >
                            <Text style={styles.actionButtonText}>
                              {speaker.isActive ? "Deactivate" : "Activate"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => onRevoke(speaker)}
                          >
                            <Text style={styles.actionButtonText}>
                              Remove access
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              },
            )}
            {orderedSpeakers.length === 0 && (
              <Text style={styles.emptyText}>
                No speakers match the current search or filter
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

// QR Scanner Tab Component
function QRScannerTab({ styles, colors, onScanPress }: any) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.qrScannerCard}>
        <MaterialIcons name="qr-code-scanner" size={64} color="#007AFF" />
        <Text style={styles.qrScannerTitle}>QR Code Scanner</Text>
        <Text style={styles.qrScannerDescription}>
          Scan QR codes to validate passes and check their status
        </Text>
        <TouchableOpacity style={styles.scanButton} onPress={onScanPress}>
          <MaterialIcons name="camera-alt" size={24} color="#fff" />
          <Text style={styles.scanButtonText}>Start Scanning</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Meeting Matcher Tab Component
function MeetingMatcherTab({
  styles,
  colors,
  requests,
  speakers,
  loading,
  searchQuery,
  onSearchChange,
  onMatchPress,
  onRefresh,
  randomMatchCount,
  onRandomMatchCountChange,
  onRandomMatch,
}: any) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.requestCard}>
        <Text style={styles.requestTitle}>Admin matchmaking</Text>
        <Text style={styles.requestInfo}>Create random attendee-to-speaker matches, or use a pending request below for a manual match. Both participants receive an in-app notification and email.</Text>
        <TextInput style={styles.searchInput} keyboardType="number-pad" value={randomMatchCount} onChangeText={onRandomMatchCountChange} placeholder="Number of random matches" placeholderTextColor={colors.text.secondary} />
        <TouchableOpacity style={styles.matchButton} onPress={onRandomMatch} disabled={loading}>
          <MaterialIcons name="shuffle" size={20} color="#fff" /><Text style={styles.matchButtonText}>Generate random matches</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color={colors.text.secondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search meeting requests..."
          placeholderTextColor={colors.text.secondary}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {requests.map((request: MeetingRequest) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestCardHeader}>
                <View>
                  <Text style={styles.requestTitle}>
                    {request.requester_name}
                  </Text>
                  <Text style={styles.requestSubtitle}>
                    → {request.speaker_name}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    styles[`statusBadge${request.status}`],
                  ]}
                >
                  <Text style={styles.statusBadgeText}>{request.status}</Text>
                </View>
              </View>
              <Text style={styles.requestInfo}>
                Created: {new Date(request.created_at).toLocaleDateString()}
              </Text>
              {request.status === "pending" && (
                <TouchableOpacity
                  style={styles.matchButton}
                  onPress={() => onMatchPress(request)}
                >
                  <MaterialIcons name="link" size={20} color="#fff" />
                  <Text style={styles.matchButtonText}>Create Match</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {requests.length === 0 && (
            <Text style={styles.emptyText}>No meeting requests found</Text>
          )}
        </View>
      )}
    </View>
  );
}

function CommunicationsTab({ styles, colors, subject, heading, message, audience, template, preview, sending, onSubject, onHeading, onMessage, onAudience, onTemplate, onPreview, onSend }: any) {
  return <View style={styles.tabContent}>
    <Text style={styles.requestTitle}>Email communications</Text>
    <Text style={styles.requestInfo}>Compose a global event announcement, preview the exact rendered email, then deliver it to attendees, speakers, or everyone. Delivery outcomes are retained in the audit log.</Text>

    <Text style={styles.campaignFieldLabel}>Audience</Text>
    <View style={styles.campaignPillRow}>
      {['attendees', 'speakers', 'all'].map(value => <TouchableOpacity key={value} style={[styles.slotOption, audience === value && styles.slotOptionActive]} onPress={() => onAudience(value)}><Text style={[styles.slotOptionText, audience === value && styles.slotOptionTextActive]}>{value}</Text></TouchableOpacity>)}
    </View>

    <Text style={styles.campaignFieldLabel}>Template</Text>
    <View style={styles.campaignPillRow}>
      <TouchableOpacity style={[styles.slotOption, template === 'branded' && styles.slotOptionActive]} onPress={() => onTemplate('branded')}>
        <Text style={[styles.slotOptionText, template === 'branded' && styles.slotOptionTextActive]}>HASHPASS template</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.slotOption, template === 'raw' && styles.slotOptionActive]} onPress={() => onTemplate('raw')}>
        <Text style={[styles.slotOptionText, template === 'raw' && styles.slotOptionTextActive]}>Raw (unbranded)</Text>
      </TouchableOpacity>
    </View>
    <Text style={styles.requestInfo}>
      {template === 'branded'
        ? 'Uses the same branded header, card layout, and footer as HASHPASS notification emails, including event branding when applicable.'
        : 'Sends a minimal, unbranded shell — useful for quick internal or plain-text-style messages.'}
    </Text>

    <TextInput style={styles.searchInput} value={subject} onChangeText={onSubject} placeholder="Email subject" placeholderTextColor={colors.text.secondary} />
    <TextInput style={styles.searchInput} value={heading} onChangeText={onHeading} placeholder="Email heading" placeholderTextColor={colors.text.secondary} />
    <TextInput style={[styles.searchInput, { minHeight: 140, textAlignVertical: 'top' }]} value={message} onChangeText={onMessage} multiline placeholder="Message" placeholderTextColor={colors.text.secondary} />

    {preview && (
      <View style={styles.requestCard}>
        <Text style={styles.requestSubtitle}>Rendered preview · {preview.template === 'raw' ? 'raw' : 'HASHPASS template'}</Text>
        <Text style={styles.requestTitle}>{preview.subject}</Text>
        {preview.html ? (
          <View style={styles.emailPreviewWrap}>
            {/* Deferred require: react-native-webview pulls in a real native
                module at import time, which would crash every test that
                renders this screen (not just the Emails tab) if imported
                statically at module scope. */}
            {(() => {
              const EmailPreviewFrame = require("../../../components/EmailPreviewFrame").default;
              return <EmailPreviewFrame html={preview.html} />;
            })()}
          </View>
        ) : (
          <Text style={styles.requestInfo}>{preview.message}</Text>
        )}
      </View>
    )}

    <View style={{ flexDirection: 'row', gap: 12 }}><TouchableOpacity style={[styles.matchButton, { flex: 1 }]} onPress={onPreview} disabled={sending}><Text style={styles.matchButtonText}>Preview</Text></TouchableOpacity><TouchableOpacity style={[styles.matchButton, { flex: 1 }]} onPress={onSend} disabled={sending}><MaterialIcons name="send" size={18} color="#fff"/><Text style={styles.matchButtonText}>{sending ? 'Sending…' : 'Send campaign'}</Text></TouchableOpacity></View>
  </View>;
}

// Match Meeting Modal Component
function MatchMeetingModal({
  styles,
  colors,
  request,
  speakers,
  selectedSlot,
  onSlotChange,
  onConfirm,
  onCancel,
  loading,
  onLoadSlots,
}: any) {
  const [slots, setSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (request) {
      loadSlots();
    }
  }, [request]);

  const loadSlots = async () => {
    if (!request) return;
    setLoadingSlots(true);

    // meeting_requests.speaker_id is UUID (user_id), need to find bsl_speakers.id
    try {
      const { data: speakerData } = await supabase
        .from("bsl_speakers")
        .select("id")
        .eq("user_id", request.speaker_id)
        .single();

      if (speakerData) {
        const availableSlots = await onLoadSlots(speakerData.id);
        setSlots(availableSlots);
      } else {
        // Fallback: try finding by id
        const speaker = speakers.find(
          (s: Speaker) =>
            s.id === request.speaker_id || s.user_id === request.speaker_id,
        );
        if (speaker && speaker.id) {
          const availableSlots = await onLoadSlots(speaker.id);
          setSlots(availableSlots);
        }
      }
    } catch (error) {
      console.error("Error loading slots:", error);
    }

    setLoadingSlots(false);
  };

  if (!request) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Create Meeting Match</Text>

        <Text style={styles.modalLabel}>
          Requester: {request.requester_name}
        </Text>
        <Text style={styles.modalLabel}>Speaker: {request.speaker_name}</Text>

        <Text style={styles.modalLabel}>Select Time Slot</Text>
        {loadingSlots ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <ScrollView style={styles.slotsList} nestedScrollEnabled>
            {slots.map((slot: any, index: number) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.slotOption,
                  selectedSlot === slot.slot_time && styles.slotOptionActive,
                ]}
                onPress={() => onSlotChange(slot.slot_time)}
              >
                <Text
                  style={[
                    styles.slotOptionText,
                    selectedSlot === slot.slot_time &&
                      styles.slotOptionTextActive,
                  ]}
                >
                  {new Date(slot.slot_time).toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
            {slots.length === 0 && (
              <Text style={styles.emptyText}>No available slots</Text>
            )}
          </ScrollView>
        )}

        <View style={styles.modalButtons}>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonCancel]}
            onPress={onCancel}
          >
            <Text style={styles.modalButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalButton, styles.modalButtonConfirm]}
            onPress={onConfirm}
            disabled={loading || !selectedSlot}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text
                style={[styles.modalButtonText, styles.modalButtonTextConfirm]}
              >
                Create Match
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.default,
    },
    header: {
      padding: 20,
      backgroundColor: colors.background.paper,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.text.primary,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    eventSwitcher: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 12,
    },
    eventSwitcherChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background.default,
    },
    eventSwitcherChipActive: {
      backgroundColor: "#007AFF",
      borderColor: "#007AFF",
    },
    eventSwitcherChipText: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.text.secondary,
    },
    eventSwitcherChipTextActive: {
      color: "#fff",
    },
    tabsWrapper: {
      backgroundColor: colors.background.paper,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      position: "relative",
    },
    tabs: {
      flexGrow: 0,
    },
    tabsContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingLeft: 10,
      // Keep the final action clear of the fixed More/Back control.
      paddingRight: 96,
      paddingVertical: 8,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      minHeight: 42,
      minWidth: 140,
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: 10,
      gap: 6,
    },
    tabActive: {
      backgroundColor: "#007AFF",
    },
    tabText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: "500",
    },
    tabTextActive: {
      color: "#fff",
      fontWeight: "600",
    },
    tabScrollHint: {
      alignItems: "center",
      backgroundColor: colors.background.paper,
      borderLeftWidth: 1,
      borderLeftColor: colors.divider,
      bottom: 0,
      flexDirection: "row",
      gap: 2,
      justifyContent: "center",
      minWidth: 76,
      paddingHorizontal: 8,
      position: "absolute",
      right: 0,
      top: 0,
    },
    tabScrollHintText: {
      color: "#007AFF",
      fontSize: 12,
      fontWeight: "600",
    },
    content: {
      flex: 1,
    },
    tabContent: {
      padding: 20,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text.primary,
    },
    createButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#007AFF",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      gap: 8,
    },
    createButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    list: {
      gap: 12,
    },
    passCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    passCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    passNumber: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text.primary,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    statusBadgeactive: {
      backgroundColor: "#34A853",
    },
    statusBadgesuspended: {
      backgroundColor: "#FF9500",
    },
    statusBadgeexpired: {
      backgroundColor: "#8E8E93",
    },
    statusBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "600",
    },
    passInfo: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    passActions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
      marginTop: 12,
    },
    actionButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: "#FF3B30",
      borderRadius: 8,
    },
    actionButtonSuccess: {
      backgroundColor: "#34A853",
    },
    actionButtonWarning: {
      backgroundColor: "#D97706",
    },
    filterChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background.default,
    },
    filterChipActive: {
      backgroundColor: "#007AFF",
      borderColor: "#007AFF",
    },
    filterChipText: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    filterChipTextActive: {
      color: "#fff",
    },
    actionButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    speakerRefreshButton: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 12,
    },
    speakerRoleTitleWrap: {
      flex: 1,
      paddingRight: 12,
    },
    speakerRoleWarning: {
      color: "#D97706",
      fontSize: 13,
      marginTop: 4,
    },
    qrScannerCard: {
      alignItems: "center",
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      padding: 32,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    qrScannerTitle: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    qrScannerDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: "center",
      marginBottom: 24,
    },
    scanButton: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#007AFF",
      borderRadius: 12,
      padding: 16,
      gap: 8,
    },
    scanButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
    },
    requestCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      marginBottom: 12,
    },
    requestCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    requestTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text.primary,
    },
    requestSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    requestInfo: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    matchButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#007AFF",
      borderRadius: 8,
      padding: 12,
      gap: 8,
    },
    matchButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    modalContent: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 24,
      width: "90%",
      maxHeight: "80%",
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "600",
      color: colors.text.primary,
      marginBottom: 20,
    },
    modalLabel: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: 8,
      marginTop: 12,
    },
    modalInput: {
      backgroundColor: colors.background.default,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    passTypeButtons: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 20,
    },
    passTypeButton: {
      flex: 1,
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.background.default,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: "center",
    },
    passTypeButtonActive: {
      backgroundColor: "#007AFF",
      borderColor: "#007AFF",
    },
    passTypeButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    passTypeButtonTextActive: {
      color: "#fff",
    },
    modalButtons: {
      flexDirection: "row",
      gap: 12,
      marginTop: 20,
    },
    modalButton: {
      flex: 1,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
    },
    modalButtonCancel: {
      backgroundColor: colors.background.default,
    },
    modalButtonConfirm: {
      backgroundColor: "#007AFF",
    },
    modalButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text.primary,
    },
    modalButtonTextConfirm: {
      color: "#fff",
    },
    slotsList: {
      maxHeight: 200,
      marginBottom: 20,
    },
    slotOption: {
      padding: 12,
      borderRadius: 8,
      backgroundColor: colors.background.default,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    slotOptionActive: {
      backgroundColor: "#007AFF",
      borderColor: "#007AFF",
    },
    slotOptionText: {
      fontSize: 14,
      color: colors.text.primary,
    },
    slotOptionTextActive: {
      color: "#fff",
    },
    campaignFieldLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.4,
      marginBottom: 8,
      marginTop: 4,
    },
    campaignPillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 12,
    },
    emailPreviewWrap: {
      marginTop: 12,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.divider,
    },
    emptyText: {
      textAlign: "center",
      color: colors.text.secondary,
      fontSize: 14,
      marginTop: 32,
    },
    loader: {
      marginTop: 32,
    },
  });
