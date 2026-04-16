import { toBlob } from "html-to-image";
import { jsPDF } from "jspdf";

type CaptureOptions = {
  selector?: string;
  pixelRatio?: number;
};

const DEFAULT_SELECTOR = "[data-map-page]";

function getTargetElement(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Export target not found for selector: ${selector}`);
  }
  return el;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read PNG blob"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode exported image"));
    img.src = src;
  });
}

/**
 * Strip interactive-only UI chrome from a cloned DOM tree so the export
 * looks like clean, presentation-ready content:
 *
 *  - Empty slot placeholders (dashed "+" boxes)    → invisible, keep as spacers
 *  - Add-row / add-stage + buttons                 → fully hidden
 *  - Selected card rings / row highlight / stage   → reset to idle appearance
 */
function cleanCloneForExport(root: HTMLElement): void {
  // 1. Hide empty-slot placeholder boxes while keeping their layout space so
  //    columns stay aligned with their stage headers.
  root.querySelectorAll<HTMLElement>("[data-empty-slot]").forEach((el) => {
    el.style.visibility = "hidden";
    el.style.border = "none";
  });

  // 2. Remove the interactive + buttons (add row / add stage).
  root.querySelectorAll<HTMLElement>("[data-add-ctrl]").forEach((el) => {
    el.style.display = "none";
  });

  // 3. Reset selected card face: clear ring (which is box-shadow in Tailwind)
  //    and restore a neutral idle border so the card looks unselected.
  root.querySelectorAll<HTMLElement>("[data-card-sel]").forEach((el) => {
    el.style.boxShadow =
      "0 1px 3px 0 rgb(0 0 0 / 0.07), 0 1px 2px -1px rgb(0 0 0 / 0.05)";
    el.style.outline = "none";
    el.style.borderColor = "rgba(0,0,0,0.08)";
  });

  // 4. Reset row-shell selection (background tint + ring).
  root.querySelectorAll<HTMLElement>("[data-row-sel]").forEach((el) => {
    el.style.backgroundColor = "transparent";
    el.style.boxShadow = "none";
    el.style.outline = "none";
  });

  // 5. Reset selected stage header: dark-filled → idle white.
  root.querySelectorAll<HTMLElement>("[data-stage-sel]").forEach((el) => {
    el.style.backgroundColor = "#ffffff";
    el.style.borderColor = "rgba(0,0,0,0.08)";
    // Restore step number (muted) and title (dark) text colours.
    const step = el.querySelector<HTMLElement>("[data-stage-step]");
    const title = el.querySelector<HTMLElement>("[data-stage-title]");
    if (step) step.style.color = "rgba(0,0,0,0.35)";
    if (title) title.style.color = "#111827";
  });
}

function createCloneContainer(target: HTMLElement): {
  clone: HTMLElement;
  cleanup: () => void;
} {
  const clone = target.cloneNode(true) as HTMLElement;

  // Clean interactive chrome before rendering.
  cleanCloneForExport(clone);

  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.zIndex = "-1";
  wrapper.style.pointerEvents = "none";
  wrapper.style.opacity = "1";
  wrapper.style.background = "transparent";
  wrapper.style.width = `${target.scrollWidth}px`;
  wrapper.style.height = `${target.scrollHeight}px`;

  clone.style.transform = "none";
  clone.style.width = `${target.scrollWidth}px`;
  clone.style.height = `${target.scrollHeight}px`;
  clone.style.maxWidth = "none";

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  return {
    clone,
    cleanup: () => {
      wrapper.remove();
    },
  };
}

export async function captureBoardPngBlob(
  opts: CaptureOptions = {}
): Promise<Blob> {
  const selector = opts.selector ?? DEFAULT_SELECTOR;
  const pixelRatio = opts.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1);
  const target = getTargetElement(selector);
  const { clone, cleanup } = createCloneContainer(target);
  try {
    const blob = await toBlob(clone, {
      cacheBust: true,
      backgroundColor: "#ffffff",
      pixelRatio,
      width: Math.max(1, target.scrollWidth),
      height: Math.max(1, target.scrollHeight),
      style: {
        transform: "none",
      },
    });
    if (!blob) throw new Error("Failed to render PNG");
    return blob;
  } finally {
    cleanup();
  }
}

export async function captureBoardPdfBlob(
  opts: CaptureOptions = {}
): Promise<Blob> {
  const png = await captureBoardPngBlob(opts);
  const dataUrl = await blobToDataUrl(png);
  const image = await loadImage(dataUrl);
  const widthPt = Math.max(1, Math.round(image.width * 0.75));
  const heightPt = Math.max(1, Math.round(image.height * 0.75));
  const pdf = new jsPDF({
    orientation: widthPt >= heightPt ? "landscape" : "portrait",
    unit: "pt",
    format: [widthPt, heightPt],
    compress: true,
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, widthPt, heightPt, undefined, "FAST");
  return pdf.output("blob");
}
