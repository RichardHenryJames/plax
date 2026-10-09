package com.plaxlabs.news;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;
import java.io.IOException;
import java.util.*;
import java.util.concurrent.*;
import okhttp3.Call;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Loads publisher images through a disk cache, decodes them at screen size on worker threads and
 * can warm the next pictures before they are swiped to. All maps are touched on the main thread only.
 */
final class ImageLoader implements AutoCloseable {
    interface Listener { void result(boolean loaded); }

    private static final int MAX_BYTES = 4 * 1024 * 1024;

    private static final class Binding {
        final ImageView target; Listener listener; final Task task;
        Binding(ImageView target, Listener listener, Task task) { this.target = target; this.listener = listener; this.task = task; }
    }

    private static final class Task {
        final String url; final List<Binding> bindings = new ArrayList<>();
        boolean prefetch; volatile boolean cancelled; volatile Call call;
        Task(String url) { this.url = url; }
        void cancel() {
            cancelled = true;
            Call current = call;
            if (current != null) current.cancel();
        }
    }

    private final Context context;
    private final int targetWidth;
    private final Handler main = new Handler(Looper.getMainLooper());
    // Shared by every loader, so rotating the phone or changing the theme does not refetch pictures.
    private static final LruCache<String, Bitmap> MEMORY = new LruCache<>(
            (int) Math.min(Runtime.getRuntime().maxMemory() / 8, 48L << 20)) {
        @Override protected int sizeOf(String key, Bitmap image) { return image.getAllocationByteCount(); }
    };
    private final LruCache<String, Bitmap> memory = MEMORY;
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(3, 3, 20, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(), task -> {
        Thread thread = new Thread(task, "plax-image"); thread.setDaemon(true); return thread;
    });
    private final Map<String, Task> tasks = new HashMap<>();
    private final Map<ImageView, Binding> bindings = new IdentityHashMap<>();
    private boolean closed;

    ImageLoader(Context context, int targetWidth) {
        this.context = context.getApplicationContext();
        this.targetWidth = Math.max(240, targetWidth);
        workers.allowCoreThreadTimeOut(true);
    }

    void load(String url, ImageView target, Listener listener) {
        Binding existing = bindings.get(target);
        if (existing != null && existing.task.url.equals(url)) { existing.listener = listener; return; }
        cancel(target);
        if (closed) return;
        if (!Story.isWebLink(url)) { listener.result(false); return; }
        Bitmap hit = memory.get(url);
        if (hit != null) { target.setImageBitmap(hit); listener.result(true); return; }
        Task task = tasks.get(url);
        if (task == null) { task = new Task(url); tasks.put(url, task); start(task); }
        Binding binding = new Binding(target, listener, task);
        task.bindings.add(binding);
        bindings.put(target, binding);
    }

    void cancel(ImageView target) {
        Binding binding = bindings.remove(target);
        target.setImageDrawable(null);
        if (binding == null) return;
        binding.task.bindings.remove(binding);
        if (binding.task.bindings.isEmpty() && !binding.task.prefetch) {
            binding.task.cancel();
            tasks.remove(binding.task.url, binding.task);
        }
    }

    void prefetch(String url) {
        if (closed || !Story.isWebLink(url) || memory.get(url) != null) return;
        Task task = tasks.get(url);
        if (task == null) { task = new Task(url); tasks.put(url, task); start(task); }
        task.prefetch = true;
    }

    private void start(Task task) {
        try {
            workers.execute(() -> {
                Bitmap image = fetch(task);
                main.post(() -> finish(task, image));
            });
        } catch (RejectedExecutionException closedWhileStarting) {
            tasks.remove(task.url, task);
        }
    }

    private Bitmap fetch(Task task) {
        for (String candidate : ImageSizing.candidates(task.url, targetWidth)) {
            if (task.cancelled) return null;
            Bitmap image = download(task, candidate);
            if (image != null) return image;
        }
        return null;
    }

    private Bitmap download(Task task, String url) {
        try {
            Call call = Network.images(context.getCacheDir())
                    .newCall(new Request.Builder().url(url).header("Accept", "image/*").build());
            task.call = call;
            try (Response response = call.execute()) {
                if (!response.isSuccessful() || response.body() == null) return null;
                return decode(FeedApi.boundedRead(response.body().byteStream(), MAX_BYTES), targetWidth);
            }
        } catch (IOException | RuntimeException unavailable) {
            return null;
        }
    }

    static Bitmap decode(byte[] data, int targetWidth) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 12000 || bounds.outHeight > 12000)
            return null;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = ImageSizing.sampleSize(bounds.outWidth, targetWidth);
        int sampled = (bounds.outWidth + options.inSampleSize - 1) / options.inSampleSize;
        if (sampled > targetWidth) { options.inScaled = true; options.inDensity = sampled; options.inTargetDensity = targetWidth; }
        Bitmap image = BitmapFactory.decodeByteArray(data, 0, data.length, options);
        if (image != null) image.setDensity(Bitmap.DENSITY_NONE);
        return image;
    }

    private void finish(Task task, Bitmap image) {
        tasks.remove(task.url, task);
        if (closed) return;
        if (image != null) memory.put(task.url, image);
        for (Binding binding : new ArrayList<>(task.bindings)) {
            if (bindings.get(binding.target) != binding) continue;
            bindings.remove(binding.target);
            if (image != null) binding.target.setImageBitmap(image);
            binding.listener.result(image != null);
        }
    }

    /** Gives memory back when the system asks; pictures come back from the disk cache. */
    static void trim(int level) {
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) MEMORY.evictAll();
        else if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) MEMORY.trimToSize(MEMORY.size() / 2);
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        for (Task task : tasks.values()) task.cancel();
        tasks.clear(); bindings.clear();
        main.removeCallbacksAndMessages(null);
        workers.shutdownNow();
    }
}
