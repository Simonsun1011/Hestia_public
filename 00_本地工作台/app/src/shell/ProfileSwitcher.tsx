import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

type StudioPersona = "owner" | "creator";

const STORAGE_KEY = "infans-studio.profile-persona";
const BURN_MS = 1180;
const SOUND_SRC = "/sfx/match-light.mp3";

const PERSONAS: Record<StudioPersona, { name: string; sub: string; avatar: string }> = {
  owner: { name: "新拥有者", sub: "点击切换身份", avatar: "/infans-studio-logo.v2.png" },
  creator: { name: "创作身份", sub: "点击切换身份", avatar: "/infans-studio-logo.v2.png" },
};

function readStoredPersona(): StudioPersona {
  try { return localStorage.getItem(STORAGE_KEY) === "creator" ? "creator" : "owner"; }
  catch { return "owner"; }
}

function noise1(value: number) {
  const integer = Math.floor(value);
  const fraction = value - integer;
  const first = Math.sin(integer * 127.1 + 311.7) * 43758.5453;
  const second = Math.sin((integer + 1) * 127.1 + 311.7) * 43758.5453;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const start = first - Math.floor(first);
  const end = second - Math.floor(second);
  return start + (end - start) * eased;
}

function fireRadius(angle: number, progress: number, maximum: number) {
  return progress * maximum
    + noise1(angle * 3.1 + progress * 4.2) * maximum * 0.12
    + noise1(angle * 8.4 + progress * 9.1) * maximum * 0.05
    + noise1(angle * 16.2 + progress * 14.5) * maximum * 0.02;
}

function easeInOut(value: number) {
  return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
}

let burnAudio: HTMLAudioElement | null = null;
let burnStopTimer = 0;

function playSwitchSound() {
  try {
    burnAudio ??= new Audio(SOUND_SRC);
    window.clearTimeout(burnStopTimer);
    burnAudio.pause();
    burnAudio.currentTime = 0;
    burnAudio.volume = 0.7;
    void burnAudio.play().catch(() => undefined);
    burnStopTimer = window.setTimeout(() => {
      burnAudio?.pause();
      if (burnAudio) burnAudio.currentTime = 0;
    }, 1250);
  } catch { /* 浏览器未授权音频时保留视觉切换。 */ }
}

export function ProfileSwitcher() {
  const initial = readStoredPersona();
  const [persona, setPersona] = useState<StudioPersona>(initial);
  const [frontName, setFrontName] = useState(PERSONAS[initial].name);
  const [backName, setBackName] = useState(PERSONAS[initial].name);
  const [burning, setBurning] = useState(false);
  const timerRef = useRef(0);
  const frameRef = useRef(0);
  const tokenRef = useRef(0);
  const stackRef = useRef<HTMLSpanElement | null>(null);
  const nameRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const image = new Image();
    image.src = PERSONAS.creator.avatar;
    burnAudio = new Audio(SOUND_SRC);
    burnAudio.preload = "auto";
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(burnStopTimer);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!burning) return;
    const stack = stackRef.current;
    const name = nameRef.current;
    const canvas = canvasRef.current;
    if (!stack || !name || !canvas) return;
    const token = ++tokenRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, stack.clientWidth);
    const height = Math.max(1, stack.clientHeight);
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const styles = getComputedStyle(name);
    const originX = -8;
    const originY = height + 8;
    const maximum = Math.hypot(width - originX, height - originY) * 1.25;
    const started = performance.now();

    const outline = (progress: number, inset: number) => {
      context.beginPath();
      const steps = 80;
      for (let index = 0; index <= steps; index += 1) {
        const angle = Math.PI * 1.12 * (index / steps) - Math.PI * 0.06;
        const radius = fireRadius(angle, progress, maximum) - inset;
        const x = originX + Math.cos(angle) * radius;
        const y = originY - Math.sin(angle) * radius;
        if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    };

    const draw = (progress: number) => {
      context.clearRect(0, 0, width, height);
      if (progress >= 1) return;
      context.fillStyle = "#071014";
      context.fillRect(0, 0, width, height);
      context.fillStyle = styles.color || "#edf3ee";
      context.font = `700 ${styles.fontSize} ${styles.fontFamily}`;
      context.textBaseline = "middle";
      context.fillText(frontName, 0, height / 2);
      context.save();
      context.globalCompositeOperation = "destination-out";
      context.beginPath();
      context.moveTo(originX, originY);
      for (let index = 0; index <= 80; index += 1) {
        const angle = Math.PI * 1.12 * (index / 80) - Math.PI * 0.06;
        const radius = fireRadius(angle, progress, maximum);
        context.lineTo(originX + Math.cos(angle) * radius, originY - Math.sin(angle) * radius);
      }
      context.closePath();
      context.fill();
      context.restore();
      context.save();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = `rgba(255, 118, 32, ${0.78 * (1 - progress * 0.2)})`;
      context.lineWidth = 1.6;
      context.shadowColor = "rgba(255, 90, 20, .9)";
      context.shadowBlur = 5;
      outline(Math.min(1, progress * 1.02), 1.1);
      context.strokeStyle = `rgba(255, 214, 130, ${0.5 * (1 - progress * 0.35)})`;
      context.lineWidth = 0.85;
      outline(Math.min(1, progress * 1.02), 2.1);
      context.restore();
    };

    if (reduceMotion) { draw(1); return; }
    draw(0);
    const tick = (now: number) => {
      if (tokenRef.current !== token) return;
      const raw = Math.min(1, (now - started) / BURN_MS);
      draw(easeInOut(raw ** 0.88));
      if (raw < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [burning, frontName]);

  const togglePersona = () => {
    if (burning) return;
    const next: StudioPersona = persona === "owner" ? "creator" : "owner";
    playSwitchSound();
    setFrontName(PERSONAS[persona].name);
    setBackName(PERSONAS[next].name);
    setPersona(next);
    setBurning(true);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 当前页面仍会完成切换。 */ }
    timerRef.current = window.setTimeout(() => {
      setFrontName(PERSONAS[next].name);
      setBurning(false);
    }, BURN_MS + 40);
  };

  const current = PERSONAS[persona];
  const shownName = burning ? backName : frontName;
  return <div className={`profile${persona === "creator" ? " is-creator" : ""}${burning ? " is-flipping" : ""}`}>
    <button type="button" className={`avatar avatar-flip${persona === "creator" ? " is-creator" : ""}${burning ? " is-flipping" : ""}`} onClick={togglePersona} aria-label="点击切换身份" title="点击切换身份">
      <span className="avatar-flip-inner" aria-hidden="true">
        <span className="avatar-face front"><img src={PERSONAS.owner.avatar} alt=""/></span>
        <span className="avatar-face back"><img src={PERSONAS.creator.avatar} alt=""/></span>
      </span>
    </button>
    <button type="button" className="profile-meta" onClick={togglePersona} aria-label="点击切换身份">
      <span ref={stackRef} className={`profile-name-stack${burning ? " is-burning" : ""}`}>
        <strong ref={nameRef} className={`profile-name under${burning ? " is-revealing" : ""}`}>{shownName}</strong>
        {burning ? <canvas ref={canvasRef} className="profile-burn-canvas" aria-hidden="true"/> : null}
      </span>
      <small>{current.sub}</small>
    </button>
    <button type="button" className="profile-chevron" onClick={togglePersona} aria-label="点击切换身份" tabIndex={-1}><ChevronRight size={14}/></button>
  </div>;
}
