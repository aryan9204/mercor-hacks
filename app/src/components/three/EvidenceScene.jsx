// Three.js hero: the real #12834 image on a tilted plane, the annotated evidence box outlined in
// amber just above it, and a gray slab that settles over the evidence box ("evid") or the equal-size
// random box ("rand"). Falls back to a plain <img> when WebGL or the texture is unavailable
// (demo images are inlined as data URLs, so this also works when opened from file://).
import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { DEMO } from "@/lib/imaced";
import { SceneFallback } from "./SceneFallback";
import { cn } from "@/lib/utils";

const [IW, IH] = DEMO.size; // 800 x 1252
const PH = 3.2;              // plane height in world units
const PW = (PH * IW) / IH;
const AMBER = "#fab219";
const GRAY = "#7c7468";

/** Pixel box [x0,y0,x1,y1] -> plane-space center + size. */
function boxToPlane([x0, y0, x1, y1]) {
  const w = ((x1 - x0) / IW) * PW, h = ((y1 - y0) / IH) * PH;
  const cx = -PW / 2 + ((x0 + x1) / 2 / IW) * PW;
  const cy = PH / 2 - ((y0 + y1) / 2 / IH) * PH;
  return { cx, cy, w, h };
}
const EVID = boxToPlane(DEMO.evidence_box_px);
const RAND = boxToPlane(DEMO.random_box_px);

const rectPts = ({ cx, cy, w, h }, z) => [
  [cx - w / 2, cy - h / 2, z], [cx + w / 2, cy - h / 2, z], [cx + w / 2, cy + h / 2, z],
  [cx - w / 2, cy + h / 2, z], [cx - w / 2, cy - h / 2, z],
];

function usePrefersReducedMotion() {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!m) return;
    const on = () => setR(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return r;
}

function webglAvailable() {
  if (typeof window === "undefined") return false;
  // Images are inlined as data URLs, so WebGL works from file:// too.
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Rig({ children, reduced }) {
  const g = useRef();
  useFrame((state, dt) => {
    if (!g.current) return;
    const t = state.clock.elapsedTime;
    const px = reduced ? 0 : state.pointer.x, py = reduced ? 0 : state.pointer.y;
    const idle = reduced ? 0 : Math.sin(t * 0.35) * 0.04;
    const ty = -0.32 + px * 0.14 + idle, tx = 0.1 - py * 0.08;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 3);
    g.current.rotation.y += (ty - g.current.rotation.y) * k;
    g.current.rotation.x += (tx - g.current.rotation.x) * k;
  });
  return <group ref={g} rotation={[0.1, -0.32, 0]}>{children}</group>;
}

function ImagePlane() {
  const tex = useTexture(DEMO.images.full);
  useMemo(() => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.needsUpdate = true; }, [tex]);
  return (
    <>
      {/* thin backing card for depth */}
      <mesh position={[0.06, -0.06, -0.06]}>
        <boxGeometry args={[PW + 0.08, PH + 0.08, 0.04]} />
        <meshBasicMaterial color="#1c1c1a" />
      </mesh>
      <mesh>
        <planeGeometry args={[PW, PH]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </>
  );
}

function Slab({ view, reduced }) {
  const m = useRef();
  const mat = useRef();
  const { invalidate } = useThree();
  const target = view === "rand" ? RAND : EVID;
  const shown = view === "evid" || view === "rand";
  useEffect(() => { invalidate(); }, [view, invalidate]);
  useFrame((_, dt) => {
    if (!m.current) return;
    const tz = shown ? 0.025 : 0.7;
    const to = shown ? 1 : 0;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 6);
    const p = m.current.position;
    p.x += (target.cx - p.x) * k; p.y += (target.cy - p.y) * k; p.z += (tz - p.z) * k;
    mat.current.opacity += (to - mat.current.opacity) * k;
    m.current.visible = mat.current.opacity > 0.01;
    const moving = Math.abs(target.cx - p.x) + Math.abs(target.cy - p.y) + Math.abs(tz - p.z) + Math.abs(to - mat.current.opacity) > 0.002;
    if (moving) invalidate();
  });
  return (
    <mesh ref={m} position={[EVID.cx, EVID.cy, 0.7]} visible={false}>
      <boxGeometry args={[EVID.w, EVID.h, 0.03]} />
      <meshBasicMaterial ref={mat} color={GRAY} transparent opacity={0} toneMapped={false} />
    </mesh>
  );
}

function Scene({ view, reduced }) {
  return (
    <Rig reduced={reduced}>
      <ImagePlane />
      <Slab view={view} reduced={reduced} />
      <Line points={rectPts(EVID, 0.09)} color={AMBER} lineWidth={2} dashed dashSize={0.07} gapSize={0.045} />
      {view === "rand" && <Line points={rectPts(RAND, 0.09)} color="#c3c2b7" lineWidth={1.5} />}
    </Rig>
  );
}

const LABEL = {
  full: "full image, nothing hidden",
  evid: "the evidence region (the mass, on the left) painted gray",
  rand: "an equal-size random region painted gray, evidence left visible",
};

export default function EvidenceScene({ view = "full", className }) {
  const reduced = usePrefersReducedMotion();
  const [gl] = useState(webglAvailable);
  const wrap = useRef();
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    if (!wrap.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { rootMargin: "80px" });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  const fallback = <SceneFallback view={view} />;
  const aria = `Mammogram from ViTAR-16K case ${DEMO.ds_index}, ${LABEL[view] || LABEL.full}. Amber dashed box marks the annotated evidence region.`;

  return (
    <div ref={wrap} role="img" aria-label={aria} className={cn("relative size-full", className)}>
      {gl ? (
        <SceneBoundary fallback={fallback}>
          <Canvas
              dpr={[1, 2]}
              frameloop={!onScreen ? "never" : reduced ? "demand" : "always"}
              camera={{ position: [0, 0, 6], fov: 35 }}
              gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
              style={{ background: "transparent" }}
              aria-hidden
            >
              <Suspense fallback={null}><Scene view={view} reduced={reduced} /></Suspense>
            </Canvas>
        </SceneBoundary>
      ) : fallback}
    </div>
  );
}
