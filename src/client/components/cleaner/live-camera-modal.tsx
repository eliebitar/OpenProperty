import { useEffect, useRef, useState } from "react";
import {
  X,
  SwitchCamera,
  Camera,
  AlertTriangle,
  Upload,
  BedDouble,
  Bath,
  UtensilsCrossed,
  Sofa,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { compressCanvas } from "@/lib/photo-utils";
import type { ZoneConfig } from "@/lib/photo-utils";

interface Props {
  open: boolean;
  onClose: () => void;
  zone: ZoneConfig;
  onCapture: (dataUrl: string) => void;
}

export function LiveCameraModal({ open, onClose, zone, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [shutterFlash, setShutterFlash] = useState(false);

  // Stop camera tracks cleanly
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const startCamera = async (mode: "environment" | "user") => {
    stopStream();
    setCameraError(null);

    // Check if getUserMedia is supported
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("In-browser live camera is not supported on this browser. You can still use the system camera picker below.");
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err) {
      console.warn("Camera access failed or was denied:", err);
      setCameraError(
        "Camera permission was denied or camera is unavailable. You can use the device photo picker below."
      );
    }
  };

  useEffect(() => {
    if (open) {
      startCamera(facingMode);
    } else {
      stopStream();
    }
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facingMode]);

  const handleFlipCamera = () => {
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
  };

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    // Trigger visual shutter flash
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 200);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // If using front camera, mirror image for natural feeling
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const compressed = compressCanvas(canvas, 1280, 0.75);
    stopStream();
    onCapture(compressed);
    onClose();
  };

  const handleFallbackFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) {
        stopStream();
        onCapture(dataUrl);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black text-white select-none">
      {/* Hidden file input for direct fallback */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileFallbackRef}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFallbackFile(file);
          e.target.value = "";
        }}
      />

      {/* Top Controls Header */}
      <header className="flex h-16 shrink-0 items-center justify-between px-4 bg-zinc-950/80 backdrop-blur-md z-10 border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-400">
            {zone.iconName === "bed" && <BedDouble className="size-5" />}
            {zone.iconName === "bath" && <Bath className="size-5" />}
            {zone.iconName === "kitchen" && <UtensilsCrossed className="size-5" />}
            {zone.iconName === "living" && <Sofa className="size-5" />}
            {zone.iconName === "lockbox" && <KeyRound className="size-5" />}
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-sm truncate text-white">
              {zone.label}
            </h3>
            <p className="text-[11px] text-zinc-400 truncate">
              {zone.tips}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cameraActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleFlipCamera}
              className="h-10 w-10 p-0 rounded-full text-zinc-300 hover:text-white hover:bg-white/10"
              title="Flip Camera"
            >
              <SwitchCamera className="size-5" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="h-10 w-10 p-0 rounded-full text-zinc-300 hover:text-white hover:bg-white/10"
          >
            <X className="size-5" />
          </Button>
        </div>
      </header>

      {/* Main Viewfinder */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
        {/* Shutter flash animation */}
        {shutterFlash && (
          <div className="absolute inset-0 bg-white z-20 transition-opacity duration-150" />
        )}

        {/* Live video */}
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            cameraActive ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Viewfinder crosshairs / target frame guide */}
        {cameraActive && (
          <div className="pointer-events-none absolute inset-8 sm:inset-16 border-2 border-white/30 rounded-2xl flex flex-col justify-between p-3">
            <div className="flex justify-between">
              <span className="border-t-2 border-l-2 border-teal-400 size-4 -mt-3.5 -ml-3.5 rounded-tl-sm" />
              <span className="border-t-2 border-r-2 border-teal-400 size-4 -mt-3.5 -mr-3.5 rounded-tr-sm" />
            </div>
            <div className="text-center">
              <span className="text-[11px] font-semibold tracking-wider text-white/80 bg-black/60 px-3 py-1 rounded-full backdrop-blur-xs">
                Position {zone.shortLabel} in frame
              </span>
            </div>
            <div className="flex justify-between">
              <span className="border-b-2 border-l-2 border-teal-400 size-4 -mb-3.5 -ml-3.5 rounded-bl-sm" />
              <span className="border-b-2 border-r-2 border-teal-400 size-4 -mb-3.5 -mr-3.5 rounded-br-sm" />
            </div>
          </div>
        )}

        {/* Fallback state when camera is blocked or not available */}
        {cameraError && (
          <div className="max-w-md p-6 mx-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center space-y-4">
            <div className="size-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="size-6" />
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-base text-white">Camera Access Notice</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">{cameraError}</p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => fileFallbackRef.current?.click()}
                className="h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm gap-2"
              >
                <Camera className="size-4" />
                <span>Open Device Camera / Photos</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  stopStream();
                  onClose();
                }}
                className="h-10 text-xs text-zinc-400 hover:text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Shutter Action Bar */}
      <footer className="h-28 shrink-0 flex items-center justify-around px-6 bg-zinc-950/90 border-t border-white/10 z-10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileFallbackRef.current?.click()}
          className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white h-auto py-2 text-[11px] font-medium"
        >
          <Upload className="size-5" />
          <span>Upload File</span>
        </Button>

        {/* Big tactile Shutter Button */}
        <button
          type="button"
          disabled={!cameraActive}
          onClick={handleTakeSnapshot}
          className="size-18 sm:size-20 rounded-full border-4 border-white flex items-center justify-center bg-transparent active:scale-95 transition-transform disabled:opacity-30 cursor-pointer p-1"
          title="Take Photo"
        >
          <div className="size-full rounded-full bg-white hover:bg-zinc-200 transition-colors" />
        </button>

        <div className="w-16 flex justify-center">
          {cameraActive && (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="flex flex-col items-center gap-1 text-zinc-400 hover:text-white text-[11px] font-medium cursor-pointer"
            >
              <SwitchCamera className="size-5" />
              <span>Flip</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
