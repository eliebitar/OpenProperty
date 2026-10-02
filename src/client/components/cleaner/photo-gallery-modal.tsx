import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Calendar,
  User,
  Home,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Clock,
  Download,
  BedDouble,
  Bath,
  UtensilsCrossed,
  Sofa,
  KeyRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { parseInspectionPhotos, INSPECTION_ZONES } from "@/lib/photo-utils";
import type { CleaningTask, InspectionPhoto } from "@/types";

function renderZoneIcon(zoneId: string, className = "size-3.5") {
  switch (zoneId) {
    case "bedroom":
      return <BedDouble className={className} />;
    case "bathroom":
      return <Bath className={className} />;
    case "kitchen":
      return <UtensilsCrossed className={className} />;
    case "living_room":
      return <Sofa className={className} />;
    case "lockbox":
      return <KeyRound className={className} />;
    default:
      return <Camera className={className} />;
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: CleaningTask;
}

export function PhotoGalleryModal({ open, onOpenChange, task }: Props) {
  const photos = parseInspectionPhotos(task.inspection_photos);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);

  const activePhoto: InspectionPhoto | null =
    selectedPhotoIndex !== null && photos[selectedPhotoIndex]
      ? photos[selectedPhotoIndex]
      : null;

  const handleNext = () => {
    if (selectedPhotoIndex === null) return;
    setSelectedPhotoIndex((selectedPhotoIndex + 1) % photos.length);
  };

  const handlePrev = () => {
    if (selectedPhotoIndex === null) return;
    setSelectedPhotoIndex((selectedPhotoIndex - 1 + photos.length) % photos.length);
  };

  const handleDownload = (photo: InspectionPhoto) => {
    const a = document.createElement("a");
    a.href = photo.photoUrl;
    a.download = `${task.unit_name.replace(/\s+/g, "_")}_${photo.zone}_inspection.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[96vw] max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left border-b border-border pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                  <Camera className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-foreground flex items-center gap-2">
                    <span>Cleaning Proof of Evidence</span>
                    <Badge className="bg-emerald-600 text-white font-bold text-xs py-0.5 px-2">
                      {photos.length} Photos
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="font-semibold text-foreground">{task.unit_name}</span>
                    <span>&bull;</span>
                    <span>{task.property_name}</span>
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Metadata pill */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl bg-muted/40 border border-border text-xs">
            <div className="flex items-center gap-2">
              <User className="size-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block">Cleaner</span>
                <span className="font-bold text-foreground truncate block">
                  {task.cleaner_name || "Assigned Cleaner"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="size-3.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block">Cleaned Date</span>
                <span className="font-bold text-foreground truncate block">
                  {formatDate(task.scheduled_date)}
                </span>
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 flex items-center gap-2">
              <Clock className="size-3.5 text-emerald-600 shrink-0" />
              <div className="min-w-0">
                <span className="text-[10px] text-muted-foreground block">Status</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                  {task.status === "completed" ? "Verified Cleaned" : "In Progress"}
                </span>
              </div>
            </div>
          </div>

          {/* Photo Gallery Grid */}
          {photos.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Camera className="size-8 text-muted-foreground mx-auto opacity-50" />
              <p className="text-xs font-semibold text-muted-foreground">
                No inspection photos uploaded yet for this cleaning task.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {photos.map((photo, index) => {
                  const zoneConfig = INSPECTION_ZONES.find((z) => z.id === photo.zone);
                  return (
                    <div
                      key={photo.id}
                      onClick={() => setSelectedPhotoIndex(index)}
                      className="group cursor-pointer rounded-2xl border border-border bg-card overflow-hidden hover:border-teal-500/60 hover:shadow-md transition-all space-y-2 p-2.5"
                    >
                      <div className="relative aspect-4/3 rounded-xl overflow-hidden bg-black/10">
                        <img
                          src={photo.photoUrl}
                          alt={photo.zoneLabel}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <Maximize2 className="size-6 drop-shadow-md" />
                        </div>
                        <div className="absolute top-2 left-2 bg-black/60 text-white font-bold text-[10px] px-2 py-0.5 rounded-md backdrop-blur-xs flex items-center gap-1.5">
                          {renderZoneIcon(photo.zone, "size-3 text-teal-400")}
                          <span>{photo.zoneLabel}</span>
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white font-mono text-[9px] px-1.5 py-0.5 rounded backdrop-blur-xs">
                          {photo.takenAt}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="font-extrabold text-foreground truncate">
                          {zoneConfig?.label || photo.zoneLabel}
                        </span>
                        <span className="text-[11px] text-teal-700 dark:text-teal-400 font-bold shrink-0">
                          View &rarr;
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Cleaner notes if any */}
          {task.notes && (
            <div className="p-3 rounded-xl border border-border bg-muted/30 text-xs space-y-1">
              <span className="font-bold text-foreground block">Cleaner Notes:</span>
              <p className="text-muted-foreground leading-relaxed">{task.notes}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Full-Screen Lightbox View */}
      {activePhoto && selectedPhotoIndex !== null && (
        <Dialog open={true} onOpenChange={() => setSelectedPhotoIndex(null)}>
          <DialogContent className="max-w-4xl w-[96vw] max-h-[95vh] p-0 overflow-hidden bg-black border-zinc-800 text-white rounded-2xl flex flex-col">
            {/* Lightbox header */}
            <div className="flex items-center justify-between p-4 bg-zinc-950/80 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-teal-400">
                  {renderZoneIcon(activePhoto.zone, "size-4")}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-zinc-100">
                    {activePhoto.zoneLabel}
                  </h4>
                  <span className="text-[11px] text-zinc-400">
                    Photo {selectedPhotoIndex + 1} of {photos.length} &bull; Taken at {activePhoto.takenAt}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(activePhoto)}
                  className="h-8 px-2.5 text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg gap-1"
                >
                  <Download className="size-3.5" />
                  <span>Download</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPhotoIndex(null)}
                  className="h-8 w-8 p-0 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>

            {/* Lightbox image preview */}
            <div className="relative flex-1 flex items-center justify-center bg-black/90 p-2 sm:p-4 min-h-[350px] overflow-hidden">
              <img
                src={activePhoto.photoUrl}
                alt={activePhoto.zoneLabel}
                className="max-h-[70vh] max-w-full object-contain rounded-lg"
              />

              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors cursor-pointer"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox footer thumb strip */}
            {photos.length > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 bg-zinc-950 border-t border-zinc-800 overflow-x-auto">
                {photos.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPhotoIndex(idx)}
                    className={`size-12 shrink-0 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      idx === selectedPhotoIndex
                        ? "border-teal-400 ring-2 ring-teal-400/40"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={p.photoUrl} alt={p.zoneLabel} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
