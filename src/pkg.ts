export interface PackageInfo {
    name: string;
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional: boolean }>;
}

export interface AggregatedDependencies {
    deps: Record<string, string>;
    dev: Record<string, string>;
    opt: Record<string, string>;
    peer: Record<string, string>;
}

export async function getPackageInfo(npmPackageName: string): Promise<AggregatedDependencies> {
    const url = `https://registry.npmjs.org/${npmPackageName}/latest`;
    let response: Response;
    try {
        response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (e) {
        throw new Error(`Failed to fetch package info for "${npmPackageName}": ${e}`);
    }

    let data: PackageInfo;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error(`Invalid JSON response for package "${npmPackageName}": ${e}`);
    }

    const {
        dependencies = {},
        devDependencies = {},
        peerDependencies = {},
        peerDependenciesMeta = {}
    } = data;

    const opt: Record<string, string> = {};
    const peer: Record<string, string> = {};

    for (const [pkg, version] of Object.entries(peerDependencies)) {
        const meta = peerDependenciesMeta[pkg];
        if (meta && meta.optional === true) {
            opt[pkg] = version;
        } else {
            peer[pkg] = version;
        }
    }

    return {
        deps: dependencies,
        dev: devDependencies,
        opt,
        peer
    };
}