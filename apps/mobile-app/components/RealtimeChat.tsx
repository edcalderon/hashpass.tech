import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { useRealtimeChat, ChatMessage } from '../hooks/useRealtimeChat';
import { useChatScroll } from '../hooks/useChatScroll';
import { useMessagesQuery } from '../hooks/useMessagesQuery';
import { storeMessages } from '../lib/store-messages';
import SpeakerAvatar from './SpeakerAvatar';
import { supabase } from '../lib/supabase';
import { useNotifications } from '../contexts/NotificationContext';

interface RealtimeChatProps {
  roomName: string;
  username: string;
  meetingId: string;
  messages?: ChatMessage[];
  onMessage?: (messages: ChatMessage[]) => void;
  otherParticipantId?: string; // User ID of the other participant
  otherParticipantName?: string; // Name of the other participant
  otherParticipantAvatar?: string; // Avatar URL of the other participant
}

// Helper function to generate user avatar URL
const generateUserAvatarUrl = (name: string): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

export default function RealtimeChat({ 
  roomName, 
  username, 
  meetingId,
  messages: initialMessages,
  onMessage,
  otherParticipantId,
  otherParticipantName,
  otherParticipantAvatar,
}: RealtimeChatProps) {
  const { isDark, colors } = useTheme();
  const { user } = useAuth();
  const { refreshNotifications } = useNotifications();
  const styles = getStyles(isDark, colors);

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [otherUserAvatar, setOtherUserAvatar] = useState<string | null>(null);
  const [presence, setPresence] = useState<{ [userId: string]: { isOnline: boolean; lastSeen: Date } }>({});

  // Load user avatar
  useEffect(() => {
    const loadUserAvatar = async () => {
      if (!user) return;
      
      // Try to get avatar from user metadata
      const avatarUrl = user.user_metadata?.avatar_url;
      if (avatarUrl) {
        setUserAvatar(avatarUrl);
      } else {
        // Generate avatar from name
        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
        setUserAvatar(generateUserAvatarUrl(name));
      }
    };
    
    loadUserAvatar();
  }, [user]);

  // Load other participant avatar
  // IMPORTANT: Always prioritize otherParticipantAvatar (speaker avatar) if provided
  // This ensures speaker avatars from bsl_speakers are always used
  useEffect(() => {
    const loadOtherAvatar = async () => {
      // Priority 1: Use provided avatar (speaker avatar from bsl_speakers)
      if (otherParticipantAvatar) {
        setOtherUserAvatar(otherParticipantAvatar);
        return; // Don't override with generated avatar
      }
      
      // Priority 2: Generate avatar from name (only if no avatar provided)
      if (otherParticipantName) {
        setOtherUserAvatar(generateUserAvatarUrl(otherParticipantName));
        return;
      }
      
      // Priority 3: Fallback to ID-based avatar
      if (otherParticipantId && user) {
        const fallbackName = otherParticipantId.substring(0, 8);
        setOtherUserAvatar(generateUserAvatarUrl(fallbackName));
      }
    };
    
    loadOtherAvatar();
  }, [otherParticipantAvatar, otherParticipantName, otherParticipantId, user]);

  // Use real-time chat hook with presence tracking
  const { messages: realtimeMessages, sendMessage, isConnected, presence: chatPresence } = useRealtimeChat({
    roomName,
    username,
    userId: user?.id || '',
    otherParticipantId,
  });

  // Update presence state from hook
  useEffect(() => {
    if (chatPresence) {
      setPresence(chatPresence);
    }
  }, [chatPresence]);

  // Use messages query for persistence - only when user is available
  const { data: persistedMessages, loading, error, storeMessages: storeMessagesFn } = useMessagesQuery({
    meetingId,
    userId: user?.id || '', // Will be validated in the hook
  });

  // Use chat scroll hook
  const { containerRef, scrollToBottom } = useChatScroll();

  // Get last seen for other participant
  const [otherParticipantLastSeen, setOtherParticipantLastSeen] = useState<Date | null>(null);
  
  useEffect(() => {
    const fetchLastSeen = async () => {
      if (!otherParticipantId || !meetingId) return;
      
      try {
        const { data, error } = await supabase.rpc('get_chat_last_seen', {
          p_user_id: otherParticipantId,
          p_meeting_id: meetingId,
        });
        
        if (!error && data?.success && data?.last_seen_at) {
          setOtherParticipantLastSeen(new Date(data.last_seen_at));
        }
      } catch (error) {
        console.error('Error fetching last seen:', error);
      }
    };
    
    fetchLastSeen();
    // Refresh last seen every 30 seconds
    const interval = setInterval(fetchLastSeen, 30000);
    return () => clearInterval(interval);
  }, [otherParticipantId, meetingId]);

  // Combine initial messages, persisted messages, and real-time messages
  // Remove duplicates by message ID
  const allMessages = [
    ...(initialMessages || []),
    ...(persistedMessages || []),
    ...realtimeMessages,
  ]
    .filter((msg, index, self) => 
      index === self.findIndex((m) => m.id === msg.id)
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [allMessages.length, scrollToBottom]);

  // Update last seen when user views chat or scrolls
  useEffect(() => {
    const updateLastSeen = async () => {
      if (!user?.id || !meetingId) return;
      
      try {
        const { error } = await supabase.rpc('update_chat_last_seen', {
          p_user_id: user.id,
          p_meeting_id: meetingId,
        });
        
        if (error) {
          console.error('Error updating chat last seen:', error);
        }
      } catch (error) {
        console.error('Error updating chat last seen:', error);
      }
    };

    // Update when component mounts
    updateLastSeen();
    
    // Update when new messages arrive (user is viewing)
    if (allMessages.length > 0) {
      updateLastSeen();
    }
    
    // Update periodically while chat is open (every 30 seconds)
    const interval = setInterval(updateLastSeen, 30000);
    
    return () => clearInterval(interval);
  }, [user?.id, meetingId, allMessages.length]);

  // Listen for new incoming messages and refresh notifications
  useEffect(() => {
    const incomingMessages = allMessages.filter(msg => {
      const messageUserId = msg.user.id;
      const currentUserId = user?.id;
      const currentUserEmail = user?.email;
      const currentUsername = username;
      
      return !(
        messageUserId === currentUserId || 
        messageUserId === currentUserEmail || 
        messageUserId === currentUsername ||
        (currentUserId && messageUserId.includes(currentUserId)) ||
        (currentUserEmail && messageUserId.includes(currentUserEmail))
      );
    });
    
    // If there are new incoming messages, refresh notifications
    if (incomingMessages.length > 0) {
      refreshNotifications();
    }
  }, [allMessages.length, user?.id, username, refreshNotifications]);

  // Handle message sending
  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      // Send via real-time chat
      await sendMessage(newMessage.trim(), 'text');
      
      // Store in database
      if (onMessage) {
        const newChatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          content: newMessage.trim(),
          user: {
            name: username,
            id: user?.id || username,
          },
          createdAt: new Date().toISOString(),
          messageType: 'text',
        };
        
        onMessage([...allMessages, newChatMessage]);
      }

      // Also store via the query hook
      if (storeMessagesFn) {
        const newChatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          content: newMessage.trim(),
          user: {
            name: username,
            id: user?.id || username,
          },
          createdAt: new Date().toISOString(),
          messageType: 'text',
        };
        
        await storeMessages([newChatMessage], meetingId, user?.id || '');
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message: ChatMessage, index: number) => {
    // More robust check for own message - check all possible ID formats
    const messageUserId = message.user.id;
    const currentUserId = user?.id;
    const currentUserEmail = user?.email;
    const currentUsername = username;
    
    const isOwnMessage = 
      messageUserId === currentUserId || 
      messageUserId === currentUserEmail || 
      messageUserId === currentUsername ||
      (currentUserId && messageUserId.includes(currentUserId)) ||
      (currentUserEmail && messageUserId.includes(currentUserEmail));
    
    const isSystemMessage = message.messageType === 'system';
    const isMeetingUpdate = message.messageType === 'meeting_update';
    
    // For own messages: use userAvatar (generated from user metadata or name)
    // For incoming messages: ALWAYS use otherParticipantAvatar if provided (speaker avatar from bsl_speakers)
    // This ensures speaker avatars are correctly displayed for incoming messages
    const messageAvatar = isOwnMessage 
      ? userAvatar 
      : (otherParticipantAvatar || otherUserAvatar); // Prioritize otherParticipantAvatar (speaker avatar)
    
    const messageName = isOwnMessage 
      ? (user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'You')
      : (otherParticipantName || message.user.name || 'User');

    // Different colors for different message types
    const getMessageBubbleStyle = () => {
      if (isSystemMessage) return styles.systemMessageBubble;
      if (isMeetingUpdate) return styles.meetingUpdateBubble;
      if (isOwnMessage) return styles.ownMessageBubble;
      return styles.incomingMessageBubble;
    };

    return (
      <View
        key={message.id}
        style={[
          styles.messageWrapper,
          isOwnMessage && styles.ownMessageWrapper,
          !isOwnMessage && !isSystemMessage && styles.incomingMessageWrapper,
        ]}
      >
        {!isSystemMessage && (
          <View style={[
            styles.messageContainer,
            isOwnMessage && styles.ownMessageContainer,
            !isOwnMessage && styles.incomingMessageContainer,
          ]}>
            {/* Avatar for incoming messages (left side) */}
            {!isOwnMessage && (
              <View style={styles.avatarContainer}>
                <SpeakerAvatar
                  name={messageName}
                  imageUrl={messageAvatar || undefined}
                  size={40}
                  showBorder={true}
                />
              </View>
            )}
            
            {/* Message content */}
            <View style={[
              styles.messageContent,
              isOwnMessage && styles.ownMessageContent,
              !isOwnMessage && styles.incomingMessageContent,
            ]}>
              {!isOwnMessage && (
                <Text style={styles.senderName}>
                  {messageName}
                </Text>
              )}
              <View style={[
                styles.messageBubble,
                getMessageBubbleStyle(),
              ]}>
                <Text style={[
                  styles.messageText,
                  isOwnMessage && styles.ownMessageText,
                  !isOwnMessage && styles.incomingMessageText,
                ]}>
                  {message.content}
                </Text>
              </View>
              <Text style={[
                styles.messageTime,
                isOwnMessage && styles.ownMessageTime,
                !isOwnMessage && styles.incomingMessageTime,
              ]}>
                {formatTime(message.createdAt)}
              </Text>
            </View>
            
            {/* Avatar for own messages (right side) */}
            {isOwnMessage && (
              <View style={styles.avatarContainer}>
                <SpeakerAvatar
                  name={messageName}
                  imageUrl={messageAvatar || undefined}
                  size={40}
                  showBorder={true}
                />
              </View>
            )}
          </View>
        )}
        {isSystemMessage && (
          <View style={styles.systemMessageContainer}>
            <Text style={styles.systemMessageText}>
              {message.content}
            </Text>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={48} color="#F44336" />
        <Text style={styles.errorTitle}>Failed to Load Chat</Text>
        <Text style={styles.errorMessage}>{error}</Text>
      </View>
    );
  }

  // Format last seen status
  const formatLastSeen = (lastSeen: Date | null) => {
    if (!lastSeen) return null;
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Active now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Active ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Active ${diffDays}d ago`;
  };

  const lastSeenText = formatLastSeen(otherParticipantLastSeen);
  const isOtherParticipantOnline = otherParticipantLastSeen && 
    (new Date().getTime() - otherParticipantLastSeen.getTime()) < 60000; // Within last minute

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header with participant info and last seen - Avatar always visible for speaker */}
      {(otherParticipantName || otherParticipantAvatar) && (
        <View style={styles.chatHeader}>
          <View style={styles.headerInfo}>
            <View style={styles.headerAvatarContainer}>
              <SpeakerAvatar
                name={otherParticipantName || 'User'}
                imageUrl={otherParticipantAvatar || undefined}
                size={40}
                showBorder={true}
              />
              {isOtherParticipantOnline && (
                <View style={styles.onlineIndicator} />
              )}
            </View>
            <View style={styles.headerTextContainer}>
              {otherParticipantName && (
                <Text style={styles.headerName}>{otherParticipantName}</Text>
              )}
              {lastSeenText && (
                <Text style={styles.headerLastSeen}>{lastSeenText}</Text>
              )}
            </View>
          </View>
        </View>
      )}
      
      {/* Connection Status and Presence */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusIndicator, { backgroundColor: isConnected ? '#4CAF50' : '#F44336' }]} />
          <Text style={styles.statusText}>
            {isConnected ? 'Connected' : 'Connecting...'}
          </Text>
        </View>
        {otherParticipantId && presence[otherParticipantId] && (
          <View style={styles.presenceContainer}>
            <View style={[
              styles.presenceIndicator,
              { backgroundColor: presence[otherParticipantId].isOnline ? '#4CAF50' : '#9E9E9E' }
            ]} />
            <Text style={styles.presenceText}>
              {presence[otherParticipantId].isOnline 
                ? `${otherParticipantName || 'User'} is online`
                : `${otherParticipantName || 'User'} is offline`
              }
            </Text>
          </View>
        )}
      </View>

      {/* Messages */}
      <ScrollView
        ref={containerRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {allMessages.map((message, index) => renderMessage(message, index))}
      </ScrollView>

      {/* Message Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={newMessage}
          onChangeText={setNewMessage}
          placeholder="Type your message..."
          placeholderTextColor={colors.text.secondary}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={!newMessage.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <MaterialIcons name="send" size={20} color="white" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  chatHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2a2a2a' : '#e9ecef',
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34A853',
    borderWidth: 2,
    borderColor: isDark ? '#1a1a1a' : '#ffffff',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 2,
  },
  headerName: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginBottom: 2,
  },
  headerLastSeen: {
    fontSize: 11,
    color: colors.text?.secondary || (isDark ? '#a0a0a0' : '#666666'),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    textAlign: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#f5f5f5'),
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#333333' : '#e0e0e0',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  presenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presenceIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  presenceText: {
    fontSize: 11,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  messageWrapper: {
    marginBottom: 12,
    width: '100%',
  },
  ownMessageWrapper: {
    alignItems: 'flex-end',
    paddingLeft: 50, // Space for avatar on left
  },
  incomingMessageWrapper: {
    alignItems: 'flex-start',
    paddingRight: 50, // Space for avatar on right
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '80%',
    gap: 8,
  },
  ownMessageContainer: {
    flexDirection: 'row-reverse',
    alignSelf: 'flex-end',
    justifyContent: 'flex-end',
  },
  incomingMessageContainer: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'flex-end',
    marginBottom: 4,
  },
  messageContent: {
    flex: 1,
    minWidth: 0, // Allow flex shrinking
  },
  ownMessageContent: {
    alignItems: 'flex-end',
  },
  incomingMessageContent: {
    alignItems: 'flex-start',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text?.secondary || (isDark ? '#a0a0a0' : '#666666'),
    marginBottom: 4,
    marginLeft: 8,
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  ownMessageBubble: {
    backgroundColor: colors.primary || '#007AFF',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderTopLeftRadius: 18,
  },
  incomingMessageBubble: {
    backgroundColor: isDark ? '#2a2a2a' : '#f1f3f5',
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
    borderTopRightRadius: 18,
  },
  systemMessageBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  meetingUpdateBubble: {
    backgroundColor: isDark ? '#1a3a52' : '#e3f2fd',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  ownMessageText: {
    color: '#ffffff',
    fontWeight: '400',
  },
  incomingMessageText: {
    color: colors.text?.primary || (isDark ? '#ffffff' : '#1a1a1a'),
  },
  messageTime: {
    fontSize: 10,
    color: colors.text?.secondary || (isDark ? '#888888' : '#999999'),
    marginTop: 4,
    fontWeight: '400',
  },
  ownMessageTime: {
    textAlign: 'right',
    marginRight: 8,
  },
  incomingMessageTime: {
    textAlign: 'left',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.secondary || (isDark ? '#888888' : '#999999'),
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#666666' : '#999999'),
    marginTop: 8,
  },
  systemMessageContainer: {
    alignSelf: 'center',
    maxWidth: '90%',
    marginVertical: 8,
  },
  systemMessageText: {
    backgroundColor: 'transparent',
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 8,
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#333333' : '#f0f0f0',
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    fontSize: 16,
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary || '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: isDark ? '#333333' : '#e0e0e0',
  },
});
