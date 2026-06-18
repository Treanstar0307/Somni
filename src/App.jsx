import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, useAnimations } from "@react-three/drei";
import { useRef, useState, useMemo, useEffect, Suspense } from "react";
import * as THREE from "three";

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

// Words that trigger "looking" or "look" animation variants instead of the default for that category
// (used when the dream mentions searching / observing / distance — adds variety)
function maybeObservationVariant(text, baseState) {
    const lookingWords = /四处|寻找|找不到|环顾|周围|张望|徘徊|迷路|找路/;
    const lookWords = /远方|远处|前方|望向|看见了|看到了远|地平线|尽头/;
    if (lookingWords.test(text) && Math.random() < 0.6) return "looking";
    if (lookWords.test(text) && Math.random() < 0.6) return "look";
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
    { text: "今夜有多少人正在做梦……", anim: "idle" },
    { text: "梦与梦之间，是否也有边界？", anim: "idle" },
    { text: "有些梦只在黎明前几分钟存在。", anim: "idle" },
    { text: "我听见了什么——是一个梦碎裂的声音。", anim: "idle" },
    { text: "人类总是忘记最美的那部分。", anim: "idle" },
    { text: "平行时空的档案室，从不关灯。", anim: "idle" },
    { text: "有一个梦，来了又走了……", anim: "idle" },
    { text: "Somewhere, someone is dreaming of the sea.", anim: "idle" },
    { text: "碎片。又一片碎片落入档案。", anim: "idle" },
    { text: "等待本身，也是一种收集。", anim: "idle" },
    { text: "这里的每一条记录，都曾是某人的真实。", anim: "idle" },
    { text: "梦境会消散，但档案永存。", anim: "idle" },
    { text: "……我总觉得这附近有个梦正在靠近。", anim: "looking" },
    { text: "四处都是细微的声音，像是谁在低语。", anim: "looking" },
    { text: "远处好像有什么东西，在边界之外闪烁。", anim: "look" },
    { text: "我望向那个方向——那里曾经有一个梦境入口。", anim: "look" },
];

const SEED_DREAMS = [
    { id: "seed-1", text: "我梦见自己站在一片无边的白色平原上，脚下的雪不融化，但我感觉不到冷。", state: "strange", date: "2025年1月3日", author: "无名旅人", shared: true, response: "这个梦很奇特。白色的平原——是某种纯粹的开始，还是某种记忆的终点？" },
    { id: "seed-2", text: "梦里我和一个很久不见的朋友坐在海边，什么都没说，却感觉很温暖。", state: "sweet", date: "2025年2月14日", author: "晚风", shared: true, response: "多温柔的梦。有些情感不需要语言，沉默本身就是最深的陪伴。" },
    { id: "seed-3", text: "有什么东西在黑暗里追我，我拼命跑但双腿像灌了铅，怎么也跑不动。", state: "nightmare", date: "2025年3月7日", author: "深夜失眠者", shared: true, response: "等等……这个梦的重量，我得先稳住自己再收好它。" },
];

const PANEL_W = 290;

function loadStorage(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function saveStorage(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
function formatDate(d) { return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }); }

// ── IDLE WHISPER HOOK — returns { text, anim } or null ────────
function useIdleWhisper(dreamState) {
    const [whisper, setWhisper] = useState(null);
    const timerRef = useRef(null);
    useEffect(() => {
        if (dreamState !== "idle") { setWhisper(null); return; }
        const schedule = () => {
            timerRef.current = setTimeout(() => {
                setWhisper(getRandom(IDLE_WHISPERS));
                setTimeout(() => { setWhisper(null); schedule(); }, 5500);
            }, 10000 + Math.random() * 10000);
        };
        schedule();
        return () => clearTimeout(timerRef.current);
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

// ── ANIMATED MODEL ────────────────────────────────────────────
function AnimatedModel({ path, loop = true }) {
    const group = useRef();
    const { scene, animations } = useGLTF(path);
    const { actions } = useAnimations(animations, group);
    useMemo(() => {
        scene.traverse(c => {
            if (c.isMesh) {
                const ms = Array.isArray(c.material) ? c.material : [c.material];
                ms.forEach(m => { if (m) { m.envMapIntensity = 1.3; m.needsUpdate = true; } });
            }
        });
    }, [scene]);
    useEffect(() => {
        const names = Object.keys(actions);
        if (!names.length) return;
        const act = actions[names[0]];
        act.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1).fadeIn(0.4).play();
        if (!loop) act.clampWhenFinished = true;
        return () => { try { act.stop(); } catch { } };
    }, [actions, loop]);
    return <group ref={group} position={[0, 0.18, 0]}><primitive object={scene} /></group>;
}

// ── AVATAR ────────────────────────────────────────────────────
function Avatar({ dreamState }) {
    const path = STATE_TO_GLB[dreamState] ?? STATE_TO_GLB.idle;
    const fc = STATE_COLORS[dreamState] ?? "#c8b89a";
    const isOneShot = dreamState === "waving" || dreamState === "farewell";
    return (<>
        <Suspense fallback={null}>
            <AnimatedModel key={path} path={path} loop={!isOneShot} />
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
export default function App() {
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
    const timerRef = useRef(null);

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

    // On entry: Waving greeting, then settle into idle
    useEffect(() => {
        if (showIntro) return;
        setBubbleText("……啊，有人来了。欢迎来到梦境档案馆。");
        setBubbleColor("#c9b9a6");
        const t = setTimeout(() => { setDreamState("idle"); setBubbleText(""); }, 4500);
        return () => clearTimeout(t);
    }, [showIntro]);

    const handleSubmit = () => {
        if (!dream.trim()) return;
        const text = dream.trim();
        let state = classifyDream(text);
        state = maybeObservationVariant(text, state); // may swap to looking/look for variety
        const responsePool = RESPONSES[state] || RESPONSES.collect;
        const response = getRandom(responsePool);
        const entry = { id: Date.now(), text, state: classifyDream(text), date: formatDate(new Date()), author: username || "匿名旅人", shared: isShared, response };
        const nm = [entry, ...myLogs]; setMyLogs(nm); saveStorage("dc_my_dreams", nm);
        if (isShared) { const np = [entry, ...publicLogs]; setPublicLogs(np); saveStorage("dc_public_dreams", np); }
        fire(state, response, STATE_COLORS[entry.state] || "#a8a890", 7000);
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
        setDreamState("waving");
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
                gl={{ antialias: true, alpha: true, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false }}
            >
                <Environment preset="sunset" />
                <ambientLight intensity={0.35} color="#b0a090" />
                <directionalLight position={[1.5, 3, 2.5]} intensity={1.1} color="#f5ead8" />
                <directionalLight position={[-2, 1, -1]} intensity={0.25} color="#8899cc" />
                <directionalLight position={[0, 2, 3.5]} intensity={0.5} color="#f0e8e0" />
                <DreamDust />
                <Avatar dreamState={dreamState} />
                <OrbitControls enablePan={false} enableZoom={false} enableRotate={true}
                    target={[0, 0.7, 0]} minPolarAngle={Math.PI / 3.5} maxPolarAngle={Math.PI / 2.1}
                    minAzimuthAngle={-Math.PI / 4.5} maxAzimuthAngle={Math.PI / 4.5}
                    dampingFactor={0.06} enableDamping />
            </CanvasWithRecovery>

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
                    {username && <div style={{ fontSize: 12, color: "#7a7068", letterSpacing: "0.1em", borderRight: "1px solid rgba(255,255,255,0.08)", paddingRight: 10 }}>{username}</div>}
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, boxShadow: displayedDreamState !== "idle" ? `0 0 8px ${cfg.color},0 0 18px ${cfg.color}55` : `0 0 5px ${cfg.color}70`, transition: "all 1s ease" }} />
                    <div style={{ fontSize: 11, color: cfg.color, letterSpacing: "0.1em", transition: "color 1s ease", fontStyle: "italic" }}>{cfg.label}</div>
                </div>
            </div>

            {/* Bottom-right exit button */}
            {!showIntro && !showFarewell && (
                <button onClick={() => setShowExitConfirm(true)}
                    style={{
                        position: "absolute", bottom: 20, right: 20, zIndex: 20,
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
