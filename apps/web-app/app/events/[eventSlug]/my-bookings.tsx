import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemeContextType } from '@/types/theme';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { apiClient } from '@/lib/api-client';

interface Booking {
  id: string;
  slot_id: string;
  host_id: string;
  host_name?: string;
  attendee_id: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  start_time: string;
  end_time: string;
  location: string;
  created_at: string;
  updated_at: string;
  slot?: {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
  };
  host?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    company?: string;
  };
  attendee?: {
    id: string;
    full_name: string;
    avatar_url?: string;
    company?: string;
  };
}

export default function MyBookings() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadBookings = async (isRefreshing = false) => {
    if (!user) return;
    
    try {
      if (!isRefreshing) setLoading(true);
      
      // Fetch bookings where user is either host or attendee
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          slot:meeting_slots(*),
          host:profiles!meetings_host_id_fkey(id, full_name, avatar_url, company),
          attendee:profiles!meetings_attendee_id_fkey(id, full_name, avatar_url, company)
        `)
        .or(`host_id.eq.${user.id},attendee_id.eq.${user.id}`)
        .order('start_time', { ascending: true });

      if (error) throw error;
      
      setBookings(data || []);
    } catch (error) {
      console.error('Error loading bookings:', error);
      Alert.alert('Error', 'No se pudieron cargar las reservas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { 
    loadBookings(); 
  }, [user]);

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const result = await apiClient.delete(`/bslatam/bookings/${bookingId}`);
      
      if (!result.success) {
        throw new Error(result.error || 'Error al cancelar la reserva');
      }
      
      // Refresh the bookings list
      await loadBookings();
      Alert.alert('Éxito', 'Reserva cancelada correctamente');
    } catch (error: unknown) {
      console.error('Error cancelling booking:', error);
      const errorMessage = error instanceof Error ? error.message : 'No se pudo cancelar la reserva';
      Alert.alert('Error', errorMessage);
    }
  };

  const handleConfirmBooking = async (bookingId: string) => {
    try {
      const result = await apiClient.patch(`/bslatam/bookings/${bookingId}`, {
        status: 'confirmed'
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Error al confirmar la reserva');
      }
      
      await loadBookings();
      Alert.alert('Éxito', 'Reserva confirmada correctamente');
    } catch (error: any) {
      console.error('Error confirming booking:', error);
      Alert.alert('Error', error?.message || 'No se pudo confirmar la reserva');
    }
  };

  const handleStartMeeting = (booking: Booking) => {
    // Navigate to meeting screen or open meeting URL
    Alert.alert(
      'Iniciar Reunión',
      `¿Deseas iniciar la reunión con ${booking.host_id === user?.id ? booking.attendee?.full_name : booking.host?.full_name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Iniciar', 
          onPress: () => {
            // TODO: Implement meeting start logic
            // This could open a video call or navigate to a meeting screen
            console.log('Starting meeting:', booking.id);
          } 
        }
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadBookings(true);
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return colors.success?.main || '#10B981';
      case 'pending':
        return colors.warning?.main || '#F59E0B';
      case 'cancelled':
        return colors.error?.main || '#EF4444';
      case 'completed':
        return colors.primary || '#3B82F6'; // Using primary color for completed status
      default:
        return colors.text?.secondary || '#6B7280';
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background?.default || '#FFFFFF' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background?.default || '#FFFFFF' }]}>
      <Text style={[styles.title, { color: colors.text?.primary || '#111827' }]}>
        Mis Reservas
      </Text>
      
      {bookings.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.text.secondary, textAlign: 'center' }}>
            No tienes reservas programadas.
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.bookingsList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
        >
          {bookings.map((booking) => {
            const otherUser = booking.host_id === user?.id ? booking.attendee : booking.host;
            const isHost = booking.host_id === user?.id;
            
            return (
              <View 
                key={booking.id} 
                style={[
                  styles.bookingCard, 
                  { 
                    backgroundColor: colors.background.paper,
                    borderLeftColor: getStatusColor(booking.status),
                    opacity: booking.status === 'cancelled' ? 0.7 : 1
                  }
                ]}
              >
                <View style={styles.bookingHeader}>
                  <Text style={[styles.bookingTitle, { color: colors.text.primary }]}>
                    {isHost ? 'Reunión con' : 'Reunión conmigo'}
                  </Text>
                  <Text style={[styles.bookingStatus, { color: getStatusColor(booking.status) }]}>
                    {booking.status === 'confirmed' ? 'Confirmada' : 
                     booking.status === 'pending' ? 'Pendiente' : 
                     booking.status === 'cancelled' ? 'Cancelada' : 'Completada'}
                  </Text>
                </View>
                
                <View style={styles.bookingInfo}>
                  <Text style={[styles.bookingText, { color: colors.text.primary }]}>
                    {otherUser?.full_name || 'Usuario'}
                  </Text>
                  {otherUser?.company && (
                    <Text style={[styles.bookingSubtext, { color: colors.text.secondary }]}>
                      {otherUser.company}
                    </Text>
                  )}
                </View>
                
                <View style={styles.bookingTime}>
                  <Text style={[styles.bookingTimeText, { color: colors.text.primary }]}>
                    {formatDateTime(booking.start_time)}
                  </Text>
                  <Text style={[styles.bookingLocation, { color: colors.primary }]}>
                    {booking.location || 'Ubicación no especificada'}
                  </Text>
                </View>
                
                {booking.status === 'pending' && !isHost && (
                  <View style={styles.bookingActions}>
                    <TouchableOpacity 
                      style={[
                        styles.actionButton, 
                        { 
                          backgroundColor: typeof colors.error === 'object' 
                            ? colors.error.light 
                            : colors.error 
                        }
                      ]}
                      onPress={() => handleCancelBooking(booking.id)}
                    >
                      <Text style={[styles.actionButtonText, { 
                        color: colors.error && typeof colors.error === 'object' ? colors.error.main : colors.error 
                      }]}>
                        Rechazar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionButton, { 
                        backgroundColor: colors.success && typeof colors.success === 'object' ? colors.success.light : colors.success 
                      }]}
                      onPress={() => handleConfirmBooking(booking.id)}
                    >
                      <Text style={[styles.actionButtonText, { 
                        color: colors.success && typeof colors.success === 'object' ? colors.success.main : colors.success 
                      }]}>
                        Aceptar
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                
                {booking.status === 'confirmed' && new Date(booking.start_time) > new Date() && (
                  <View style={styles.bookingActions}>
                    <TouchableOpacity 
                      style={[styles.actionButton, { 
                        backgroundColor: colors.error && typeof colors.error === 'object' ? colors.error.light : colors.error 
                      }]}
                      onPress={() => handleCancelBooking(booking.id)}
                    >
                      <Text style={[styles.actionButtonText, { 
                        color: colors.error && typeof colors.error === 'object' ? colors.error.main : colors.error 
                      }]}>
                        Cancelar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.actionButton, styles.primaryAction, { 
                        backgroundColor: colors.primary 
                      }]}
                      onPress={() => handleStartMeeting(booking)}
                    >
                      <Text style={[styles.actionButtonText, { 
                        color: colors.primaryContrastText || '#FFFFFF' 
                      }]}>
                        Iniciar Reunión
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  bookingsList: {
    flex: 1,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bookingTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookingStatus: {
    fontSize: 14,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  bookingInfo: {
    marginBottom: 12,
  },
  bookingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bookingSubtext: {
    fontSize: 14,
    opacity: 0.8,
  },
  bookingTime: {
    marginBottom: 12,
  },
  bookingTimeText: {
    fontSize: 14,
    marginBottom: 4,
  },
  bookingLocation: {
    fontSize: 14,
    fontWeight: '500',
  },
  bookingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  actionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginLeft: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  primaryAction: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});