export class PingService {
    public static getPingData() {
        return {
            message: "Pong!",
            timestamp: new Date().toISOString(),
            status: "Nexo Backend is up and running."
        };
    }
}
