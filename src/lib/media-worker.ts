import { db } from "./db";
import { shopifySaree } from "./shopify";
import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const execPromise = promisify(exec);

export async function processQueueAsync() {
  // Trigger asynchronously in non-blocking fashion
  (async () => {
    try {
      const queue = await db.hgetall("media:queue");
      if (!queue) return;

      const items = Object.values(queue).map((val: any) => 
        typeof val === "string" ? JSON.parse(val) : val
      );

      // Filter for items that are queued
      const queuedItems = items.filter(item => item && item.status === "queued");

      for (const item of queuedItems) {
        // Mark as processing to avoid duplicate runs
        const processingItem = { ...item, status: "processing", startedAt: new Date().toISOString() };
        await db.hset("media:queue", { [item.id]: JSON.stringify(processingItem) });

        const absoluteRawPath = item.path;
        const rawExt = path.extname(absoluteRawPath).toLowerCase() || (item.type === "image" ? ".jpg" : ".mp4");
        // Output extension: optimize to .jpg for images, .mp4 for videos
        let ext = item.type === "image" ? ".jpg" : ".mp4";
        const dir = path.dirname(absoluteRawPath);
        const filename = path.basename(absoluteRawPath);
        
        let optimizedFilename = filename.replace(/\.[^/.]+$/, "") + "_optimized" + ext;
        let absoluteOptimizedPath = path.join(dir, optimizedFilename);
        let isFallbackCopy = false;

        try {
          console.log(`[Media Worker] Optimizing queued item ${item.id} (${item.type})...`);

          if (item.type === "image") {
            try {
              // 1. Image Optimization: Resize to max 2400px wide, preserve original aspect ratio (NO cropping)
              await sharp(absoluteRawPath)
                .resize(2400, undefined, {
                  fit: "inside",        // shrink to fit within bounds, never crop
                  withoutEnlargement: true, // don't upscale smaller images
                })
                .jpeg({ quality: 88, progressive: true })
                .toFile(absoluteOptimizedPath);
            } catch (sharpErr) {
              console.warn("[Media Worker] Sharp optimization failed, falling back to direct copy", sharpErr);
              ext = rawExt; // Use raw file extension
              optimizedFilename = filename.replace(/\.[^/.]+$/, "") + "_optimized" + ext;
              absoluteOptimizedPath = path.join(dir, optimizedFilename);
              await fs.copyFile(absoluteRawPath, absoluteOptimizedPath);
              isFallbackCopy = true;
            }

          } else {
            // 2. Video Optimization: Strip audio, scale height to 1280px vertical, compress bitrates
            try {
              let ffmpegPath = "ffmpeg";
              try {
                await execPromise("which ffmpeg");
              } catch {
                ffmpegPath = "/opt/homebrew/bin/ffmpeg";
              }
              const ffmpegCmd = `${ffmpegPath} -y -i "${absoluteRawPath}" -an -vf "scale=-2:1280" -vcodec libx264 -crf 26 -preset fast "${absoluteOptimizedPath}"`;
              await execPromise(ffmpegCmd);
            } catch (ffmpegErr) {
              console.warn("[Media Worker] FFmpeg full scale failed, fallback to copy...", ffmpegErr);
              try {
                let ffmpegPath = "ffmpeg";
                try {
                  await execPromise("which ffmpeg");
                } catch {
                  ffmpegPath = "/opt/homebrew/bin/ffmpeg";
                }
                const fallbackCmd = `${ffmpegPath} -y -i "${absoluteRawPath}" -an -vcodec copy "${absoluteOptimizedPath}"`;
                await execPromise(fallbackCmd);
              } catch (fallbackErr) {
                console.warn("[Media Worker] FFmpeg fallback command failed, performing direct file copy...", fallbackErr);
                ext = rawExt; // Use raw file extension
                optimizedFilename = filename.replace(/\.[^/.]+$/, "") + "_optimized" + ext;
                absoluteOptimizedPath = path.join(dir, optimizedFilename);
                await fs.copyFile(absoluteRawPath, absoluteOptimizedPath);
                isFallbackCopy = true;
              }
            }
          }

          // 3. Upload Optimized file to Shopify staged targets CDN
          const fileBuffer = await fs.readFile(absoluteOptimizedPath);
          const fileName = `${item.id}${ext}`;
          
          let mimeType = item.type === "image" ? "image/jpeg" : "video/mp4";
          if (isFallbackCopy) {
            if (ext === ".png") mimeType = "image/png";
            else if (ext === ".gif") mimeType = "image/gif";
            else if (ext === ".webp") mimeType = "image/webp";
            else if (ext === ".mov") mimeType = "video/quicktime";
            else if (ext === ".webm") mimeType = "video/webm";
          }

          console.log(`[Media Worker] Uploading optimized ${fileName} to Shopify staged target...`);
          const result = await shopifySaree.uploadMedia(fileName, mimeType, fileBuffer);

          // 4. Mark status as completed
          const completedItem = {
            ...item,
            status: "completed",
            shopifyId: result.id,
            shopifyUrl: result.url,
            optimizedPath: absoluteOptimizedPath,
            completedAt: new Date().toISOString()
          };
          await db.hset("media:queue", { [item.id]: JSON.stringify(completedItem) });
          console.log(`[Media Worker] Item ${item.id} successfully synced to Shopify!`);

          // 5. Clean up temporary files on local disk
          try {
            await fs.unlink(absoluteRawPath);
            await fs.unlink(absoluteOptimizedPath);
          } catch (unlinkErr) {
            console.error("[Media Worker] Disk cleanup warning:", unlinkErr);
          }

        } catch (err: any) {
          console.error(`[Media Worker] Process failed for item ${item.id}:`, err);
          const failedItem = {
            ...item,
            status: "failed",
            error: err.message || "Transformation failed",
            failedAt: new Date().toISOString()
          };
          await db.hset("media:queue", { [item.id]: JSON.stringify(failedItem) });
        }
      }
    } catch (err) {
      console.error("[Media Worker] Queue loop execution failure:", err);
    }
  })();
}
