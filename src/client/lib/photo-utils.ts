import type { InspectionPhoto, InspectionZone } from "@/types";

export interface ZoneConfig {
  id: InspectionZone;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
  required: boolean;
  tips: string;
}

export const INSPECTION_ZONES: ZoneConfig[] = [
  {
    id: "bedroom",
    label: "Bedrooms & Fresh Linens",
    shortLabel: "Bedrooms",
    icon: "🛏️",
    description: "Beds neatly made with fresh sheets, duvet & fluffed pillows",
    required: true,
    tips: "Capture a clear wide angle showing the fully made bed.",
  },
  {
    id: "bathroom",
    label: "Bathroom & Shower",
    shortLabel: "Bathroom",
    icon: "🚿",
    description: "Sanitized sink, toilet, shower/tub & clean folded towels",
    required: true,
    tips: "Show clean mirrors, sanitized toilet, and stocked toiletries.",
  },
  {
    id: "kitchen",
    label: "Kitchen & Dining",
    shortLabel: "Kitchen",
    icon: "🍳",
    description: "Wiped counters, clean sink, and empty microwave/fridge",
    required: false,
    tips: "Show clean stovetop, dry sink, and cleared trash.",
  },
  {
    id: "living_room",
    label: "Living Room / Main Area",
    shortLabel: "Living Area",
    icon: "🛋️",
    description: "Tidy furniture, vacuumed/mopped floors & welcoming setup",
    required: false,
    tips: "Capture the overall room feeling staged and ready for guests.",
  },
  {
    id: "lockbox",
    label: "Lockbox / Door Locked",
    shortLabel: "Lockbox",
    icon: "🔑",
    description: "Key safely returned inside lockbox & exterior door secured",
    required: false,
    tips: "Confirm keys are locked inside and lockbox closed.",
  },
];

/**
 * Compress an image file to a lightweight data URL using an offscreen HTML5 canvas.
 * Reduces 4-8 MB mobile camera photos down to ~70-120 KB without noticeable visual loss.
 */
export async function compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image into memory"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        // Draw image smoothly
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Safely parse inspection photos from a CleaningTask.
 */
export function parseInspectionPhotos(raw: unknown): InspectionPhoto[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as InspectionPhoto[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as InspectionPhoto[];
    } catch {
      /* ignore */
    }
  }
  return [];
}
