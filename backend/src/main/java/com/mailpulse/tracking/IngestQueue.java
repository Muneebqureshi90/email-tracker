package com.mailpulse.tracking;

import com.mailpulse.common.MailPulseProperties;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

/**
 * Bounded queue between the public endpoints and the database, so a pixel response never waits for a
 * write. When the queue is full the event is dropped (and counted) rather than slowing responses down.
 */
@Component
class IngestQueue implements SmartLifecycle {

    private static final Logger log = LoggerFactory.getLogger(IngestQueue.class);

    private final BlockingQueue<RawEvent> queue;
    private final EventIngestService ingest;
    private final AtomicLong dropped = new AtomicLong();
    private volatile boolean running;
    private Thread worker;

    IngestQueue(EventIngestService ingest, MailPulseProperties properties) {
        this.ingest = ingest;
        this.queue = new ArrayBlockingQueue<>(properties.ingestQueueCapacity());
    }

    boolean offer(RawEvent event) {
        if (queue.offer(event)) {
            return true;
        }
        long total = dropped.incrementAndGet();
        if (total % 100 == 1) {
            log.warn("Tracking queue is full; {} events dropped so far", total);
        }
        return false;
    }

    @Override
    public void start() {
        running = true;
        worker = Thread.ofVirtual().name("tracking-ingest").start(this::drain);
    }

    @Override
    public void stop() {
        running = false;
        if (worker != null) {
            try {
                worker.join(5_000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    private void drain() {
        while (running || !queue.isEmpty()) {
            RawEvent event;
            try {
                event = queue.poll(250, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            if (event != null) {
                try {
                    ingest.ingest(event);
                } catch (RuntimeException e) {
                    log.warn("Could not save a tracking event ({})", e.getClass().getSimpleName());
                }
            }
        }
    }
}
