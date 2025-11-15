import { Valthera } from "@wxn0brp/db";
import FalconFrame from "@wxn0brp/falcon-frame";
import { $ } from "bun";
import { getPackageInfo } from "./pkg";

const db = new Valthera("data");
const app = new FalconFrame();
const scope = "@wxn0brp/";

app.static("public");
app.static("dist");

app.get("/pkg", async () => {
    const pkgs = await $`all-the-package-names | grep "${scope}"`.text();
    return pkgs.trim().split("\n").map(name => name.replace(scope, ""));
});

app.get("/info/:name", async (req) => {
    const name = req.params.name;
    const cache = await db.findOne("pkg", { name });
    if (cache) {
        delete cache.name;
        return cache;
    }

    try {
        const info = await getPackageInfo(scope + name);
        await db.add("pkg", {
            name,
            ...info
        }, false);
        return info;
    } catch {
        return { err: true }
    }
});

app.l(15963);