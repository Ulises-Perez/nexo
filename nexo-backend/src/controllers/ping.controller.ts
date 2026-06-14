import { Request, Response } from 'express';
import { PingService } from '../services/ping.service';

export class PingController {
    public static ping(req: Request, res: Response) {
        try {
            const data = PingService.getPingData();
            res.status(200).json(data);
        } catch (error) {
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
}
