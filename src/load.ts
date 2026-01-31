import * as d3 from "d3";
import { g, height, width } from ".";
import { getInfo } from "./api";

export let simulation: d3.Simulation<any, any>;
export const noticeEl = document.querySelector<HTMLDivElement>("#intervention-notice");

// Color
const color = {
    peer: "violet",
    opt: "blue",
    deps: "green",
    dev: "yellow",
    req: "red"
};

function needsIntervention(depVersionSpec: string, latestVersionStr: string): boolean {
    if (!depVersionSpec || !latestVersionStr) return false;
    if (depVersionSpec === "*" || depVersionSpec.startsWith("git")) return false;

    const depVersionStr = depVersionSpec.replace(/[\^~>=<]/g, "").trim();

    const depParts = depVersionStr.split(".").map(p => parseInt(p, 10));
    const latestParts = latestVersionStr.split(".").map(p => parseInt(p, 10));

    const [depMajor = 0, depMinor = 0] = depParts;
    const [latestMajor = 0, latestMinor = 0] = latestParts;

    if (depMajor !== latestMajor) return true;
    if (depMinor !== latestMinor) return true;

    return false;
}

export async function loadGraph() {
    if (simulation) {
        simulation.stop();
    }
    g.selectAll("*").remove();
    d3.select("body").selectAll(".tooltip").remove();

    try {
        const infos = await getInfo();

        const nodes = new Map();
        const rawLinks = new Map<string, { source: string, target: string, types: Set<string>, versions: Record<string, string> }>();
        const packageVersions = new Map<string, string>();

        // Priorytet: peer > opt > deps > dev
        const priority = { peer: 4, opt: 3, deps: 2, dev: 1 };

        infos.forEach(({ name, info }) => {
            packageVersions.set(name, info.version);
            if (!nodes.has(name)) {
                nodes.set(name, { id: name, label: name.split("/")[1] });
            }

            const addDep = (deps, type) => {
                if (!deps) return;
                Object.keys(deps).forEach(dep => {
                    if (!dep.startsWith("@wxn0brp/")) return;
                    if (!nodes.has(dep)) {
                        nodes.set(dep, { id: dep, label: dep.split("/")[1] });
                    }
                    const key = `${name}→${dep}`;
                    if (!rawLinks.has(key)) {
                        rawLinks.set(key, { source: name, target: dep, types: new Set(), versions: {} });
                    }
                    const link = rawLinks.get(key);
                    link.types.add(type);
                    link.versions[type] = deps[dep];
                });
            };

            addDep(info.peer, "peer");
            addDep(info.opt, "opt");
            addDep(info.deps, "deps");
            addDep(info.dev, "dev");
        });

        // Reduction: choose the highest priority
        const links = [];
        const interventions = [];
        rawLinks.forEach(link => {
            const types = Array.from(link.types);
            const bestType = types.reduce((a, b) => priority[a] > priority[b] ? a : b);
            const versionSpec = link.versions[bestType];
            const latestVersion = packageVersions.get(link.target);
            const requiresIntervention = needsIntervention(versionSpec, latestVersion);

            if (requiresIntervention) {
                interventions.push({
                    source: link.source,
                    target: link.target,
                    versionSpec,
                    latestVersion
                });
            }

            links.push({
                source: link.source,
                target: link.target,
                type: bestType,
                version: versionSpec,
                allTypes: types.sort((a, b) => priority[b] - priority[a]), // to tooltip
                requiresIntervention
            });
        });

        if (interventions.length > 0) {
            let content = `<ul>`;
            interventions.forEach(({ source, target, versionSpec, latestVersion }) => {
                content += `
<li title="${versionSpec} -> ${latestVersion}" data-pkg-open="${source}">
${source.split('/')[1]} -> ${target.split('/')[1]}
</li>`;
            });
            content += `</ul>`;

            noticeEl.innerHTML = content;
        } else {
            noticeEl.innerHTML = "No entires";
        }

        const nodeArray = Array.from(nodes.values());
        const linkArray = links;

        // Symbolize with larger force
        simulation = d3.forceSimulation(nodeArray)
            .force("link", d3.forceLink(linkArray).id((d: any) => d.id).distance(800).strength(1))
            .force("charge", d3.forceManyBody().strength(-22000))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collision", d3.forceCollide().radius(220))
            .force("x", d3.forceX(width / 2).strength(0.05))
            .force("y", d3.forceY(height / 2).strength(0.05));

        // Edges
        const link = g.append("g")
            .selectAll("line")
            .data(linkArray)
            .enter().append("line")
            .attr("class", "link")
            .attr("stroke", d => d.requiresIntervention ? color["req"] : color[d.type])
            .attr("stroke-width", 3);

        // Edge labels
        const linkLabel = g.append("g")
            .selectAll("text")
            .data(linkArray)
            .enter().append("text")
            .attr("class", "link-label")
            .text(d => `${d.type}: ${d.version}`)
            .attr("fill", d => color[d.type]);

        // Edges
        const node = g.append("g")
            .selectAll("g")
            .data(nodeArray)
            .enter().append("g")
            .attr("class", "node")
            .call(d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended));

        node.append("circle")
            .attr("r", 35)
            .attr("fill", "#2c3e50")
            .attr("stroke", "#ffffff");

        node.append("text")
            .text(d => d.label)
            .attr("y", 6);

        // Tooltip
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip");

        node.on("mouseover", (event, d) => {
            const outgoing = linkArray.filter(l => l.source.id === d.id);
            const incoming = linkArray.filter(l => l.target.id === d.id);

            const depsInfo = outgoing.map(l =>
                `<div style="color:${color[l.type]}">→ ${l.target.label} <em>(${l.type}: ${l.version})</em></div>`
            ).join("");
            const usedByInfo = incoming.map(l =>
                `<div style="color:${color[l.type]}">← ${l.source.label} <em>(${l.type}: ${l.version})</em></div>`
            ).join("");

            tooltip.html(`
                <strong>${d.id}</strong>
                <div style="margin-top:8px; font-size:12px;">
                    ${outgoing.length ? `<div><strong>Dependencies (${outgoing.length}):</strong></div>${depsInfo}` : "<em>No dependencies</em>"}
                    ${incoming.length ? `<div style="margin-top:8px;"><strong>Used by (${incoming.length}):</strong></div>${usedByInfo}` : ""}
                </div>
            `).style("opacity", 1);
        })
            .on("mousemove", (event) => {
                tooltip.style("left", (event.pageX + 15) + "px")
                    .style("top", (event.pageY - 10) + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));

        // Tick
        simulation.on("tick", () => {
            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            linkLabel.attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);

            node.attr("transform", d => `translate(${d.x},${d.y})`);
        });

    } catch (err) {
        console.error("Error:", err);
        alert("Error loading graph");
    }
}

function dragstarted(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event: any, d: any) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragended(event: any, d: any) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}