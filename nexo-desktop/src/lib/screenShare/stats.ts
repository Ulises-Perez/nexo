// Live WebRTC quality stats for a screen share video track (sharer or
// viewer side), sampled from getStats() on an interval.

export interface VideoStatsSnapshot {
    width: number | null;
    height: number | null;
    fps: number | null;
    bitrateKbps: number | null;
    codec: string | null; // e.g. 'VP9', 'H264' — derived from the codec report's mimeType
    rttMs: number | null;
    packetLossPct: number | null;
    limitation: 'none' | 'cpu' | 'bandwidth' | 'other' | null; // outbound only, null for inbound
}

interface PrevByteSample {
    bytes: number;
    timestamp: number;
}

export function createStatsSampler(
    pc: RTCPeerConnection,
    direction: 'inbound' | 'outbound',
    onSample: (s: VideoStatsSnapshot) => void,
    intervalMs = 1000
): { stop(): void } {
    let prev: PrevByteSample | null = null;
    const reportType = direction === 'inbound' ? 'inbound-rtp' : 'outbound-rtp';
    const bytesField = direction === 'inbound' ? 'bytesReceived' : 'bytesSent';

    const handle = setInterval(() => {
        pc.getStats()
            .then((statsReport) => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let rtpReport: any = null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let remoteInboundReport: any = null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let candidatePairReport: any = null;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const reportsById = new Map<string, any>();

                    statsReport.forEach((report: any) => {
                        reportsById.set(report.id, report);
                        if (report.type === reportType && report.kind === 'video') {
                            rtpReport = report;
                        }
                        if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
                            remoteInboundReport = report;
                        }
                        if (
                            report.type === 'candidate-pair' &&
                            (report.nominated === true || report.state === 'succeeded')
                        ) {
                            candidatePairReport = report;
                        }
                    });

                    if (!rtpReport) return;

                    const bytes: number | undefined = rtpReport[bytesField];
                    const timestamp: number = rtpReport.timestamp;
                    let bitrateKbps: number | null = null;
                    if (typeof bytes === 'number' && prev) {
                        const bytesDelta = bytes - prev.bytes;
                        const timeDeltaMs = timestamp - prev.timestamp;
                        if (timeDeltaMs > 0) {
                            bitrateKbps = (bytesDelta * 8) / timeDeltaMs;
                        }
                    }
                    if (typeof bytes === 'number') {
                        prev = { bytes, timestamp };
                    }

                    const width: number | null = rtpReport.frameWidth ?? null;
                    const height: number | null = rtpReport.frameHeight ?? null;
                    const fps: number | null = rtpReport.framesPerSecond ?? null;

                    let codec: string | null = null;
                    if (rtpReport.codecId) {
                        const codecReport = reportsById.get(rtpReport.codecId);
                        if (codecReport?.mimeType) {
                            codec = String(codecReport.mimeType)
                                .replace(/^video\//i, '')
                                .toUpperCase();
                        }
                    }

                    let rttMs: number | null = null;
                    if (candidatePairReport && typeof candidatePairReport.currentRoundTripTime === 'number') {
                        rttMs = candidatePairReport.currentRoundTripTime * 1000;
                    }

                    let packetLossPct: number | null = null;
                    if (direction === 'inbound') {
                        const lost = rtpReport.packetsLost;
                        const received = rtpReport.packetsReceived;
                        if (typeof lost === 'number' && typeof received === 'number' && lost + received > 0) {
                            packetLossPct = Math.min(100, Math.max(0, (lost / (lost + received)) * 100));
                        }
                    } else if (remoteInboundReport) {
                        const lost = remoteInboundReport.packetsLost;
                        const sent = rtpReport.packetsSent;
                        if (typeof lost === 'number' && typeof sent === 'number' && lost + sent > 0) {
                            packetLossPct = Math.min(100, Math.max(0, (lost / (lost + sent)) * 100));
                        }
                    }

                    let limitation: VideoStatsSnapshot['limitation'] = null;
                    if (direction === 'outbound') {
                        const reason = rtpReport.qualityLimitationReason;
                        if (reason === 'cpu' || reason === 'bandwidth' || reason === 'none') {
                            limitation = reason;
                        } else if (reason) {
                            limitation = 'other';
                        } else {
                            limitation = 'none';
                        }
                    }

                    onSample({ width, height, fps, bitrateKbps, codec, rttMs, packetLossPct, limitation });
                } catch {
                    // Skip this tick on any stats-parsing error.
                }
            })
            .catch(() => {
                // Skip this tick if getStats() itself rejects.
            });
    }, intervalMs);

    return {
        stop() {
            clearInterval(handle);
        },
    };
}
