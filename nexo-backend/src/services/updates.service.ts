const GITHUB_OWNER = 'Ulises-Perez';
const GITHUB_REPO = 'nexo';

interface GitHubAsset {
    name: string;
    id: number;
    url: string;
}

interface GitHubRelease {
    tag_name: string;
    body: string | null;
    published_at: string;
    assets: GitHubAsset[];
}

interface UpdateManifest {
    version: string;
    notes: string;
    pub_date: string;
    platforms: {
        'windows-x86_64': {
            signature: string;
            url: string;
        };
    };
}

function githubHeaders(): Record<string, string> {
    return {
        Authorization: `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
    };
}

function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    const length = Math.max(partsA.length, partsB.length);

    for (let i = 0; i < length; i++) {
        const numA = partsA[i] || 0;
        const numB = partsB[i] || 0;

        if (numA > numB) return 1;
        if (numA < numB) return -1;
    }

    return 0;
}

export class UpdatesService {
    public static async getLatestManifest(
        target: string,
        arch: string,
        currentVersion: string
    ): Promise<UpdateManifest | null> {
        const releaseResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
            { headers: githubHeaders() }
        );

        if (!releaseResponse.ok) {
            throw new Error(`GitHub API error: ${releaseResponse.status}`);
        }

        const release: GitHubRelease = await releaseResponse.json();
        const releaseVersion = release.tag_name.replace(/^v/, '');

        if (compareVersions(releaseVersion, currentVersion) <= 0) {
            return null;
        }

        const installerAsset = release.assets.find(
            (asset) => /-setup\.exe$/.test(asset.name) && !asset.name.endsWith('.sig')
        );

        if (!installerAsset) {
            throw new Error('Release assets incomplete');
        }

        const signatureAsset = release.assets.find(
            (asset) => asset.name === `${installerAsset.name}.sig`
        );

        if (!signatureAsset) {
            throw new Error('Release assets incomplete');
        }

        const signatureResponse = await fetch(signatureAsset.url, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`,
                Accept: 'application/octet-stream',
            },
        });

        if (!signatureResponse.ok) {
            throw new Error(`GitHub API error: ${signatureResponse.status}`);
        }

        const signature = await signatureResponse.text();

        return {
            version: releaseVersion,
            notes: release.body || '',
            pub_date: release.published_at,
            platforms: {
                'windows-x86_64': {
                    signature,
                    url: `https://nexo-production-2df4.up.railway.app/api/updates/download/${release.tag_name}/${installerAsset.name}`,
                },
            },
        };
    }

    public static async getAssetResponse(tag: string, assetName: string): Promise<Response | null> {
        const releaseResponse = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${tag}`,
            { headers: githubHeaders() }
        );

        if (!releaseResponse.ok) {
            throw new Error(`GitHub API error: ${releaseResponse.status}`);
        }

        const release: GitHubRelease = await releaseResponse.json();
        const asset = release.assets.find((a) => a.name === assetName);

        if (!asset) {
            return null;
        }

        const assetResponse = await fetch(asset.url, {
            headers: {
                Authorization: `Bearer ${process.env.GITHUB_RELEASES_TOKEN}`,
                Accept: 'application/octet-stream',
            },
        });

        if (!assetResponse.ok) {
            throw new Error(`GitHub API error: ${assetResponse.status}`);
        }

        return assetResponse;
    }
}
