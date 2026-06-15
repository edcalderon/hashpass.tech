"use client"

import React, { FC, useRef, useMemo, Suspense, Component, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Plane } from '@react-three/drei'
import * as THREE from 'three'

const vertexShader = `
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  #define TWO_PI 6.2831853072
  #define PI 3.14159265359

  precision highp float;
  uniform vec2 resolution;
  uniform float time;

  void main(void) {
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    float t = time * 0.05;
    float lineWidth = 0.002;

    vec3 color = vec3(0.0);
    for(int j = 0; j < 3; j++){
      for(int i=0; i < 5; i++){
        color[j] += lineWidth*float(i*i) / abs(fract(t - 0.01*float(j)+float(i)*0.01)*5.0 - length(uv) + mod(uv.x+uv.y, 0.2));
      }
    }

    gl_FragColor = vec4(color[0],color[1],color[2],1.0);
  }
`

const RipplePlane: FC = () => {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const { viewport, gl, size } = useThree()

  const uniforms = useMemo(() => ({
    time: { value: 1.0 },
    resolution: { value: new THREE.Vector2() },
  }), [])

  useFrame(() => {
    if (!materialRef.current) return
    materialRef.current.uniforms.time.value += 0.05
    const dpr = gl.getPixelRatio()
    materialRef.current.uniforms.resolution.value.set(size.width * dpr, size.height * dpr)
  })

  return (
    <Plane args={[1, 1]} scale={[viewport.width, viewport.height, 1]}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
      />
    </Plane>
  )
}

class ShaderErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export const ShaderAnimation: FC = () => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof window === 'undefined') return null

  return (
    <ShaderErrorBoundary>
      <Suspense fallback={null}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <Canvas
            camera={{ position: [0, 0, 15], fov: 50 }}
            dpr={1}
            frameloop="always"
            gl={{ antialias: false, powerPreference: 'high-performance' }}
          >
            <RipplePlane />
          </Canvas>
        </div>
      </Suspense>
    </ShaderErrorBoundary>
  )
}
