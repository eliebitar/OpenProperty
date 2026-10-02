import { useState, useRef } from "react";
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
  const [notes, setNotes] = useState(task.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Hidden input refs per zone
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const requiredZones = INSPECTION_ZONES.filter((z) => z.required);
  const takenRequiredZones = requiredZones.filter((z) =>
    photos.some((p) => p.zone === z.id)
  );
  const hasMetRequirements = takenRequiredZones.length === requiredZones.length;

  const handleCaptureFile = async (zone: ZoneConfig, file: File) => {
    try {
      setCompressingZone(zone.id);
      const compressedDataUrl = await compressImage(file, 1280, 0.75);

      const newPhoto: InspectionPhoto = {
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        zone: zone.id,
        zoneLabel: zone.shortLabel,
        photoUrl: compressedDataUrl,
        takenAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setPhotos((prev) => {
        // Replace photo in the same zone or append
        const filtered = prev.filter((p) => p.zone !== zone.id);
        return [...filtered, newPhoto];
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
        <DialogHeader className="space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
              <Camera className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl font-black text-foreground">
                Proof of Evidence Walkthrough
              </DialogTitle>
              <DialogDescription className="text-xs">
                {task.unit_name} &bull; {task.property_name}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Requirements status pill */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            hasMetRequirements
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
              : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
          }`}
        >
          <div className="flex items-center gap-2 font-bold">
            {hasMetRequirements ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="size-4 text-amber-600 shrink-0" />
            )}
            <span>
              {hasMetRequirements
                ? "All required areas photographed! Ready to complete."
                : `Required: ${takenRequiredZones.length}/${requiredZones.length} areas photographed (Bedrooms & Bathroom)`}
            </span>
          </div>
          <Badge
            className={`font-black text-[11px] px-2 py-0.5 ${
              hasMetRequirements
                ? "bg-emerald-600 text-white"
                : "bg-amber-600 text-white"
            }`}
          >
            {photos.length} Photos
          </Badge>
        </div>

        {/* Room-by-room Key Zones */}
        <div className="space-y-3.5 pt-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
            <span>Tap each area to snap a quick photo from your phone:</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INSPECTION_ZONES.map((zone) => {
              const photo = photos.find((p) => p.zone === zone.id);
              const isCompressing = compressingZone === zone.id;

              return (
                <div
                  key={zone.id}
                  className={`rounded-2xl border p-3.5 transition-all flex flex-col justify-between ${
                    photo
                      ? "border-emerald-500/50 bg-emerald-500/[0.03] shadow-xs"
                      : zone.required
                      ? "border-amber-500/40 bg-card hover:border-amber-500"
                      : "border-border bg-card hover:border-border/80"
                  }`}
                >
                  {/* Card top */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{zone.icon}</span>
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

                  {/* Photo area */}
                  <div className="mt-3">
                    {/* Hidden input */}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      ref={(el) => {
                        fileInputRefs.current[zone.id] = el;
                      }}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleCaptureFile(zone, file);
                        // Reset input so taking another with same filename works
                        e.target.value = "";
                      }}
                    />

                    {isCompressing ? (
                      <div className="h-32 w-full rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground animate-pulse">
                        <Loader2 className="size-6 animate-spin text-teal-600" />
                        <span>Optimizing photo...</span>
                      </div>
                    ) : photo ? (
                      <div className="space-y-2">
                        <div className="relative rounded-xl overflow-hidden border border-border h-36 bg-black/10 group">
                          <img
                            src={photo.photoUrl}
                            alt={zone.label}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 flex items-center gap-1">
                            <span className="bg-emerald-600/90 text-white font-bold text-[10px] px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                              <CheckCircle2 className="size-3" /> Captured
                            </span>
                          </div>
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-mono px-2 py-0.5 rounded-md backdrop-blur-xs">
                            {photo.takenAt}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRefs.current[zone.id]?.click()}
                            className="flex-1 h-8 text-[11px] font-bold rounded-xl gap-1"
                          >
                            <RotateCcw className="size-3 text-muted-foreground" />
                            <span>Retake</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemovePhoto(zone.id)}
                            className="h-8 px-2.5 text-[11px] font-bold rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-500/10"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRefs.current[zone.id]?.click()}
                        className={`w-full h-24 rounded-xl border-dashed border-2 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          zone.required
                            ? "border-amber-500/40 hover:border-amber-500 bg-amber-500/[0.03] text-foreground"
                            : "border-border hover:border-teal-500/50 hover:bg-teal-500/[0.03] text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted/60 text-foreground">
                          <Camera className="size-4" />
                        </div>
                        <span className="text-xs font-bold">
                          Snap {zone.shortLabel} Photo
                        </span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                          Tap to open camera or upload
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Completion notes */}
        <div className="space-y-1.5 pt-2">
          <label htmlFor="completion-notes" className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Info className="size-3.5 text-muted-foreground" />
            <span>Optional Notes for Property Manager:</span>
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

        {/* Modal actions */}
        <DialogFooter className="flex-col sm:flex-row gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleSaveDraft}
            disabled={submitting || savingDraft}
            className="h-11 rounded-xl text-xs font-bold text-muted-foreground"
          >
            {savingDraft ? "Saving..." : "Save Draft Photos"}
          </Button>

          <Button
            type="button"
            onClick={handleSubmitComplete}
            disabled={!hasMetRequirements || submitting}
            className="h-12 sm:h-11 rounded-xl text-xs sm:text-sm font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md gap-2 flex-1 cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                <span>Marking Cleaned...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 text-white" />
                <span>✓ Submit Photos & Mark Cleaned</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
