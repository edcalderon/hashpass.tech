export interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
  social?: {
    linkedin?: string;
    twitter?: string;
  };
}

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  speakers?: string[];
  type: 'keynote' | 'panel' | 'break' | 'meal' | 'registration';
  location?: string;
}

export interface QuickAccessItem {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  route: string;
}

export interface EventConfig {
  id: string;
  name: string;
  domain: string;
  features: string[];
  // UI display fields
  title: string;
  subtitle: string;
  image: string;
  color: string;
  // Event dates for countdown and display
  eventStartDate?: string; // ISO date string for countdown
  eventEndDate?: string; // ISO date string for event end
  eventDateString?: string; // Formatted date string for display
  branding: {
    primaryColor: string;
    secondaryColor?: string;
    logo: string;
    favicon?: string;
  };
  api: {
    basePath: string;
    endpoints: Record<string, string>;
  };
  routes: {
    home: string;
    speakers: string;
    bookings: string;
    admin?: string;
  };
  database?: {
    schema: string;
    tables: Record<string, string>;
  };
  speakers?: Speaker[];
  agenda?: AgendaItem[];
  quickAccessItems?: QuickAccessItem[];
  eventType?: 'hashpass' | 'whitelabel';
  website?: string; // Event website URL for footer links
}

