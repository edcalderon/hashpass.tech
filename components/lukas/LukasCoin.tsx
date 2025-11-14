import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import Svg, { Path, Circle, Polygon, G } from 'react-native-svg';

interface LukasCoinProps {
  size?: number;
}

export function LukasCoin({ size = 220 }: LukasCoinProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const coinSize = isMobile ? size * 0.8 : size;
  const center = coinSize / 2;
  const radius = center - 10;

  return (
    <View style={[styles.container, { width: coinSize, height: coinSize }]}>
      <Svg width={coinSize} height={coinSize} viewBox={`0 0 ${coinSize} ${coinSize}`}>
        {/* Outer decorative border */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="#A7F3D0"
          stroke="#059669"
          strokeWidth="3"
        />
        
        {/* Decorative pentagons around the border */}
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i * 360) / 16;
          const rad = (angle * Math.PI) / 180;
          const x = center + Math.cos(rad) * (radius - 5);
          const y = center + Math.sin(rad) * (radius - 5);
          const size = 6;
          const points = [
            `${x},${y}`,
            `${x + size * Math.cos(rad + Math.PI / 3)},${y + size * Math.sin(rad + Math.PI / 3)}`,
            `${x + size * Math.cos(rad + Math.PI * 2 / 3)},${y + size * Math.sin(rad + Math.PI * 2 / 3)}`,
            `${x + size * Math.cos(rad + Math.PI)},${y + size * Math.sin(rad + Math.PI)}`,
            `${x + size * Math.cos(rad + Math.PI * 4 / 3)},${y + size * Math.sin(rad + Math.PI * 4 / 3)}`,
          ].join(' ');
          
          return (
            <Polygon
              key={i}
              points={points}
              fill="#A7F3D0"
              stroke="#059669"
              strokeWidth="1"
            />
          );
        })}

        {/* Inner circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius * 0.75}
          fill="#D1FAE5"
          stroke="#059669"
          strokeWidth="2"
        />

        {/* Mountains/Landscape at bottom */}
        <Path
          d={`M ${center * 0.4} ${center * 1.3} L ${center * 0.5} ${center * 0.7} L ${center * 0.6} ${center * 0.9} L ${center * 0.7} ${center * 0.65} L ${center * 0.8} ${center * 0.85} L ${center * 0.9} ${center * 0.6} L ${center * 1.1} ${center * 0.8} L ${center * 1.3} ${center * 1.3} Z`}
          fill="#10B981"
          stroke="#059669"
          strokeWidth="2"
        />
        <Path
          d={`M ${center * 0.45} ${center * 1.3} L ${center * 0.55} ${center * 0.75} L ${center * 0.65} ${center * 0.95} L ${center * 0.75} ${center * 0.7} L ${center * 0.85} ${center * 0.9} L ${center * 0.95} ${center * 0.65} L ${center * 1.05} ${center * 0.85} L ${center * 1.15} ${center * 1.3} Z`}
          fill="#34D399"
          stroke="#059669"
          strokeWidth="1"
        />
      </Svg>
      
      {/* Overlay text for better visibility */}
      <View style={styles.textOverlay}>
        <Text style={[styles.dollarSign, { fontSize: coinSize * 0.25 }]}>$</Text>
        <Text style={[styles.lukasText, { fontSize: coinSize * 0.12 }]}>LUKAS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
  },
  dollarSign: {
    color: '#059669',
    fontWeight: '800',
    marginTop: -15,
  },
  lukasText: {
    color: '#022C22',
    fontWeight: '800',
    marginTop: 5,
    textShadowColor: '#A7F3D0',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
