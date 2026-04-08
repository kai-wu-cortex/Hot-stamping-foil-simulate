import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { PerspectiveCamera, Environment, Text, OrbitControls, useCursor, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { SimulationResult, ProcessStep, CoatingMethod } from '../types';

interface VisualizerProps {
  result: SimulationResult;
  speed: number;
  speedRatio: number;
  tension: number;
  coronaPower: number;
  step: ProcessStep;
  method: CoatingMethod;
  onStepChange: (step: ProcessStep) => void;
  autoCamera: boolean;
  totalMeters: number;
}

// --- Materials ---
const COLORS = {
    frame: "#eab308", 
    cabinet: "#3b82f6", 
    metal: "#94a3b8",
    roller: "#cbd5e1",
    floor: "#0f172a",
    catwalk: "#d97706",
    fabricRaw: "#3b82f6", 
    fabricWet: "#2563eb", 
    fabricDry: "#60a5fa", 
};

// --- Custom Shader Material ---

const WebShaderMaterial = shaderMaterial(
  {
    uTime: 0,
    uSpeed: 0,
    uTension: 0,
    uColor: new THREE.Color(COLORS.fabricRaw),
    uBubbleStrength: 0,
    uStreakStrength: 0,
    uOrangePeelStrength: 0,
    uRepeat: new THREE.Vector2(40, 4)
  },
  // Vertex Shader
  `
    varying vec2 vUv;
    varying float vElevation;
    varying vec3 vWorldPosition; 
    uniform float uTime;
    uniform float uSpeed;
    uniform float uTension;

    void main() {
      vUv = uv;
      vec3 pos = position;
      
      // Physics Flutter Effect
      float flutterFreq = 10.0 + (uSpeed * 0.1);
      float flutterAmp = (uSpeed * 0.002) * (1.0 - clamp(uTension / 100.0, 0.0, 0.9));
      
      float flutter = sin(uv.x * 20.0 - uTime * 5.0) * sin(uv.y * 10.0);
      pos.y += flutter * flutterAmp;
      
      vElevation = pos.y;
      
      // Calculate world position for color transition logic
      vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
      vWorldPosition = worldPosition.xyz;

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  // Fragment Shader
  `
    varying vec2 vUv;
    varying float vElevation;
    varying vec3 vWorldPosition;
    uniform float uTime;
    uniform float uSpeed;
    uniform vec3 uColor;
    uniform float uBubbleStrength;
    uniform float uStreakStrength;
    uniform float uOrangePeelStrength;
    uniform vec2 uRepeat;

    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise(vec2 st) {
        vec2 i = floor(st);
        vec2 f = fract(st);
        float a = random(i);
        float b = random(i + vec2(1.0, 0.0));
        float c = random(i + vec2(0.0, 1.0));
        float d = random(i + vec2(1.0, 1.0));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // Flow logic
      vec2 movingUv = vUv;
      movingUv.x -= uTime * (uSpeed * 0.05); 

      // 1. Color Transition Logic (Coating happens approx at x = -8)
      // Smooth transition from Raw Fabric Color to Gold
      float coatingX = -8.0;
      float transitionWidth = 5.0;
      float transition = smoothstep(coatingX, coatingX + transitionWidth, vWorldPosition.x);
      
      // Metallic Gold Color
      vec3 goldColor = vec3(1.0, 0.85, 0.35); 
      vec3 baseColor = mix(uColor, goldColor, transition);

      // 2. Base Weave Pattern (reduced intensity on gold)
      vec2 gridUv = movingUv * uRepeat;
      float weave = smoothstep(0.4, 0.5, abs(sin(gridUv.x) * sin(gridUv.y)));
      baseColor = mix(baseColor, baseColor * 0.8, weave * 0.2 * (1.0 - transition * 0.5));

      // 3. Defects
      if (uStreakStrength > 0.01) {
          float streak = noise(vec2(vUv.y * 15.0, 0.0));
          float streakLine = smoothstep(0.4, 0.7, streak);
          baseColor = mix(baseColor, vec3(0.95, 0.95, 1.0), streakLine * uStreakStrength * 0.6);
      }
      if (uOrangePeelStrength > 0.01) {
          float opNoise = noise(movingUv * vec2(100.0, 100.0));
          float opBump = (opNoise - 0.5) * 2.0; 
          baseColor += vec3(opBump * uOrangePeelStrength * 0.15);
      }
      if (uBubbleStrength > 0.01) {
          vec2 bubbleUv = movingUv * vec2(40.0, 10.0);
          float n = noise(bubbleUv);
          float bubbleShape = smoothstep(0.65, 0.75, n) - smoothstep(0.78, 0.85, n);
          float bubbleCore = smoothstep(0.78, 0.85, n);
          vec3 bubbleColor = vec3(0.9, 0.9, 1.0);
          baseColor = mix(baseColor, bubbleColor, bubbleShape * uBubbleStrength);
          baseColor = mix(baseColor, uColor * 0.5, bubbleCore * uBubbleStrength * 0.5);
      }

      // 4. Metallic Specular Highlight (Fake PBR)
      if (transition > 0.1) {
         float metallic = transition; 
         float shiny = weave * 0.5; 
         // Add some extra shine for "Gold" effect
         baseColor += vec3(0.3, 0.2, 0.05) * metallic * 0.5;
      }

      float light = 1.0 + vElevation * 2.0;
      gl_FragColor = vec4(baseColor * light, 1.0);
      
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `
);

extend({ WebShaderMaterial });

// Declare the new material in R3F namespace
declare module '@react-three/fiber' {
  interface ThreeElements {
    webShaderMaterial: any;
  }
}

// --- Components ---

const InteractionZone = ({ position, size, onClick, label }: any) => {
  const [hovered, setHover] = useState(false);
  const glowRef = useRef<THREE.Mesh>(null);
  useCursor(hovered);

  useFrame(({ clock }) => {
    if (glowRef.current) {
        const t = clock.getElapsedTime();
        const scale = 1 + Math.sin(t * 3) * 0.1;
        glowRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group position={position}>
        <mesh 
          onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
        >
          <boxGeometry args={size} />
          <meshBasicMaterial 
            transparent 
            opacity={0.1} 
            color="#facc15" 
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <group position={[0, size[1]/2 + 0.5, 0]}>
             <mesh>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
             </mesh>
             <mesh ref={glowRef}>
                <sphereGeometry args={[0.5, 16, 16]} />
                <meshBasicMaterial color="#facc15" transparent opacity={0.3} />
             </mesh>
             {hovered && (
                 <Text position={[0, 0.8, 0]} fontSize={0.4} color="white" anchorY="bottom" outlineWidth={0.02} outlineColor="#000">
                    {label || "点击详情"}
                 </Text>
             )}
        </group>
    </group>
  );
};

const Roller = ({ position, width = 4.5, radius = 0.6, color = COLORS.roller, speed = 0, reverse = false, label = "" }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame((_, delta) => {
    if (groupRef.current && speed !== 0) {
      const direction = reverse ? 1 : -1;
      groupRef.current.rotation.z += (direction * speed * delta) / (radius * 60);
    }
  });

  return (
    <group position={position}>
        <group ref={groupRef}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[radius, radius, width, 32]} />
                <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0,0, width/2 + 0.05]}>
                 <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                 <meshStandardMaterial color="#333" />
            </mesh>
        </group>
        {label && <Text position={[0, radius + 0.5, 0]} fontSize={0.5} color="white" anchorY="bottom">{label}</Text>}
    </group>
  );
};

// --- Continuous Paper Web Simulation ---

const PaperWeb = ({ speed, tension, totalMeters, method, result }: VisualizerProps) => {
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const MAX_METERS = 3000;
    const rCore = 0.3;
    const rMax = 1.2;
    const rUnwind = Math.sqrt(Math.pow(rCore, 2) + (Math.pow(rMax, 2) - Math.pow(rCore, 2)) * Math.max(0, (MAX_METERS - totalMeters) / MAX_METERS));
    const rRewind = Math.sqrt(Math.pow(rCore, 2) + (Math.pow(rMax, 2) - Math.pow(rCore, 2)) * Math.min(1, totalMeters / MAX_METERS));

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = clock.getElapsedTime();
            materialRef.current.uniforms.uSpeed.value = speed;
            materialRef.current.uniforms.uTension.value = tension;
            materialRef.current.uniforms.uBubbleStrength.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uBubbleStrength.value, result.defects.bubbles, 0.1);
             materialRef.current.uniforms.uStreakStrength.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uStreakStrength.value, result.defects.streaks, 0.1);
            materialRef.current.uniforms.uOrangePeelStrength.value = THREE.MathUtils.lerp(materialRef.current.uniforms.uOrangePeelStrength.value, result.defects.orangePeel, 0.1);
        }
    });

    const shape = useMemo(() => {
        const s = new THREE.Shape();
        const w = 2.1; 
        const t = 0.02; 
        s.moveTo(-w, -t); s.lineTo(-w, t); s.lineTo(w, t); s.lineTo(w, -t); s.lineTo(-w, -t);
        return s;
    }, []);

    const curve = useMemo(() => {
        const points: THREE.Vector3[] = [];
        const addSegment = (p1: number[], p2: number[], tns: number) => {
            const v1 = new THREE.Vector3(...p1);
            const v2 = new THREE.Vector3(...p2);
            points.push(v1);
            const dist = v1.distanceTo(v2);
            const steps = Math.ceil(dist * 2); 
            const dir = new THREE.Vector3().subVectors(v2, v1).normalize();
            const gravity = new THREE.Vector3(0, -1, 0);
            const parallel = dir.clone().multiplyScalar(gravity.dot(dir));
            const sagDir = new THREE.Vector3().subVectors(gravity, parallel); 
            const sagAmp = (dist * dist * 0.5) / Math.max(5, tns * 5); 

            for(let i=1; i<steps; i++) {
                const t = i/steps;
                const p = new THREE.Vector3().lerpVectors(v1, v2, t);
                const parab = 4 * t * (1-t); 
                p.addScaledVector(sagDir, sagAmp * parab);
                points.push(p);
            }
        };

        const pUnwind = [-30, 1 + rUnwind, 0];
        const pUnwindGuideIn = [-27, 3.5, 0];
        const pUnwindGuideOut = [-26, 3.5, 0]; 
        const pPeel = [-24, 0.9, 0];
        const pEPC = [-20, 0.9, 0];
        const pCorona = [-18, 0.8, 0];
        const pClean = [-10.5, 0.3, 0];
        const isGravure = true; 
        const pCoatIn = isGravure ? [-9.5, 1.3, 0] : [-9, 2, 0];
        const pCoatHead = isGravure ? [-8, 0.9, 0] : [-8, 1.5, 0];
        const pCoatOut = isGravure ? [-6.5, 1.3, 0] : [-7, 2, 0];
        
        // --- Oven Path with Support Rollers ---
        const pOvenEntry = [-5, 3.5, 0];
        const ovenRollerXs = [-2, 2, 6, 10, 14];
        const pOvenRollers = ovenRollerXs.map(x => [x, 3.5, 0]);
        const pOvenExit = [15, 3.5, 0];
        
        const pInspect = [14, 2.3, 0];
        const pDancerIn = [17, 0.8, 0];
        const dancerY = 0.5 + (tension / 100) * 1.5;
        const pDancer = [18, dancerY - 0.4, 0];
        const pDancerOut = [19, 0.8, 0];
        const pRewindGuide = [24, 2.0, 0];
        const pRewind = [26, 1 + rRewind, 0];

        addSegment(pUnwind, pUnwindGuideIn, tension);
        points.push(new THREE.Vector3(...pUnwindGuideOut));
        addSegment(pUnwindGuideOut, pPeel, tension);
        addSegment(pPeel, pEPC, tension);
        addSegment(pEPC, pCorona, tension);
        addSegment(pCorona, pClean, tension);
        addSegment(pClean, pCoatIn, tension);
        addSegment(pCoatIn, pCoatHead, tension);
        addSegment(pCoatHead, pCoatOut, tension);
        
        // Enter Oven
        addSegment(pCoatOut, pOvenEntry, tension);
        
        // Over Support Rollers (Collision Simulation)
        let currentPos = pOvenEntry;
        pOvenRollers.forEach(pos => {
             addSegment(currentPos, pos, tension);
             currentPos = pos;
        });
        
        // Exit Oven
        addSegment(currentPos, pOvenExit, tension);
        addSegment(pOvenExit, pInspect, tension);
        
        addSegment(pInspect, pDancerIn, tension);
        addSegment(pDancerIn, pDancer, tension);
        addSegment(pDancer, pDancerOut, tension);
        addSegment(pDancerOut, pRewindGuide, tension);
        addSegment(pRewindGuide, pRewind, tension);
        points.push(new THREE.Vector3(...pRewind));

        return new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.2);
    }, [tension, rUnwind, rRewind, method]);

    return (
        <mesh position={[0,0,0]} castShadow receiveShadow>
            <extrudeGeometry args={[shape, { extrudePath: curve, steps: 400, bevelEnabled: false }]} />
            <webShaderMaterial 
                ref={materialRef} 
                uColor={new THREE.Color(COLORS.fabricRaw)}
            />
        </mesh>
    );
};

const SpiralRoll = ({ position, radius, color, layers = 10 }: any) => {
    const points = useMemo(() => {
        const pts = [];
        const maxR = radius;
        const minR = 0.3;
        const rotations = layers; 
        const pointsPerRot = 32;
        for (let i = 0; i <= rotations * pointsPerRot; i++) {
            const t = i / (rotations * pointsPerRot);
            const angle = t * rotations * Math.PI * 2;
            const r = minR + (maxR - minR) * t;
            pts.push(new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, 0));
        }
        return pts;
    }, [radius, layers]);
    
    const lineGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
    const NativeLine = 'line' as any;

    return (
        <group position={position}>
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius, radius, 4.2, 32]} />
                <meshStandardMaterial color={color} />
            </mesh>
            <NativeLine geometry={lineGeo} position={[0,0, 2.11]}>
                <lineBasicMaterial color="white" opacity={0.5} transparent />
            </NativeLine>
            <NativeLine geometry={lineGeo} position={[0,0, -2.11]}>
                <lineBasicMaterial color="white" opacity={0.5} transparent />
            </NativeLine>
        </group>
    );
}

// --- Stations (Simplified wrapper for rollers) ---

const UnwindStation = ({ speed, onClick, meters }: any) => {
    const MAX_METERS = 3000;
    const remaining = Math.max(0, MAX_METERS - meters);
    const radius = Math.sqrt(0.3**2 + (1.2**2 - 0.3**2) * (remaining/MAX_METERS));

    return (
    <group position={[-30, 0, 0]}>
      <Text position={[0, 4.5, 0]} fontSize={0.5} color="white">放卷 (Unwind)</Text>
      <SpiralRoll position={[0, 1, 0]} radius={radius} color={COLORS.fabricRaw} />
      <Roller position={[3.5, 3.2, 0]} radius={0.3} speed={speed} />
      <InteractionZone position={[0, 1, 0]} size={[4, 6, 6]} onClick={onClick} label="设置张力" />
    </group>
    );
};

const RewindStation = ({ speed, onClick, meters }: any) => {
    const MAX_METERS = 3000;
    const radius = Math.sqrt(0.3**2 + (1.2**2 - 0.3**2) * Math.min(1, meters/MAX_METERS));

    return (
    <group position={[-20, 0, 0]}>
      <Text position={[0, 4.5, 0]} fontSize={0.5} color="white">收卷 (Rewind)</Text>
      <Roller position={[-2, 1.7, 0]} radius={0.3} speed={speed} />
      <SpiralRoll position={[0, 1, 0]} radius={radius} color={COLORS.fabricRaw} layers={20} />
      <InteractionZone position={[0, 1, 0]} size={[4, 6, 6]} onClick={onClick} label="锥度控制" />
    </group>
    )
};

const PeelingStation = ({ speed, onClick }: any) => (
    <group position={[-24, 0, 0]}>
        <Text position={[0, 4.5, 0]} fontSize={0.5} color="white">剥离</Text>
        <Roller position={[0, 0.5, 0]} radius={0.4} width={4.2} speed={speed} />
        <Roller position={[0, 2.5, 0]} radius={0.6} width={4.2} color="#93c5fd" speed={speed} reverse={true} />
        <InteractionZone position={[0, 1.5, 0]} size={[3, 5, 6]} onClick={onClick} label="剥离废料" />
    </group>
);

const PreTreatStation = ({ speed, coronaPower, onClick }: any) => (
    <group position={[-18, 0, 0]}>
        <group position={[0, 1, 0]}>
             <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[1.5, 1, 5]} />
                <meshStandardMaterial color="#6366f1" opacity={0.6} transparent />
            </mesh>
            <Text position={[0, 1.2, 0]} fontSize={0.3} color="#a5b4fc">Corona</Text>
            <Roller position={[0, -0.2, 0]} radius={0.4} width={4.2} speed={speed} color="black" />
        </group>
        <InteractionZone position={[0, 0, 0]} size={[6, 5, 6]} onClick={onClick} label="电晕功率" />
    </group>
);

const CoatingStation = ({ method, speed, speedRatio, onClick }: any) => {
    const rollerSpeed = method === CoatingMethod.MICRO_GRAVURE ? speed * speedRatio : speed;
    return (
        <group position={[-8, 0, 0]}>
            <Text position={[0, 4.5, 0]} fontSize={0.5} color="yellow">涂布 (Coating)</Text>
            <group position={[-2.5, 0.5, 0]}>
                <Roller position={[0, 0, 0]} radius={0.3} width={4.2} speed={speed} color="#22c55e" label="除尘" />
            </group>
            {method === CoatingMethod.SLOT_DIE ? (
                <>
                    <Roller position={[0, 1, 0]} radius={1.0} width={4.2} color="#333" speed={speed} label="背辊" />
                    <group position={[-1.2, 1, 0]}><mesh><boxGeometry args={[1,1,4]}/><meshStandardMaterial color="gold"/></mesh></group>
                </>
            ) : (
                <>
                    <Roller position={[-1.5, 1, 0]} radius={0.3} speed={speed} />
                    <Roller position={[1.5, 1, 0]} radius={0.3} speed={speed} />
                    <Roller position={[0, 0.4, 0]} radius={0.5} width={4.2} color="#94a3b8" speed={rollerSpeed} reverse={true} label={`Ratio ${speedRatio.toFixed(1)}`} />
                    <mesh position={[0, -0.4, 0]}><boxGeometry args={[2,0.8,4.8]}/><meshStandardMaterial color="#334155"/></mesh>
                </>
            )}
            <InteractionZone position={[0, 0.5, 0]} size={[5, 4, 6]} onClick={onClick} label="液料配置" />
        </group>
    );
};

const OvenStation = ({ temp, onClick, speed }: any) => {
    // Generate rollers for inside the oven (Lowered to y=3.2 to match user request "rollers below")
    const ovenRollers = useMemo(() => {
        const rollers = [];
        // Approximate web path inside oven from x=-5 to x=15
        for(let i=0; i<5; i++) {
            rollers.push(
                <Roller key={i} position={[-2 + i*4, 3.2, 0]} radius={0.3} speed={speed} color="#3b82f6" />
            );
        }
        return rollers;
    }, [speed]);

    return (
        <group position={[5, 6, 0]}>
            <Text position={[0, 2.5, 0]} fontSize={0.5} color="orange">烘箱 {temp}°C</Text>
            
            {/* Transparent Glass Oven Casing */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[2.8, 2.8, 22, 4, 1, false, Math.PI/4]} />
                <meshPhysicalMaterial 
                    color="white" 
                    transparent 
                    opacity={0.1} 
                    roughness={0.1} 
                    metalness={0.1}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            {/* Outline for the glass */}
             <mesh rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[2.85, 2.85, 22, 4, 1, false, Math.PI/4]} />
                 <meshBasicMaterial color="white" wireframe transparent opacity={0.2} />
            </mesh>
            
            {/* Internal Rollers */}
            <group position={[-5, -6, 0]}>
                {ovenRollers}
            </group>

            {/* Entry/Exit Rollers */}
            <Roller position={[-10, -3.5, 0]} radius={0.3} speed={speed} label="UP" />
            <Roller position={[10, -3.5, 0]} radius={0.3} speed={speed} label="DOWN" />
            <InteractionZone position={[0, 0, 0]} size={[18, 4, 6]} onClick={onClick} label="烘箱温度" />
        </group>
    )
};

const PostProcessStation = ({ speed, tension, onClick }: any) => {
    const dancerY = 0.5 + (tension / 100) * 1.5;
    return (
        <group position={[18, 0, 0]}>
            <Text position={[0, 4.5, 0]} fontSize={0.5} color="white">后处理</Text>
            <group position={[-4, 2, 0]}>
                <Roller position={[0, 0, 0]} radius={0.3} speed={speed} />
            </group>
            <group position={[0, 0, 0]}>
                 <Roller position={[-1, 0.5, 0]} radius={0.3} speed={speed} />
                 <Roller position={[1, 0.5, 0]} radius={0.3} speed={speed} />
                 <group position={[0, dancerY, 0]}>
                    <Roller position={[0, 0, 0]} radius={0.4} width={4.2} speed={speed} color="#f43f5e" label="Dancer" />
                 </group>
            </group>
            <InteractionZone position={[0, 1, 0]} size={[10, 5, 6]} onClick={onClick} label="复合张力" />
        </group>
    );
};

// --- Camera ---
const CameraController = ({ step, autoCamera }: { step: ProcessStep, autoCamera: boolean }) => {
    const { camera, controls } = useThree();
    const [targetPos, setTargetPos] = useState(new THREE.Vector3(30, 30, 50)); 
    const [targetLook, setTargetLook] = useState(new THREE.Vector3(0, 5, 0));
    const isTransitioning = useRef(false);

    useEffect(() => {
        if (!autoCamera) return;
        isTransitioning.current = true;
        const t = new THREE.Vector3(); const l = new THREE.Vector3();
        switch (step) {
            case ProcessStep.UNWIND: t.set(-30, 10, 20); l.set(-30, 0, 0); break;
            case ProcessStep.PRETREAT: t.set(-20, 10, 20); l.set(-20, 0, 0); break;
            case ProcessStep.COATING: t.set(-8, 10, 15); l.set(-8, 0, 0); break;
            case ProcessStep.DRYING: t.set(5, 15, 30); l.set(5, 6, 0); break; 
            case ProcessStep.POST_PROCESS: t.set(18, 10, 20); l.set(18, 0, 0); break;
            case ProcessStep.REWIND: t.set(26, 10, 20); l.set(26, 0, 0); break;
            default: t.set(40, 35, 40); l.set(0, 5, 0); 
        }
        setTargetPos(t); setTargetLook(l);
        const timer = setTimeout(() => { isTransitioning.current = false; }, 2000);
        return () => clearTimeout(timer);
    }, [step, autoCamera]);

    useFrame((state, delta) => {
        if (autoCamera && isTransitioning.current) {
            camera.position.lerp(targetPos, delta * 2);
            const c = state.controls as any;
            if (c) { c.target.lerp(targetLook, delta * 2); c.update(); }
        }
    });
    return null;
}

const Catwalk = ({ length }: { length: number }) => (
    <group position={[length/2 - 15, 6, 4]}>
        <mesh position={[0, 0, 0]} receiveShadow><boxGeometry args={[length, 0.2, 1.5]} /><meshStandardMaterial color={COLORS.catwalk} roughness={0.8} /></mesh>
        <group position={[0, 1, 0.7]}><mesh><boxGeometry args={[length, 0.1, 0.1]} /><meshStandardMaterial color={COLORS.frame} /></mesh></group>
    </group>
)

export const FilmVisualizer: React.FC<VisualizerProps> = (props) => {
  return (
    <div className="w-full h-full rounded-lg overflow-hidden shadow-2xl border border-gray-700 bg-gray-900 relative">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[40, 35, 40]} fov={35} />
        <OrbitControls enablePan={true} maxPolarAngle={Math.PI / 2} target={[0, 5, 0]} />
        <CameraController step={props.step} autoCamera={props.autoCamera} />
        
        <Environment preset="warehouse" />
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 40, 20]} castShadow intensity={1.5} shadow-mapSize={[2048, 2048]} />
        
        {/* Floor */}
        <mesh position={[0, -5, 0]} rotation={[-Math.PI/2, 0, 0]} receiveShadow>
            <planeGeometry args={[200, 100]} />
            <meshStandardMaterial color={COLORS.floor} roughness={0.8} />
        </mesh>
        <gridHelper args={[200, 40, 0x334155, 0x1e293b]} position={[0, -4.9, 0]} />
        <Catwalk length={60} />

        {/* Stations */}
        <group position={[0, 0, 0]}>
            <UnwindStation speed={props.speed} onClick={() => props.onStepChange(ProcessStep.UNWIND)} meters={props.totalMeters} />
            <PeelingStation speed={props.speed} onClick={() => props.onStepChange(ProcessStep.PRETREAT)} />
            <PreTreatStation speed={props.speed} coronaPower={props.coronaPower} onClick={() => props.onStepChange(ProcessStep.PRETREAT)} />
            <CoatingStation method={props.method} speed={props.speed} speedRatio={props.speedRatio} onClick={() => props.onStepChange(ProcessStep.COATING)} />
            <OvenStation temp={100} onClick={() => props.onStepChange(ProcessStep.DRYING)} speed={props.speed} />
            <PostProcessStation speed={props.speed} tension={props.tension} onClick={() => props.onStepChange(ProcessStep.POST_PROCESS)} />
            <group position={[46, 0, 0]}>
                 <RewindStation speed={props.speed} onClick={() => props.onStepChange(ProcessStep.REWIND)} meters={props.totalMeters} />
            </group>
            
            {/* Continuous Web with WebGL Shader */}
            <PaperWeb 
                {...props}
            />
        </group>
      </Canvas>
    </div>
  );
};