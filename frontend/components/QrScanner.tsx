"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScanIcon, UploadIcon } from "@/components/icons";
import { primaryBtn, secondaryBtn } from "@/components/ui";

const OPEN_EVENT = "gachard:open-scanner";
const SCAN_EVERY_MS = 200;
const MAX_FRAME = 720;

type BarcodeReader = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Where a scanned code leads inside this site, or null if it is not one of ours. Only the
 * path is ever followed, so a code can never send a visitor to another site.
 */
export function pathFromQr(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const ours = url.hostname === window.location.hostname || url.hostname === "gachard-near.vercel.app";
  if (!ours || !/^https?:$/.test(url.protocol)) return null;
  if (/^\/S\/\d+\/[0-9A-Fa-f]{32}$/.test(url.pathname)) return url.pathname;
  if (/^\/scan(\/\d+)?$/.test(url.pathname)) return url.pathname + url.search;
  return null;
}

/** The button on the card picture. It opens the same scanner as the main button. */
export function ScanIconButton() {
  return (
    <button
      type="button"
      className="crystal-calm absolute -bottom-5 left-1/2 -translate-x-1/2 grid place-items-center size-11 rounded-full cursor-pointer transition hover:scale-105"
      aria-label="Scan a QR code with your camera"
      data-testid="scan-icon"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
    >
      <ScanIcon />
    </button>
  );
}

export default function QrScanner() {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  // True if the text led somewhere. A full navigation, because a printed code goes through a redirect.
  const follow = useCallback((text: string) => {
    const path = pathFromQr(text);
    if (!path) {
      setProblem("That QR code is not a Gachard card.");
      return false;
    }
    stop();
    setProblem("");
    setStatus("Found it. Opening the card...");
    window.location.assign(path);
    return true;
  }, [stop]);

  // Native where the browser has it, and a small library everywhere else.
  const reader = useCallback(async () => {
    const Native = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => BarcodeReader }).BarcodeDetector;
    const native = Native ? new Native({ formats: ["qr_code"] }) : null;
    const jsQR = (await import("jsqr")).default;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return async (source: CanvasImageSource, width: number, height: number) => {
      if (native) {
        const found = await native.detect(source).catch(() => []);
        if (found[0]) return found[0].rawValue;
      }
      if (!context || !width || !height) return null;
      const scale = Math.min(1, MAX_FRAME / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const frame = context.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(frame.data, frame.width, frame.height)?.data ?? null;
    };
  }, []);

  const open = useCallback(async () => {
    setProblem("");
    setStatus("Asking for your camera...");
    if (!dialog.current?.open) dialog.current?.showModal();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("");
      setProblem("This browser cannot open the camera here. Upload a photo of the QR instead.");
      return;
    }
    try {
      const camera = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      // Closed while the browser was asking.
      if (!dialog.current?.open) {
        camera.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = camera;
      const element = video.current!;
      element.srcObject = camera;
      await element.play();
      setStatus("Point your camera at the QR code on the card.");
      const read = await reader();
      const tick = async () => {
        if (!stream.current) return;
        const text = await read(element, element.videoWidth, element.videoHeight);
        if (text && follow(text)) return;
        timer.current = setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    } catch (error) {
      setStatus("");
      const denied = (error as DOMException).name === "NotAllowedError";
      setProblem(denied
        ? "Camera access is blocked. Allow it in your browser's settings, or upload a photo of the QR."
        : "We could not open a camera. Upload a photo of the QR instead.");
    }
  }, [follow, reader]);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [open]);

  const fromPhoto = async (file: File) => {
    setProblem("");
    setStatus("Reading the photo...");
    try {
      const bitmap = await createImageBitmap(file);
      const read = await reader();
      const text = await read(bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      setStatus("");
      if (!text) setProblem("No QR code found in that photo. Try a closer, sharper one.");
      else follow(text);
    } catch {
      setStatus("");
      setProblem("That file could not be read as an image.");
    }
  };

  return (
    <>
      <button type="button" className={`${primaryBtn} mt-6 w-full sm:w-auto`} onClick={open} data-testid="open-scanner">
        <ScanIcon width={18} height={18} /> Scan with camera
      </button>
      <dialog ref={dialog} className="scanner" aria-label="Scan a QR code" data-testid="scanner" onClose={stop}>
        <div className="scanner-view">
          <video ref={video} muted playsInline aria-hidden="true" />
          <span className="scanner-frame" aria-hidden="true"><span className="scan-beam" /></span>
        </div>
        <p className="mt-3 min-h-5 text-sm text-cn-text-2 text-center" role="status" data-testid="scanner-status">{status}</p>
        {problem ? <p className="mt-1 text-sm font-medium text-cn-danger text-center" role="alert" data-testid="scanner-problem">{problem}</p> : null}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <label className={`${secondaryBtn} cursor-pointer`}>
            <UploadIcon width={16} height={16} /> Upload a photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="scanner-photo"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) fromPhoto(file);
              }}
            />
          </label>
          <button type="button" className={secondaryBtn} onClick={() => dialog.current?.close()}>Close</button>
        </div>
      </dialog>
    </>
  );
}
