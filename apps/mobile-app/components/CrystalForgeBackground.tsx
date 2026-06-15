"use client";

import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as THREE from 'three';

export interface CrystalForgeBackgroundProps {
  isDarkMode?: boolean;
  enableClickSpawn?: boolean;
  maxCrystals?: number;
}

type CrystalMesh = THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> & {
  userData: {
    velocity: THREE.Vector3;
    spin: THREE.Vector3;
    life: number;
    decay: number;
  };
};

const LIGHT_PALETTE = [0xdc2626, 0xef4444, 0xf87171];
const DARK_PALETTE = [0x06b6d4, 0x22d3ee, 0x38bdf8];

const pickPaletteColor = (isDarkMode: boolean) => {
  const palette = isDarkMode ? DARK_PALETTE : LIGHT_PALETTE;
  return palette[Math.floor(Math.random() * palette.length)];
};

export default function CrystalForgeBackground({
  isDarkMode = true,
  enableClickSpawn = true,
  maxCrystals = 48,
}: CrystalForgeBackgroundProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const mountNode = mountRef.current;
    if (!mountNode) return;

    let isDisposed = false;
    let frameId = 0;
    let cleanup = () => {};

    const init = async () => {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
        import('three/examples/jsm/postprocessing/EffectComposer.js'),
        import('three/examples/jsm/postprocessing/RenderPass.js'),
        import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
      ]);

      if (isDisposed || !mountRef.current) return;

      const width = mountNode.clientWidth || window.innerWidth;
      const height = mountNode.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(68, width / height, 0.1, 220);
      camera.position.z = 24;

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      mountNode.appendChild(renderer.domElement);

      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        isDarkMode ? 1.15 : 0.75,
        isDarkMode ? 0.55 : 0.4,
        0.05
      );
      composer.addPass(bloomPass);

      const ambientLight = new THREE.AmbientLight(isDarkMode ? 0x8be9fd : 0xffc4c4, isDarkMode ? 0.72 : 0.58);
      const pointLight = new THREE.PointLight(isDarkMode ? 0x22d3ee : 0xef4444, isDarkMode ? 1.2 : 1.0, 120);
      pointLight.position.set(0, 3, 30);
      const rimLight = new THREE.DirectionalLight(0xffffff, isDarkMode ? 0.35 : 0.25);
      rimLight.position.set(-2, 2, 4);
      scene.add(ambientLight, pointLight, rimLight);

      const creationGroup = new THREE.Group();
      scene.add(creationGroup);

      const crystals: CrystalMesh[] = [];
      const pointer = new THREE.Vector2(0, 0);
      const clock = new THREE.Clock();

      const disposeCrystal = (crystal: CrystalMesh) => {
        crystal.geometry.dispose();
        crystal.material.dispose();
        creationGroup.remove(crystal);
      };

      const removeOldestCrystal = () => {
        const oldest = crystals.shift();
        if (oldest) disposeCrystal(oldest);
      };

      const spawnCrystal = (xNdc: number, yNdc: number) => {
        if (crystals.length >= maxCrystals) removeOldestCrystal();

        const accentColor = new THREE.Color(pickPaletteColor(isDarkMode));
        const crystalMaterial = new THREE.MeshStandardMaterial({
          color: accentColor,
          emissive: accentColor.clone().multiplyScalar(isDarkMode ? 1.15 : 0.85),
          emissiveIntensity: isDarkMode ? 1.2 : 0.65,
          metalness: 0.88,
          roughness: 0.14,
          transparent: true,
          opacity: 0.92,
        });

        const radius = Math.random() * 1.4 + 0.55;
        const crystalGeo = new THREE.IcosahedronGeometry(radius, 0);
        const crystal = new THREE.Mesh(crystalGeo, crystalMaterial) as CrystalMesh;

        const vector = new THREE.Vector3(xNdc, yNdc, 0.3);
        vector.unproject(camera);
        const direction = vector.sub(camera.position).normalize();
        const distance = -camera.position.z / direction.z;
        const position = camera.position.clone().add(direction.multiplyScalar(distance));

        crystal.position.set(position.x, position.y, (Math.random() - 0.5) * 6);
        crystal.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        );

        const velocityScale = isDarkMode ? 0.018 : 0.013;
        crystal.userData = {
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * velocityScale,
            (Math.random() - 0.5) * velocityScale,
            (Math.random() - 0.5) * velocityScale
          ),
          spin: new THREE.Vector3(
            (Math.random() - 0.5) * 0.015,
            (Math.random() - 0.5) * 0.015,
            (Math.random() - 0.5) * 0.015
          ),
          life: 0.95,
          decay: Math.random() * 0.004 + 0.0012,
        };

        creationGroup.add(crystal);
        crystals.push(crystal);
      };

      // Seed initial crystals for immediate visual richness.
      for (let i = 0; i < Math.min(maxCrystals, 18); i += 1) {
        spawnCrystal(Math.random() * 2 - 1, Math.random() * 2 - 1);
      }

      const getPointerData = (clientX: number, clientY: number) => {
        const rect = mountNode.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return null;
        }

        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const isInside = x >= 0 && x <= 1 && y >= 0 && y <= 1;

        return {
          isInside,
          xNdc: x * 2 - 1,
          yNdc: -(y * 2 - 1),
        };
      };

      const onPointerMove = (event: PointerEvent) => {
        const pointerData = getPointerData(event.clientX, event.clientY);
        if (!pointerData || !pointerData.isInside) return;

        pointer.x = pointerData.xNdc;
        pointer.y = pointerData.yNdc;
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!enableClickSpawn) return;
        if (event.button !== 0 && event.pointerType !== 'touch') return;

        const pointerData = getPointerData(event.clientX, event.clientY);
        if (!pointerData || !pointerData.isInside) return;

        spawnCrystal(pointerData.xNdc, pointerData.yNdc);
      };

      const onResize = () => {
        const nextWidth = mountNode.clientWidth || window.innerWidth;
        const nextHeight = mountNode.clientHeight || window.innerHeight;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(nextWidth, nextHeight);
        composer.setSize(nextWidth, nextHeight);
      };

      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('resize', onResize);

      const animate = () => {
        frameId = window.requestAnimationFrame(animate);

        const elapsed = clock.getElapsedTime();
        creationGroup.rotation.y += isDarkMode ? 0.0009 : 0.0006;
        camera.position.z = 24 + Math.sin(elapsed * 0.18) * 1.1;

        for (let index = crystals.length - 1; index >= 0; index -= 1) {
          const crystal = crystals[index];
          crystal.position.add(crystal.userData.velocity);
          crystal.rotation.x += crystal.userData.spin.x;
          crystal.rotation.y += crystal.userData.spin.y;
          crystal.rotation.z += crystal.userData.spin.z;

          crystal.userData.life -= crystal.userData.decay;
          crystal.material.opacity = Math.max(0, crystal.userData.life);

          if (crystal.userData.life <= 0.05) {
            crystals.splice(index, 1);
            disposeCrystal(crystal);
          }
        }

        pointLight.position.x = Math.sin(elapsed * 0.5) * 6;
        pointLight.position.y = Math.cos(elapsed * 0.3) * 3;

        composer.render();
      };

      animate();

      cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('resize', onResize);
        window.cancelAnimationFrame(frameId);

        while (crystals.length > 0) {
          const crystal = crystals.pop();
          if (crystal) disposeCrystal(crystal);
        }

        composer.passes.forEach((pass) => {
          const disposablePass = pass as { dispose?: () => void };
          if (typeof disposablePass.dispose === 'function') {
            disposablePass.dispose();
          }
        });
        renderer.dispose();

        if (mountNode.contains(renderer.domElement)) {
          mountNode.removeChild(renderer.domElement);
        }
      };
    };

    void init();

    return () => {
      isDisposed = true;
      cleanup();
    };
  }, [enableClickSpawn, isDarkMode, maxCrystals]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDarkMode
            ? 'radial-gradient(circle at 50% 34%, rgba(8,145,178,0.16) 0%, rgba(8,145,178,0.08) 32%, rgba(8,145,178,0) 70%)'
            : 'radial-gradient(circle at 50% 34%, rgba(239,68,68,0.14) 0%, rgba(239,68,68,0.07) 30%, rgba(239,68,68,0) 70%)',
        }}
      />
    </div>
  );
}
