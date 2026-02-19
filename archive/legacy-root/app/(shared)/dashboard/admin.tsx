import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { isAdmin, getUserAdminRole, AdminRole } from '../../../lib/admin-utils';
import { supabase } from '../../../lib/supabase';
import { passSystemService, PassType, PassStatus } from '../../../lib/pass-system';
import { qrSystemService, QRScanResult } from '../../../lib/qr-system';
import AdminQRScanner from '../../../components/AdminQRScanner';
import LoadingScreen from '../../../components/LoadingScreen';
import { useRouter } from 'expo-router';

type TabType = 'passes' | 'qr-scanner' | 'meetings';

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
}

interface User {
  id: string;
  email?: string;
  name?: string;
}

interface Speaker {
  id: string;
  name: string;
  title?: string;
  company?: string;
  user_id?: string;
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

export default function AdminPanel() {
  const { colors, isDark } = useTheme();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('passes');
  const [isUserAdmin, setIsUserAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQRScanner, setShowQRScanner] = useState(false);
  
  // Pass Management State
  const [passes, setPasses] = useState<Pass[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [passesLoading, setPassesLoading] = useState(false);
  const [showCreatePassModal, setShowCreatePassModal] = useState(false);
  const [newPassUserId, setNewPassUserId] = useState('');
  const [newPassType, setNewPassType] = useState<PassType>('general');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Meeting Matcher State
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [meetingRequests, setMeetingRequests] = useState<MeetingRequest[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const styles = getStyles(isDark, colors);

  // Wait for auth to finish loading before checking admin access
  useEffect(() => {
    // Don't check admin access while auth is still loading
    if (authLoading) {
      console.log('Auth still loading, waiting...');
      return;
    }

    // If auth finished loading and no user, redirect
    if (!user) {
      console.log('No user found after auth load, redirecting...');
      router.replace('/(shared)/dashboard/explore');
      return;
    }

    // Now check admin access
    checkAdminAccess();
  }, [user, authLoading]);

  useEffect(() => {
    if (isUserAdmin) {
      loadInitialData();
    }
  }, [isUserAdmin, activeTab]);

  const checkAdminAccess = async () => {
    if (!user) {
      console.log('checkAdminAccess: No user, redirecting...');
      router.replace('/(shared)/dashboard/explore');
      return;
    }

    console.log('Checking admin access for user:', user.id);
    setLoading(true);
    
    try {
      const admin = await isAdmin(user.id);
      console.log('Admin check result:', admin);
      
      if (!admin) {
        console.log('User is not admin, redirecting...');
        Alert.alert('Access Denied', 'You do not have admin privileges.');
        router.replace('/(shared)/dashboard/explore');
        return;
      }

      console.log('User is admin, setting up admin panel...');
      setIsUserAdmin(true);
      const role = await getUserAdminRole(user.id);
      setAdminRole(role);
      setLoading(false);
    } catch (error) {
      console.error('Error checking admin access:', error);
      Alert.alert('Error', 'Failed to verify admin access. Please try again.');
      router.replace('/(shared)/dashboard/explore');
    }
  };

  const loadInitialData = async () => {
    if (activeTab === 'passes') {
      await loadPasses();
      await loadUsers();
    } else if (activeTab === 'meetings') {
      await loadMeetingRequests();
      await loadSpeakers();
    }
  };

  const loadPasses = async () => {
    setPassesLoading(true);
    try {
      const { data, error } = await supabase
        .from('passes')
        .select('*')
        .eq('event_id', 'bsl2025')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setPasses(data || []);
    } catch (error: any) {
      console.error('Error loading passes:', error);
      Alert.alert('Error', 'Failed to load passes: ' + error.message);
    } finally {
      setPassesLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      // Get unique user IDs from passes
      const { data: passesData, error: passesError } = await supabase
        .from('passes')
        .select('user_id')
        .eq('event_id', 'bsl2025')
        .limit(200);

      if (passesError) throw passesError;
      
      // Create user list from pass user_ids
      const uniqueUserIds = [...new Set((passesData || []).map(p => p.user_id))];
      setUsers(uniqueUserIds.map(id => ({ id, email: undefined, name: undefined })));
    } catch (error: any) {
      console.error('Error loading users:', error);
      // Fallback: empty array
      setUsers([]);
    }
  };

  const loadSpeakers = async () => {
    try {
      const { data, error } = await supabase
        .from('bsl_speakers')
        .select('id, name, title, company, user_id')
        .order('name')
        .limit(200);

      if (error) throw error;
      setSpeakers(data || []);
    } catch (error: any) {
      console.error('Error loading speakers:', error);
    }
  };

  const loadMeetingRequests = async () => {
    setMeetingsLoading(true);
    try {
      const { data, error } = await supabase
        .from('meeting_requests')
        .select('id, requester_id, speaker_id, requester_name, speaker_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setMeetingRequests(data || []);
    } catch (error: any) {
      console.error('Error loading meeting requests:', error);
      Alert.alert('Error', 'Failed to load meeting requests: ' + error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const handleCreatePass = async () => {
    if (!newPassUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID or email');
      return;
    }

    try {
      setPassesLoading(true);
      
      // Check if input is email or UUID
      let userId = newPassUserId.trim();
      const isEmail = userId.includes('@');
      
      // If email, we need to find the user ID (this would require an API endpoint)
      // For now, assume it's a UUID
      if (isEmail) {
        Alert.alert('Info', 'Email lookup requires API endpoint. Please use user UUID for now.');
        return;
      }

      const { data, error } = await supabase
        .rpc('create_default_pass', {
          p_user_id: userId,
          p_pass_type: newPassType
        });

      if (error) throw error;

      Alert.alert('Success', `Pass created successfully! Pass ID: ${data}`);
      setShowCreatePassModal(false);
      setNewPassUserId('');
      setNewPassType('general');
      await loadPasses();
    } catch (error: any) {
      console.error('Error creating pass:', error);
      Alert.alert('Error', 'Failed to create pass: ' + error.message);
    } finally {
      setPassesLoading(false);
    }
  };

  const handleUpdatePassStatus = async (passId: string, newStatus: PassStatus) => {
    try {
      const { error } = await supabase
        .from('passes')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', passId);

      if (error) throw error;

      Alert.alert('Success', 'Pass status updated');
      await loadPasses();
    } catch (error: any) {
      console.error('Error updating pass:', error);
      Alert.alert('Error', 'Failed to update pass: ' + error.message);
    }
  };

  const handleQRScanSuccess = (result: QRScanResult) => {
    // Don't close scanner - keep it open to show details
    // The scanner component will handle showing the details
    console.log('QR Scan Success:', result);
  };

  const handleCreateMatch = async () => {
    if (!selectedRequest || !selectedSlot) {
      Alert.alert('Error', 'Please select a request and time slot');
      return;
    }

    try {
      setMeetingsLoading(true);
      
      // meeting_requests.speaker_id is UUID (user_id), not bsl_speakers.id
      // We need to find the bsl_speakers.id from the user_id
      const { data: speakerData, error: speakerError } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', selectedRequest.speaker_id)
        .single();

      if (speakerError || !speakerData) {
        // Try alternative: maybe speaker_id is already bsl_speakers.id
        const speaker = speakers.find(s => s.id === selectedRequest.speaker_id || s.user_id === selectedRequest.speaker_id);
        if (!speaker || !speaker.id) {
          throw new Error('Speaker not found. Please ensure the speaker has a bsl_speakers record.');
        }
        
        const { data, error } = await supabase
          .rpc('accept_meeting_request', {
            p_request_id: selectedRequest.id,
            p_speaker_id: speaker.id,
            p_slot_start_time: selectedSlot,
            p_speaker_response: 'Meeting scheduled by admin'
          });

        if (error) throw error;

        if (data && typeof data === 'object' && 'success' in data && !data.success) {
          throw new Error(data.error || 'Failed to create match');
        }

        Alert.alert('Success', 'Meeting match created successfully!');
        setShowMatchModal(false);
        setSelectedRequest(null);
        setSelectedSlot('');
        await loadMeetingRequests();
        return;
      }

      // Use the found speaker ID
      const { data, error } = await supabase
        .rpc('accept_meeting_request', {
          p_request_id: selectedRequest.id,
          p_speaker_id: speakerData.id,
          p_slot_start_time: selectedSlot,
          p_speaker_response: 'Meeting scheduled by admin'
        });

      if (error) throw error;

      if (data && typeof data === 'object' && 'success' in data && !data.success) {
        throw new Error(data.error || 'Failed to create match');
      }

      Alert.alert('Success', 'Meeting match created successfully!');
      setShowMatchModal(false);
      setSelectedRequest(null);
      setSelectedSlot('');
      await loadMeetingRequests();
    } catch (error: any) {
      console.error('Error creating match:', error);
      Alert.alert('Error', 'Failed to create match: ' + error.message);
    } finally {
      setMeetingsLoading(false);
    }
  };

  const getAvailableSlots = async (speakerId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_speaker_available_slots', {
          p_speaker_id: speakerId,
          p_duration_minutes: 15
        });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error loading slots:', error);
      return [];
    }
  };

  const filteredPasses = passes.filter(pass => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      pass.pass_number?.toLowerCase().includes(query) ||
      pass.user_id.toLowerCase().includes(query) ||
      pass.pass_type.toLowerCase().includes(query)
    );
  });

  const filteredRequests = meetingRequests.filter(req => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      req.requester_name?.toLowerCase().includes(query) ||
      req.speaker_name?.toLowerCase().includes(query) ||
      req.status.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return <LoadingScreen icon="admin-panel-settings" message="Checking admin access..." />;
  }

  if (!isUserAdmin) {
    return null; // Will redirect
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <Text style={styles.headerSubtitle}>Role: {adminRole || 'Admin'}</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'passes' && styles.tabActive]}
          onPress={() => setActiveTab('passes')}
        >
          <MaterialIcons name="card-membership" size={20} color={activeTab === 'passes' ? '#007AFF' : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'passes' && styles.tabTextActive]}>Passes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'qr-scanner' && styles.tabActive]}
          onPress={() => setActiveTab('qr-scanner')}
        >
          <MaterialIcons name="qr-code-scanner" size={20} color={activeTab === 'qr-scanner' ? '#007AFF' : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'qr-scanner' && styles.tabTextActive]}>QR Scanner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'meetings' && styles.tabActive]}
          onPress={() => setActiveTab('meetings')}
        >
          <MaterialIcons name="people" size={20} color={activeTab === 'meetings' ? '#007AFF' : colors.text.secondary} />
          <Text style={[styles.tabText, activeTab === 'meetings' && styles.tabTextActive]}>Meetings</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'passes' && (
          <PassManagementTab
            styles={styles}
            colors={colors}
            passes={filteredPasses}
            users={users}
            loading={passesLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onCreatePass={() => setShowCreatePassModal(true)}
            onUpdateStatus={handleUpdatePassStatus}
            onRefresh={loadPasses}
          />
        )}

        {activeTab === 'qr-scanner' && (
          <QRScannerTab
            styles={styles}
            colors={colors}
            onScanPress={() => setShowQRScanner(true)}
          />
        )}

        {activeTab === 'meetings' && (
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
          />
        )}
      </ScrollView>

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
            
            <Text style={styles.modalLabel}>User ID (UUID)</Text>
            <TextInput
              style={styles.modalInput}
              value={newPassUserId}
              onChangeText={setNewPassUserId}
              placeholder="Enter user UUID from auth.users"
              placeholderTextColor={colors.text.secondary}
              autoCapitalize="none"
            />
            <Text style={[styles.modalLabel, { fontSize: 12, marginTop: 4 }]}>
              Note: User must exist in auth.users. Use UUID format.
            </Text>

            <Text style={styles.modalLabel}>Pass Type</Text>
            <View style={styles.passTypeButtons}>
              {(['general', 'business', 'vip'] as PassType[]).map(type => (
                <TouchableOpacity
                  key={type}
                  style={[styles.passTypeButton, newPassType === type && styles.passTypeButtonActive]}
                  onPress={() => setNewPassType(type)}
                >
                  <Text style={[styles.passTypeButtonText, newPassType === type && styles.passTypeButtonTextActive]}>
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
                  <Text style={[styles.modalButtonText, styles.modalButtonTextConfirm]}>Create</Text>
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
            setSelectedSlot('');
          }}
          loading={meetingsLoading}
          onLoadSlots={getAvailableSlots}
        />
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
  users,
  loading,
  searchQuery,
  onSearchChange,
  onCreatePass,
  onUpdateStatus,
  onRefresh
}: any) {
  return (
    <View style={styles.tabContent}>
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

      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {passes.map((pass: Pass) => (
            <View key={pass.id} style={styles.passCard}>
              <View style={styles.passCardHeader}>
                <Text style={styles.passNumber}>{pass.pass_number}</Text>
                <View style={[styles.statusBadge, styles[`statusBadge${pass.status}`]]}>
                  <Text style={styles.statusBadgeText}>{pass.status}</Text>
                </View>
              </View>
              <Text style={styles.passInfo}>Type: {pass.pass_type.toUpperCase()}</Text>
              <Text style={styles.passInfo}>User: {pass.user_id}</Text>
              <Text style={styles.passInfo}>
                Requests: {pass.used_meeting_requests} / {pass.max_meeting_requests}
              </Text>
              <Text style={styles.passInfo}>
                Boost: {pass.used_boost_amount} / {pass.max_boost_amount}
              </Text>
              <View style={styles.passActions}>
                {pass.status === 'active' && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onUpdateStatus(pass.id, 'suspended')}
                  >
                    <Text style={styles.actionButtonText}>Suspend</Text>
                  </TouchableOpacity>
                )}
                {pass.status === 'suspended' && (
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionButtonSuccess]}
                    onPress={() => onUpdateStatus(pass.id, 'active')}
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
  onRefresh
}: any) {
  return (
    <View style={styles.tabContent}>
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
                  <Text style={styles.requestTitle}>{request.requester_name}</Text>
                  <Text style={styles.requestSubtitle}>→ {request.speaker_name}</Text>
                </View>
                <View style={[styles.statusBadge, styles[`statusBadge${request.status}`]]}>
                  <Text style={styles.statusBadgeText}>{request.status}</Text>
                </View>
              </View>
              <Text style={styles.requestInfo}>Created: {new Date(request.created_at).toLocaleDateString()}</Text>
              {request.status === 'pending' && (
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
  onLoadSlots
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
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', request.speaker_id)
        .single();

      if (speakerData) {
        const availableSlots = await onLoadSlots(speakerData.id);
        setSlots(availableSlots);
      } else {
        // Fallback: try finding by id
        const speaker = speakers.find((s: Speaker) => s.id === request.speaker_id || s.user_id === request.speaker_id);
        if (speaker && speaker.id) {
          const availableSlots = await onLoadSlots(speaker.id);
          setSlots(availableSlots);
        }
      }
    } catch (error) {
      console.error('Error loading slots:', error);
    }
    
    setLoadingSlots(false);
  };

  if (!request) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Create Meeting Match</Text>
        
        <Text style={styles.modalLabel}>Requester: {request.requester_name}</Text>
        <Text style={styles.modalLabel}>Speaker: {request.speaker_name}</Text>

        <Text style={styles.modalLabel}>Select Time Slot</Text>
        {loadingSlots ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <ScrollView style={styles.slotsList} nestedScrollEnabled>
            {slots.map((slot: any, index: number) => (
              <TouchableOpacity
                key={index}
                style={[styles.slotOption, selectedSlot === slot.slot_time && styles.slotOptionActive]}
                onPress={() => onSlotChange(slot.slot_time)}
              >
                <Text style={[styles.slotOptionText, selectedSlot === slot.slot_time && styles.slotOptionTextActive]}>
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
              <Text style={[styles.modalButtonText, styles.modalButtonTextConfirm]}>Create Match</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
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
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  passNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeactive: {
    backgroundColor: '#34A853',
  },
  statusBadgesuspended: {
    backgroundColor: '#FF9500',
  },
  statusBadgeexpired: {
    backgroundColor: '#8E8E93',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  passInfo: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 4,
  },
  passActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FF3B30',
    borderRadius: 8,
  },
  actionButtonSuccess: {
    backgroundColor: '#34A853',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  qrScannerCard: {
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 32,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  qrScannerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  qrScannerDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requestTitle: {
    fontSize: 16,
    fontWeight: '600',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  matchButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
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
    flexDirection: 'row',
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
    alignItems: 'center',
  },
  passTypeButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  passTypeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  passTypeButtonTextActive: {
    color: '#fff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.background.default,
  },
  modalButtonConfirm: {
    backgroundColor: '#007AFF',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  modalButtonTextConfirm: {
    color: '#fff',
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
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  slotOptionText: {
    fontSize: 14,
    color: colors.text.primary,
  },
  slotOptionTextActive: {
    color: '#fff',
  },
  emptyText: {
    textAlign: 'center',
    color: colors.text.secondary,
    fontSize: 14,
    marginTop: 32,
  },
  loader: {
    marginTop: 32,
  },
});


