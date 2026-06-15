/**
 * Branding configurations for HashPass white-label platform
 * Defines visual identity and styling for different events
 */

export interface BrandingConfig {
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    background: {
      default: string;
      paper: string;
      elevated?: string;
    };
    text: {
      primary: string;
      secondary: string;
      disabled?: string;
    };
    status: {
      success: string;
      warning: string;
      error: string;
      info: string;
    };
  };
  typography: {
    fontFamily: {
      primary: string;
      secondary?: string;
      mono?: string;
    };
    fontSize: {
      xs: number;
      sm: number;
      base: number;
      lg: number;
      xl: number;
      '2xl': number;
      '3xl': number;
    };
    fontWeight: {
      normal: string;
      medium: string;
      semibold: string;
      bold: string;
    };
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    '2xl': number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: number;
  };
  shadows: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  assets: {
    logo: {
      light: string;
      dark: string;
      favicon: string;
      icon: string;
    };
    images: {
      hero?: string;
      background?: string;
      placeholder?: string;
    };
  };
  animations: {
    duration: {
      fast: number;
      normal: number;
      slow: number;
    };
    easing: {
      ease: string;
      easeIn: string;
      easeOut: string;
      easeInOut: string;
    };
  };
}

export const BRANDING_PRESETS: Record<string, BrandingConfig> = {
  'hashpass-default': {
    colors: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#06b6d4',
      background: {
        default: '#ffffff',
        paper: '#f8fafc',
        elevated: '#ffffff'
      },
      text: {
        primary: '#1e293b',
        secondary: '#64748b',
        disabled: '#94a3b8'
      },
      status: {
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
        info: '#3b82f6'
      }
    },
    typography: {
      fontFamily: {
        primary: 'Inter, system-ui, sans-serif',
        secondary: 'Inter, system-ui, sans-serif',
        mono: 'JetBrains Mono, monospace'
      },
      fontSize: {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
        '2xl': 24,
        '3xl': 30
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
      }
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      '2xl': 48
    },
    borderRadius: {
      sm: 4,
      md: 8,
      lg: 12,
      xl: 16,
      full: 9999
    },
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
    },
    assets: {
      logo: {
        light: '/assets/logos/hashpass/logo-full-hashpass-white.svg',
        dark: '/assets/logos/hashpass/logo-full-hashpass-black.svg',
        favicon: '/favicon.ico',
        icon: '/assets/images/icon.png'
      },
      images: {
        hero: '/assets/images/hero-bg.jpg',
        background: '/assets/images/bg-pattern.svg',
        placeholder: '/assets/images/placeholder.png'
      }
    },
    animations: {
      duration: {
        fast: 150,
        normal: 300,
        slow: 500
      },
      easing: {
        ease: 'ease',
        easeIn: 'ease-in',
        easeOut: 'ease-out',
        easeInOut: 'ease-in-out'
      }
    }
  },
  'bsl2025': {
    colors: {
      primary: '#007AFF',
      secondary: '#34A853',
      accent: '#FF9500',
      background: {
        default: '#ffffff',
        paper: '#f2f2f7',
        elevated: '#ffffff'
      },
      text: {
        primary: '#000000',
        secondary: '#6d6d70',
        disabled: '#c7c7cc'
      },
      status: {
        success: '#34c759',
        warning: '#ff9500',
        error: '#ff3b30',
        info: '#007aff'
      }
    },
    typography: {
      fontFamily: {
        primary: 'SF Pro Display, system-ui, sans-serif',
        secondary: 'SF Pro Text, system-ui, sans-serif',
        mono: 'SF Mono, monospace'
      },
      fontSize: {
        xs: 11,
        sm: 13,
        base: 15,
        lg: 17,
        xl: 19,
        '2xl': 22,
        '3xl': 28
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700'
      }
    },
    spacing: {
      xs: 4,
      sm: 8,
      md: 16,
      lg: 24,
      xl: 32,
      '2xl': 48
    },
    borderRadius: {
      sm: 6,
      md: 10,
      lg: 14,
      xl: 18,
      full: 9999
    },
    shadows: {
      sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
      md: '0 4px 6px rgba(0, 0, 0, 0.1)',
      lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
      xl: '0 20px 25px rgba(0, 0, 0, 0.1)'
    },
    assets: {
      logo: {
        light: '/assets/logos/BSL-Logo-fondo-oscuro-2024.svg',
        dark: '/assets/logos/BSL-Logo-fondo-oscuro-2024.svg',
        favicon: '/favicon.ico',
        icon: '/assets/images/icon.png'
      },
      images: {
        hero: '/assets/images/bsl2025-hero.jpg',
        background: '/assets/images/bsl2025-bg.svg',
        placeholder: '/assets/images/bsl2025-placeholder.png'
      }
    },
    animations: {
      duration: {
        fast: 200,
        normal: 350,
        slow: 600
      },
      easing: {
        ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
        easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
        easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
        easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
      }
    }
  }
};

/**
 * Get branding configuration for an event
 */
export function getEventBranding(eventId: string): BrandingConfig {
  return BRANDING_PRESETS[eventId] || BRANDING_PRESETS['hashpass-default'];
}

/**
 * Generate CSS custom properties from branding config
 */
export function generateBrandingCSS(branding: BrandingConfig): string {
  return `
    :root {
      --color-primary: ${branding.colors.primary};
      --color-secondary: ${branding.colors.secondary || branding.colors.primary};
      --color-accent: ${branding.colors.accent || branding.colors.primary};
      --color-background-default: ${branding.colors.background.default};
      --color-background-paper: ${branding.colors.background.paper};
      --color-text-primary: ${branding.colors.text.primary};
      --color-text-secondary: ${branding.colors.text.secondary};
      --color-success: ${branding.colors.status.success};
      --color-warning: ${branding.colors.status.warning};
      --color-error: ${branding.colors.status.error};
      --color-info: ${branding.colors.status.info};
      
      --font-family-primary: ${branding.typography.fontFamily.primary};
      --font-size-xs: ${branding.typography.fontSize.xs}px;
      --font-size-sm: ${branding.typography.fontSize.sm}px;
      --font-size-base: ${branding.typography.fontSize.base}px;
      --font-size-lg: ${branding.typography.fontSize.lg}px;
      --font-size-xl: ${branding.typography.fontSize.xl}px;
      --font-size-2xl: ${branding.typography.fontSize['2xl']}px;
      --font-size-3xl: ${branding.typography.fontSize['3xl']}px;
      
      --spacing-xs: ${branding.spacing.xs}px;
      --spacing-sm: ${branding.spacing.sm}px;
      --spacing-md: ${branding.spacing.md}px;
      --spacing-lg: ${branding.spacing.lg}px;
      --spacing-xl: ${branding.spacing.xl}px;
      --spacing-2xl: ${branding.spacing['2xl']}px;
      
      --border-radius-sm: ${branding.borderRadius.sm}px;
      --border-radius-md: ${branding.borderRadius.md}px;
      --border-radius-lg: ${branding.borderRadius.lg}px;
      --border-radius-xl: ${branding.borderRadius.xl}px;
      --border-radius-full: ${branding.borderRadius.full}px;
      
      --shadow-sm: ${branding.shadows.sm};
      --shadow-md: ${branding.shadows.md};
      --shadow-lg: ${branding.shadows.lg};
      --shadow-xl: ${branding.shadows.xl};
      
      --animation-duration-fast: ${branding.animations.duration.fast}ms;
      --animation-duration-normal: ${branding.animations.duration.normal}ms;
      --animation-duration-slow: ${branding.animations.duration.slow}ms;
    }
  `;
}
