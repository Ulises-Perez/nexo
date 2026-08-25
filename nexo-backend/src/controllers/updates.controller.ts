import { Request, Response } from 'express';
import { Readable } from 'node:stream';
import { UpdatesService } from '../services/updates.service';

export class UpdatesController {
    public static async getManifest(
        req: Request<{ target: string; arch: string; currentVersion: string }>,
        res: Response
    ) {
        try {
            const { target, arch, currentVersion } = req.params;
            const manifest = await UpdatesService.getLatestManifest(target, arch, currentVersion);

            if (!manifest) {
                res.status(204).send();
                return;
            }

            res.status(200).json(manifest);
        } catch (error) {
            console.error('[updates.getManifest]', error);

            if (error instanceof Error && error.message === 'Release assets incomplete') {
                res.status(500).json({ error: 'Release assets incomplete' });
                return;
            }

            res.status(500).json({ error: "Internal Server Error" });
        }
    }

    public static async downloadAsset(
        req: Request<{ tag: string; assetName: string }>,
        res: Response
    ) {
        try {
            const { tag, assetName } = req.params;
            const assetResponse = await UpdatesService.getAssetResponse(tag, assetName);

            if (!assetResponse) {
                res.status(404).json({ error: 'Asset not found' });
                return;
            }

            if (!assetResponse.body) {
                res.status(500).json({ error: "Internal Server Error" });
                return;
            }

            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${assetName}"`);

            Readable.fromWeb(assetResponse.body as import('node:stream/web').ReadableStream).pipe(res);
        } catch (error) {
            console.error('[updates.downloadAsset]', error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
}
