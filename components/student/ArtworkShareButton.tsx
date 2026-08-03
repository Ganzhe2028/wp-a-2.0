"use client";
/* eslint-disable @next/next/no-img-element -- the generated local Blob URL must remain directly saveable */

import { useEffect, useState } from "react";
import ViewportDialog from "@/components/student/ViewportDialog";
import { describeApiError, studentApi, type Section } from "@/components/student/api";
import { DAY1_TEMPLATE, DAY3_TEMPLATE } from "@/lib/domain/submission-templates";

interface ArtworkSlot {
  slotKey: string;
  imageUrl?: string;
  originalUrl?: string;
  url?: string;
  crop?: { x: number; y: number; scale: number };
}

interface ArtworkBottle {
  bottleKey: string;
  level: number | null;
  isConfirmed?: boolean;
}

interface HomeIdentityResponse { identity: { displayTitle: string } }

interface Day1MosaicTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LoadedPosterImage {
  image: HTMLImageElement;
  objectUrl: string;
}

const POSTER_WIDTH = 900;
const POSTER_PADDING = 48;
const POSTER_ORANGE = "#ff530f";
const POSTER_BLACK = "#0b0b0a";
const POSTER_PAPER = "#f7f7f7";
const DAY1_POSTER_HEIGHT = 1130;
const POSTER_IMAGE_ATTEMPTS = 3;
const POSTER_IMAGE_TIMEOUT_MS = 15_000;
const POSTER_IMAGE_CONCURRENCY = 4;

// Fixed 15-tile composition approved for the Day 1 social share poster.
// The order intentionally follows DAY1_TEMPLATE.slots so labels and images
// remain coupled even when the visible copy changes.
const DAY1_MOSAIC_LAYOUT: readonly Day1MosaicTile[] = [
  { x: 520, y: 455, width: 220, height: 245 }, // 头像
  { x: 280, y: 210, width: 115, height: 115 }, // 喜欢的食物
  { x: 520, y: 210, width: 220, height: 220 }, // 喜欢的音乐
  { x: 400, y: 890, width: 115, height: 115 }, // 最喜欢的动物
  { x: 285, y: 625, width: 225, height: 240 }, // 我的颜色
  { x: 155, y: 625, width: 115, height: 115 }, // 最近天气
  { x: 400, y: 480, width: 115, height: 115 }, // 此刻心情
  { x: 520, y: 725, width: 115, height: 115 }, // 想去的地方
  { x: 40, y: 475, width: 115, height: 115 }, // 最近在读
  { x: 155, y: 350, width: 230, height: 250 }, // 一件重要的东西
  { x: 155, y: 210, width: 115, height: 115 }, // 最喜欢的电影
  { x: 40, y: 350, width: 115, height: 115 }, // 我的日常
  { x: 400, y: 350, width: 115, height: 115 }, // 最近在学
  { x: 745, y: 475, width: 115, height: 115 }, // 一张旧照片
  { x: 745, y: 350, width: 115, height: 115 }, // 今天的我
];

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function drawFittedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, startSize: number, minimumSize = 34) {
  let size = startSize;
  while (size > minimumSize) {
    context.font = `900 ${size}px Arial, "PingFang SC", sans-serif`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  context.font = `900 ${size}px Arial, "PingFang SC", sans-serif`;
  context.fillText(text, x, y, maxWidth);
}

function drawWrappedText(context: CanvasRenderingContext2D, text: string, centerX: number, y: number, maxWidth: number, lineHeight: number, maxLines = 2) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  const consumed = lines.join("").length;
  if (consumed < characters.length && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].slice(0, -1)}…`;
  lines.forEach((value, index) => context.fillText(value, centerX, y + index * lineHeight, maxWidth));
}

function drawHeader(context: CanvasRenderingContext2D, height: number, section: Section, displayTitle: string) {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, POSTER_WIDTH, height);
  context.fillStyle = POSTER_ORANGE;
  context.fillRect(0, 0, POSTER_WIDTH, 22);
  context.fillStyle = POSTER_ORANGE;
  context.font = '900 25px Arial, "PingFang SC", sans-serif';
  context.fillText("O—WEEK / 26", POSTER_PADDING, 72);
  context.fillStyle = POSTER_BLACK;
  context.font = '900 50px Arial, "PingFang SC", sans-serif';
  context.fillText(section === "DAY1" ? "DAY 1 · IT’S ME" : "DAY 3 · LITTLE BOTTLES", POSTER_PADDING, 142);
  drawFittedText(context, displayTitle, POSTER_PADDING, 232, POSTER_WIDTH - POSTER_PADDING * 2, 72);
}

function drawFooter(context: CanvasRenderingContext2D, y: number) {
  context.fillStyle = POSTER_BLACK;
  context.fillRect(0, y, POSTER_WIDTH, 112);
  context.fillStyle = "#fff";
  context.font = '900 24px Arial, "PingFang SC", sans-serif';
  context.fillText("MSOWEEK.SITE", POSTER_PADDING, y + 48);
  context.fillStyle = POSTER_ORANGE;
  context.font = '700 19px Arial, "PingFang SC", sans-serif';
  context.fillText("O—WEEK DIGITAL EXHIBITION", POSTER_PADDING, y + 80);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function decodePosterImage(blob: Blob): Promise<LoadedPosterImage> {
  const objectUrl = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = "async";
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      image.src = "";
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_DECODE_TIMEOUT"));
    }, POSTER_IMAGE_TIMEOUT_MS);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve({ image, objectUrl });
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      image.src = "";
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_DECODE_FAILED"));
    };
    image.src = objectUrl;
  });
}

async function fetchPosterImage(source: string, attempt: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), POSTER_IMAGE_TIMEOUT_MS);
  try {
    const suffix = attempt === 0 ? "" : `${source.includes("?") ? "&" : "?"}ow_share_retry=${attempt}`;
    const response = await fetch(`${source}${suffix}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`IMAGE_FETCH_FAILED_${response.status}`);
    const blob = await response.blob();
    if (!blob.size || (blob.type && !blob.type.startsWith("image/"))) throw new Error("INVALID_IMAGE_RESPONSE");
    return await decodePosterImage(blob);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function loadPosterImage(sources: string[]): Promise<LoadedPosterImage> {
  let lastError: unknown;
  for (let attempt = 0; attempt < POSTER_IMAGE_ATTEMPTS; attempt += 1) {
    for (const source of sources) {
      try {
        return await fetchPosterImage(source, attempt);
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt + 1 < POSTER_IMAGE_ATTEMPTS) await delay(450 * (attempt + 1));
  }
  throw lastError;
}

async function preloadDay1Images(items: Array<{ slotKey: string; sources: string[] }>) {
  const loaded = new Map<string, LoadedPosterImage>();
  const failedSlotKeys: string[] = [];
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      try {
        loaded.set(item.slotKey, await loadPosterImage(item.sources));
      } catch {
        failedSlotKeys.push(item.slotKey);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(POSTER_IMAGE_CONCURRENCY, items.length) }, () => worker()));
  if (failedSlotKeys.length) {
    loaded.forEach(({ image, objectUrl }) => {
      image.src = "";
      URL.revokeObjectURL(objectUrl);
    });
    throw new Error(`有 ${failedSlotKeys.length} 张图片暂时无法载入，分享图未生成。请检查网络后重试。`);
  }
  return loaded;
}

function drawCroppedImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, crop = { x: .5, y: .5, scale: 1 }) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight) * Math.min(3, Math.max(1, crop.scale));
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const offsetX = (crop.x - .5) * width * .36;
  const offsetY = (crop.y - .5) * height * .36;
  context.drawImage(image, x + (width - drawnWidth) / 2 + offsetX, y + (height - drawnHeight) / 2 + offsetY, drawnWidth, drawnHeight);
}

async function drawDay1Poster(displayTitle: string, slots: ArtworkSlot[]) {
  if (DAY1_TEMPLATE.slots.length !== DAY1_MOSAIC_LAYOUT.length) {
    throw new Error("Day 1 分享模板与当前作品模板不一致");
  }
  const slotByKey = new Map(slots.map((slot) => [slot.slotKey, slot]));
  const posterItems = DAY1_TEMPLATE.slots.map((config) => {
    const slot = slotByKey.get(config.slotKey);
    return {
      slotKey: config.slotKey,
      sources: Array.from(new Set([slot?.imageUrl, slot?.url, slot?.originalUrl].filter((source): source is string => Boolean(source)))),
    };
  });
  const missingCount = posterItems.filter((item) => !item.sources.length).length;
  if (missingCount) {
    throw new Error(`作品中有 ${missingCount} 张图片尚未准备好，请等待图片处理完成后重试。`);
  }
  const loadedImages = await preloadDay1Images(posterItems);
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = DAY1_POSTER_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    loadedImages.forEach(({ image, objectUrl }) => {
      image.src = "";
      URL.revokeObjectURL(objectUrl);
    });
    throw new Error("当前浏览器无法生成长图");
  }
  try {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    roundedRect(context, 318, 38, 264, 110, 4);
    context.fillStyle = POSTER_BLACK;
    context.fill();
    context.fillStyle = "#fff";
    context.font = 'italic 900 56px Arial, "PingFang SC", sans-serif';
    context.textAlign = "center";
    context.fillText("It's me", POSTER_WIDTH / 2, 112);
    context.fillStyle = POSTER_ORANGE;
    drawFittedText(context, displayTitle, POSTER_WIDTH / 2, 184, 420, 32, 20);
    context.textAlign = "left";

    for (let index = 0; index < DAY1_TEMPLATE.slots.length; index += 1) {
      const config = DAY1_TEMPLATE.slots[index];
      const item = DAY1_MOSAIC_LAYOUT[index];
      const radius = item.width >= 200 ? 8 : 5;
      roundedRect(context, item.x, item.y, item.width, item.height, radius);
      context.save();
      context.clip();
      context.fillStyle = POSTER_PAPER;
      context.fillRect(item.x, item.y, item.width, item.height);
      const value = slotByKey.get(config.slotKey);
      const loaded = loadedImages.get(config.slotKey);
      if (!loaded) throw new Error("Day 1 分享图片预加载结果不完整");
      drawCroppedImage(context, loaded.image, item.x, item.y, item.width, item.height, value?.crop);
      const labelHeight = item.width >= 200 ? 58 : 48;
      context.fillStyle = "rgba(11,11,10,.86)";
      context.fillRect(item.x, item.y + item.height - labelHeight, item.width, labelHeight);
      context.fillStyle = "#fff";
      context.font = `800 ${item.width >= 200 ? 20 : 15}px Arial, "PingFang SC", sans-serif`;
      context.textAlign = "center";
      drawWrappedText(context, config.label, item.x + item.width / 2, item.y + item.height - labelHeight + (item.width >= 200 ? 25 : 19), item.width - 14, item.width >= 200 ? 22 : 16);
      context.restore();
      context.strokeStyle = POSTER_BLACK;
      context.lineWidth = 3;
      roundedRect(context, item.x, item.y, item.width, item.height, radius);
      context.stroke();
    }
    context.textAlign = "center";
    context.fillStyle = POSTER_BLACK;
    context.font = '900 19px Arial, "PingFang SC", sans-serif';
    context.fillText("O—WEEK / 26  ·  MSOWEEK.SITE", POSTER_WIDTH / 2, 1090);
    context.fillStyle = POSTER_ORANGE;
    context.fillRect(385, 1104, 130, 5);
    context.textAlign = "left";
    return canvas;
  } finally {
    loadedImages.forEach(({ image, objectUrl }) => {
      image.src = "";
      URL.revokeObjectURL(objectUrl);
    });
  }
}

function drawBottle(context: CanvasRenderingContext2D, centerX: number, y: number, level: number) {
  const width = 62;
  const height = 108;
  const x = centerX - width / 2;
  context.fillStyle = "#fff";
  roundedRect(context, x, y + 18, width, height, 16);
  context.fill();
  context.save();
  roundedRect(context, x, y + 18, width, height, 16);
  context.clip();
  const liquidHeight = Math.max(0, Math.min(5, level)) / 5 * (height - 8);
  context.fillStyle = POSTER_ORANGE;
  context.fillRect(x + 3, y + 18 + height - liquidHeight - 3, width - 6, liquidHeight);
  context.restore();
  context.strokeStyle = POSTER_BLACK;
  context.lineWidth = 3;
  roundedRect(context, x, y + 18, width, height, 16);
  context.stroke();
  context.fillStyle = "#fff";
  context.fillRect(centerX - 18, y, 36, 21);
  context.strokeRect(centerX - 18, y, 36, 21);
}

async function drawDay3Poster(displayTitle: string, bottles: ArtworkBottle[]) {
  const headerHeight = 286;
  const footerHeight = 112;
  const groupHeaderHeight = 132;
  const bottleRowHeight = 190;
  const columns = 4;
  const groups = Array.from(new Map(DAY3_TEMPLATE.bottles.map((bottle) => [bottle.group, { title: bottle.group, subtitle: bottle.groupSubtitle }])).values());
  const rowsPerGroup = groups.map((group) => Math.ceil(DAY3_TEMPLATE.bottles.filter((bottle) => bottle.group === group.title).length / columns));
  const contentHeight = groups.reduce((total, _group, index) => total + groupHeaderHeight + rowsPerGroup[index] * bottleRowHeight, 0) + POSTER_PADDING;
  const canvas = document.createElement("canvas");
  canvas.width = POSTER_WIDTH;
  canvas.height = headerHeight + contentHeight + footerHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成长图");
  drawHeader(context, canvas.height, "DAY3", displayTitle);
  const valueByKey = new Map(bottles.map((bottle) => [bottle.bottleKey, bottle]));
  const columnWidth = (POSTER_WIDTH - POSTER_PADDING * 2) / columns;
  let y = headerHeight;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    context.fillStyle = groupIndex % 2 === 0 ? POSTER_PAPER : "#fff";
    const configs = DAY3_TEMPLATE.bottles.filter((bottle) => bottle.group === group.title);
    const sectionHeight = groupHeaderHeight + rowsPerGroup[groupIndex] * bottleRowHeight;
    context.fillRect(0, y, POSTER_WIDTH, sectionHeight);
    context.fillStyle = POSTER_ORANGE;
    context.font = '900 20px Arial, "PingFang SC", sans-serif';
    context.fillText(`THEME ${String(groupIndex + 1).padStart(2, "0")}`, POSTER_PADDING, y + 38);
    context.fillStyle = POSTER_BLACK;
    context.font = '900 35px Arial, "PingFang SC", sans-serif';
    context.fillText(group.title, POSTER_PADDING, y + 82);
    context.fillStyle = "#77736b";
    context.font = '600 19px Arial, "PingFang SC", sans-serif';
    context.fillText(group.subtitle, POSTER_PADDING, y + 112, POSTER_WIDTH - POSTER_PADDING * 2);
    configs.forEach((config, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const centerX = POSTER_PADDING + columnWidth * column + columnWidth / 2;
      const itemY = y + groupHeaderHeight + row * bottleRowHeight;
      const value = valueByKey.get(config.bottleKey);
      drawBottle(context, centerX, itemY + 2, value?.isConfirmed && value.level !== null ? value.level : 0);
      context.fillStyle = POSTER_BLACK;
      context.font = '700 18px Arial, "PingFang SC", sans-serif';
      context.textAlign = "center";
      drawWrappedText(context, config.label, centerX, itemY + 150, columnWidth - 18, 22);
      context.textAlign = "left";
    });
    y += sectionHeight;
  }
  drawFooter(context, canvas.height - footerHeight);
  return canvas;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("长图生成失败，请释放一些手机内存后重试")), "image/jpeg", .9);
  });
}

export default function ArtworkShareButton({ section, slots = [], bottles = [] }: { section: Section; slots?: ArtworkSlot[]; bottles?: ArtworkBottle[] }) {
  const [generating, setGenerating] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; filename: string; file: File } | null>(null);
  const canSystemShare = Boolean(preview && typeof navigator !== "undefined" && typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [preview.file] }));

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      await document.fonts?.ready;
      const home = await studentApi<HomeIdentityResponse>("/api/v1/home");
      const canvas = section === "DAY1"
        ? await drawDay1Poster(home.identity.displayTitle, slots)
        : await drawDay3Poster(home.identity.displayTitle, bottles);
      const blob = await canvasBlob(canvas);
      canvas.width = 1;
      canvas.height = 1;
      const filename = `oweek-${section.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.jpg`;
      const file = new File([blob], filename, { type: blob.type });
      setPreview({ url: URL.createObjectURL(blob), filename, file });
    } catch (caught) {
      setError(caught instanceof Error && !("status" in caught) ? caught.message : describeApiError(caught));
    } finally {
      setGenerating(false);
    }
  }

  async function shareGenerated() {
    if (!preview || !navigator.share || !navigator.canShare?.({ files: [preview.file] })) return;
    setSharing(true);
    setError("");
    try {
      await navigator.share({ title: `O—WEEK ${section.replace("DAY", "DAY ")}`, files: [preview.file] });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("系统分享暂时不可用，请长按图片保存或使用下载按钮");
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <button type="button" disabled={generating} onClick={() => void generate()} className="ow-btn ow-btn-outline">
        {generating ? "正在生成长图…" : "截图分享"}
      </button>
      {error && <p className="col-span-2 mt-2 text-sm font-bold text-red-700" role="alert">{error}</p>}
      {preview && <ViewportDialog close={closePreview}><div className="ow-modal student-dialog" role="dialog" aria-modal="true" aria-labelledby="share-preview-title"><p className="ow-kicker">SHARE POSTER</p><h2 id="share-preview-title" className="ow-heading mt-2">{section === "DAY1" ? "拼贴分享图已生成" : "长图已生成"}</h2><p className="ow-muted mt-3">在 iPhone 或微信中长按下方图片，选择“保存到照片”；也可以使用系统分享或下载图片。</p><div className="mt-5 max-h-[58svh] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--paper)]"><img src={preview.url} alt={`${section.replace("DAY", "Day ")} 完整作品${section === "DAY1" ? "拼贴图" : "长图"}`} className="block h-auto w-full" /></div>{canSystemShare && <button type="button" disabled={sharing} onClick={() => void shareGenerated()} className="ow-btn mt-5">{sharing ? "正在打开分享…" : "系统分享"}</button>}<a href={preview.url} download={preview.filename} className={`ow-btn ${canSystemShare ? "ow-btn-outline mt-3" : "mt-5"}`}>下载图片</a><button type="button" onClick={closePreview} className="mt-3 min-h-11 w-full font-bold">关闭</button></div></ViewportDialog>}
    </>
  );
}
