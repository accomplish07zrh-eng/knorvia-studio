import { useEffect, useRef, type RefObject } from "react";
import {
  advanceSpring,
  canAnimateMascot,
  clampGaze,
  mascotTarget,
  type MascotPose,
  type SpringAxis,
} from "./mascotMotion.js";
import type { KnorviaRig } from "./KnorviaMark.js";
import { knorviaEyePath } from "./mascotArtwork.js";
import type { MascotMode } from "@/store/mascotPreferenceStore.js";

export function useKnorviaMotion(
  buttonRef: RefObject<HTMLButtonElement | null>,
  mode: MascotMode,
): KnorviaRig {
  const head = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const leftEye = useRef<SVGPathElement>(null);
  const rightEye = useRef<SVGPathElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;
    if (mode !== "animated") {
      button.dataset.motion = "paused";
      return;
    }
    const surface = button.closest("[data-knorvia-scope]");
    const doc = button.ownerDocument;
    const win = doc.defaultView;
    if (!win || !surface) return;
    const media = win.matchMedia("(prefers-reduced-motion: reduce)");
    const data = {
      gazeX: 0,
      gazeY: 0,
      focusGazeX: -0.6,
      focusGazeY: -0.6,
      focused: false,
      hovered: false,
      typingUntil: 0,
      lastInteraction: 0,
      reactionAt: -10,
      reaction: -1,
      nextBlink: 2.6 + Math.random(),
      blinkAt: -10,
    };
    const initial = mascotTarget({
      time: 0,
      gazeX: 0,
      gazeY: 0,
      focused: false,
      typing: false,
      hovered: false,
      resting: false,
      blink: 0,
      reactionAge: -1,
      reaction: 0,
    });
    const axes = Object.fromEntries(
      Object.entries(initial).map(([key, value]) => [key, { value, velocity: 0 }]),
    ) as Record<keyof MascotPose, SpringAxis>;
    let frame: number | null = null;
    let inView = false;
    let lastFrame = 0;
    let time = 0;
    let rect = button.getBoundingClientRect();
    const paint = (p: MascotPose) => {
      head.current?.setAttribute(
        "transform",
        `translate(${p.x} ${p.y}) translate(60 82) rotate(${p.tilt}) scale(${2 - p.stretch} ${p.stretch}) translate(-60 -82)`,
      );
      eyes.current?.setAttribute("transform", `translate(${p.eyeX} ${p.eyeY})`);
      leftEye.current?.setAttribute("d", knorviaEyePath(42, p.leftEye, p.smile));
      rightEye.current?.setAttribute("d", knorviaEyePath(78, p.rightEye, p.smile));
      shadow.current?.setAttribute("rx", String(34 + p.y * 0.45));
      shadow.current?.setAttribute("opacity", String(0.88 + p.y * 0.035));
    };
    const tick = (stamp: number) => {
      const dt = lastFrame ? Math.min((stamp - lastFrame) / 1000, 0.05) : 1 / 60;
      lastFrame = stamp;
      time += dt;
      if (time > data.nextBlink) {
        data.blinkAt = time;
        data.nextBlink = time + 3.6 + Math.random() * 3.1;
      }
      const blinkAge = time - data.blinkAt;
      const focused = data.focused && !data.hovered && time - data.reactionAt > 1.8;
      const target = mascotTarget({
        time,
        gazeX: focused ? data.focusGazeX : data.gazeX,
        gazeY: focused ? data.focusGazeY : data.gazeY,
        focused,
        hovered: data.hovered,
        typing: time < data.typingUntil,
        resting: !data.focused && !data.hovered && time - data.lastInteraction > 32,
        blink: blinkAge < 0.22 ? Math.sin((blinkAge / 0.22) * Math.PI) : 0,
        reactionAge: time - data.reactionAt,
        reaction: data.reaction,
      });
      const pose = { ...target };
      for (const key of Object.keys(axes) as (keyof MascotPose)[]) {
        advanceSpring(
          axes[key],
          target[key],
          dt,
          key.includes("Eye") ? 44 : key.startsWith("eye") || key === "smile" ? 20 : 12,
        );
        pose[key] = axes[key].value;
      }
      paint(pose);
      frame = win.requestAnimationFrame(tick);
    };
    const allowed = () =>
      canAnimateMascot(mode, media.matches, doc.visibilityState === "visible", inView);
    const sync = () => {
      const running = allowed();
      button.dataset.motion = running ? "running" : "paused";
      if (running && frame === null) {
        lastFrame = 0;
        rect = button.getBoundingClientRect();
        frame = win.requestAnimationFrame(tick);
      }
      if (!running) {
        if (frame !== null) win.cancelAnimationFrame(frame);
        frame = null;
        lastFrame = 0;
        paint(initial);
        // 重新显示时从静态姿态开始，避免恢复隐藏前的残留速度而突然跳动。
        for (const key of Object.keys(axes) as (keyof MascotPose)[]) {
          axes[key].value = initial[key];
          axes[key].velocity = 0;
        }
        data.gazeX = data.gazeY = 0;
        data.hovered = false;
        data.reactionAt = -10;
      }
    };
    const move = (event: PointerEvent) => {
      if (!allowed() || event.pointerType === "touch") return;
      data.gazeX = clampGaze((event.clientX - rect.left - rect.width / 2) / 240);
      data.gazeY = clampGaze((event.clientY - rect.top - rect.height / 2) / 180);
      data.lastInteraction = time;
    };
    const clear = () => {
      data.gazeX = data.gazeY = 0;
      data.hovered = false;
    };
    const enter = () => {
      data.hovered = true;
      data.lastInteraction = time;
    };
    const leave = () => {
      data.hovered = false;
    };
    const react = () => {
      if (allowed()) {
        data.reactionAt = time;
        data.reaction++;
        data.lastInteraction = time;
      }
    };
    const editorSelector =
      '[data-composer-surface] [contenteditable="true"], [data-composer-surface] textarea';
    let activeEditor: Element | null = null;
    const measure = () => {
      rect = button.getBoundingClientRect();
      if (!activeEditor) return;
      const editorRect = activeEditor.getBoundingClientRect();
      data.focusGazeX = clampGaze(
        (editorRect.left + editorRect.width / 2 - rect.left - rect.width / 2) / 240,
      );
      data.focusGazeY = clampGaze(
        (editorRect.top + editorRect.height / 2 - rect.top - rect.height / 2) / 180,
      );
    };
    const editorFocus = (event?: Event) => {
      // focusout 时 activeElement 可能尚未更新，使用 relatedTarget 防止离开输入框仍保持输入表情。
      const target =
        event?.type === "focusout" ? (event as FocusEvent).relatedTarget : doc.activeElement;
      const editor = target instanceof Element ? target.closest(editorSelector) : null;
      activeEditor = editor && surface.contains(editor) ? editor : null;
      data.focused = activeEditor !== null;
      measure();
      data.lastInteraction = time;
    };
    const typing = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest(editorSelector)) return;
      data.typingUntil = time + 0.9;
      data.lastInteraction = time;
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry?.isIntersecting ?? false;
      sync();
    });
    const resize = new ResizeObserver(measure);
    observer.observe(button);
    resize.observe(surface);
    doc.addEventListener("pointermove", move, { passive: true });
    doc.addEventListener("pointerleave", clear);
    doc.addEventListener("visibilitychange", sync);
    doc.addEventListener("scroll", measure, { passive: true, capture: true });
    win.addEventListener("blur", clear);
    media.addEventListener("change", sync);
    button.addEventListener("pointerenter", enter);
    button.addEventListener("pointerleave", leave);
    button.addEventListener("click", react);
    surface.addEventListener("focusin", editorFocus);
    surface.addEventListener("focusout", editorFocus);
    surface.addEventListener("input", typing);
    editorFocus();
    sync();
    return () => {
      if (frame !== null) win.cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      doc.removeEventListener("pointermove", move);
      doc.removeEventListener("pointerleave", clear);
      doc.removeEventListener("visibilitychange", sync);
      doc.removeEventListener("scroll", measure, true);
      win.removeEventListener("blur", clear);
      media.removeEventListener("change", sync);
      button.removeEventListener("pointerenter", enter);
      button.removeEventListener("pointerleave", leave);
      button.removeEventListener("click", react);
      surface.removeEventListener("focusin", editorFocus);
      surface.removeEventListener("focusout", editorFocus);
      surface.removeEventListener("input", typing);
      paint(initial);
    };
  }, [buttonRef, mode]);
  return { head, eyes, leftEye, rightEye, shadow };
}
