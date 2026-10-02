import { useState, useRef, useCallback } from "react";
import {
  Camera,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Loader2,
  Upload,
  Info,
  BedDouble,
  Bath,
  UtensilsCrossed,
  Sofa,
  KeyRound,
  ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  INSPECTION_ZONES,
  compressImage,
  parseInspectionPhotos,
  type ZoneConfig,
} from "@/lib/photo-utils";
import { LiveCameraModal } from "./live-camera-modal";
import type { CleaningTask, InspectionPhoto, InspectionZone } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: CleaningTask;
  onComplete: (photos: InspectionPhoto[], notes?: string) => Promise<void>;
  onSaveDraftOnly?: (photos: InspectionPhoto[]) => Promise<void>;
}

export function PhotoInspectionModal({
  open,
  onOpenChange,
  task,
  onComplete,
  onSaveDraftOnly,
}: Props) {
  const [photos, setPhotos] = useState<InspectionPhoto[]>(() =>
    parseInspectionPhotos(task.inspection_photos)
  );
  const [compressingZone, setCompressingZone] = useState<InspectionZone | null>(null);
  const [activeCameraZone, setActiveCameraZone] = useState<ZoneConfig | null>(null);
  const [notes, setNotes] = useState(task.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Hidden file inputs per zone
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const requiredZones = INSPECTION_ZONES.filter((z) => z.required);
  const takenRequiredZones = requiredZones.filter((z) =>
    photos.some((p) => p.zone === z.id)
  );
  const hasMetRequirements = takenRequiredZones.length === requiredZones.length;

  const handleCaptureDataUrl = (zone: ZoneConfig, dataUrl: string) => {
    const newPhoto: InspectionPhoto = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      zone: zone.id,
      zoneLabel: zone.shortLabel,
      photoUrl: dataUrl,
      takenAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setPhotos((prev) => {
      const filtered = prev.filter((p) => p.zone !== zone.id);
      return [...filtered, newPhoto];
    });
  };

  const handleCaptureFile = async (zone: ZoneConfig, file: File) => {
    try {
      setCompressingZone(zone.id);
      const compressedDataUrl = await compressImage(file, 1280, 0.75);
      handleCaptureDataUrl(zone, compressedDataUrl);
    } catch (err) {
      console.error("Failed to process photo:", err);
      alert("Could not process photo. Please try again.");
    } finally {
      setCompressingZone(null);
    }
  };

  const handleRemovePhoto = (zoneId: InspectionZone) => {
    setPhotos((prev) => prev.filter((p) => p.zone !== zoneId));
  };

  const handleSubmitComplete = async () => {
    if (!hasMetRequirements) return;
    try {
      setSubmitting(true);
      await onComplete(photos, notes.trim() || undefined);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraftOnly) {
      onOpenChange(false);
      return;
    }
    try {
      setSavingDraft(true);
      await onSaveDraftOnly(photos);
      onOpenChange(false);
    } finally {
      setSavingDraft(false);
    }
  };

  const renderZoneIcon = (iconName: ZoneConfig["iconName"], className = "size-5") => {
    switch (iconName) {
      case "bed":
        return <BedDouble className={className} />;
      case "bath":
        return <Bath className={className} />;
      case "kitchen":
        return <UtensilsCrossed className={className} />;
      case "living":
        return <Sofa className={className} />;
      case "lockbox":
        return <KeyRound className={className} />;
    }
  };

  // Ref to the dialog content element so we can refocus it after camera closes
  const dialogContentRef = useRef<HTMLDivElement | null>(null);

  // Guard: don't let Radix auto-close the dialog while the camera portal is open
  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean) => {
      // If camera is active, ignore close attempts (caused by focus leaving to the portal)
      if (!nextOpen && activeCameraZone) return;
      onOpenChange(nextOpen);
    },
    [activeCameraZone, onOpenChange]
  );

  // When camera closes, refocus the dialog first so Radix doesn't fire onOpenChange(false)
  const handleCameraClose = useCallback(() => {
    // Restore focus to the dialog content BEFORE we unmount the camera portal
    if (dialogContentRef.current) {
      dialogContentRef.current.focus();
    }
    setActiveCameraZone(null);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          ref={dialogContentRef}
          className="w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[92vh] flex flex-col p-0 sm:rounded-2xl rounded-none border-border bg-background overflow-hidden"
          onPointerDownOutside={(e) => { if (activeCameraZone) e.preventDefault(); }}
          onInteractOutside={(e) => { if (activeCameraZone) e.preventDefault(); }}
          onFocusOutside={(e) => { if (activeCameraZone) e.preventDefault(); }}
        >
          {/* Header */}
          <DialogHeader className="p-4 sm:p-6 border-b border-border text-left shrink-0 bg-card">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                <Camera className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg sm:text-xl font-black text-foreground truncate">
                  Proof of Evidence Walkthrough
                </DialogTitle>
                <DialogDescription className="text-xs truncate">
                  {task.unit_name} &bull; {task.property_name}
                </DialogDescription>
              </div>
            </div>

            {/* Requirements Progress Bar */}
            <div
              className={`mt-3 p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                hasMetRequirements
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
              }`}
            >
              <div className="flex items-center gap-2 font-bold min-w-0">
                {hasMetRequirements ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                )}
                <span className="truncate">
                  {hasMetRequirements
                    ? "All required areas photographed! Ready to complete."
                    : `Required: ${takenRequiredZones.length}/${requiredZones.length} areas photographed (Bedrooms & Bathroom)`}
                </span>
              </div>
              <Badge
                className={`font-black text-xs px-2.5 py-0.5 shrink-0 ${
                  hasMetRequirements
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-600 text-white"
                }`}
              >
                {photos.length} Captured
              </Badge>
            </div>
          </DialogHeader>

          {/* Scrollable Room Cards Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <div className="text-xs text-muted-foreground font-semibold">
              Tap &quot;Open Camera&quot; to snap a photo, or &quot;Upload&quot; from your photo library:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {INSPECTION_ZONES.map((zone) => {
                const photo = photos.find((p) => p.zone === zone.id);
                const isCompressing = compressingZone === zone.id;

                return (
                  <div
                    key={zone.id}
                    className={`rounded-2xl border p-4 transition-all flex flex-col justify-between ${
                      photo
                        ? "border-emerald-500/50 bg-emerald-500/[0.03] shadow-xs"
                        : zone.required
                        ? "border-amber-500/40 bg-card hover:border-amber-500"
                        : "border-border bg-card hover:border-border/80"
                    }`}
                  >
                    {/* Zone Info Header */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
                            {renderZoneIcon(zone.iconName, "size-4")}
                          </div>
                          <span className="font-extrabold text-sm text-foreground">
                            {zone.label}
                          </span>
                        </div>
                        {zone.required ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 border-amber-500/40 bg-amber-500/10 px-1.5 py-0"
                          >
                            Required
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-medium text-muted-foreground border-border px-1.5 py-0"
                          >
                            Optional
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-tight">
                        {zone.description}
                      </p>
                    </div>

                    {/* Photo Box */}
                    <div className="mt-3.5">
                      {/* Hidden file input */}
                      <input
                        type="file"
                        accept="image/*"
                        ref={(el) => {
                          fileInputRefs.current[zone.id] = el;
                        }}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCaptureFile(zone, file);
                          e.target.value = "";
                        }}
                      />

                      {isCompressing ? (
                        <div className="h-36 w-full rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground animate-pulse">
                          <Loader2 className="size-6 animate-spin text-teal-600" />
                          <span>Processing photo...</span>
                        </div>
                      ) : photo ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl overflow-hidden border border-border h-40 bg-black/10">
                            <img
                              src={photo.photoUrl}
                              alt={zone.label}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute top-2 right-2 flex items-center gap-1">
                              <span className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                                <CheckCircle2 className="size-3" /> Captured
                              </span>
                            </div>
                            <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-mono px-2 py-0.5 rounded-md backdrop-blur-xs">
                              {photo.takenAt}
                            </div>
                          </div>

                          {/* Retake / Remove buttons */}
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setActiveCameraZone(zone)}
                              className="flex-1 h-9 text-xs font-bold rounded-xl gap-1.5"
                            >
                              <RotateCcw className="size-3.5 text-muted-foreground" />
                              <span>Retake Photo</span>
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemovePhoto(zone.id)}
                              className="h-9 px-3 text-xs font-bold rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {/* Live Camera Button */}
                          <Button
                            type="button"
                            onClick={() => setActiveCameraZone(zone)}
                            className="w-full h-13 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm gap-2 shadow-xs cursor-pointer"
                          >
                            <Camera className="size-5" />
                            <span>Open Camera</span>
                          </Button>

                          {/* Secondary File Upload Button */}
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRefs.current[zone.id]?.click()}
                            className="w-full h-9 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground border-border gap-1.5"
                          >
                            <ImageIcon className="size-3.5" />
                            <span>Choose from Gallery / Files</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Notes */}
            <div className="space-y-1.5 pt-2">
              <label htmlFor="completion-notes" className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Info className="size-3.5 text-muted-foreground" />
                <span>Optional Turnover Notes for Property Manager:</span>
              </label>
              <Textarea
                id="completion-notes"
                placeholder="e.g. Unit spotless, new welcome basket placed, bed linens changed."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Sticky Mobile Footer Actions */}
          <DialogFooter className="p-4 border-t border-border bg-card shrink-0 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={submitting || savingDraft}
              className="h-12 sm:h-11 rounded-xl text-xs font-bold text-muted-foreground"
            >
              {savingDraft ? "Saving..." : "Save Draft Photos"}
            </Button>

            <Button
              type="button"
              onClick={handleSubmitComplete}
              disabled={!hasMetRequirements || submitting}
              className="h-13 sm:h-11 rounded-xl text-sm font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-2 flex-1 cursor-pointer disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Marking Cleaned...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4 text-white" />
                  <span>Submit Photos & Mark Cleaned</span>
                </>
              )}
            </Button>
          </DialogFooter>

          {/* Live Camera Viewfinder Modal — rendered inside DialogContent so it's within the Radix focus trap */}
          {activeCameraZone && (
            <LiveCameraModal
              open={!!activeCameraZone}
              onClose={handleCameraClose}
              zone={activeCameraZone}
              onCapture={(dataUrl) => handleCaptureDataUrl(activeCameraZone, dataUrl)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
