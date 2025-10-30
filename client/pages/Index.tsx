import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const DEFAULT_FRAME_COUNT = 280; // target frames to sample from video
// Backwards-compatible alias: some older bundles or references may still use FRAME_COUNT
const FRAME_COUNT = DEFAULT_FRAME_COUNT;
const SCROLL_PX_PER_FRAME = 8; // tune smoothness; total scroll = frameCount * this (uses frameCountRef.current)
const VIDEO_SRC =
  "https://cdn.builder.io/o/assets%2F0f9269d834214d64a7448cc96395210e%2Fc23c077dd15c465e89e78b2e8197f2f3%2Fcompressed?apiKey=0f9269d834214d64a7448cc96395210e&token=c23c077dd15c465e89e78b2e8197f2f3&alt=media&optimized=true";

gsap.registerPlugin(ScrollTrigger);

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function localFrameUrl(index: number) {
  return `/sequence/frame-${pad3(index)}.jpg`;
}

export default function Index() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCountRef = useRef<number>(DEFAULT_FRAME_COUNT);
  const imagesRef = useRef<(HTMLImageElement | null)[]>(
    Array(DEFAULT_FRAME_COUNT + 1).fill(null),
  );
  const lastDrawnRef = useRef(1);
  const dprRef = useRef(1);
  const reduceMotionRef = useRef(false);
  const stRef = useRef<any>(null);
  const [lqipVisible, setLqipVisible] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const frameCounterRef = useRef<HTMLDivElement | null>(null);

  // Video fallback resources
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoDurationRef = useRef<number | null>(null);
  const extractingFromVideoRef = useRef(false);
  const useVideoFallbackRef = useRef(false);
  const videoQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Draw current frame to canvas with object-fit: cover behavior
  const drawFrame = (index: number) => {
    const canvas = canvasRef.current;
    const img = imagesRef.current[index];
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    const cw = Math.floor(canvas.clientWidth * dpr);
    const ch = Math.floor(canvas.clientHeight * dpr);

    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const dw = Math.ceil(iw * scale);
    const dh = Math.ceil(ih * scale);
    const dx = Math.floor((cw - dw) / 2);
    const dy = Math.floor((ch - dh) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high" as CanvasImageSmoothingQuality;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);

    lastDrawnRef.current = index;
  };

  const drawNearestLoaded = (targetIndex: number) => {
    if (imagesRef.current[targetIndex]) {
      drawFrame(targetIndex);
      return;
    }
    // Search nearby loaded frame to keep motion smooth while loading
    const maxDelta = 12;
    for (let d = 1; d <= maxDelta; d++) {
      const up = targetIndex + d;
      const down = targetIndex - d;
      if (down >= 1 && imagesRef.current[down]) {
        drawFrame(down);
        return;
      }
      if (up <= frameCountRef.current && imagesRef.current[up]) {
        drawFrame(up);
        return;
      }
    }
    // fall back to last drawn
    if (imagesRef.current[lastDrawnRef.current]) drawFrame(lastDrawnRef.current);
  };

  // Capture a single frame from the VIDEO_SRC at a normalized frame index (1..frameCountRef.current)
  const captureFrameFromVideo = async (index: number) => {
    if (imagesRef.current[index]) return; // already captured
    if (!videoRef.current) {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.src = VIDEO_SRC;
      v.muted = true;
      v.playsInline = true;
      // prevent autoplay policy issues
      videoRef.current = v;

      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          videoDurationRef.current = v.duration || null;
          resolve();
        };
        const onError = () => reject(new Error("Failed to load video"));
        v.addEventListener("loadedmetadata", onLoaded, { once: true });
        v.addEventListener("error", onError, { once: true });
      });
    }

      // queue up seeks so we don't overwhelm the video element
    videoQueueRef.current = videoQueueRef.current.then(async () => {
      // ensure video element exists; recreate if cleaned up
      if (!videoRef.current) {
        const v2 = document.createElement("video");
        v2.crossOrigin = "anonymous";
        v2.src = VIDEO_SRC;
        v2.muted = true;
        v2.playsInline = true;
        videoRef.current = v2;
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => {
            videoDurationRef.current = v2.duration || null;
            resolve();
          };
          const onError = () => reject(new Error("Failed to load video"));
          v2.addEventListener("loadedmetadata", onLoaded, { once: true });
          v2.addEventListener("error", onError, { once: true });
        });
      }

      const v = videoRef.current;
      if (!v) return;
      const duration = videoDurationRef.current || v.duration || 0.0001;
      const t = Math.max(0, Math.min(duration, (index - 1) / (frameCountRef.current - 1) * duration));

      await new Promise<void>((resolve, reject) => {
        // If video was cleaned up during the wait, abort
        if (!videoRef.current) return resolve();
        const vNow = videoRef.current;
        if (!vNow) return resolve();

        let resolved = false;
        const onSeeked = () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          resolve();
        };
        const onError = () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new Error("Video seek error"));
        };
        const timeout = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          cleanup();
          // fallback: resolve so capture can continue (draw nearest loaded)
          resolve();
        }, 1200);

        function cleanup() {
          try {
            vNow.removeEventListener("seeked", onSeeked);
            vNow.removeEventListener("error", onError);
          } catch (e) {}
          clearTimeout(timeout);
        }

        try {
          if (!vNow || typeof vNow.currentTime === "undefined") {
            cleanup();
            return resolve();
          }
          vNow.currentTime = t;
        } catch (err) {
          // Seeking might throw if not allowed; bail but resolve gracefully
          cleanup();
          return resolve();
        }

        vNow.addEventListener("seeked", onSeeked, { once: true });
        vNow.addEventListener("error", onError, { once: true });
      });

      // If video element no longer exists, abort
      if (!videoRef.current) return;

      // draw to an offscreen canvas
      const off = document.createElement("canvas");
      const w = v.videoWidth || 1280;
      const h = v.videoHeight || 720;
      off.width = w;
      off.height = h;
      const ctx = off.getContext("2d");
      if (!ctx) return;
      try {
        ctx.drawImage(v, 0, 0, w, h);
      } catch (err) {
        console.warn("drawImage failed", err);
        return;
      }

      // create image element from blob to keep consistent loading API
      const blob = await new Promise<Blob | null>((resolve) => off.toBlob((b) => resolve(b), "image/jpeg", 0.9));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to create image from video frame"));
        img.src = url;
      });
      imagesRef.current[index] = img;
      // release blob url
      URL.revokeObjectURL(url);
    }).catch((err) => {
      console.error("video frame capture error", err);
    });

    return videoQueueRef.current;
  };

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handleResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      if (lastDrawnRef.current) drawNearestLoaded(lastDrawnRef.current);
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    // Preload images with limited concurrency for stability, try local frames first
    let nextToLoad = 1;
    const maxConcurrency = 6;
    let cancelled = false;
    let consecutiveErrors = 0;

    const loadNextLocal = () => {
      if (cancelled || nextToLoad > frameCountRef.current || useVideoFallbackRef.current) return;
      const i = nextToLoad++;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.loading = "eager";
      img.src = localFrameUrl(i);
      img.onload = () => {
        imagesRef.current[i] = img;
        consecutiveErrors = 0;
        if (i === 1) {
          drawFrame(1);
          setTimeout(() => setLqipVisible(false), 250);
        }
        loadNextLocal();
      };
      img.onerror = async () => {
        consecutiveErrors++;
        // If local frames aren't present (many errors), switch to video fallback
        if (consecutiveErrors >= 3) {
          useVideoFallbackRef.current = true;
          console.warn("Local frames not found — switching to video fallback capture.");
          // Kick off a few captures for early frames
          await captureFrameFromVideo(1);
          if (imagesRef.current[1]) {
            drawFrame(1);
            setTimeout(() => setLqipVisible(false), 250);
          }
          // Pre-capture a handful of frames in background
          for (let j = 2; j <= Math.min(20, frameCountRef.current); j++) captureFrameFromVideo(j);
          return;
        }
        // try next local frame
        loadNextLocal();
      };
    };

    // start local preload workers
    for (let c = 0; c < maxConcurrency; c++) loadNextLocal();

    // If using video fallback, also ensure we capture frames on demand as user scrolls
    let st: ScrollTrigger | null = null;

    if (!reduceMotionRef.current && containerRef.current) {
      const container = containerRef.current;
      const totalScroll = frameCountRef.current * SCROLL_PX_PER_FRAME;

      st = ScrollTrigger.create({
        trigger: container,
        start: "top top",
        end: `+=${totalScroll}`,
        scrub: 0.2,
        pin: true,
        onUpdate: async (self: any) => {
          const isSmall = window.innerWidth < 768;
          const reducedCount = isSmall ? Math.min(80, frameCountRef.current) : frameCountRef.current;
          const reducedIndex = Math.round(self.progress * (reducedCount - 1)) + 1;
          const mappedIndex = Math.round((reducedIndex - 1) * (frameCountRef.current - 1) / (reducedCount - 1)) + 1;

          // If we haven't loaded the mappedIndex and are using video fallback, capture it
          if (!imagesRef.current[mappedIndex] && useVideoFallbackRef.current) {
            // kick capture but don't await (keeps UI responsive)
            captureFrameFromVideo(mappedIndex);
            // attempt to draw nearest loaded while waiting
            drawNearestLoaded(mappedIndex);
            return;
          }

          drawNearestLoaded(mappedIndex);

          if (progressBarRef.current) {
            progressBarRef.current.style.width = `${Math.round(self.progress * 100)}%`;
          }
          if (frameCounterRef.current) {
            frameCounterRef.current.textContent = `${mappedIndex.toString().padStart(3, "0")}`;
          }
        },
      });

      stRef.current = st;
    }

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (st) st.kill();
      // cleanup video element if used
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.load();
        videoRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    if (!stRef.current) return;
    if (isPaused) {
      stRef.current.enable();
      setIsPaused(false);
    } else {
      stRef.current.disable();
      setIsPaused(true);
    }
  };

  const skipToEnd = () => {
    if (!containerRef.current) return;
    const totalScroll = frameCountRef.current * SCROLL_PX_PER_FRAME;
    const top = containerRef.current.offsetTop || 0;
    window.scrollTo({ top: top + totalScroll + 10, behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Scroll-driven sequence section */}
      <section
        ref={containerRef}
        className="relative h-screen w-screen overflow-hidden bg-black"
        aria-label="Scroll-controlled cinematic sequence"
      >
        {/* LQIP blurred background while high res frames load */}
        <div
          aria-hidden
          className={`absolute inset-0 transition-opacity duration-700 ease-out ${
            lqipVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundImage: `url(${localFrameUrl(1)})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(18px) saturate(1.1)",
            transform: "scale(1.04)",
          }}
        />

        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* Top overlay: brand + small controls */}
        <div className="absolute inset-x-0 top-0 z-30 flex items-center justify-between p-6 pointer-events-none">
          <div className="rounded-full bg-white/6 px-4 py-2 text-xs uppercase tracking-widest backdrop-blur text-white/90 pointer-events-auto">
            Arsalan Rad
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
            <div
              ref={frameCounterRef}
              className="rounded-md bg-black/60 px-3 py-2 text-sm font-mono"
            >
              001
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-md bg-black/40 px-2 py-1">
              <button
                onClick={togglePlay}
                className="rounded-md bg-white/6 px-3 py-2 text-sm font-medium text-white"
                aria-pressed={isPaused}
              >
                {isPaused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={skipToEnd}
                className="rounded-md bg-white/6 px-3 py-2 text-sm font-medium text-white"
              >
                Skip
              </button>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="absolute left-0 right-0 top-16 z-30 h-1 bg-white/6">
          <div
            ref={progressBarRef}
            className="h-full bg-gradient-to-r from-purple-400 via-pink-400 to-orange-300"
            style={{ width: "0%" }}
          />
        </div>

        {/* Bottom cue */}
        <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 text-center text-xs opacity-90 pointer-events-none">
          <div className="animate-bounce">▾</div>
          <div className="mt-1">Scroll to zoom out</div>
        </div>
      </section>

      {/* Content after the animation so normal scroll resumes */}
      <section id="content" className="relative mx-auto max-w-4xl px-6 py-24 text-neutral-200">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Cinematic scroll experience</h1>
        <p className="mt-4 text-neutral-400">
          The opening sequence above is driven by GSAP ScrollTrigger and a
          high‑fidelity image sequence (001–280). The app will use pre-extracted
          local frames in public/sequence if present; otherwise it captures
          frames from the provided video URL on the fly.
        </p>

        <div className="mt-12 space-y-8">
          <div className="rounded-xl bg-gradient-to-br from-zinc-900/40 to-black/30 p-6">
            <h2 className="text-2xl font-semibold">Performance & Accessibility</h2>
            <p className="mt-2 text-neutral-400">
              Low-resolution blurred placeholder, limited concurrency image
              preloading, and smaller sampled frame counts on mobile ensure a
              fast, smooth experience across devices.
            </p>
          </div>

          <div className="rounded-xl bg-gradient-to-br from-zinc-900/30 to-black/20 p-6">
            <h2 className="text-2xl font-semibold">Next steps</h2>
            <ul className="mt-2 text-neutral-400 list-disc pl-5 space-y-2">
              <li>Replace images with optimized WebP/AVIF variants on a CDN.</li>
              <li>Serve a single MP4 fallback for very low bandwidth devices.</li>
              <li>Allow user uploads to replace the sequence dynamically.</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
