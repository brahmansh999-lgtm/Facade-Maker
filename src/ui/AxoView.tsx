import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useDerived } from './derived.ts';
import { buildHouse, facadeGroups, sceneBounds } from '../three/scene.ts';
import { PAPER } from '../drawings/color.ts';

export const axoCanvas: { current: HTMLCanvasElement | null; reset?: () => void } = { current: null };

export function AxoView() {
  const d = useDerived();
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; controls: OrbitControls; render: () => void; house?: THREE.Object3D; faces: THREE.Object3D[] } | null>(null);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAPER);
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 500);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.zoomSpeed = 1.2;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => {
      const w = el.clientWidth || 1, h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = w + 'px';
      renderer.domElement.style.height = h + 'px';
      const half = (camera.userData.half as number) ?? 12;
      const a = w / h;
      camera.left = -half * a; camera.right = half * a; camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ctx.current = { renderer, scene, camera, controls, render, faces: [] };
    axoCanvas.current = renderer.domElement;
    axoCanvas.reset = () => {
      const c = ctx.current;
      if (!c) return;
      const b = c.camera.userData.bounds as { c: THREE.Vector3; r: number } | undefined;
      if (!b) return;
      c.controls.target.copy(b.c);
      // classic axonometric from the front-left, 30° up
      const dir = new THREE.Vector3(-1, 0.82, 1.15).normalize();
      c.camera.position.copy(b.c).add(dir.multiplyScalar(60));
      c.camera.zoom = 1;
      c.camera.userData.half = b.r * 1.12;
      c.camera.updateProjectionMatrix();
      c.controls.update();
      resize();
    };
    return () => {
      ro.disconnect();
      controls.dispose();
      if (ctx.current?.house) disposeTree(ctx.current.house);
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
      axoCanvas.current = null;
    };
  }, []);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    if (c.house) { c.scene.remove(c.house); disposeTree(c.house); }
    for (const f of c.faces) c.scene.remove(f);   // cached with the facade output; not disposed
    c.house = buildHouse(d);
    c.faces = facadeGroups(d);
    c.scene.add(c.house, ...c.faces);
    const first = !c.camera.userData.bounds;
    c.camera.userData.bounds = sceneBounds(d);
    if (first) axoCanvas.reset?.();
    else c.render();
  }, [d]);

  return <div className="axo" ref={host} />;
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
  });
}
