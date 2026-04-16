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

function createCloneContainer(target: HTMLElement): {
  clone: HTMLElement;
  cleanup: () => void;
} {
  const clone = target.cloneNode(true) as HTMLElement;
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
