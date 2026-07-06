"use client";

import React, { FC, useMemo, useRef, useState, useEffect, Suspense, Component, ErrorInfo } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Plane } from '@react-three/drei'
import * as THREE from 'three'
import { createFragmentShader } from './auth-background-shader'

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== 'undefined') {
      const userAgent = navigator.userAgent
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth <= 768
      return mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen)
    }
    return false
  })

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkIsMobile = () => {
      const userAgent = navigator.userAgent
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isSmallScreen = window.innerWidth <= 768

      setIsMobile(mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen))
    }

    checkIsMobile()
    window.addEventListener('resize', checkIsMobile)

    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  return isMobile
}
type AnimationState = {
  positions: THREE.Vector3[]
  rotations: THREE.Vector3[]
  baseOffsets: {
    x: number
    y: number
    posSpeed: THREE.Vector3
    rotSpeed: THREE.Vector3
    posPhase: THREE.Vector3
    rotPhase: THREE.Vector3
  }[]
}

const createInitialState = (amount: number): AnimationState => ({
  positions: Array.from({ length: amount }, () => new THREE.Vector3(0, 0, 0)),
  rotations: Array.from({ length: amount }, () => new THREE.Vector3(0, 0, 0)),
  baseOffsets: Array.from({ length: amount }, (_, i) => {
    const t = (i / amount) * Math.PI * 2
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
      )
    }
  })
})

const vertexShader = `
varying vec2 v_uv;

void main() {
  v_uv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

interface ScreenPlaneProps {
  animationState: AnimationState
  amount: number
  isDark: boolean
}

const ScreenPlane: FC<ScreenPlaneProps> = ({ animationState, amount, isDark }) => {
  const { viewport } = useThree()
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
    u_aspect: { value: viewport.width / viewport.height },
    u_positions: { value: animationState.positions },
    u_rotations: { value: animationState.rotations },
  }), [viewport.width, viewport.height, animationState.positions, animationState.rotations])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value += delta
      const time = materialRef.current.uniforms.u_time.value

      animationState.baseOffsets.forEach((offset, i) => {
        const wanderX = Math.sin(time * offset.posSpeed.x + offset.posPhase.x) * 0.8
        const wanderY = Math.cos(time * offset.posSpeed.y + offset.posPhase.y) * 5
        const wanderZ = Math.sin(time * offset.posSpeed.z + offset.posPhase.z) * 0.5

        const secondaryX = Math.cos(time * offset.posSpeed.x * 0.7 + offset.posPhase.x * 1.3) * 0.4
        const secondaryY = Math.sin(time * offset.posSpeed.y * 0.8 + offset.posPhase.y * 1.1) * 0.3

        animationState.positions[i].set(
          offset.x + wanderX + secondaryX,
          offset.y + wanderY + secondaryY,
          wanderZ
        )

        animationState.rotations[i].set(
          time * offset.rotSpeed.x + offset.rotPhase.x,
          time * offset.rotSpeed.y + offset.rotPhase.y,
          time * offset.rotSpeed.z + offset.rotPhase.z
        )

        materialRef.current!.uniforms.u_positions.value[i].copy(animationState.positions[i])
        materialRef.current!.uniforms.u_rotations.value[i].copy(animationState.rotations[i])
      })
    }
  })

  return (
    <Plane args={[1, 1]} scale={[viewport.width, viewport.height, 1]}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={createFragmentShader(amount, isDark)}
        transparent={true}
      />
    </Plane>
  )
}

interface AnimationControllerProps {
  animationState: AnimationState
}

const AnimationController: FC<AnimationControllerProps> = ({ animationState }) => {
  useEffect(() => {
    animationState.baseOffsets.forEach((offset, i) => {
      animationState.positions[i].set(offset.x, offset.y, 0)
      animationState.rotations[i].set(0, 0, 0)
    })
  }, [animationState])

  return null
}

const AuthBackgroundSceneInner: FC<{ amount: number, isMobile: boolean, isDark: boolean }> = ({ amount, isMobile, isDark }) => {
  const [animationState] = useState<AnimationState>(() => createInitialState(amount))

  const cameraConfig = useMemo(() => ({
    position: [0, 0, 15] as [number, number, number],
    fov: 50,
    near: 0.1,
    far: 2000,
  }), [])

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: -1, pointerEvents: 'none' }}>
      <Canvas
        camera={cameraConfig}
        dpr={1}
        frameloop="always"
        gl={{
          alpha: true,
          antialias: !isMobile,
          powerPreference: "high-performance"
        }}
      >
        <AnimationController animationState={animationState} />
        <ScreenPlane animationState={animationState} amount={amount} isDark={isDark} />
      </Canvas>
    </div>
  )
}

class ErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AuthBackgroundScene Error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export const AuthBackgroundScene: FC<{ isDark?: boolean }> = ({ isDark = false }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isMobile = useIsMobile();
  const amount = isMobile ? 3 : 4;

  if (!mounted || typeof window === 'undefined') {
    return null; // Avoid SSR hydration mismatches
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <AuthBackgroundSceneInner key={amount} amount={amount} isMobile={isMobile} isDark={isDark} />
      </Suspense>
    </ErrorBoundary>
  );
}

export default AuthBackgroundScene;
