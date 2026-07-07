"use client";

import React, { Component, ErrorInfo, FC, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Platform } from 'react-native';
import { createFragmentShader } from './auth-background-shader';

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      return mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen);
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkIsMobile = () => {
      const userAgent = navigator.userAgent;
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;

      setIsMobile(mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen));
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);

    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  return isMobile;
};

type AnimationState = {
  positions: THREE.Vector3[];
  rotations: THREE.Vector3[];
  baseOffsets: {
    x: number;
    y: number;
    posSpeed: THREE.Vector3;
    rotSpeed: THREE.Vector3;
    posPhase: THREE.Vector3;
    rotPhase: THREE.Vector3;
  }[];
};

const createInitialState = (amount: number): AnimationState => ({
  positions: Array.from({ length: amount }, () => new THREE.Vector3(0, 0, 0)),
  rotations: Array.from({ length: amount }, () => new THREE.Vector3(0, 0, 0)),
  baseOffsets: Array.from({ length: amount }, (_, i) => {
    const t = (i / amount) * Math.PI * 2;
    return {
      x: Math.cos(t) * 1.75,
      y: Math.sin(t) * 4.5,
      posSpeed: new THREE.Vector3(
        1.0 + Math.random() * 4,
        1.0 + Math.random() * 3.5,
        0.5 + Math.random() * 2.0
      ),
      rotSpeed: new THREE.Vector3(
        0.1 + Math.random() * 1,
        0.1 + Math.random() * 1,
        0.1 + Math.random() * 1
      ),
      posPhase: new THREE.Vector3(
        t + Math.random() * Math.PI * 3.0,
        t * 1.3 + Math.random() * Math.PI * 3.0,
        t * 0.7 + Math.random() * Math.PI * 3.0
      ),
      rotPhase: new THREE.Vector3(
        t * 0.5 + Math.random() * Math.PI * 2.0,
        t * 0.8 + Math.random() * Math.PI * 2.0,
        t * 1.1 + Math.random() * Math.PI * 2.0
      ),
    };
  }),
});

const vertexShader = `
varying vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const AuthBackgroundSceneInner: FC<{ amount: number; isMobile: boolean; isDark: boolean }> = ({
  amount,
  isMobile,
  isDark,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [animationState] = useState<AnimationState>(() => createInitialState(amount));

  const fragmentShader = useMemo(() => createFragmentShader(amount, isDark), [amount, isDark]);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode || typeof window === 'undefined') {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.Camera();
    camera.position.z = 1;

    const geometry = new THREE.PlaneGeometry(2, 2);
    const uniforms = {
      u_time: { value: 0 },
      u_aspect: { value: 1 },
      u_positions: { value: animationState.positions },
      u_rotations: { value: animationState.rotations },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: true,
      powerPreference: 'high-performance',
    });

    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mountNode.appendChild(renderer.domElement);

    const clock = new THREE.Clock();
    let disposed = false;
    let animationId = 0;

    const resize = () => {
      const width = mountNode.clientWidth || window.innerWidth;
      const height = mountNode.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      uniforms.u_aspect.value = width / Math.max(height, 1);
    };

    const syncInitialOffsets = () => {
      animationState.baseOffsets.forEach((offset, index) => {
        animationState.positions[index].set(offset.x, offset.y, 0);
        animationState.rotations[index].set(0, 0, 0);
      });
    };

    const animate = () => {
      if (disposed) {
        return;
      }

      animationId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      uniforms.u_time.value = elapsed;

      animationState.baseOffsets.forEach((offset, index) => {
        const wanderX = Math.sin(elapsed * offset.posSpeed.x + offset.posPhase.x) * 0.8;
        const wanderY = Math.cos(elapsed * offset.posSpeed.y + offset.posPhase.y) * 5;
        const wanderZ = Math.sin(elapsed * offset.posSpeed.z + offset.posPhase.z) * 0.5;

        const secondaryX =
          Math.cos(elapsed * offset.posSpeed.x * 0.7 + offset.posPhase.x * 1.3) * 0.4;
        const secondaryY =
          Math.sin(elapsed * offset.posSpeed.y * 0.8 + offset.posPhase.y * 1.1) * 0.3;

        animationState.positions[index].set(
          offset.x + wanderX + secondaryX,
          offset.y + wanderY + secondaryY,
          wanderZ
        );

        animationState.rotations[index].set(
          elapsed * offset.rotSpeed.x + offset.rotPhase.x,
          elapsed * offset.rotSpeed.y + offset.rotPhase.y,
          elapsed * offset.rotSpeed.z + offset.rotPhase.z
        );

        (uniforms.u_positions.value[index] as THREE.Vector3).copy(animationState.positions[index]);
        (uniforms.u_rotations.value[index] as THREE.Vector3).copy(animationState.rotations[index]);
      });

      renderer.render(scene, camera);
    };

    syncInitialOffsets();
    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      window.cancelAnimationFrame(animationId);

      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }

      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [animationState, fragmentShader, isMobile]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  );
};

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AuthBackgroundScene Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const AuthBackgroundSceneContent: FC<{ isDark?: boolean }> = ({ isDark = false }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isMobile = useIsMobile();
  const amount = isMobile ? 3 : 4;

  if (!mounted || typeof window === 'undefined') {
    return null;
  }

  return (
    <ErrorBoundary>
      <AuthBackgroundSceneInner amount={amount} isMobile={isMobile} isDark={isDark} />
    </ErrorBoundary>
  );
};

export const AuthBackgroundScene: FC<{ isDark?: boolean }> = (props) => {
  if (Platform.OS !== 'web') {
    return null;
  }

  return <AuthBackgroundSceneContent {...props} />;
};

export default AuthBackgroundScene;
