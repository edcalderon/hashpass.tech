import { Redirect } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Import git info to check branch
let gitInfo: { gitBranch?: string } = {};
try {
  gitInfo = require('../config/git-info.json');
} catch (e) {
  // Fallback if git-info.json doesn't exist
  gitInfo = {};
}

export default function Index() {
  const { isLoading } = useAuth();
  const { colors } = useTheme();
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // Detect subdomain on web and check git branch
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      
      // Check if we're on lukas.hashpass.tech
      if (hostname === 'lukas.hashpass.tech' || hostname.startsWith('lukas.')) {
        setSubdomain('lukas');
      } else {
        // Extract subdomain from hashpass.tech domains
        const match = hostname.match(/^([a-z0-9-]+)\.hashpass\.tech$/);
        if (match) {
          setSubdomain(match[1]);
        }
      }
      
      setIsChecking(false);
    } else {
      setIsChecking(false);
    }
  }, []);

  // Check git branch
  const gitBranch = gitInfo.gitBranch || process.env.GIT_BRANCH || process.env.AWS_BRANCH || 'main';
  const isLukasBranch = gitBranch === 'lukas';

  if (isLoading || isChecking) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: colors.background.default 
      }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Route to LUKAS landing page if on lukas subdomain OR lukas branch
  if (subdomain === 'lukas' || isLukasBranch) {
    return <Redirect href="/lukas" />;
  }

  return <Redirect href="/home" />;
}
