import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const TUTORIAL_STORAGE_KEYS = {
  MAIN_TUTORIAL_COMPLETED: '@tutorial_main_completed',
  NETWORKING_TUTORIAL_COMPLETED: '@tutorial_networking_completed',
} as const;

export type TutorialType = 'main' | 'networking';
export type TutorialStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';

export interface TutorialProgress {
  status: TutorialStatus;
  current_step: number;
  total_steps_completed: number;
  started_at: string | null;
  completed_at: string | null;
  skipped_at: string | null;
}

export interface TutorialPreferences {
  mainTutorialCompleted: boolean;
  networkingTutorialCompleted: boolean;
  mainTutorialProgress: TutorialProgress | null;
  networkingTutorialProgress: TutorialProgress | null;
  isReady: boolean;
  markTutorialCompleted: (type: TutorialType) => Promise<void>;
  markTutorialSkipped: (type: TutorialType) => Promise<void>;
  updateTutorialStep: (type: TutorialType, stepNumber: number) => Promise<void>;
  resetTutorial: (type: TutorialType) => Promise<void>;
  resetAllTutorials: () => Promise<void>;
  shouldShowTutorial: (type: TutorialType) => boolean;
  reloadPreferences: () => Promise<void>;
}

export const useTutorialPreferences = (): TutorialPreferences => {
  const { user, isLoggedIn } = useAuth();
  const [mainTutorialCompleted, setMainTutorialCompleted] = useState(false);
  const [networkingTutorialCompleted, setNetworkingTutorialCompleted] = useState(false);
  const [mainTutorialProgress, setMainTutorialProgress] = useState<TutorialProgress | null>(null);
  const [networkingTutorialProgress, setNetworkingTutorialProgress] = useState<TutorialProgress | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Load tutorial preferences from database and fallback to AsyncStorage
  const loadPreferences = useCallback(async () => {
    try {
      if (isLoggedIn && user?.id) {
        // Load from database
        const { data: progressData, error } = await supabase
          .from('user_tutorial_progress')
          .select('*')
          .eq('user_id', user.id);

        if (!error && progressData) {
          const mainProgress = progressData.find(p => p.tutorial_type === 'main');
          const networkingProgress = progressData.find(p => p.tutorial_type === 'networking');

          if (mainProgress) {
            const isCompleted = mainProgress.status === 'completed';
            setMainTutorialCompleted(isCompleted);
            setMainTutorialProgress({
              status: mainProgress.status as TutorialStatus,
              current_step: mainProgress.current_step || 0,
              total_steps_completed: mainProgress.total_steps_completed || 0,
              started_at: mainProgress.started_at,
              completed_at: mainProgress.completed_at,
              skipped_at: mainProgress.skipped_at,
            });
            console.log('Loaded main tutorial progress:', { status: mainProgress.status, isCompleted });
          } else {
            // New user - no progress record exists
            console.log('No main tutorial progress found - new user');
            setMainTutorialCompleted(false);
            setMainTutorialProgress(null);
          }

          if (networkingProgress) {
            const isCompleted = networkingProgress.status === 'completed';
            setNetworkingTutorialCompleted(isCompleted);
            setNetworkingTutorialProgress({
              status: networkingProgress.status as TutorialStatus,
              current_step: networkingProgress.current_step || 0,
              total_steps_completed: networkingProgress.total_steps_completed || 0,
              started_at: networkingProgress.started_at,
              completed_at: networkingProgress.completed_at,
              skipped_at: networkingProgress.skipped_at,
            });
            console.log('Loaded networking tutorial progress:', { status: networkingProgress.status, isCompleted });
          } else {
            // New user - no progress record exists
            console.log('No networking tutorial progress found - new user');
            setNetworkingTutorialCompleted(false);
            setNetworkingTutorialProgress(null);
          }
        } else if (error) {
          console.error('Error loading tutorial progress:', error);
        } else {
          // No data returned - new user
          console.log('No tutorial progress data returned - new user');
          setMainTutorialCompleted(false);
          setNetworkingTutorialCompleted(false);
          setMainTutorialProgress(null);
          setNetworkingTutorialProgress(null);
        }
      } else {
        // Fallback to AsyncStorage for non-logged-in users
        const [mainCompleted, networkingCompleted] = await Promise.all([
          AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.MAIN_TUTORIAL_COMPLETED),
          AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.NETWORKING_TUTORIAL_COMPLETED),
        ]);

        setMainTutorialCompleted(mainCompleted === 'true');
        setNetworkingTutorialCompleted(networkingCompleted === 'true');
      }
    } catch (error) {
      console.error('Failed to load tutorial preferences:', error);
      // Fallback to AsyncStorage on error
      try {
        const [mainCompleted, networkingCompleted] = await Promise.all([
          AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.MAIN_TUTORIAL_COMPLETED),
          AsyncStorage.getItem(TUTORIAL_STORAGE_KEYS.NETWORKING_TUTORIAL_COMPLETED),
        ]);
        setMainTutorialCompleted(mainCompleted === 'true');
        setNetworkingTutorialCompleted(networkingCompleted === 'true');
      } catch (fallbackError) {
        console.error('Failed to load from AsyncStorage:', fallbackError);
      }
    } finally {
      setIsReady(true);
    }
  }, [user?.id, isLoggedIn]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Update tutorial step progress
  const updateTutorialStep = useCallback(async (type: TutorialType, stepNumber: number) => {
    if (!user?.id) return;

    try {
      const { data: existing } = await supabase
        .from('user_tutorial_progress')
        .select('id, total_steps_completed')
        .eq('user_id', user.id)
        .eq('tutorial_type', type)
        .maybeSingle();

      const totalStepsCompleted = Math.max(stepNumber, existing?.total_steps_completed || 0);

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('user_tutorial_progress')
          .update({
            status: 'in_progress',
            current_step: stepNumber,
            total_steps_completed: totalStepsCompleted,
            last_step_at: new Date().toISOString(),
            started_at: existing.started_at || new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (!error) {
          if (type === 'main') {
            setMainTutorialProgress(prev => ({
              ...prev!,
              status: 'in_progress',
              current_step: stepNumber,
              total_steps_completed: totalStepsCompleted,
            }));
          } else {
            setNetworkingTutorialProgress(prev => ({
              ...prev!,
              status: 'in_progress',
              current_step: stepNumber,
              total_steps_completed: totalStepsCompleted,
            }));
          }
        }
      } else {
        // Insert new record using upsert to handle race conditions
        const { error } = await supabase
          .from('user_tutorial_progress')
          .upsert({
            user_id: user.id,
            tutorial_type: type,
            status: 'in_progress',
            current_step: stepNumber,
            total_steps_completed: totalStepsCompleted,
            started_at: new Date().toISOString(),
            last_step_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,tutorial_type'
          });

        if (!error) {
          if (type === 'main') {
            setMainTutorialProgress({
              status: 'in_progress',
              current_step: stepNumber,
              total_steps_completed: totalStepsCompleted,
              started_at: new Date().toISOString(),
              completed_at: null,
              skipped_at: null,
            });
          } else {
            setNetworkingTutorialProgress({
              status: 'in_progress',
              current_step: stepNumber,
              total_steps_completed: totalStepsCompleted,
              started_at: new Date().toISOString(),
              completed_at: null,
              skipped_at: null,
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to update tutorial step:', error);
    }
  }, [user?.id]);

  const markTutorialCompleted = useCallback(async (type: TutorialType) => {
    try {
      if (user?.id) {
        // Update database
        const { data: existing } = await supabase
          .from('user_tutorial_progress')
          .select('id')
          .eq('user_id', user.id)
          .eq('tutorial_type', type)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_tutorial_progress')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          // Use upsert to handle race conditions
          await supabase
            .from('user_tutorial_progress')
            .upsert({
              user_id: user.id,
              tutorial_type: type,
              status: 'completed',
              completed_at: new Date().toISOString(),
              started_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,tutorial_type'
            });
        }
      }

      // Also update AsyncStorage as fallback
      const key = type === 'main' 
        ? TUTORIAL_STORAGE_KEYS.MAIN_TUTORIAL_COMPLETED
        : TUTORIAL_STORAGE_KEYS.NETWORKING_TUTORIAL_COMPLETED;
      
      await AsyncStorage.setItem(key, 'true');
      
      if (type === 'main') {
        setMainTutorialCompleted(true);
        setMainTutorialProgress(prev => prev ? { ...prev, status: 'completed', completed_at: new Date().toISOString() } : null);
      } else {
        setNetworkingTutorialCompleted(true);
        setNetworkingTutorialProgress(prev => prev ? { ...prev, status: 'completed', completed_at: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error('Failed to save tutorial completion:', error);
    }
  }, [user?.id]);

  const markTutorialSkipped = useCallback(async (type: TutorialType) => {
    try {
      if (user?.id) {
        const { data: existing } = await supabase
          .from('user_tutorial_progress')
          .select('id')
          .eq('user_id', user.id)
          .eq('tutorial_type', type)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('user_tutorial_progress')
            .update({
              status: 'skipped',
              skipped_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          // Use upsert to handle race conditions
          await supabase
            .from('user_tutorial_progress')
            .upsert({
              user_id: user.id,
              tutorial_type: type,
              status: 'skipped',
              skipped_at: new Date().toISOString(),
            }, {
              onConflict: 'user_id,tutorial_type'
            });
        }
      }

      if (type === 'main') {
        setMainTutorialProgress(prev => prev ? { ...prev, status: 'skipped', skipped_at: new Date().toISOString() } : null);
      } else {
        setNetworkingTutorialProgress(prev => prev ? { ...prev, status: 'skipped', skipped_at: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error('Failed to mark tutorial as skipped:', error);
    }
  }, [user?.id]);

  const resetTutorial = useCallback(async (type: TutorialType) => {
    try {
      if (user?.id) {
        // Delete from database
        await supabase
          .from('user_tutorial_progress')
          .delete()
          .eq('user_id', user.id)
          .eq('tutorial_type', type);
      }

      // Also remove from AsyncStorage
      const key = type === 'main' 
        ? TUTORIAL_STORAGE_KEYS.MAIN_TUTORIAL_COMPLETED
        : TUTORIAL_STORAGE_KEYS.NETWORKING_TUTORIAL_COMPLETED;
      
      await AsyncStorage.removeItem(key);
      
      // Update state immediately
      if (type === 'main') {
        setMainTutorialCompleted(false);
        setMainTutorialProgress(null);
      } else {
        setNetworkingTutorialCompleted(false);
        setNetworkingTutorialProgress(null);
      }
      
      // Reload preferences to ensure consistency
      console.log('Tutorial reset - reloading preferences');
      await loadPreferences();
    } catch (error) {
      console.error('Failed to reset tutorial:', error);
    }
  }, [user?.id, loadPreferences]);

  const resetAllTutorials = useCallback(async () => {
    try {
      if (user?.id) {
        await supabase
          .from('user_tutorial_progress')
          .delete()
          .eq('user_id', user.id);
      }

      await Promise.all([
        AsyncStorage.removeItem(TUTORIAL_STORAGE_KEYS.MAIN_TUTORIAL_COMPLETED),
        AsyncStorage.removeItem(TUTORIAL_STORAGE_KEYS.NETWORKING_TUTORIAL_COMPLETED),
      ]);
      
      // Update state immediately
      setMainTutorialCompleted(false);
      setNetworkingTutorialCompleted(false);
      setMainTutorialProgress(null);
      setNetworkingTutorialProgress(null);
      
      // Reload preferences to ensure consistency
      console.log('All tutorials reset - reloading preferences');
      await loadPreferences();
    } catch (error) {
      console.error('Failed to reset all tutorials:', error);
    }
  }, [user?.id, loadPreferences]);

  const reloadPreferences = useCallback(async () => {
    setIsReady(false);
    await loadPreferences();
  }, [loadPreferences]);

  const shouldShowTutorial = useCallback((type: TutorialType): boolean => {
    if (type === 'main') {
      const progress = mainTutorialProgress;
      // Check if tutorial is completed (either in state or in progress record)
      const isCompleted = mainTutorialCompleted || (progress?.status === 'completed');
      
      // Show tutorial if not completed AND:
      // - No progress record exists (new user), OR
      // - Progress exists but status allows showing (not_started, skipped, in_progress)
      const shouldShow = !isCompleted && (
        progress === null || 
        progress.status === 'not_started' || 
        progress.status === 'skipped' ||
        progress.status === 'in_progress'
      );
      
      console.log('shouldShowTutorial(main):', {
        mainTutorialCompleted,
        progressStatus: progress?.status,
        progressIsNull: progress === null,
        isCompleted,
        shouldShow,
        calculation: {
          step1_notCompleted: !isCompleted,
          step2_noProgress: progress === null,
          step2_notStarted: progress?.status === 'not_started',
          step2_skipped: progress?.status === 'skipped',
          step2_inProgress: progress?.status === 'in_progress',
          step2_anyValid: progress === null || progress.status === 'not_started' || progress.status === 'skipped' || progress.status === 'in_progress',
        }
      });
      return shouldShow;
    } else {
      const progress = networkingTutorialProgress;
      const isCompleted = networkingTutorialCompleted || (progress?.status === 'completed');
      const shouldShow = !isCompleted && (
        progress === null || 
        progress.status === 'not_started' || 
        progress.status === 'skipped' ||
        progress.status === 'in_progress'
      );
      console.log('shouldShowTutorial(networking):', {
        networkingTutorialCompleted,
        progressStatus: progress?.status,
        progressIsNull: progress === null,
        isCompleted,
        shouldShow
      });
      return shouldShow;
    }
  }, [mainTutorialCompleted, networkingTutorialCompleted, mainTutorialProgress, networkingTutorialProgress]);

  return {
    mainTutorialCompleted,
    networkingTutorialCompleted,
    mainTutorialProgress,
    networkingTutorialProgress,
    isReady,
    markTutorialCompleted,
    markTutorialSkipped,
    updateTutorialStep,
    resetTutorial,
    resetAllTutorials,
    shouldShowTutorial,
    reloadPreferences,
  };
};
