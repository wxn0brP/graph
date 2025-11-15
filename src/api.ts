import { AggregatedDependencies, getPackageInfo } from "./pkg";

const cachePrefix = "wxn0brP/graph/";
const ttl = 24 * 60 * 60 * 1000; // 1 day

async function getCache<T>(name: string, callback: (...args: any[]) => Promise<T>, ...args: any[]) {
    const key = cachePrefix + name;
    if (localStorage.getItem(key)) {
        const { data, timestamp } = JSON.parse(localStorage.getItem(key)!);
        if (Date.now() - timestamp < ttl) {
            return data;
        } else {
            localStorage.removeItem(key);
        }
    }
    const data = await callback(...args);
    localStorage.setItem(key, JSON.stringify({
        data,
        timestamp: Date.now()
    }));
    return data;
}

async function _getInfo(): Promise<{ name: string, info: AggregatedDependencies }[]> {
    const packages = await fetch("https://registry.npmjs.com/-/v1/search?text=@wxn0brp&size=100").then(res => res.json());
    const names: string[] = packages.objects.map(({ package: pkg }) => pkg.name);
    const infos = await Promise.all(names.map(async name => {
        const info = await getPackageInfo(name);
        return { name, info };
    }));
    return infos;
}

export async function getInfo() {
    return getCache("info", _getInfo);
}