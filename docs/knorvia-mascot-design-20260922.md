# Knorvia 形象草案 03

2026-09-22。用户已确认草案 03（“可以了”），形象定为无手、无顶部圆点、饱满头部、主区右下角。正式集成与交付记录见本文后续验收更新；保留设计预览供复核。

## 预览

桌面文件：`%USERPROFILE%/Desktop/Knorvia-形象与动效预览.html`。自包含、离线运行，无外部请求、不持久化输入、不发送消息。

形象由 `KnorviaMark.tsx` 与 `mascotArtwork.ts` 原创 SVG 绘制。按最新反馈去掉悬浮圆点和双手，增加头部高度，使用接近等宽高、略不对称的圆润轮廓，保留发光白眼睛。静态内核图标和右下角小助手共用图形。动作由 `useKnorviaMotion.ts` 驱动：呼吸、眨眼、视线跟随、输入专注、悬停靠近、点击点头／眯眼／歪头和空闲休息。眼睛连续变形，切换姿态保留速度，系统减少动态优先。

复现预览：`node scripts/preview-knorvia-mascot.mjs <output.html>`。预览直接打包应用组件，不另写一套绘图和动画。可切换主布局和放大细节，查看 20／32／48px 的静态图标，也可暂停动效、切换亮暗背景。

当前源码已将单个小助手接入 `WorkspaceShellLayout` 主区右下角，移除输入卡中的挂载；底部预留无边框空间，防止覆盖发送按钮、工作流小地图或终端。聊天输入事件只控制表情，不读取文字。Agent 图标与外观设置同步共用该形象。

## 验证记录

- 9 项针对性测试通过：30/60/120Hz 连续积分一致性、打断动作、长帧限幅、视线边界、反应结束、眨眼阶段连续性、动画可见性条件、偏好持久化和保存失败。
- 根 typecheck、desktop renderer 类型检查通过；lint 0 errors / 29 既有 warnings；architecture 0 violations。
- 实际 Electron 预览已观察白色界面、主区右下角位置、无手轮廓、放大形象与 20／32／48px 小尺寸图标。点击、静态／动态和亮暗背景由同一预览控制；未测量真实帧率，不宣称与 Grok Bot 完全相同。
- 正式聊天界面本轮还未打包验证；便携版及其 data 未更新。本次不是后端接入或最终发布。

## 参考与实现归属

- [官方角色状态设计](https://x.ai/news/designing-grok-bot)
- [官方动作调校过程](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot)
- 本机 `D:/tools/_grokbot_ref` 是重建参考，读到 SVG 与代码控制的角色。仅参考动作方法，本次没有复制其角色几何、配色表或实现。
- 应用内角色最终采用纯代码草案，以下 imagegen 输出均仅为未采用的探索图片。调用模式是内置 image_gen，不是 CLI/API fallback。

## 生成记录与提示词

### 初版机器人参考（未采用）

文件：`%USERPROFILE%/.codex/generated_images/01a0c23e-a6f5-7332-bce0-8c5a7bc1592a/exec-ff61284d-f3f1-400e-a4cf-2b251fada0be.png`

```text
Use case: stylized-concept.
Asset type: Knorvia in-app character icon, production transparent PNG.
Input image 1 is the identity reference: preserve its rounded black robot head, two large plain luminous white circular eyes and one small floating black spherical antenna.
Refine this exact character into a beautifully finished, tactile satin-black 3D icon, front view, soft charcoal upper-left highlights, subtle cool rim highlight, extremely restrained fine surface grain. Friendly and calm, no mouth, no nose, no pupils, no eyebrows. Keep its simplicity and familiar proportions. Head is a softly rounded slightly horizontal squircle, with the two eyes clearly readable at small sizes.
Composition: one character alone, square canvas, head fills about 78% of canvas width, floating ball centered just above the head with a visible narrow gap. Tight but comfortable transparent margin. No paws for this icon.
Background must be genuinely transparent alpha, including the gap under the floating ball. Remove the white background and dot grid completely. No ground plane, no cast shadow onto a background, no text, no letter, no border, no frame, no tile, no checkerboard printed into image.
Output one final transparent PNG character asset, not a presentation sheet or app mockup.
```

### 无五官图层研究（未采用）

文件：`%USERPROFILE%/.codex/generated_images/01a0c23e-a6f5-7332-bce0-8c5a7bc1592a/exec-e2f3a635-f942-4a44-9864-178015d99a8e.png`

```text
Use case: precise-object-edit.
Asset type: animation-ready body layer for the same Knorvia mascot.
Input image is the edit target. Keep the rounded black head silhouette, exact head position and scale, satin tactile texture, soft highlight and subtle rim lighting completely unchanged.
Change only these: remove both white eyes and all their glow, filling those two circular regions seamlessly with the same dark smooth face surface; remove the small floating sphere above the head entirely.
The result must be ONLY the blank rounded black head, with no eyes, no antenna, no features and no paws. Preserve the original full square canvas dimensions and exact head placement (do not recenter or enlarge it). All background and former sphere area fully transparent alpha. No ground shadow, no border, no checkerboard, no text. This is a technical layer to put procedural animated eyes on in an application.
```

### K 应用图标候选（未采用，等待形象确定）

文件：`%USERPROFILE%/.codex/generated_images/01a0c23e-a6f5-7332-bce0-8c5a7bc1592a/exec-ddee25b7-56d3-405c-be3c-5d48cd01c570.png`

```text
Use case: precise-object-edit.
Asset type: Knorvia Studio desktop application icon, transparent PNG.
Input image is the edit target. Preserve the existing large white sculpted ribbon letter K, white rounded tile, its angle, sculpted texture, and delicate mint-cyan/lavender illumination. Preserve the full composition and the robot's two little hands holding onto the upper edge.
Change only the small black robot: completely REMOVE its top antenna stalk AND the round ball above it. Redesign the remaining head as a slightly lower, wider, softer rounded charcoal-black squircle / friendly pebble, clean satin 3D surface, subtle upper-left soft highlight and very delicate cool edge lighting. Keep exactly two simple luminous white eyes, softly rounded and expressive; no mouth, no nose, no pupils, no new antenna or floating symbols above the head. Give the head a very subtle curious tilt as it peeks over the K tile.
Keep the small three cyan/white/lavender excitement strokes to the right, clean and restrained. Ensure the robot and hands fit the existing icon naturally.
Transparent alpha background everywhere outside the cutout subject and the excitement strokes. No dark background, no extra border, no enclosing square, no floor shadow. The white K tile is part of the foreground icon and must remain. Clean alpha edge without white jagged fringe. Comfortable small transparent padding on every side. One finished square application icon, no text or presentation board.
```
