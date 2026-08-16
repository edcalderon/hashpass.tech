import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

type ShaderSceneState = {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  geometry: THREE.PlaneGeometry;
  material: THREE.ShaderMaterial;
  animationId: number;
};

const vertexShader = `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`;

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
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 5; i++) {
        color[j] += lineWidth * float(i * i) /
          abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(uv) + mod(uv.x + uv.y, 0.2));
      }
    }

    float intensity = max(max(color[0], color[1]), color[2]);
    float alpha = smoothstep(0.015, 0.12, intensity);
    gl_FragColor = vec4(color[0], color[1], color[2], alpha);
  }
`;

export default function AuthShaderScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<ShaderSceneState | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === 'undefined') {
      return;
    }

    // `new THREE.WebGLRenderer()` throws synchronously (not just returns
    // null) when the browser/device can't create a WebGL context -- some
    // Android GPU drivers are denylisted, WebGL can be disabled by policy,
    // or the device is simply out of contexts. This runs inside a
    // useEffect on the auth screen (the real "first thing a visitor sees"
    // entry point), so an uncaught throw here takes down the entire app on
    // load, not just this decorative background. There is no local error
    // boundary around this component (unlike AuthBackgroundScene, the
    // other 50% A/B variant, which has one) -- this try/catch is the only
    // thing standing between a WebGL failure and a full-app crash screen.
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let geometry: THREE.PlaneGeometry;
    let material: THREE.ShaderMaterial;
    let camera: THREE.Camera;
    let mesh: THREE.Mesh;
    const uniforms = {
      time: { value: 1.0 },
      resolution: { value: new THREE.Vector2() },
    };
    try {
      camera = new THREE.Camera();
      camera.position.z = 1;

      scene = new THREE.Scene();
      geometry = new THREE.PlaneGeometry(2, 2);

      material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      });

      mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error('AuthShaderScene: WebGL unavailable, skipping animated background', error);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);

    const resize = () => {
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      uniforms.resolution.value.set(renderer.domElement.width, renderer.domElement.height);
    };

    let disposed = false;
    const animate = () => {
      if (disposed) {
        return;
      }

      const nextAnimationId = requestAnimationFrame(animate);
      uniforms.time.value += 0.05;
      renderer.render(scene, camera);

      if (sceneRef.current) {
        sceneRef.current.animationId = nextAnimationId;
      }
    };

    sceneRef.current = {
      camera,
      scene,
      renderer,
      geometry,
      material,
      animationId: 0,
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);

      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animationId);
        scene.remove(mesh);

        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }

        renderer.dispose();
        geometry.dispose();
        material.dispose();
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}
