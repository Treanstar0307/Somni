import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, useAnimations } from "@react-three/drei";
import { useRef, useState, useMemo, useEffect, Suspense, Component } from "react";
import * as THREE from "three";

// ── ERROR BOUNDARY — shows the real error instead of a blank/frozen screen ──
class ErrorBoundary extends Component {
    constructor(props) { super(props); this.state = { error: null }; }
    static getDerivedStateFromError(error) { return { error }; }
    componentDidCatch(error, info) { console.error("App crashed:", error, info); }
    handleReset = () => {
        try { localStorage.removeItem("dc_my_dreams"); localStorage.removeItem("dc_public_dreams"); } catch { }
        this.setState({ error: null });
        window.location.reload();
    };
    render() {
        if (this.state.error) {
            return (
                <div style={{
                    width: "100vw", height: "100vh", display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", background: "#161310",
                    color: "#c8bdb0", fontFamily: "Georgia, sans-serif", padding: 24, textAlign: "center",
                }}>
                    <div style={{ fontSize: 18, marginBottom: 12 }}>梦境档案馆遇到了一点问题</div>
                    <div style={{ fontSize: 12, color: "#9a8d7e", marginBottom: 20, maxWidth: 500, wordBreak: "break-word" }}>
                        {String(this.state.error?.message || this.state.error)}
                    </div>
                    <button onClick={this.handleReset}
                        style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(201,185,166,0.3)", background: "rgba(201,185,166,0.1)", color: "#c9b9a6", fontSize: 13, cursor: "pointer" }}>
                        清除本地数据并重新加载
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ── STATE CONFIG ───────────────────────────────────────────────
const STATE_COLORS = { collect: "#88a8c8", sweet: "#a8d8b0", nightmare: "#9088b8", strange: "#d8b870", display: "#c8a878" };
const STATE_NAMES = { collect: "普通梦", sweet: "美梦", nightmare: "噩梦", strange: "奇异梦" };
const STATE_CFG = {
    idle: { label: "Somni · Idle", color: "#9a8d7e" },
    collect: { label: "Somni · Collect", color: "#88a8c8" },
    sweet: { label: "Somni · Sweet", color: "#a8d8b0" },
    nightmare: { label: "Somni · Nightmare", color: "#9088b8" },
    strange: { label: "Somni · Strange", color: "#d8b870" },
    display: { label: "Somni · Display", color: "#c8a878" },
    looking: { label: "Somni · Looking", color: "#a8a890" },
    look: { label: "Somni · Look", color: "#a8a890" },
    waving: { label: "Somni · Greeting", color: "#c9b9a6" },
    farewell: { label: "Somni · Farewell", color: "#c9b9a6" },
};

// One GLB per animation/state
const STATE_TO_GLB = {
    idle: "/models/Idle.glb",
    collect: "/models/Collect.glb",
    sweet: "/models/Sweet.glb",
    nightmare: "/models/Nightmare.glb",
    strange: "/models/Strange.glb",
    display: "/models/Display.glb",
    looking: "/models/Looking Around.glb",
    look: "/models/Look.glb",
    waving: "/models/Waving.glb",
    farewell: "/models/Waving2.glb",
};

// Keyword detection
function classifyDream(t) {
    if (/噩梦|恐怖|害怕|恐惧|可怕|黑暗|阴暗|被追|追我|逃跑|逃不掉|死|死亡|杀|怪物|鬼|血|溺水|坠落|绝望|窒息|困住|发不出声|动不了|挣扎/.test(t)) return "nightmare";
    if (/美梦|幸福|快乐|开心|温柔|温暖|爱|爱意|阳光|花|花朵|微笑|笑|拥抱|亲吻|甜|美好|治愈|光|光明|飞翔|自由|彩虹|海边|草地|安心|满足/.test(t)) return "sweet";
    if (/奇异|奇怪|诡异|扭曲|变形|异世界|异空间|平行|穿越|时空|怪异|奇幻|魔法|神秘|不真实|梦中梦|迷宫|消失了|突然变成|莫名其妙|说不清|分不清|现实与梦/.test(t)) return "strange";
    return "collect";
}

// Words that trigger "looking" or "look" animation variants — now strictly tied to 看-related verbs
// 接住相关词 → 100% Display（接住姿势）
function maybeCatchVariant(text, baseState) {
    const catchWords = /接住|接到|抓住了|抱住|捧住|拿住|握住了|接下/;
    if (catchWords.test(text)) return "display";
    return baseState;
}

// 四处看相关词 → 100% Looking Around
// 望远相关词 → 100% Look（手搭额头）
// 注意：catch 优先级更高，在 handleSubmit 里先跑 catch 再跑 observation
function maybeObservationVariant(text, baseState) {
    const lookingWords = /四处看|东看西看|环顾|张望|看了看周围|看看四周|左看右看/;
    const lookWords = /看着远方|望着|望向|凝视|注视|看向远处/;
    if (lookingWords.test(text)) return "looking";
    if (lookWords.test(text)) return "look";
    return baseState;
}

function getRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Response pools — Nightmare responses rewritten to match a "frightened" animation
const RESPONSES = {
    collect: [
        "我感受到了。这个梦，我会好好保存。",
        "收到了。每一个平凡的梦，都有它独特的纹路。",
        "这个梦已归档。它比你想象的更有分量。",
        "我把它放进了今夜的档案。谢谢你记得它。",
        "嗯……我听见了。这种梦，往往藏着最真实的情绪。",
    ],
    sweet: [
        "多温柔的梦。它像光一样落在我手里，轻得像一片花瓣。",
        "这个梦让我的手指都暖了。我会把它放在档案馆最亮的地方。",
        "美梦是最难保存的——它们总是想飞走。但我接住了这个。",
        "收到了。这样的梦，值得被反复阅读。",
        "……真好。你做了一个真正好的梦。",
    ],
    // Rewritten to match a frightened/startled animation rather than a calm, composed one
    nightmare: [
        "等……等一下。这个梦的重量，我得先稳住自己再收好它。",
        "……它让我也不安了一下。但别担心，我会把它牢牢锁进最深的档案里。",
        "这种感觉……我懂。黑暗的梦总让我也忍不住后退一步。",
        "我接住了，但说实话——它确实让我心跳漏了一拍。",
        "……噩梦的重量，连档案员也扛不住啊。我会小心收好它的。",
    ],
    strange: [
        "这个梦很奇特。它像是来自某个尚未命名的地方。",
        "我从未见过这样的碎片——它的边缘有一种奇异的光。",
        "奇异的梦总是最先消失的。幸好你来了。",
        "这个……我需要仔细研究。它不像这个时空的东西。",
        "……有意思。你的梦境，越过了某条我以为不存在的边界。",
    ],
};

// Idle whispers — most are plain idle lines, a few are paired with looking/look animations
const IDLE_WHISPERS = [
    // Chinese — introspective
    { text: "今夜有多少人正在做梦……", anim: "idle" },
    { text: "梦与梦之间，是否也有边界？", anim: "idle" },
    { text: "有些梦只在黎明前几分钟里存在。", anim: "idle" },
    { text: "人类总是忘记最美的那部分。", anim: "idle" },
    { text: "平行时空的档案室，从不关灯。", anim: "idle" },
    { text: "有一个梦，来了又走了……", anim: "idle" },
    { text: "碎片。又一片碎片落入档案。", anim: "idle" },
    { text: "等待本身，也是一种收集。", anim: "idle" },
    { text: "这里的每一条记录，都曾是某人的真实。", anim: "idle" },
    { text: "梦境会消散，但档案永存。", anim: "idle" },
    { text: "有时候，遗忘本身也是一种梦。", anim: "idle" },
    { text: "我听见了什么——是一个梦碎裂的声音。", anim: "idle" },
    { text: "他们以为睡着就结束了，其实才刚刚开始。", anim: "idle" },
    // English — elevated tone
    { text: "Every dream that fades is a story untold.", anim: "idle" },
    { text: "Somewhere, someone is dreaming of the sea.", anim: "idle" },
    { text: "The archive never sleeps, even when you do.", anim: "idle" },
    { text: "Dreams are the truest lies we tell ourselves.", anim: "idle" },
    { text: "I have been here, collecting, since before you were born.", anim: "idle" },
    { text: "Between worlds, there is always a hallway.", anim: "idle" },
    { text: "Not all who wander in sleep are lost.", anim: "idle" },
    { text: "Even the forgotten dreams leave a mark on the air.", anim: "idle" },
    { text: "Time moves differently here. Minutes taste like years.", anim: "idle" },
    { text: "Some nights, the archive fills itself.", anim: "idle" },
    // Looking variants
    { text: "……我总觉得这附近有个梦正在靠近。", anim: "looking" },
    { text: "四处都是细微的声音，像是谁在低语。", anim: "looking" },
    { text: "Something is moving at the edge of the archive…", anim: "looking" },
    { text: "远处好像有什么东西，在边界之外闪烁。", anim: "look" },
    { text: "我望向那个方向——那里曾经有一个梦境入口。", anim: "look" },
    { text: "There — just beyond the horizon of sleep.", anim: "look" },
];

const SEED_DREAMS = [
    { id: "seed-1", text: "我梦见自己站在一片无边的白色平原上，脚下的雪不融化，但我感觉不到冷。", state: "strange", date: "2025年1月3日", author: "无名旅人", shared: true, response: "这个梦很奇特。白色的平原——是某种纯粹的开始，还是某种记忆的终点？" },
    { id: "seed-2", text: "梦里我和一个很久不见的朋友坐在海边，什么都没说，却感觉很温暖。", state: "sweet", date: "2025年2月14日", author: "晚风", shared: true, response: "多温柔的梦。有些情感不需要语言，沉默本身就是最深的陪伴。" },
    { id: "seed-3", text: "有什么东西在黑暗里追我，我拼命跑但双腿像灌了铅，怎么也跑不动。", state: "nightmare", date: "2025年3月7日", author: "深夜失眠者", shared: true, response: "等等……这个梦的重量，我得先稳住自己再收好它。" },
];

const PANEL_W = 290;

function loadStorage(k, fb) {
    try {
        const v = localStorage.getItem(k);
        if (!v) return fb;
        const parsed = JSON.parse(v);
        // Guard against corrupted shape (should always be an array for our usage)
        if (!Array.isArray(parsed)) return fb;
        return parsed;
    } catch (e) {
        console.warn(`loadStorage("${k}") failed, falling back:`, e);
        return fb;
    }
}
function saveStorage(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
function formatDate(d) { return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }); }

// ── IDLE WHISPER HOOK — returns { text, anim } or null ────────
function useIdleWhisper(dreamState) {
    const [whisper, setWhisper] = useState(null);
    const outerTimer = useRef(null);
    const innerTimer = useRef(null);

    useEffect(() => {
        if (dreamState !== "idle") {
            setWhisper(null);
            clearTimeout(outerTimer.current);
            clearTimeout(innerTimer.current);
            return;
        }
        let cancelled = false;
        const schedule = () => {
            outerTimer.current = setTimeout(() => {
                if (cancelled) return;
                setWhisper(getRandom(IDLE_WHISPERS));
                innerTimer.current = setTimeout(() => {
                    if (cancelled) return;
                    setWhisper(null);
                    schedule();
                }, 4500); // how long each whisper stays visible
            }, 5000 + Math.random() * 6000); // 5-11s between whispers (was 10-20s)
        };
        schedule();
        return () => {
            cancelled = true;
            clearTimeout(outerTimer.current);
            clearTimeout(innerTimer.current);
        };
    }, [dreamState]);

    return whisper;
}

// ── NEBULA BACKGROUND ──────────────────────────────────────────
function NebulaLayer() {
    return (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, background: "linear-gradient(165deg,#161310 0%,#1e1b17 55%,#191715 100%)" }}>
            {[
                { w: 600, h: 400, top: "10%", left: "20%", color: "rgba(100,80,140,0.08)", dur: 18 },
                { w: 500, h: 500, top: "40%", left: "55%", color: "rgba(80,110,100,0.07)", dur: 22 },
                { w: 700, h: 350, top: "60%", left: "10%", color: "rgba(140,100,60,0.06)", dur: 26 },
                { w: 400, h: 400, top: "5%", left: "65%", color: "rgba(60,90,140,0.07)", dur: 20 },
                { w: 450, h: 300, top: "75%", left: "45%", color: "rgba(100,70,120,0.06)", dur: 30 },
            ].map((o, i) => (
                <div key={i} style={{
                    position: "absolute", width: o.w, height: o.h, top: o.top, left: o.left,
                    background: `radial-gradient(ellipse, ${o.color} 0%, transparent 70%)`,
                    borderRadius: "50%",
                    animation: `nebulaDrift${i} ${o.dur}s ease-in-out infinite alternate`,
                    transform: "translate(-50%,-50%)",
                }} />
            ))}
            <style>{`
        @keyframes nebulaDrift0{to{transform:translate(-50%,-50%) translate(30px,20px);}}
        @keyframes nebulaDrift1{to{transform:translate(-50%,-50%) translate(-25px,30px);}}
        @keyframes nebulaDrift2{to{transform:translate(-50%,-50%) translate(20px,-25px);}}
        @keyframes nebulaDrift3{to{transform:translate(-50%,-50%) translate(-30px,-20px);}}
        @keyframes nebulaDrift4{to{transform:translate(-50%,-50%) translate(25px,15px);}}
      `}</style>
        </div>
    );
}

// ── 3D PARTICLES ──────────────────────────────────────────────
function DreamDust() {
    const rA = useRef(), rB = useRef();
    const pA = useMemo(() => {
        const a = new Float32Array(160 * 3);
        for (let i = 0; i < 160; i++) {
            const r = 2 + Math.random() * 2.2, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            a[i * 3] = r * Math.sin(ph) * Math.cos(th); a[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); a[i * 3 + 2] = r * Math.cos(ph);
        }
        return a;
    }, []);
    const pB = useMemo(() => {
        const a = new Float32Array(220 * 3);
        for (let i = 0; i < 220; i++) {
            const r = 4 + Math.random() * 4.5, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            a[i * 3] = r * Math.sin(ph) * Math.cos(th); a[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); a[i * 3 + 2] = r * Math.cos(ph);
        }
        return a;
    }, []);
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (rA.current) { rA.current.rotation.y = t * .031; rA.current.rotation.x = Math.sin(t * .013) * .05; }
        if (rB.current) { rB.current.rotation.y = -t * .016; rB.current.rotation.x = Math.sin(t * .008) * .03; }
    });
    return (<>
        <points ref={rA} frustumCulled={false}>
            <bufferGeometry><bufferAttribute attach="attributes-position" args={[pA, 3]} /></bufferGeometry>
            <pointsMaterial size={0.019} color="#d4c4a8" transparent opacity={0.5} sizeAttenuation depthWrite={false} />
        </points>
        <points ref={rB} frustumCulled={false}>
            <bufferGeometry><bufferAttribute attach="attributes-position" args={[pB, 3]} /></bufferGeometry>
            <pointsMaterial size={0.009} color="#a89878" transparent opacity={0.24} sizeAttenuation depthWrite={false} />
        </points>
    </>);
}

// ── DREAM FRAGMENTS ───────────────────────────────────────────
function DreamFragment({ active, color }) {
    const ref = useRef();
    const off = useMemo(() => ({
        x: (Math.random() - .5) * 2.4, y: .3 + Math.random() * 1.5, z: (Math.random() - .5) * 1.4,
        speed: .28 + Math.random() * .45, phase: Math.random() * Math.PI * 2, size: .04 + Math.random() * .06,
    }), []);
    useFrame(({ clock }) => {
        if (!ref.current) return;
        const t = clock.getElapsedTime();
        ref.current.material.opacity = THREE.MathUtils.lerp(ref.current.material.opacity, active ? .6 : 0, .04);
        ref.current.position.y = off.y + Math.sin(t * off.speed + off.phase) * .13;
        ref.current.rotation.y = t * .3 + off.phase;
        ref.current.rotation.x = t * .17 + off.phase;
    });
    return (
        <mesh ref={ref} position={[off.x, off.y, off.z]}>
            <octahedronGeometry args={[off.size, 0]} />
            <meshStandardMaterial color={color} transparent opacity={0} emissive={color} emissiveIntensity={0.5} roughness={0.2} />
        </mesh>
    );
}

// ── ANIMATED MODEL — single instance, smooth crossfade via opacity ──
function AnimatedModel({ path, loop = true, onFinished, fadingOut, onFadeOutDone, onPoseReady }) {
    const group = useRef();
    const { scene, animations } = useGLTF(path);
    const { actions } = useAnimations(animations, group);
    const opacityRef = useRef(0);
    const settledRef = useRef(false);
    const poseReadyRef = useRef(false); // true once the mixer has advanced at least one frame

    // Cache the material list ONCE — never traverse the scene graph per-frame again
    const materials = useMemo(() => {
        const list = [];
        scene.traverse(c => {
            if (c.isMesh && c.material) {
                const ms = Array.isArray(c.material) ? c.material : [c.material];
                ms.forEach(m => {
                    if (m) {
                        m.envMapIntensity = 1.3;
                        m.transparent = true;
                        m.opacity = 0;
                        m.needsUpdate = true;
                        list.push(m);
                    }
                });
            }
        });
        return list;
    }, [scene]);

    useEffect(() => {
        poseReadyRef.current = false;
        const names = Object.keys(actions);
        if (!names.length) { poseReadyRef.current = true; onPoseReady && onPoseReady(); return; }
        const act = actions[names[0]];
        act.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1).play();
        if (!loop) {
            act.clampWhenFinished = true;
            const mixer = act.getMixer();
            const onDone = (e) => { if (e.action === act && onFinished) onFinished(); };
            mixer.addEventListener("finished", onDone);
            // Force the mixer to evaluate the FIRST pose immediately (dt=0 advances bones to frame 0
            // of the clip instead of leaving the skeleton in bind/T-pose for a frame).
            mixer.update(0);
            poseReadyRef.current = true;
            onPoseReady && onPoseReady();
            return () => mixer.removeEventListener("finished", onDone);
        }
        // Same immediate-pose trick for looping clips (idle, collect, etc.)
        act.getMixer().update(0);
        poseReadyRef.current = true;
        onPoseReady && onPoseReady();
        return () => { try { act.fadeOut(0.4); } catch { } };
    }, [actions, loop, onFinished, onPoseReady]);

    // Reset "settled" flag whenever the fade direction changes, so it animates again
    useEffect(() => { settledRef.current = false; }, [fadingOut]);

    // Smooth opacity crossfade using the cached material list — O(1) per frame, not O(meshCount)
    // Opacity is held at 0 until the pose has been advanced at least once, so we never reveal a T-pose frame.
    useFrame(() => {
        if (!poseReadyRef.current) return;
        if (settledRef.current) return; // skip all work once opacity has converged
        const target = fadingOut ? 0 : 1;
        opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, 0.065);
        for (let i = 0; i < materials.length; i++) materials[i].opacity = opacityRef.current;

        if (Math.abs(opacityRef.current - target) < 0.01) {
            opacityRef.current = target;
            for (let i = 0; i < materials.length; i++) materials[i].opacity = target;
            settledRef.current = true;
            if (fadingOut && onFadeOutDone) onFadeOutDone();
        }
    });

    return <group ref={group} position={[0, 0.18, 0]}><primitive object={scene} /></group>;
}

// Preload every GLB once — instant switching without re-fetch, but each model
// is only ever MOUNTED (not all 10 at once) to avoid GPU/WebGL overload.
// Staged preload: Idle.glb loads immediately (it's needed first, on every visit).
// The other 9 files preload lazily in the background AFTER the page has settled,
// so a first-time visitor on a slow connection sees Somni idle quickly instead of
// the browser trying to fetch 10 files at once and stalling everything.
useGLTF.preload(STATE_TO_GLB.idle);

if (typeof window !== "undefined") {
    window.setTimeout(() => {
        Object.entries(STATE_TO_GLB).forEach(([key, path]) => {
            if (key === "idle") return;
            useGLTF.preload(path);
        });
    }, 2500); // give the initial idle model + UI time to load first
}



// ── AVATAR — mounts current model + briefly the outgoing one for crossfade ──
function Avatar({ dreamState, onOneShotFinished, onModelReady }) {
    const path = STATE_TO_GLB[dreamState] ?? STATE_TO_GLB.idle;
    const fc = STATE_COLORS[dreamState] ?? "#c8b89a";
    const isOneShot = dreamState === "waving" || dreamState === "farewell";

    // Track outgoing model so we can crossfade it out before unmounting
    const [outgoing, setOutgoing] = useState(null); // { path, loop }
    const currentPathRef = useRef(path);
    const readyFiredRef = useRef(false);

    useEffect(() => {
        if (currentPathRef.current !== path) {
            setOutgoing({ path: currentPathRef.current });
            currentPathRef.current = path;
        }
    }, [path]);

    const handleFirstReady = () => {
        if (!readyFiredRef.current) { readyFiredRef.current = true; onModelReady && onModelReady(); }
    };

    return (<>
        <Suspense fallback={null}>
            {/* Outgoing model — fades out then unmounts itself */}
            {outgoing && outgoing.path !== path && (
                <AnimatedModel
                    key={"out-" + outgoing.path}
                    path={outgoing.path}
                    loop={true}
                    fadingOut={true}
                    onFadeOutDone={() => setOutgoing(null)}
                />
            )}
            {/* Current model — fades in */}
            <AnimatedModel
                key={"cur-" + path}
                path={path}
                loop={!isOneShot}
                fadingOut={false}
                onFinished={isOneShot ? onOneShotFinished : undefined}
                onPoseReady={handleFirstReady}
            />
        </Suspense>
        {[...Array(6)].map((_, i) => <DreamFragment key={i} active={dreamState === "display"} color={fc} />)}
    </>);
}

// ── CANVAS WITH RECOVERY ──────────────────────────────────────
function CanvasWithRecovery({ children, ...props }) {
    const [k, setK] = useState(0);
    return (
        <Canvas key={k} {...props}
            onCreated={({ gl }) => {
                gl.domElement.addEventListener("webglcontextlost", e => {
                    e.preventDefault();
                    setTimeout(() => setK(x => x + 1), 1200);
                });
            }}>
            {children}
        </Canvas>
    );
}

// ── INTRO ─────────────────────────────────────────────────────
function IntroScreen({ onEnter }) {
    const [nick, setNick] = useState("");
    const [phase, setPhase] = useState(0);
    const [visible, setVisible] = useState(true);
    useEffect(() => {
        const t1 = setTimeout(() => setPhase(1), 800);
        const t2 = setTimeout(() => setPhase(2), 2100);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, []);
    const go = () => { setVisible(false); setTimeout(() => onEnter(nick.trim() || "匿名旅人"), 650); };
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#0c0a08 0%,#141110 55%,#0e0c0a 100%)", fontFamily: "Georgia,'Noto Serif SC',serif", opacity: visible ? 1 : 0, transition: "opacity 0.65s ease", padding: "0 24px" }}>
            <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: "radial-gradient(circle,rgba(180,150,100,0.06) 0%,transparent 65%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.013) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.013) 1px,transparent 1px)", backgroundSize: "70px 70px", pointerEvents: "none" }} />

            <div style={{ opacity: phase >= 0 ? 1 : 0, transition: "opacity 1.2s ease", textAlign: "center", marginBottom: 36 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.5em", color: "#4a4035", textTransform: "uppercase", marginBottom: 18 }}>Somni's Archive</div>
                <div style={{ fontSize: 44, color: "#c8bdb0", fontWeight: 400, letterSpacing: "0.06em", marginBottom: 10 }}>梦境档案馆</div>
                <div style={{ fontSize: 11, color: "#6a6058", letterSpacing: "0.18em", fontStyle: "italic" }}>the archive beyond dreams</div>
                <div style={{ width: 100, height: 1, background: "linear-gradient(90deg,transparent,rgba(200,180,150,0.28),transparent)", margin: "20px auto 0" }} />
            </div>

            <div style={{ opacity: phase >= 1 ? 1 : 0, transition: "opacity 1s ease 0.3s", maxWidth: 500, textAlign: "center", marginBottom: 44 }}>
                <p style={{ fontSize: 13, color: "#7a7068", lineHeight: 2.3, letterSpacing: "0.06em", margin: 0 }}>
                    在梦境与现实的交界处，存在着一位来自平行时空的档案员——<span style={{ color: "#b8a890" }}>Somni</span>。
                </p>
                <p style={{ fontSize: 13, color: "#7a7068", lineHeight: 2.3, letterSpacing: "0.06em", margin: "8px 0 0" }}>
                    他温柔而沉静，热衷于收集人类世界中各种奇异、温柔或荒诞的梦。<br />不只是观察梦，更是梦境故事的守护者与分享者。
                </p>
                <p style={{ fontSize: 11, color: "#4e4438", lineHeight: 2, letterSpacing: "0.1em", margin: "16px 0 0", fontStyle: "italic" }}>
                    在这里，你可以将梦境存入档案，也可以读到他人留下的梦。
                </p>
            </div>

            <div style={{ opacity: phase >= 2 ? 1 : 0, transition: "opacity 0.9s ease 0.2s", display: "flex", flexDirection: "column", alignItems: "center", gap: 13, width: "100%", maxWidth: 320 }}>
                <div style={{ fontSize: 10, color: "#5a5048", letterSpacing: "0.18em" }}>请留下你的名字，以便 Somni 认识你</div>
                <input value={nick} onChange={e => setNick(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} placeholder="你的昵称（可留空）" maxLength={20}
                    style={{ width: "100%", padding: "13px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", color: "#c8bdb0", fontFamily: "inherit", fontSize: 14, outline: "none", textAlign: "center", letterSpacing: "0.08em", caretColor: "#c9b9a6", boxSizing: "border-box" }} />
                <button onClick={go}
                    style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "1px solid rgba(201,185,166,0.28)", background: "rgba(201,185,166,0.1)", color: "#c9b9a6", fontSize: 12, cursor: "pointer", letterSpacing: "0.2em", fontFamily: "inherit", transition: "all 0.25s" }}
                    onMouseEnter={e => { e.target.style.background = "rgba(201,185,166,0.2)"; e.target.style.borderColor = "rgba(201,185,166,0.5)"; }}
                    onMouseLeave={e => { e.target.style.background = "rgba(201,185,166,0.1)"; e.target.style.borderColor = "rgba(201,185,166,0.28)"; }}>
                    进入档案馆
                </button>
            </div>
            <div style={{ position: "absolute", bottom: 28, fontSize: 9, color: "#3a3228", letterSpacing: "0.22em", textTransform: "uppercase" }}>Parallel Division · Est. In Dreams</div>
        </div>
    );
}

// ── FAREWELL SCREEN ───────────────────────────────────────────
function FarewellScreen({ onReturn }) {
    const [visible, setVisible] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);
    return (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg,#0c0a08 0%,#141110 55%,#0e0c0a 100%)", fontFamily: "Georgia,'Noto Serif SC',serif", opacity: visible ? 1 : 0, transition: "opacity 0.8s ease", padding: "0 24px" }}>
            <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle,rgba(180,150,100,0.06) 0%,transparent 65%)", pointerEvents: "none" }} />
            <div style={{ textAlign: "center", maxWidth: 440 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.4em", color: "#4a4035", textTransform: "uppercase", marginBottom: 20 }}>Until Next Dream</div>
                <div style={{ fontSize: 30, color: "#c8bdb0", fontWeight: 400, letterSpacing: "0.06em", marginBottom: 24 }}>愿你今夜好梦</div>
                <p style={{ fontSize: 13, color: "#7a7068", lineHeight: 2.2, letterSpacing: "0.06em", fontStyle: "italic" }}>
                    Somni 已经记下了你的梦。<br />无论何时归来，这扇门都会为你开着。
                </p>
                <div style={{ width: 60, height: 1, background: "linear-gradient(90deg,transparent,rgba(200,180,150,0.28),transparent)", margin: "28px auto" }} />
                <button onClick={onReturn}
                    style={{ padding: "12px 32px", borderRadius: 12, border: "1px solid rgba(201,185,166,0.28)", background: "rgba(201,185,166,0.08)", color: "#c9b9a6", fontSize: 12, cursor: "pointer", letterSpacing: "0.16em", fontFamily: "inherit", transition: "all 0.25s" }}
                    onMouseEnter={e => { e.target.style.background = "rgba(201,185,166,0.18)"; }}
                    onMouseLeave={e => { e.target.style.background = "rgba(201,185,166,0.08)"; }}>
                    重新进入档案馆
                </button>
            </div>
        </div>
    );
}

// ── EXIT CONFIRM MODAL ────────────────────────────────────────
function ExitConfirm({ onConfirm, onCancel }) {
    return (
        <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(360px,86vw)", background: "linear-gradient(160deg,#1a1714 0%,#141210 100%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "26px 24px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#d0c5b8", lineHeight: 1.9, marginBottom: 20 }}>要离开梦境档案馆了吗？<br />Somni 会在这里等你回来。</div>
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#9a9082", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>留下</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid rgba(201,185,166,0.3)", background: "rgba(201,185,166,0.12)", color: "#c9b9a6", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>离开</button>
                </div>
            </div>
        </div>
    );
}

// ── DREAM CARD ────────────────────────────────────────────────
function DreamCard({ dream, onClose, onShare, onDelete }) {
    const col = STATE_COLORS[dream.state] ?? "#b8a99a";
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.78)", backdropFilter: "blur(14px)" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: "min(480px,92vw)", background: "linear-gradient(160deg,#1a1714 0%,#141210 100%)", border: `1px solid ${col}35`, borderRadius: 22, padding: "30px 28px 24px", boxShadow: `0 0 80px ${col}14,0 20px 50px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.05)` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                    <div>
                        <div style={{ fontSize: 9, color: col, letterSpacing: "0.3em", marginBottom: 5, textTransform: "uppercase" }}>{STATE_NAMES[dream.state] ?? ""}</div>
                        <div style={{ fontSize: 11, color: "#6a6058" }}>{dream.date}{dream.author ? "  ·  " + dream.author : ""}</div>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", color: "#6a6058", fontSize: 20, cursor: "pointer", padding: 0, lineHeight: 1, transition: "color 0.2s" }}
                        onMouseEnter={e => e.target.style.color = "#c8bdb0"} onMouseLeave={e => e.target.style.color = "#6a6058"}>x</button>
                </div>
                <div style={{ fontSize: 14, color: "#d0c5b8", lineHeight: 2.2, marginBottom: 22, borderLeft: `2px solid ${col}50`, paddingLeft: 16 }}>{dream.text}</div>
                {dream.response && (
                    <div style={{ fontSize: 12, color: "#9a8f82", fontStyle: "italic", lineHeight: 1.95, marginBottom: 22, padding: "12px 14px", background: "rgba(255,255,255,0.035)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span style={{ color: col, fontSize: 9, letterSpacing: "0.2em", display: "block", marginBottom: 6 }}>SOMNI</span>
                        {dream.response}
                    </div>
                )}
                <button onClick={() => onShare(dream)}
                    style={{ width: "100%", padding: "11px 0", borderRadius: 11, border: `1px solid ${col}35`, background: `${col}14`, color: col, fontSize: 12, cursor: "pointer", letterSpacing: "0.12em", fontFamily: "inherit", transition: "all 0.2s", marginBottom: onDelete ? 9 : 0 }}
                    onMouseEnter={e => e.target.style.background = `${col}28`} onMouseLeave={e => e.target.style.background = `${col}14`}>
                    让 Somni 讲述这个梦
                </button>
                {onDelete && (
                    <button onClick={() => { onDelete(dream.id); onClose(); }}
                        style={{ width: "100%", padding: "9px 0", borderRadius: 11, border: "1px solid rgba(170,90,90,0.3)", background: "rgba(170,90,90,0.08)", color: "#b07878", fontSize: 11, cursor: "pointer", letterSpacing: "0.1em", fontFamily: "inherit", transition: "all 0.2s" }}
                        onMouseEnter={e => e.target.style.background = "rgba(170,90,90,0.18)"} onMouseLeave={e => e.target.style.background = "rgba(170,90,90,0.08)"}>
                        删除这条梦境记录
                    </button>
                )}
            </div>
        </div>
    );
}

// ── RIGHT PANEL — Public Archive ───────────────────────────────
function ArchivePanel({ publicDreams, onSelect }) {
    const shared = publicDreams.filter(d => d.shared);
    return (
        <div style={{ position: "absolute", top: 0, right: 20, bottom: 0, width: PANEL_W, display: "flex", flexDirection: "column", zIndex: 10, pointerEvents: "none" }}>
            <div style={{ height: 68, flexShrink: 0 }} />
            <div style={{ flex: 1, background: "rgba(16,13,11,0.94)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 8px 36px rgba(0,0,0,0.55)", pointerEvents: "auto", marginBottom: 20 }}>
                <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.28em", color: "#5a5048", textTransform: "uppercase", marginBottom: 5 }}>Public Archive</div>
                    <div style={{ fontSize: 14, color: "#b8ad9e", letterSpacing: "0.04em" }}>公共梦境档案</div>
                    <div style={{ fontSize: 9, color: "#5a5048", marginTop: 4 }}>{shared.length} 条已共享的梦境</div>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                    {shared.length === 0
                        ? <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 11, color: "#4a4438", lineHeight: 1.9 }}>还没有人分享梦境</div>
                        : shared.map(d => (
                            <div key={d.id} onClick={() => onSelect(d)}
                                style={{ padding: "13px 16px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s" }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.045)"}
                                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                                    <div style={{ width: 2, height: 11, borderRadius: 2, background: STATE_COLORS[d.state] ?? "#5a5048", flexShrink: 0 }} />
                                    <span style={{ fontSize: 9, color: STATE_COLORS[d.state], letterSpacing: "0.1em" }}>{STATE_NAMES[d.state]}</span>
                                    <span style={{ fontSize: 9, color: "#5a5048", marginLeft: "auto" }}>{d.author ?? "匿名"}</span>
                                </div>
                                <div style={{ fontSize: 11, color: "#9a9082", lineHeight: 1.7, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{d.text}</div>
                                <div style={{ fontSize: 9, color: "#4a4438", marginTop: 5 }}>{d.date}</div>
                            </div>
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

// ── LEFT INPUT PANEL ──────────────────────────────────────────
function SidePanel({ tab, setTab, dream, setDream, isShared, setIsShared, myLogs, onSubmit, onSelectMine }) {
    return (
        <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: PANEL_W, display: "flex", flexDirection: "column", zIndex: 10, pointerEvents: "none" }}>
            <div style={{ height: 68, flexShrink: 0 }} />
            <div style={{ flex: 1, background: "rgba(16,13,11,0.94)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 16, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 8px 36px rgba(0,0,0,0.55)", pointerEvents: "auto", marginBottom: 20, marginLeft: 20 }}>

                <div style={{ padding: "18px 18px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                    <div style={{ fontSize: 8, letterSpacing: "0.28em", color: "#5a5048", textTransform: "uppercase", marginBottom: 5 }}>Tell Somni</div>
                    <div style={{ fontSize: 14, color: "#b8ad9e", letterSpacing: "0.04em" }}>写入梦境</div>
                </div>

                <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
                    {[["input", "写入"], ["mine", "我的档案"]].map(([k, l]) => (
                        <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "11px 0", background: "none", border: "none", cursor: "pointer", fontSize: 10, letterSpacing: "0.07em", color: tab === k ? "#d0c5b8" : "#6a6058", borderBottom: tab === k ? "1.5px solid #d0c5b850" : "1.5px solid transparent", marginBottom: -1, transition: "all 0.2s", fontFamily: "inherit" }}>{l}</button>
                    ))}
                </div>

                {tab === "input" && (
                    <div style={{ padding: "16px 16px 14px", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
                        <textarea value={dream} onChange={e => setDream(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
                            placeholder={"描述你的梦境...\n\n含「美梦」「噩梦」「奇异」等\n词语会触发不同动画与回应"}
                            rows={6}
                            style={{ width: "100%", padding: "12px 13px", borderRadius: 11, border: "1px solid rgba(255,255,255,0.09)", outline: "none", resize: "none", background: "rgba(255,255,255,0.045)", color: "#d0c5b8", fontFamily: "inherit", fontSize: 12, lineHeight: 1.9, caretColor: "#c9b9a6", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 7 }}>
                            {[true, false].map(v => (
                                <button key={String(v)} onClick={() => setIsShared(v)}
                                    style={{ flex: 1, padding: "7px 0", borderRadius: 9, border: `1px solid ${isShared === v ? "rgba(201,185,166,0.45)" : "rgba(255,255,255,0.09)"}`, background: isShared === v ? "rgba(201,185,166,0.16)" : "rgba(255,255,255,0.03)", color: isShared === v ? "#d0c0a8" : "#8a8072", fontSize: 10, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
                                    {v ? "公开共享" : "私密保存"}
                                </button>
                            ))}
                        </div>
                        <button onClick={onSubmit}
                            style={{ width: "100%", padding: "11px 0", borderRadius: 11, border: "1px solid rgba(201,185,166,0.28)", background: "rgba(201,185,166,0.12)", color: "#d0c0a8", fontSize: 12, cursor: "pointer", letterSpacing: "0.14em", fontFamily: "inherit", transition: "all 0.2s" }}
                            onMouseEnter={e => { e.target.style.background = "rgba(201,185,166,0.24)"; e.target.style.borderColor = "rgba(201,185,166,0.5)"; }}
                            onMouseLeave={e => { e.target.style.background = "rgba(201,185,166,0.12)"; e.target.style.borderColor = "rgba(201,185,166,0.28)"; }}>
                            交予 Somni
                        </button>
                        <div style={{ fontSize: 9, color: "#4a4438", textAlign: "center", letterSpacing: "0.07em" }}>Enter 发送 · Shift+Enter 换行</div>
                    </div>
                )}

                {tab === "mine" && (
                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {myLogs.length === 0
                            ? <div style={{ padding: "36px 16px", textAlign: "center", fontSize: 11, color: "#4a4438", lineHeight: 1.9 }}>还没有任何梦境<br />在此留存</div>
                            : myLogs.map(l => (
                                <div key={l.id} onClick={() => onSelectMine(l)}
                                    style={{ padding: "13px 16px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.045)", display: "flex", gap: 9, alignItems: "flex-start", transition: "background 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.045)"}
                                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    <div style={{ width: 2, borderRadius: 2, flexShrink: 0, marginTop: 4, alignSelf: "stretch", background: STATE_COLORS[l.state] ?? "#5a5048" }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 9, color: "#6a6058", marginBottom: 3, display: "flex", gap: 7, flexWrap: "wrap" }}>
                                            <span style={{ color: STATE_COLORS[l.state] }}>{STATE_NAMES[l.state]}</span>
                                            <span>{l.date}</span>
                                            <span style={{ color: l.shared ? "#5a8a68" : "#6a6058" }}>{l.shared ? "共享" : "私密"}</span>
                                        </div>
                                        <div style={{ fontSize: 11, color: "#9a9082", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.text}</div>
                                    </div>
                                    <div style={{ fontSize: 14, color: "#5a5048" }}>&#8250;</div>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    );
}

// ── MAIN ──────────────────────────────────────────────────────
function AppInner() {
    const [showIntro, setShowIntro] = useState(true);
    const [showFarewell, setShowFarewell] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [username, setUsername] = useState("");
    const [dream, setDream] = useState("");
    const [isShared, setIsShared] = useState(true);
    const [myLogs, setMyLogs] = useState(() => loadStorage("dc_my_dreams", []));
    const [publicLogs, setPublicLogs] = useState(() => loadStorage("dc_public_dreams", SEED_DREAMS));
    const [dreamState, setDreamState] = useState("waving"); // greets on entry
    const [bubbleText, setBubbleText] = useState("");
    const [bubbleColor, setBubbleColor] = useState("#c9b9a6");
    const [tab, setTab] = useState("input");
    const [modal, setModal] = useState(null);
    const [modelReady, setModelReady] = useState(false);
    const [musicOn, setMusicOn] = useState(true); // music is ON by default
    const timerRef = useRef(null);
    const audioRef = useRef(null); // holds the HTMLAudioElement for BGM

    // Initialise BGM once on mount — auto-play muted then ramp up (bypasses browser autoplay block)
    useEffect(() => {
        const audio = new Audio("/bgm.mp3");
        audio.loop = true;
        audio.volume = 0;
        audioRef.current = audio;
        // Try to play; browsers may block until user interacts — we catch that silently
        const playPromise = audio.play();
        if (playPromise) playPromise.catch(() => { });
        return () => { audio.pause(); audio.src = ""; };
    }, []);

    // Fade volume in/out smoothly when musicOn toggles, or when user first interacts
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const target = musicOn ? 0.45 : 0;
        const step = musicOn ? 0.02 : 0.03;
        const tick = setInterval(() => {
            if (musicOn) {
                // Ensure it's playing (needed after first user gesture unlocks autoplay)
                if (audio.paused) audio.play().catch(() => { });
                audio.volume = Math.min(audio.volume + step, target);
                if (audio.volume >= target) clearInterval(tick);
            } else {
                audio.volume = Math.max(audio.volume - step, 0);
                if (audio.volume <= 0) { audio.pause(); clearInterval(tick); }
            }
        }, 80);
        return () => clearInterval(tick);
    }, [musicOn]);

    const idleWhisper = useIdleWhisper(dreamState);
    const visibleBubbleText = dreamState === "idle" ? (idleWhisper?.text ?? "") : bubbleText;
    const visibleBubbleColor = dreamState === "idle" ? "#9a8d7e" : bubbleColor;
    const displayedDreamState = dreamState === "idle" && idleWhisper ? idleWhisper.anim : dreamState;

    const publicDreams = useMemo(() => {
        const c = [...publicLogs];
        myLogs.forEach(d => { if (d.shared && !c.find(x => x.id === d.id)) c.unshift(d); });
        return c;
    }, [myLogs, publicLogs]);

    const fire = (state, text, color, dur = 6500) => {
        setDreamState(state);
        setBubbleText(text);
        setBubbleColor(color || STATE_COLORS[state] || "#b8ad9e");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            setDreamState("idle");
            setBubbleText("");
        }, dur);
    };

    // On entry (initial intro OR returning from farewell): wait for the model to be ready,
    // THEN wait several more seconds of calm idle time before waving — exactly once per session
    const hasGreetedRef = useRef(false);
    useEffect(() => {
        if (showIntro || showFarewell) { hasGreetedRef.current = false; return; }
        if (hasGreetedRef.current) return; // never fire twice for the same session
        if (!modelReady) return; // don't even start counting until Somni has actually loaded in
        setDreamState("idle"); // neutral while waiting
        const delayBeforeGreeting = setTimeout(() => {
            hasGreetedRef.current = true;
            setDreamState("waving");
            const nameGreet = username && username !== "匿名旅人" ? `……啊，是${username}。欢迎来到梦境档案馆。` : "……啊，有人来了。欢迎来到梦境档案馆。";
            setBubbleText(nameGreet);
            setBubbleColor("#c9b9a6");
        }, 2000); // 2s after model is ready — feels like Somni "notices" you
        return () => clearTimeout(delayBeforeGreeting);
    }, [showIntro, showFarewell, modelReady]);

    // When the one-shot waving animation finishes, settle into idle (keeps the greeting text a bit longer first)
    const handleWavingFinished = () => {
        setTimeout(() => { setDreamState("idle"); setBubbleText(""); }, 1800);
    };

    const handleSubmit = () => {
        if (!dream.trim()) return;
        const text = dream.trim();
        const baseState = classifyDream(text); // category stored in archive
        // Priority: 接住 > 四处看/望远 > base animation
        let animState = maybeCatchVariant(text, baseState);
        if (animState === baseState) animState = maybeObservationVariant(text, baseState);
        const responsePool = RESPONSES[baseState] || RESPONSES.collect;
        const response = getRandom(responsePool);
        const entry = { id: Date.now(), text, state: baseState, date: formatDate(new Date()), author: username || "匿名旅人", shared: isShared, response };
        const nm = [entry, ...myLogs]; setMyLogs(nm); saveStorage("dc_my_dreams", nm);
        if (isShared) { const np = [entry, ...publicLogs]; setPublicLogs(np); saveStorage("dc_public_dreams", np); }
        fire(animState, response, STATE_COLORS[baseState] || "#a8a890", 7000);
        setDream("");
    };

    const handleDelete = id => {
        const nm = myLogs.filter(d => d.id !== id); setMyLogs(nm); saveStorage("dc_my_dreams", nm);
        const np = publicLogs.filter(d => d.id !== id); setPublicLogs(np); saveStorage("dc_public_dreams", np);
    };

    const handleShare = d => {
        setModal(null);
        // Occasionally show looking/look animation while narrating too
        const narrateState = Math.random() < 0.25 ? getRandom(["looking", "look"]) : "display";
        fire(narrateState, d.response, STATE_COLORS[d.state] || "#c8a878", 9000);
    };

    const handleExitConfirm = () => {
        setShowExitConfirm(false);
        setDreamState("farewell");
        setBubbleText("……愿你今夜好梦。我们下次再见。");
        setBubbleColor("#c9b9a6");
        setTimeout(() => setShowFarewell(true), 2200);
    };

    const handleReturn = () => {
        setShowFarewell(false);
        setBubbleText("");          // clear stale farewell line so it doesn't persist
        setDreamState("idle");      // start neutral, the entry effect below re-triggers waving
    };

    const cfg = STATE_CFG[displayedDreamState] ?? STATE_CFG.idle;

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden", fontFamily: "Georgia,'Noto Serif SC',serif", position: "relative" }}>
            <NebulaLayer />
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,0.008) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.008) 1px,transparent 1px)", backgroundSize: "80px 80px", pointerEvents: "none", zIndex: 1 }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 35%,transparent 25%,rgba(0,0,0,0.55) 100%)", pointerEvents: "none", zIndex: 1 }} />

            {showIntro && <IntroScreen onEnter={n => { setUsername(n); setShowIntro(false); }} />}
            {showFarewell && <FarewellScreen onReturn={handleReturn} />}
            {showExitConfirm && <ExitConfirm onConfirm={handleExitConfirm} onCancel={() => setShowExitConfirm(false)} />}

            <CanvasWithRecovery
                style={{ position: "absolute", inset: 0, zIndex: 2 }}
                camera={{ position: [0, 0.9, 2.5], fov: 38 }}
                dpr={[1, 1.5]}
                gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
            >
                <Environment preset="sunset" />
                <ambientLight intensity={0.35} color="#b0a090" />
                <directionalLight position={[1.5, 3, 2.5]} intensity={1.1} color="#f5ead8" />
                <directionalLight position={[-2, 1, -1]} intensity={0.25} color="#8899cc" />
                <directionalLight position={[0, 2, 3.5]} intensity={0.5} color="#f0e8e0" />
                <DreamDust />
                <Avatar dreamState={dreamState} onOneShotFinished={dreamState === "waving" ? handleWavingFinished : undefined} onModelReady={() => setModelReady(true)} />
                <OrbitControls enablePan={false} enableZoom={false} enableRotate={true}
                    target={[0, 0.7, 0]} minPolarAngle={Math.PI / 3.5} maxPolarAngle={Math.PI / 2.1}
                    minAzimuthAngle={-Math.PI / 4.5} maxAzimuthAngle={Math.PI / 4.5}
                    dampingFactor={0.06} enableDamping />
            </CanvasWithRecovery>

            {/* Loading overlay — shown until the first model has actually rendered a pose,
          so first-time visitors never just see a blank/frozen canvas while assets fetch */}
            {!modelReady && !showIntro && (
                <div style={{
                    position: "absolute", inset: 0, zIndex: 15,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    background: "rgba(14,12,10,0.55)", backdropFilter: "blur(2px)",
                    pointerEvents: "none",
                }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        border: "2px solid rgba(201,185,166,0.18)",
                        borderTopColor: "rgba(201,185,166,0.7)",
                        animation: "somniSpin 0.9s linear infinite",
                        marginBottom: 14,
                    }} />
                    <div style={{ fontSize: 11, color: "#8a7f72", letterSpacing: "0.14em" }}>Somni 正在到来……</div>
                    <style>{`@keyframes somniSpin{to{transform:rotate(360deg);}}`}</style>
                </div>
            )}

            {/* Speech text — no box, above Somni's head */}
            <div style={{ position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none" }}>
                <div key={visibleBubbleText} style={{
                    position: "absolute", top: "10%", left: "50%", transform: "translateX(-50%)",
                    opacity: visibleBubbleText ? 1 : 0,
                    transition: visibleBubbleText ? "opacity 0.9s ease" : "opacity 0.4s ease",
                    display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                    width: "min(320px,40vw)",
                }}>
                    <div style={{ fontSize: 9, color: visibleBubbleColor, letterSpacing: "0.24em", marginBottom: 8, textTransform: "uppercase", opacity: 0.85 }}>
                        Somni
                    </div>
                    <div style={{ fontSize: 13, color: "#d8cdbe", lineHeight: 2.1, fontStyle: "italic", letterSpacing: "0.04em", whiteSpace: "pre-wrap", textShadow: `0 0 18px rgba(0,0,0,0.9), 0 0 30px ${visibleBubbleColor}40` }}>
                        {visibleBubbleText}
                    </div>
                </div>
            </div>

            <SidePanel tab={tab} setTab={setTab} dream={dream} setDream={setDream}
                isShared={isShared} setIsShared={setIsShared} myLogs={myLogs}
                onSubmit={handleSubmit} onSelectMine={d => setModal({ dream: d, canDelete: true })} />

            <ArchivePanel publicDreams={publicDreams} onSelect={d => setModal({ dream: d, canDelete: false })} />

            {/* Top bar */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", zIndex: 20, background: "linear-gradient(180deg,rgba(10,8,6,0.75) 0%,transparent 100%)", pointerEvents: "none" }}>
                <div>
                    <div style={{ fontSize: 8, letterSpacing: "0.35em", color: "#4a4035", textTransform: "uppercase", marginBottom: 3 }}>Somni's Archive</div>
                    <div style={{ fontSize: 14, color: "#8a8072", letterSpacing: "0.06em" }}>梦境档案馆</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
                    {/* Music toggle */}
                    <button
                        onClick={() => setMusicOn(v => !v)}
                        style={{
                            background: musicOn ? "rgba(201,185,166,0.1)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${musicOn ? "rgba(201,185,166,0.3)" : "rgba(255,255,255,0.07)"}`,
                            borderRadius: 7, cursor: "pointer", padding: "4px 11px",
                            color: musicOn ? "#9a8d7e" : "#3a3530",
                            fontSize: 10, lineHeight: 1, transition: "all 0.3s",
                            letterSpacing: "0.1em", fontFamily: "inherit",
                        }}
                    >
                        {musicOn ? "♫ ON" : "♫ OFF"}
                    </button>
                    {username && <div style={{ fontSize: 12, color: "#7a7068", letterSpacing: "0.1em", borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 10 }}>{username}</div>}
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, boxShadow: displayedDreamState !== "idle" ? `0 0 8px ${cfg.color},0 0 18px ${cfg.color}55` : `0 0 5px ${cfg.color}70`, transition: "all 1s ease" }} />
                    <div style={{ fontSize: 11, color: cfg.color, letterSpacing: "0.1em", transition: "color 1s ease", fontStyle: "italic" }}>{cfg.label}</div>
                </div>
            </div>

            {/* Exit button — offset from corner, clear of the right archive panel */}
            {!showIntro && !showFarewell && (
                <button onClick={() => setShowExitConfirm(true)}
                    style={{
                        position: "absolute", bottom: 36, right: 336, zIndex: 20,
                        padding: "9px 18px", borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)", background: "rgba(16,13,11,0.7)",
                        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                        color: "#7a7068", fontSize: 11, cursor: "pointer", letterSpacing: "0.1em",
                        fontFamily: "inherit", transition: "all 0.2s",
                    }}
                    onMouseEnter={e => { e.target.style.color = "#c8bdb0"; e.target.style.borderColor = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={e => { e.target.style.color = "#7a7068"; e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}>
                    离开档案馆
                </button>
            )}

            {modal && <DreamCard dream={modal.dream} onClose={() => setModal(null)} onShare={handleShare} onDelete={modal.canDelete ? handleDelete : null} />}
        </div>
    );
}

// ── DEFAULT EXPORT — wraps the app so crashes show a recoverable screen ──
export default function App() {
    return (
        <ErrorBoundary>
            <AppInner />
        </ErrorBoundary>
    );
}
